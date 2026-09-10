import { App, Modal, Notice, Setting, ToggleComponent } from 'obsidian';
import { getBackup } from 'src/backup/backup-service';
import type { BackupService, DriftStatus } from 'src/backup/backup-service';
import type { FileChange, UndoRecord } from 'src/backup/undo-record';
import { addModalActions } from './modal-ui';

/**
 * 备份与撤销历史模态框。
 *
 * 职责说明：
 * - 列出备份记录（时间 / 操作类型 / 文件数 / 回滚状态）；
 * - 记录标题整行可点击展开/收起（默认展开最近一条），无需寻找隐藏开关；
 * - 展开后逐文件展示变更摘要（old → new），默认全选可回滚文件，打开即可直接回滚；
 * - drift（操作后被修改）条目标记“已修改”并默认禁用，勾选“覆盖被修改的文件”后才可回滚；
 * - 回滚前二次确认，结果以 Notice 汇总（成功 / 跳过 / 失败）。
 */

/** 格式化时间为本地可读字符串。 */
function formatTime(timestamp: number): string {
	const date = new Date(timestamp);
	const pad = (n: number): string => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 记录回滚状态的中文徽标。 */
function statusLabel(status: UndoRecord['status']): string {
	switch (status) {
		case 'reverted':
			return '已回滚';
		case 'partial':
			return '部分回滚';
		default:
			return '可回滚';
	}
}

/** 单文件变更摘要（path 类显示 old → new）。 */
function fileSummary(change: FileChange): string {
	switch (change.kind) {
		case 'path':
			return `${change.path} → ${change.newPath ?? ''}`;
		case 'create':
			return `${change.path}（新建）`;
		case 'delete':
			return `${change.path}（删除）`;
		default:
			return change.path;
	}
}

export class UndoHistoryModal extends Modal {
	private readonly service: BackupService;
	private readonly focusLast: boolean;
	private records: UndoRecord[] = [];
	/** recordId -> path -> drift 状态。 */
	private readonly driftByFile = new Map<string, Map<string, DriftStatus>>();
	/** recordId -> path -> 勾选开关（公开供测试检查禁用状态与触发）。 */
	readonly fileToggles = new Map<string, Map<string, ToggleComponent>>();
	/** recordId -> 已勾选路径集合（默认全选可回滚文件）。
	 * 注意：字段名不可用 `selection`——Obsidian Modal 基类在 open() 时会根据
	 * shouldRestoreSelection 把 this.selection 设为 DOM Selection 对象（用于关闭时恢复文本选区），
	 * 覆盖自定义 Map 导致运行时 this.selection.clear is not a function。 */
	private readonly selectedByRecord = new Map<string, Set<string>>();
	private readonly expandedIds = new Set<string>();
	private forceOverride = false;
	/** 覆盖被修改的文件开关引用（供测试触发）。 */
	forceOverrideToggle: ToggleComponent | null = null;

	constructor(app: App, options?: { service?: BackupService; focusLast?: boolean }) {
		super(app);
		this.service = options?.service ?? getBackup();
		this.focusLast = options?.focusLast ?? false;
	}

	async onOpen(): Promise<void> {
		try {
			await this.refresh();
		} catch (e) {
			// 加载/渲染历史失败时明确反馈，避免静默空面板（用户无从得知原因）
			console.error('[File Cooker][Undo] Failed to load history:', e);
			new Notice('加载备份历史失败：' + (e as Error).message);
		}
	}

	/** 重新加载历史并渲染（默认全选可回滚文件）。 */
	private async refresh(): Promise<void> {
		this.selectedByRecord.clear();
		this.fileToggles.clear();
		this.records = await this.service.getHistory();
		// 诊断日志：确认读回条数（排查历史为空问题时有用）
		console.log(`[File Cooker][Undo] Loaded ${this.records.length} history record(s).`);

		this.driftByFile.clear();
		for (const record of this.records) {
			const map = new Map<string, DriftStatus>();
			const drifts = await this.service.checkDrift(record.id);
			for (const status of drifts) {
				map.set(status.path, status);
			}
			this.driftByFile.set(record.id, map);
		}

		// 默认全选：打开面板即可直接回滚，无需逐个勾选
		this.selectAllOperable();

		// 首次加载：默认展开最近一条记录（之后由用户点击状态 expandedIds 控制）
		if (this.expandedIds.size === 0 && this.records.length > 0) {
			this.expandedIds.add(this.records[0].id);
		}

		this.render();
	}

	/** 把所有当前可回滚的文件加入勾选。 */
	private selectAllOperable(): void {
		for (const record of this.records) {
			for (const change of record.files) {
				if (this.isFileOperable(record, change)) {
					this.addSelected(record.id, change.path);
				}
			}
		}
	}

	/** 渲染整个模态框内容。 */
	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h1', { text: '备份与撤销历史', cls: 'file-cooker-modal__title' });
		contentEl.createDiv({
			text: '点击记录可展开文件列表；勾选要回滚的文件后，点击底部「回滚选中的文件」。',
			cls: 'file-cooker-modal__description',
		});

		if (this.records.length === 0) {
			contentEl.createDiv({
				text: '暂无备份历史。执行批量操作（属性编辑、移动、重命名、删除、合并、创建）后会自动生成记录，可在此回滚。',
				cls: 'file-cooker-modal__empty',
			});
		} else {
			for (const record of this.records) {
				this.renderRecord(record);
			}
		}

		// 底部操作区：覆盖开关 + 操作按钮，与列表用分隔线隔开
		const footer = contentEl.createDiv({ cls: 'file-cooker-modal__footer' });

		// 覆盖被修改的文件：开启后允许回滚被中途修改（drift）的条目
		const forceRow = footer.createDiv({ cls: 'file-cooker-modal__field-row' });
		forceRow.createDiv({ text: '覆盖被修改的文件', cls: 'file-cooker-modal__field-label' });
		new Setting(forceRow).addToggle((toggle) => {
			toggle
				.setValue(this.forceOverride)
				.setTooltip('回滚时强制覆盖操作后被再次修改的文件（可能丢失其后的编辑）')
				.onChange((value) => {
					this.forceOverride = value;
					if (value) {
						// 开启覆盖后，把因 drift 禁用的条目也默认勾选（用户开覆盖即想处理它们）
						this.selectAllOperable();
					}
					this.render();
				});
			this.forceOverrideToggle = toggle;
		});

		addModalActions(footer, [
			{
				text: '回滚选中的文件',
				cta: true,
				onClick: () => this.revertSelected(),
			},
			{
				text: '关闭',
				onClick: () => this.close(),
			},
		]);
	}

	/** 渲染单条记录：卡片容器内包含可点击标题 + 文件勾选列表（子项相对标题缩进）。 */
	private renderRecord(record: UndoRecord): void {
		const { contentEl } = this;
		const expanded = this.expandedIds.has(record.id);
		if (expanded) {
			this.expandedIds.add(record.id);
		}
		// 每次渲染该记录时清掉旧的 toggle 引用，避免折叠/重渲染后残留失效控件
		this.fileToggles.delete(record.id);

		const recordEl = contentEl.createDiv({ cls: 'file-cooker-modal__record' });

		const arrow = expanded ? '▼' : '▶';
		const title = recordEl.createDiv({
			cls: 'file-cooker-modal__record-title is-clickable',
			text: `${arrow} ${formatTime(record.time)} · ${record.opLabel} · ${record.files.length} 个文件 · ${statusLabel(record.status)}`,
		});
		title.addEventListener('click', () => {
			if (expanded) {
				this.expandedIds.delete(record.id);
			} else {
				this.expandedIds.add(record.id);
			}
			this.render();
		});

		if (expanded) {
			for (const change of record.files) {
				this.renderFile(recordEl, record, change);
			}
		}
	}

	/** 渲染单文件勾选行；drift / 已回滚条目默认禁用。container 为所属记录卡片。 */
	private renderFile(container: HTMLElement, record: UndoRecord, change: FileChange): void {
		const alreadyReverted = change.reverted === true;
		const drifted = !alreadyReverted && this.driftByFile.get(record.id)?.get(change.path)?.drifted === true;
		const disabled = (drifted && !this.forceOverride) || alreadyReverted;

		const marker = alreadyReverted ? '（已回滚）' : drifted ? '（已修改）' : '';
		const row = container.createDiv({ cls: 'file-cooker-modal__field-row' });
		row.createDiv({ text: fileSummary(change) + marker, cls: 'file-cooker-modal__field-label' });

		new Setting(row).addToggle((toggle) => {
			toggle.setValue(this.isSelected(record.id, change.path)).setDisabled(disabled).onChange((value) => {
				if (disabled) {
					return;
				}
				this.setSelected(record.id, change.path, value);
			});
			if (!this.fileToggles.has(record.id)) {
				this.fileToggles.set(record.id, new Map());
			}
			this.fileToggles.get(record.id)?.set(change.path, toggle);
		});
	}

	/** 该文件当前是否可回滚（未回滚，且无 drift 或已开启强制覆盖）。 */
	private isFileOperable(record: UndoRecord, change: FileChange): boolean {
		if (change.reverted === true) {
			return false;
		}
		const drift = this.driftByFile.get(record.id)?.get(change.path);
		if (drift?.drifted === true && !this.forceOverride) {
			return false;
		}
		return true;
	}

	/** 判断路径是否已勾选。 */
	private isSelected(recordId: string, path: string): boolean {
		return this.selectedByRecord.get(recordId)?.has(path) ?? false;
	}

	/** 将路径加入勾选集合。 */
	private addSelected(recordId: string, path: string): void {
		if (!this.selectedByRecord.has(recordId)) {
			this.selectedByRecord.set(recordId, new Set());
		}
		this.selectedByRecord.get(recordId)!.add(path);
	}

	/** 更新勾选集合。 */
	private setSelected(recordId: string, path: string, selected: boolean): void {
		if (selected) {
			this.addSelected(recordId, path);
		} else {
			this.selectedByRecord.get(recordId)?.delete(path);
		}
	}

	/** 对勾选集合发起回滚：先确认，再逐记录回滚，最后以 Notice 汇总。 */
	private async revertSelected(): Promise<void> {
		let total = 0;
		for (const [, paths] of this.selectedByRecord) {
			total += paths.size;
		}
		if (total === 0) {
			new Notice('未勾选任何文件。点击记录展开后勾选要回滚的文件。');
			return;
		}
		if (!window.confirm(`确定回滚选中的 ${total} 个文件吗？此操作不可撤销。`)) {
			return;
		}

		let revertedCount = 0;
		let skippedCount = 0;
		let failedCount = 0;
		for (const [recordId, paths] of this.selectedByRecord) {
			if (paths.size === 0) {
				continue;
			}
			const result = await this.service.revert(recordId, [...paths], this.forceOverride);
			for (const item of result.items) {
				if (item.status === 'reverted') {
					revertedCount++;
				} else if (item.status === 'failed') {
					failedCount++;
				} else {
					skippedCount++;
				}
			}
		}
		new Notice(`回滚完成：成功 ${revertedCount}，跳过 ${skippedCount}，失败 ${failedCount}。`);
		await this.refresh();
	}
}
