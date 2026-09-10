import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
	return await import('../mocks/obsidian');
});

import { __resetNotices } from '../mocks/obsidian';
import { createAppMock } from '../mocks/vault-mock';
import {
	__resetBackupForTest,
	getBackup,
	initBackup,
} from 'src/backup/backup-service';
import { DEFAULT_BACKUP_SETTINGS } from 'src/backup/backup-settings';
import type { UndoRecord } from 'src/backup/undo-record';

/**
 * 测试目的：验证 BackupService 快照→提交→回滚→drift→保留清理的完整行为。
 * 测试内容：content/path/create/delete 四类变更的落盘与还原、部分回滚状态流转、
 *          drift 检测与强制覆盖、保留上限清理、备份缺失降级。
 * 预期结果：四类变更走同一代码路径且行为符合 spec。
 */

const BACKUP_DIR = '.file-cooker/backups';

/** 由记录与 blob 文件名拼出完整 blob 路径。 */
function blobPath(record: UndoRecord, blob?: string): string {
	return `${BACKUP_DIR}/${record.id}/${blob ?? ''}`;
}

function initDefault() {
	const app = createAppMock();
	initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });
	return app;
}

describe('BackupService 快照与提交', () => {
	beforeEach(() => {
		__resetBackupForTest();
		__resetNotices();
	});

	it('content 类：begin→快照→修改→finish 后 before/after blob 与 manifest 正确落盘', async () => {
		const app = createAppMock({ 'a.md': 'before-content' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('properties', 'Edit properties');
		await recorder.snapshotContentBefore({ path: 'a.md' } as never);
		// 模拟属性编辑修改内容
		app.vault.files.set('a.md', 'after-content');
		await recorder.finish();

		const history = await getBackup().getHistory();
		expect(history).toHaveLength(1);
		const record = history[0];
		expect(record.opType).toBe('properties');
		expect(record.opLabel).toBe('Edit properties');
		expect(record.status).toBe('active');
		expect(record.files).toHaveLength(1);
		expect(record.files[0].kind).toBe('content');
		expect(record.files[0].path).toBe('a.md');

		expect(await app.vault.adapter.read(blobPath(record, record.files[0].beforeBlob))).toBe('before-content');
		expect(await app.vault.adapter.read(blobPath(record, record.files[0].afterBlob))).toBe('after-content');
	});

	it('path 类：移动成功后记录旧路径与新路径', async () => {
		const app = createAppMock({ 'a.md': 'x' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('move', 'Move files');
		await recorder.snapshotPath({ path: 'a.md' } as never, 'sub/a.md');
		await app.fileManager.renameFile({ path: 'a.md' } as never, 'sub/a.md');
		await recorder.finish();

		const record = (await getBackup().getHistory())[0];
		expect(record.files[0]).toMatchObject({ kind: 'path', path: 'a.md', newPath: 'sub/a.md' });
		expect(record.files[0].beforeBlob).toBeUndefined();
	});

	it('create 类：创建成功后记录路径与 after 快照', async () => {
		const app = createAppMock();
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('create', '创建文件');
		await recorder.snapshotCreated('new.md', '');
		await app.vault.create('new.md', 'created-content');
		await recorder.finish();

		const record = (await getBackup().getHistory())[0];
		expect(record.files[0].kind).toBe('create');
		expect(record.files[0].path).toBe('new.md');
		expect(await app.vault.adapter.read(blobPath(record, record.files[0].afterBlob))).toBe('created-content');
	});

	it('delete 类：删除后仅记录 before 快照', async () => {
		const app = createAppMock({ 'gone.md': 'before-content' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('delete', 'Delete files');
		await recorder.snapshotContentBefore({ path: 'gone.md' } as never);
		await app.vault.trash({ path: 'gone.md' } as never, true);
		await recorder.finish();

		const record = (await getBackup().getHistory())[0];
		expect(record.files[0].kind).toBe('delete');
		expect(await app.vault.adapter.read(blobPath(record, record.files[0].beforeBlob))).toBe('before-content');
		expect(record.files[0].afterBlob).toBeUndefined();
	});

	it('abort 不产生 manifest 记录；finish 在 abort 后为空操作', async () => {
		const app = createAppMock({ 'a.md': 'x' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('properties', 'Edit properties');
		await recorder.snapshotContentBefore({ path: 'a.md' } as never);
		recorder.abort();
		await recorder.finish();

		expect(await getBackup().getHistory()).toHaveLength(0);
		// 不应残留任何 blob 目录
		expect(await app.vault.adapter.exists(`${BACKUP_DIR}/manifest.json`)).toBe(false);
	});

	it('备份总开关关闭时 begin 返回空操作记录器，不产生任何落盘', async () => {
		const app = createAppMock({ 'a.md': 'x' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS, enabled: false });

		const recorder = getBackup().begin('properties', 'Edit properties');
		await recorder.snapshotContentBefore({ path: 'a.md' } as never);
		await recorder.finish();

		expect(await getBackup().getHistory()).toHaveLength(0);
		expect(await app.vault.adapter.exists(`${BACKUP_DIR}/manifest.json`)).toBe(false);
	});
});

describe('BackupService 回滚', () => {
	beforeEach(() => {
		__resetBackupForTest();
		__resetNotices();
	});

	it('content 类：revert 用 before 内容覆盖写回', async () => {
		const app = createAppMock({ 'a.md': 'before-content' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('properties', 'Edit properties');
		await recorder.snapshotContentBefore({ path: 'a.md' } as never);
		app.vault.files.set('a.md', 'after-content');
		await recorder.finish();

		const record = (await getBackup().getHistory())[0];
		const result = await getBackup().revert(record.id, ['a.md']);

		expect(result.items[0].status).toBe('reverted');
		expect(app.vault.files.get('a.md')).toBe('before-content');
	});

	it('path 类：revert 走反向 renameFile 改回旧路径', async () => {
		const app = createAppMock({ 'a.md': 'x' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('move', 'Move files');
		await recorder.snapshotPath({ path: 'a.md' } as never, 'sub/a.md');
		await app.fileManager.renameFile({ path: 'a.md' } as never, 'sub/a.md');
		await recorder.finish();

		const record = (await getBackup().getHistory())[0];
		const result = await getBackup().revert(record.id, ['a.md']);

		expect(result.items[0].status).toBe('reverted');
		expect(app.vault.files.has('sub/a.md')).toBe(false);
		expect(app.vault.files.has('a.md')).toBe(true);
	});

	it('create 类：revert 将新建文件 trash 掉', async () => {
		const app = createAppMock();
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('create', '创建文件');
		await recorder.snapshotCreated('new.md', '');
		await app.vault.create('new.md', 'created-content');
		await recorder.finish();

		const record = (await getBackup().getHistory())[0];
		const result = await getBackup().revert(record.id, ['new.md']);

		expect(result.items[0].status).toBe('reverted');
		expect(app.vault.files.has('new.md')).toBe(false);
		expect(app.vault.trashed).toContain('new.md');
	});

	it('delete 类：revert 用 before 快照在原路径重建文件', async () => {
		const app = createAppMock({ 'gone.md': 'before-content' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('delete', 'Delete files');
		await recorder.snapshotContentBefore({ path: 'gone.md' } as never);
		await app.vault.trash({ path: 'gone.md' } as never, true);
		await recorder.finish();

		const record = (await getBackup().getHistory())[0];
		const result = await getBackup().revert(record.id, ['gone.md']);

		expect(result.items[0].status).toBe('reverted');
		expect(app.vault.files.get('gone.md')).toBe('before-content');
	});

	it('单次操作内部分回滚：仅勾选文件被还原，记录状态流转 active→partial→reverted', async () => {
		const app = createAppMock({ 'a.md': 'a-before', 'b.md': 'b-before' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('properties', 'Edit properties');
		await recorder.snapshotContentBefore({ path: 'a.md' } as never);
		await recorder.snapshotContentBefore({ path: 'b.md' } as never);
		app.vault.files.set('a.md', 'a-after');
		app.vault.files.set('b.md', 'b-after');
		await recorder.finish();

		const record = (await getBackup().getHistory())[0];
		expect(record.status).toBe('active');

		const partial = await getBackup().revert(record.id, ['a.md']);
		expect(partial.items[0].status).toBe('reverted');
		expect(app.vault.files.get('a.md')).toBe('a-before');
		expect(app.vault.files.get('b.md')).toBe('b-after');
		const afterPartial = (await getBackup().getHistory())[0];
		expect(afterPartial.status).toBe('partial');

		await getBackup().revert(record.id, ['b.md']);
		const afterFull = (await getBackup().getHistory())[0];
		expect(afterFull.status).toBe('reverted');
		expect(app.vault.files.get('b.md')).toBe('b-before');
	});
});

describe('BackupService drift 检测', () => {
	beforeEach(() => {
		__resetBackupForTest();
		__resetNotices();
	});

	it('content 当前=after 时安全还原不告警', async () => {
		const app = createAppMock({ 'a.md': 'before' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('properties', 'Edit properties');
		await recorder.snapshotContentBefore({ path: 'a.md' } as never);
		app.vault.files.set('a.md', 'after');
		await recorder.finish();

		const record = (await getBackup().getHistory())[0];
		const result = await getBackup().revert(record.id, ['a.md']);
		expect(result.items[0].status).toBe('reverted');
	});

	it('content 被中途修改时默认不覆盖并标记 drift', async () => {
		const app = createAppMock({ 'a.md': 'before' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('properties', 'Edit properties');
		await recorder.snapshotContentBefore({ path: 'a.md' } as never);
		app.vault.files.set('a.md', 'after');
		await recorder.finish();

		// 用户在操作后手动改过
		app.vault.files.set('a.md', 'user-changed');

		const record = (await getBackup().getHistory())[0];
		const result = await getBackup().revert(record.id, ['a.md']);
		expect(result.items[0].status).toBe('drift');
		expect(app.vault.files.get('a.md')).toBe('user-changed');
	});

	it('content 被中途修改时 force 才覆盖', async () => {
		const app = createAppMock({ 'a.md': 'before' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('properties', 'Edit properties');
		await recorder.snapshotContentBefore({ path: 'a.md' } as never);
		app.vault.files.set('a.md', 'after');
		await recorder.finish();

		app.vault.files.set('a.md', 'user-changed');

		const record = (await getBackup().getHistory())[0];
		const result = await getBackup().revert(record.id, ['a.md'], true);
		expect(result.items[0].status).toBe('reverted');
		expect(app.vault.files.get('a.md')).toBe('before');
	});

	it('delete 原路径已重新存在文件时绝不覆盖并提示冲突', async () => {
		const app = createAppMock({ 'gone.md': 'before' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('delete', 'Delete files');
		await recorder.snapshotContentBefore({ path: 'gone.md' } as never);
		await app.vault.trash({ path: 'gone.md' } as never, true);
		await recorder.finish();

		// 用户在原路径重新创建了文件
		app.vault.files.set('gone.md', 'new-user-file');

		const record = (await getBackup().getHistory())[0];
		const result = await getBackup().revert(record.id, ['gone.md'], true);
		expect(result.items[0].status).toBe('drift');
		expect(app.vault.files.get('gone.md')).toBe('new-user-file');
	});

	it('path 已被再次移动时不执行回滚并提示', async () => {
		const app = createAppMock({ 'a.md': 'x' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('move', 'Move files');
		await recorder.snapshotPath({ path: 'a.md' } as never, 'sub/a.md');
		await app.fileManager.renameFile({ path: 'a.md' } as never, 'sub/a.md');
		await recorder.finish();

		// 用户又把它移到了别处
		await app.fileManager.renameFile({ path: 'sub/a.md' } as never, 'elsewhere.md');

		const record = (await getBackup().getHistory())[0];
		const result = await getBackup().revert(record.id, ['a.md']);
		expect(result.items[0].status).toBe('drift');
		expect(app.vault.files.has('elsewhere.md')).toBe(true);
	});

	it('path 已处于旧路径时跳过且不报错', async () => {
		const app = createAppMock({ 'a.md': 'x' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('move', 'Move files');
		await recorder.snapshotPath({ path: 'a.md' } as never, 'sub/a.md');
		await app.fileManager.renameFile({ path: 'a.md' } as never, 'sub/a.md');
		await recorder.finish();

		// 用户已手动移回旧路径（已处于还原后状态）
		await app.fileManager.renameFile({ path: 'sub/a.md' } as never, 'a.md');

		const record = (await getBackup().getHistory())[0];
		const result = await getBackup().revert(record.id, ['a.md']);
		expect(result.items[0].status).toBe('reverted');
		expect(app.vault.files.has('a.md')).toBe(true);
	});

	it('checkDrift 返回每条文件的 drift 状态供 UI 层展示', async () => {
		const app = createAppMock({ 'a.md': 'before' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('properties', 'Edit properties');
		await recorder.snapshotContentBefore({ path: 'a.md' } as never);
		app.vault.files.set('a.md', 'after');
		await recorder.finish();

		app.vault.files.set('a.md', 'user-changed');
		const record = (await getBackup().getHistory())[0];
		const drift = await getBackup().checkDrift(record.id);
		expect(drift).toHaveLength(1);
		expect(drift[0].drifted).toBe(true);
		expect(drift[0].reason).toBe('content-modified');
	});
});

describe('BackupService 保留清理与降级', () => {
	beforeEach(() => {
		__resetBackupForTest();
		__resetNotices();
	});

	it('超过 retention 自动清理最旧记录及其 blob 目录', async () => {
		const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
		const app = createAppMock();
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS, retention: 2 });

		const ids: string[] = [];
		for (let i = 0; i < 3; i++) {
			nowSpy.mockReturnValue(1700000000000 + i);
			const path = `new-${i}.md`;
			const recorder = getBackup().begin('create', `Create ${i}`);
			await recorder.snapshotCreated(path, '');
			app.vault.files.set(path, `content-${i}`);
			await recorder.finish();
			ids.push((await getBackup().getHistory())[0].id);
		}
		nowSpy.mockRestore();

		const history = await getBackup().getHistory();
		expect(history).toHaveLength(2);
		// 最旧的 ids[0] 的 blob 已被清理，ids[1] 的 blob 仍存在
		expect(await app.vault.adapter.exists(`${BACKUP_DIR}/${ids[0]}/f-0.after.md`)).toBe(false);
		expect(await app.vault.adapter.exists(`${BACKUP_DIR}/${ids[1]}/f-0.after.md`)).toBe(true);
	});

	it('单文件备份缺失时跳过该文件并继续处理其余文件', async () => {
		const app = createAppMock({ 'a.md': 'a-before', 'b.md': 'b-before' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder = getBackup().begin('properties', 'Edit properties');
		await recorder.snapshotContentBefore({ path: 'a.md' } as never);
		await recorder.snapshotContentBefore({ path: 'b.md' } as never);
		app.vault.files.set('a.md', 'a-after');
		app.vault.files.set('b.md', 'b-after');
		await recorder.finish();

		const record = (await getBackup().getHistory())[0];
		// 模拟 a.md 的 before blob 被删除
		await app.vault.adapter.remove(blobPath(record, record.files[0].beforeBlob));

		const result = await getBackup().revert(record.id, ['a.md', 'b.md']);

		const a = result.items.find((item) => item.path === 'a.md');
		const b = result.items.find((item) => item.path === 'b.md');
		expect(a?.status).toBe('skipped');
		expect(a?.message).toContain('Backup missing');
		expect(b?.status).toBe('reverted');
		expect(app.vault.files.get('b.md')).toBe('b-before');
	});

	it('getHistory 按时间倒序返回（最新在前）', async () => {
		const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
		const app = createAppMock();
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const recorder1 = getBackup().begin('create', 'First');
		await recorder1.snapshotCreated('1.md', '');
		app.vault.files.set('1.md', 'c1');
		await recorder1.finish();

		nowSpy.mockReturnValue(1700000001000);
		const recorder2 = getBackup().begin('create', 'Second');
		await recorder2.snapshotCreated('2.md', '');
		app.vault.files.set('2.md', 'c2');
		await recorder2.finish();
		nowSpy.mockRestore();

		const history = await getBackup().getHistory();
		expect(history).toHaveLength(2);
		expect(history[0].opLabel).toBe('Second');
		expect(history[1].opLabel).toBe('First');
	});
});
