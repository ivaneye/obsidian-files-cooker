import { TAbstractFile, TFile } from 'obsidian';
import type { App } from 'obsidian';
import { DEFAULT_BACKUP_SETTINGS } from 'src/backup/backup-settings';
import type { BackupSettings } from 'src/backup/backup-settings';
import { parseRecords, serializeRecords } from 'src/backup/undo-record';
import type { ChangeKind, FileChange, OpType, UndoRecord } from 'src/backup/undo-record';

/**
 * 备份服务：批量写操作的前置快照、持久化历史与逐文件回滚。
 *
 * 职责说明：
 * - BackupService：begin（开启一次操作的记录器）/ getHistory / revert / checkDrift / 保留清理；
 * - OperationRecorder：单次操作的收集器（snapshot* 采集变更，finish 提交，abort 丢弃）；
 * - 存储布局：backupFolder/manifest.json（元数据）+ backupFolder/<id>/f-N.{before,after}.md（正文）；
 * - blob 与 manifest 经 vault.adapter 读写，避免触发 vault 事件；
 * - 原子提交：先写 blob，再以临时文件 + rename 覆盖 manifest；中途失败则该记录对用户不可见；
 * - 模块级单例：main.ts onload 调用 initBackup；测试用 __resetBackupForTest 重置。
 */

/** 单文件回滚结果状态。 */
export type RevertItemStatus = 'reverted' | 'skipped' | 'failed' | 'drift';

/** 单文件回滚结果。 */
export interface RevertItemResult {
	path: string;
	status: RevertItemStatus;
	message?: string;
}

/** 一次 revert 调用的汇总结果。 */
export interface RevertResult {
	recordId: string;
	items: RevertItemResult[];
}

/** 单文件的 drift 检测结果（供 UI 层展示）。 */
export interface DriftStatus {
	path: string;
	kind: ChangeKind;
	drifted: boolean;
	reason?: string;
}

/** 单次操作的记录器接口（begin 的返回值）。 */
export interface Recorder {
	readonly id: string;
	snapshotContentBefore(file: TFile): Promise<void>;
	snapshotPath(file: TAbstractFile, newPath: string): Promise<void>;
	snapshotCreated(path: string, content: string): Promise<void>;
	finish(): Promise<void>;
	abort(): void;
}

/** 内部待提交变更。 */
interface PendingChange {
	kind: ChangeKind;
	path: string;
	newPath?: string;
	beforeContent?: string;
}

/** 生成记录唯一标识：时间戳 + 随机后缀。 */
function newRecordId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 空操作记录器：总开关关闭时返回，各方法均为 no-op。 */
const NOOP_RECORDER: Recorder = {
	id: 'noop',
	snapshotContentBefore: async () => {},
	snapshotPath: async () => {},
	snapshotCreated: async () => {},
	finish: async () => {},
	abort: () => {},
};

export class BackupService {
	private readonly app: App;
	private readonly settings: BackupSettings;
	/** 内存缓存，按时间升序（最旧在前），便于保留清理。 */
	private historyCache: UndoRecord[] | null = null;

	constructor(app: App, settings: BackupSettings) {
		this.app = app;
		this.settings = settings;
	}

	/**
	 * 开启一次操作的记录器；总开关关闭时返回空操作记录器（操作照常执行但不产生备份）。
	 */
	begin(opType: OpType, opLabel: string): Recorder {
		if (!this.settings.enabled) {
			return NOOP_RECORDER;
		}
		return new OperationRecorder(this, opType, opLabel);
	}

	/** 读取当前历史（最新在前）。 */
	async getHistory(): Promise<UndoRecord[]> {
		const history = await this.loadHistory();
		return [...history].sort((a, b) => b.time - a.time);
	}

	/** 按记录 id 回滚指定路径；drift 条目仅在 force 为 true 时才覆盖。 */
	async revert(recordId: string, paths: string[], force = false): Promise<RevertResult> {
		const history = await this.loadHistory();
		const record = history.find((r) => r.id === recordId);
		if (!record) {
			return {
				recordId,
				items: paths.map((path) => ({ path, status: 'failed', message: 'Record not found' })),
			};
		}

		const items: RevertItemResult[] = [];
		for (const targetPath of paths) {
			const change = record.files.find((f) => f.path === targetPath);
			if (!change) {
				items.push({ path: targetPath, status: 'failed', message: 'File not in record' });
				continue;
			}
			switch (change.kind) {
				case 'content':
					items.push(await this.revertContent(record, change, force));
					break;
				case 'delete':
					items.push(await this.revertDelete(record, change, force));
					break;
				case 'create':
					items.push(await this.revertCreate(record, change, force));
					break;
				case 'path':
					items.push(await this.revertPath(record, change, force));
					break;
			}
		}

		await this.updateRecordStatus(record);
		return { recordId, items };
	}

	/** 回滚前 drift 检测：返回每条文件的 drift 状态供 UI 层展示。 */
	async checkDrift(recordId: string): Promise<DriftStatus[]> {
		const history = await this.loadHistory();
		const record = history.find((r) => r.id === recordId);
		if (!record) {
			return [];
		}
		const results: DriftStatus[] = [];
		for (const change of record.files) {
			results.push(await this.checkFileDrift(record, change));
		}
		return results;
	}

	/** 提交记录器：读 after → 写 blob → 原子写 manifest → 保留清理。 */
	async commit(recorder: OperationRecorder): Promise<void> {
		if (recorder.isAborted() || recorder.changes.length === 0) {
			return;
		}
		const recordId = recorder.id;
		const recordDir = `${this.settings.backupFolder}/${recordId}`;
		await this.ensureDir(this.settings.backupFolder);
		await this.ensureDir(recordDir);

		const files: FileChange[] = [];
		const changes = recorder.changes;
		for (let i = 0; i < changes.length; i++) {
			const change = changes[i];
			const beforeBlob = `f-${i}.before.md`;
			const afterBlob = `f-${i}.after.md`;
			switch (change.kind) {
				case 'content': {
					const afterContent = await this.readFileContent(change.path);
					await this.app.vault.adapter.write(`${recordDir}/${beforeBlob}`, change.beforeContent ?? '');
					await this.app.vault.adapter.write(`${recordDir}/${afterBlob}`, afterContent);
					files.push({ kind: 'content', path: change.path, beforeBlob, afterBlob });
					break;
				}
				case 'delete': {
					await this.app.vault.adapter.write(`${recordDir}/${beforeBlob}`, change.beforeContent ?? '');
					files.push({ kind: 'delete', path: change.path, beforeBlob });
					break;
				}
				case 'create': {
					const afterContent = await this.readFileContent(change.path);
					await this.app.vault.adapter.write(`${recordDir}/${afterBlob}`, afterContent);
					files.push({ kind: 'create', path: change.path, afterBlob });
					break;
				}
				case 'path': {
					files.push({ kind: 'path', path: change.path, newPath: change.newPath });
					break;
				}
			}
		}

		const record: UndoRecord = {
			id: recordId,
			time: recorder.time,
			opType: recorder.opType,
			opLabel: recorder.opLabel,
			status: 'active',
			files,
		};

		const history = await this.loadHistory();
		history.push(record);
		history.sort((a, b) => a.time - b.time);
		await this.enforceRetention(history);
	}

	// ---------------------------------------------------------------
	// 内部私有 helper
	// ---------------------------------------------------------------

	/** 读取文件当前内容；文件缺失或读取失败返回空串。 */
	async readFileContent(path: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
		if (!file) {
			return '';
		}
		try {
			return await this.app.vault.read(file);
		} catch {
			return '';
		}
	}

	/** 读取 blob 文件；缺失或读取失败返回 null。 */
	private async readBlob(recordId: string, blob?: string): Promise<string | null> {
		if (!blob) {
			return null;
		}
		try {
			const path = this.blobPath(recordId, blob);
			if (!(await this.app.vault.adapter.exists(path))) {
				return null;
			}
			return await this.app.vault.adapter.read(path);
		} catch {
			return null;
		}
	}

	/** blob 完整路径计算（私有 helper）。 */
	private blobPath(recordId: string, blob?: string): string {
		return `${this.settings.backupFolder}/${recordId}/${blob ?? ''}`;
	}

	/** 确保目录存在（已存在时忽略错误）。 */
	private async ensureDir(path: string): Promise<void> {
		try {
			await this.app.vault.adapter.mkdir(path);
		} catch {
			// 目录已存在时忽略
		}
	}

	/** 加载历史：读取 manifest，损坏时降级为空历史。 */
	private async loadHistory(): Promise<UndoRecord[]> {
		if (this.historyCache) {
			return this.historyCache;
		}
		let records: UndoRecord[] = [];
		try {
			const manifestPath = `${this.settings.backupFolder}/manifest.json`;
			if (await this.app.vault.adapter.exists(manifestPath)) {
				const raw = await this.app.vault.adapter.read(manifestPath);
				records = parseRecords(raw);
			}
		} catch {
			// manifest 损坏/不可读时降级为空历史，不阻塞插件
			records = [];
		}
		records.sort((a, b) => a.time - b.time);
		this.historyCache = records;
		return records;
	}

	/** 原子写 manifest：先写临时文件，再 rename 覆盖。 */
	private async saveManifest(records: UndoRecord[]): Promise<void> {
		const manifestPath = `${this.settings.backupFolder}/manifest.json`;
		const tmpPath = `${manifestPath}.tmp`;
		await this.app.vault.adapter.write(tmpPath, serializeRecords(records));
		await this.app.vault.adapter.rename(tmpPath, manifestPath);
	}

	/** 保留清理：超过 retention 时删除最旧记录（先删 blob 目录再更新 manifest）。 */
	private async enforceRetention(history: UndoRecord[]): Promise<void> {
		const retention = Math.max(1, this.settings.retention);
		if (history.length > retention) {
			const removed = history.splice(0, history.length - retention);
			for (const record of removed) {
				await this.removeRecordDir(record.id);
			}
		}
		await this.saveManifest(history);
		this.historyCache = history;
	}

	/** 删除单条记录的 blob 目录（递归）。 */
	private async removeRecordDir(recordId: string): Promise<void> {
		try {
			await this.app.vault.adapter.rmdir(`${this.settings.backupFolder}/${recordId}`, true);
		} catch {
			// 清理失败不阻塞整体流程
		}
	}

	/** 更新记录状态：全部回滚=reverted；部分=partial；未回滚=active。 */
	private async updateRecordStatus(record: UndoRecord): Promise<void> {
		const allReverted = record.files.every((f) => f.reverted === true);
		const anyReverted = record.files.some((f) => f.reverted === true);
		record.status = allReverted ? 'reverted' : anyReverted ? 'partial' : 'active';

		const history = await this.loadHistory();
		const index = history.findIndex((r) => r.id === record.id);
		if (index >= 0) {
			history[index] = record;
		}
		await this.saveManifest(history);
		this.historyCache = history;
	}

	// ---------------------------------------------------------------
	// 各变更类型的回滚与 drift 检测
	// ---------------------------------------------------------------

	/** content：当前=after 安全写回 before；≠after 需 force 才覆盖，绝不静默覆盖。 */
	private async revertContent(record: UndoRecord, change: FileChange, force: boolean): Promise<RevertItemResult> {
		const file = this.app.vault.getAbstractFileByPath(change.path) as TFile | null;
		if (!file) {
			return { path: change.path, status: 'failed', message: 'File not found' };
		}
		const before = await this.readBlob(record.id, change.beforeBlob);
		const after = await this.readBlob(record.id, change.afterBlob);
		if (before === null || after === null) {
			return { path: change.path, status: 'skipped', message: 'Backup missing' };
		}
		const current = await this.app.vault.read(file);
		if (current !== after && !force) {
			return { path: change.path, status: 'drift', message: 'File modified after operation' };
		}
		await this.app.vault.modify(file, before);
		change.reverted = true;
		return { path: change.path, status: 'reverted' };
	}

	/** delete：原路径已存在文件绝不覆盖（force 也不覆盖）；缺失则用 before 重建。 */
	private async revertDelete(record: UndoRecord, change: FileChange, _force: boolean): Promise<RevertItemResult> {
		const before = await this.readBlob(record.id, change.beforeBlob);
		if (before === null) {
			return { path: change.path, status: 'skipped', message: 'Backup missing' };
		}
		if (this.app.vault.getAbstractFileByPath(change.path)) {
			return { path: change.path, status: 'drift', message: 'Path re-created, conflict' };
		}
		await this.app.vault.create(change.path, before);
		change.reverted = true;
		return { path: change.path, status: 'reverted' };
	}

	/** create：当前=after 则 trash 新建文件；用户改过需 force 才 trash。 */
	private async revertCreate(record: UndoRecord, change: FileChange, force: boolean): Promise<RevertItemResult> {
		const after = await this.readBlob(record.id, change.afterBlob);
		if (after === null) {
			return { path: change.path, status: 'skipped', message: 'Backup missing' };
		}
		const file = this.app.vault.getAbstractFileByPath(change.path) as TFile | null;
		if (!file) {
			// 新建文件已被用户删除，视为已还原
			change.reverted = true;
			return { path: change.path, status: 'reverted' };
		}
		const current = await this.app.vault.read(file);
		if (current !== after && !force) {
			return { path: change.path, status: 'drift', message: 'File modified after operation' };
		}
		await this.app.vault.trash(file, true);
		change.reverted = true;
		return { path: change.path, status: 'reverted' };
	}

	/** path：反向 renameFile 改回旧路径；已处于旧路径则跳过不报错；已被再次移动则 drift。 */
	private async revertPath(record: UndoRecord, change: FileChange, _force: boolean): Promise<RevertItemResult> {
		const atNew = this.app.vault.getAbstractFileByPath(change.newPath ?? '') as TFile | null;
		const atOld = this.app.vault.getAbstractFileByPath(change.path) as TFile | null;
		if (atNew) {
			await this.app.fileManager.renameFile(atNew, change.path);
			change.reverted = true;
			return { path: change.path, status: 'reverted' };
		}
		if (atOld) {
			// 已处于旧路径（还原后状态），跳过不报错
			change.reverted = true;
			return { path: change.path, status: 'reverted', message: 'Already in original path' };
		}
		return { path: change.path, status: 'drift', message: 'File moved again' };
	}

	/** 单文件 drift 检测。 */
	private async checkFileDrift(record: UndoRecord, change: FileChange): Promise<DriftStatus> {
		if (change.reverted) {
			return { path: change.path, kind: change.kind, drifted: true, reason: 'already-reverted' };
		}
		switch (change.kind) {
			case 'content': {
				const file = this.app.vault.getAbstractFileByPath(change.path) as TFile | null;
				if (!file) {
					return { path: change.path, kind: change.kind, drifted: true, reason: 'file-missing' };
				}
				const after = await this.readBlob(record.id, change.afterBlob);
				if (after === null) {
					return { path: change.path, kind: change.kind, drifted: true, reason: 'backup-missing' };
				}
				const current = await this.app.vault.read(file);
				return current === after
					? { path: change.path, kind: change.kind, drifted: false }
					: { path: change.path, kind: change.kind, drifted: true, reason: 'content-modified' };
			}
			case 'delete': {
				const exists = this.app.vault.getAbstractFileByPath(change.path) != null;
				return exists
					? { path: change.path, kind: change.kind, drifted: true, reason: 'path-conflict' }
					: { path: change.path, kind: change.kind, drifted: false };
			}
			case 'create': {
				const file = this.app.vault.getAbstractFileByPath(change.path) as TFile | null;
				if (!file) {
					return { path: change.path, kind: change.kind, drifted: false };
				}
				const after = await this.readBlob(record.id, change.afterBlob);
				if (after === null) {
					return { path: change.path, kind: change.kind, drifted: true, reason: 'backup-missing' };
				}
				const current = await this.app.vault.read(file);
				return current === after
					? { path: change.path, kind: change.kind, drifted: false }
					: { path: change.path, kind: change.kind, drifted: true, reason: 'content-modified' };
			}
			case 'path': {
				const atNew = this.app.vault.getAbstractFileByPath(change.newPath ?? '') != null;
				const atOld = this.app.vault.getAbstractFileByPath(change.path) != null;
				if (atNew || atOld) {
					return { path: change.path, kind: change.kind, drifted: false };
				}
				return { path: change.path, kind: change.kind, drifted: true, reason: 'path-moved' };
			}
		}
	}
}

/**
 * 单次操作的记录器：采集变更，finish 提交给 BackupService，abort 丢弃。
 */
export class OperationRecorder implements Recorder {
	readonly id: string;
	readonly time: number;
	readonly opType: OpType;
	readonly opLabel: string;
	/** 内部待提交变更（由 BackupService.commit 消费）。 */
	readonly changes: PendingChange[] = [];
	private readonly service: BackupService;
	private state: 'collecting' | 'done' | 'aborted' = 'collecting';

	constructor(service: BackupService, opType: OpType, opLabel: string) {
		this.service = service;
		this.opType = opType;
		this.opLabel = opLabel;
		this.id = newRecordId();
		this.time = Date.now();
	}

	/** 记录操作前内容（delete 操作下按 delete 类型记录）。 */
	async snapshotContentBefore(file: TFile): Promise<void> {
		if (this.state !== 'collecting') {
			return;
		}
		const content = await this.service.readFileContent(file.path);
		const kind: ChangeKind = this.opType === 'delete' ? 'delete' : 'content';
		this.changes.push({ kind, path: file.path, beforeContent: content });
	}

	/** 记录路径变更（移动/重命名，回滚走反向 renameFile）。 */
	async snapshotPath(file: TAbstractFile, newPath: string): Promise<void> {
		if (this.state !== 'collecting') {
			return;
		}
		this.changes.push({ kind: 'path', path: file.path, newPath });
	}

	/** 记录新建（创建/复制，回滚为 trash；after 内容由 finish 读取实际文件）。 */
	async snapshotCreated(path: string, _content: string): Promise<void> {
		if (this.state !== 'collecting') {
			return;
		}
		this.changes.push({ kind: 'create', path });
	}

	/** 提交本次记录（读 after → 写 blob → 原子提交 manifest）。 */
	async finish(): Promise<void> {
		if (this.state !== 'collecting') {
			return;
		}
		this.state = 'done';
		await this.service.commit(this);
	}

	/** 丢弃本次记录（取消/失败时调用）。 */
	abort(): void {
		this.state = 'aborted';
	}

	isAborted(): boolean {
		return this.state === 'aborted';
	}
}

// ---------------------------------------------------------------
// 模块级单例
// ---------------------------------------------------------------

let current: BackupService | null = null;
let fallback: BackupService | null = null;

/** 供 main.ts onload 初始化单例。 */
export function initBackup(app: App, settings: BackupSettings): BackupService {
	current = new BackupService(app, settings);
	return current;
}

/** 获取单例；未初始化时返回空操作实例，保证模态框流程不中断。 */
export function getBackup(): BackupService {
	if (current) {
		return current;
	}
	if (!fallback) {
		fallback = new BackupService(inertApp(), { ...DEFAULT_BACKUP_SETTINGS, enabled: false });
	}
	return fallback;
}

/** 测试专用：重置单例。 */
export function __resetBackupForTest(): void {
	current = null;
}

/** 空操作 App 替身：未初始化单例时保证 getHistory/revert 等调用安全。 */
function inertApp(): App {
	return {
		vault: {
			adapter: {
				exists: async () => false,
				read: async () => '',
				write: async () => {},
				mkdir: async () => {},
				rename: async () => {},
				remove: async () => {},
				rmdir: async () => {},
			},
		},
		fileManager: {},
	} as unknown as App;
}
