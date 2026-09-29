import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
	return await import('../mocks/obsidian');
});

import { Setting } from 'obsidian';
import type { TFile } from 'obsidian';
import { __getNotices, __resetNotices } from '../mocks/obsidian';
import { createAppMock } from '../mocks/vault-mock';
import { DEFAULT_BACKUP_SETTINGS } from 'src/backup/backup-settings';
import { __resetBackupForTest, getBackup, initBackup } from 'src/backup/backup-service';
import { RenamePropertyModal } from 'src/modal/rename-property-modal';

/**
 * 测试目的：验证批量重命名属性键弹窗（issue #15）的写入语义与备份通道接入。
 * 测试内容：旧键值移动到新键且旧键删除、Override 开/关语义、旧键缺失跳过、
 *          校验分支（空键/同键零写入）、备份记录生成。
 * 预期结果：仅命中文件被改写且属性值保持不变；取消/校验失败零写入。
 */

function mdFile(path: string): TFile {
	return { path, name: path.split('/').pop() ?? path, parent: null } as unknown as TFile;
}

/** 用初始 props 直接驱动 processFrontMatter 回调，返回写回后的 props。 */
async function runOnProps(
	initial: Record<string, unknown>,
	oldKey: string,
	newKey: string,
	override: boolean
): Promise<Record<string, unknown>> {
	const app = createAppMock({ 'a.md': 'body' });
	initBackup(app as never, DEFAULT_BACKUP_SETTINGS);
	let result!: Record<string, unknown>;
	(app.fileManager as any).processFrontMatter = vi.fn(
		async (_file: unknown, fn: (props: Record<string, unknown>) => void) => {
			const props: Record<string, unknown> = { ...initial };
			fn(props);
			result = props;
		}
	);
	(Setting as unknown as { reset(): void }).reset();
	const modal = new RenamePropertyModal(app as never, [mdFile('a.md')]);
	modal.onOpen();
	const settings = (Setting as unknown as { instances: Array<any> }).instances;
	settings[0].texts[0].setValue(oldKey);
	settings[1].texts[0].setValue(newKey);
	settings[2].toggles[0].trigger(override);
	await settings[3].buttons.find((btn: any) => btn.buttonText === '重命名')?.click();
	return result;
}

describe('RenamePropertyModal 批量重命名属性键', () => {
	beforeEach(() => {
		(Setting as unknown as { reset(): void }).reset();
		__resetNotices();
		__resetBackupForTest();
		(globalThis as any).localStorage = {
			getItem: vi.fn(() => null),
			setItem: vi.fn(),
		};
	});

	it('旧键值移动到新键，旧键删除，值保持不变', async () => {
		const result = await runOnProps({ status: 'done', keep: 'x' }, 'status', 'state', true);
		expect(result).toEqual({ state: 'done', keep: 'x' });
		expect(__getNotices()).toContain('属性已重命名。');
	});

	it('新键已存在且 Override 关闭：跳过，两键保留', async () => {
		const result = await runOnProps({ status: 'done', state: 'open' }, 'status', 'state', false);
		expect(result).toEqual({ status: 'done', state: 'open' });
	});

	it('新键已存在且 Override 开启：覆盖新键值并删除旧键', async () => {
		const result = await runOnProps({ status: 'done', state: 'open' }, 'status', 'state', true);
		expect(result).toEqual({ state: 'done' });
	});

	it('文件没有旧键时不做任何修改', async () => {
		const result = await runOnProps({ other: 'x' }, 'status', 'state', true);
		expect(result).toEqual({ other: 'x' });
	});

	it('新旧键相同给出校验提示且零写入', async () => {
		const app = createAppMock({ 'a.md': 'body' });
		initBackup(app as never, DEFAULT_BACKUP_SETTINGS);
		const processFrontMatter = vi.fn();
		(app.fileManager as any).processFrontMatter = processFrontMatter;
		(Setting as unknown as { reset(): void }).reset();

		const modal = new RenamePropertyModal(app as never, [mdFile('a.md')]);
		modal.onOpen();
		const settings = (Setting as unknown as { instances: Array<any> }).instances;
		settings[0].texts[0].setValue('same');
		settings[1].texts[0].setValue('same');
		await settings[3].buttons.find((btn: any) => btn.buttonText === '重命名')?.click();

		expect(__getNotices()).toContain('新旧属性键不能相同。');
		expect(processFrontMatter).not.toHaveBeenCalled();
	});

	it('取消按钮零写入', async () => {
		const app = createAppMock({ 'a.md': 'body' });
		initBackup(app as never, DEFAULT_BACKUP_SETTINGS);
		const processFrontMatter = vi.fn();
		(app.fileManager as any).processFrontMatter = processFrontMatter;
		(Setting as unknown as { reset(): void }).reset();

		const modal = new RenamePropertyModal(app as never, [mdFile('a.md')]);
		modal.onOpen();
		const settings = (Setting as unknown as { instances: Array<any> }).instances;
		await settings[3].buttons.find((btn: any) => btn.buttonText === '取消')?.click();

		expect(processFrontMatter).not.toHaveBeenCalled();
		expect(__getNotices()).toContain('操作已取消。');
	});

	it('应用成功后生成备份记录，可回滚', async () => {
		const app = createAppMock({ 'a.md': '---\nstatus: done\n---\nbody' });
		initBackup(app as never, DEFAULT_BACKUP_SETTINGS);

		const modal = new RenamePropertyModal(app as never, [mdFile('a.md')]);
		modal.onOpen();
		const settings = (Setting as unknown as { instances: Array<any> }).instances;
		settings[0].texts[0].setValue('status');
		settings[1].texts[0].setValue('state');
		settings[2].toggles[0].trigger(true);
		await settings[3].buttons.find((btn: any) => btn.buttonText === '重命名')?.click();

		const history = await getBackup().getHistory();
		expect(history.length).toBe(1);
		expect(history[0].opType).toBe('properties');
	});
});
