import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
	return await import('../mocks/obsidian');
});

import { Setting } from 'obsidian';
import { __getNotices, __resetNotices } from '../mocks/obsidian';
import { createAppMock } from '../mocks/vault-mock';
import { __resetBackupForTest, getBackup, initBackup } from 'src/backup/backup-service';
import { DEFAULT_BACKUP_SETTINGS } from 'src/backup/backup-settings';
import { EditPropertiesModal } from 'src/modal/edit-properties-modal';

/**
 * 测试目的：代表性子集成测试——属性编辑模态框在真实备份通道下的完整链路。
 * 测试内容：构造 modal → 模拟内存 vault 点击 Apply → 断言历史出现记录且文件已变更。
 * 预期结果：应用成功后生成 content 类备份记录，before/after blob 正确落盘。
 */

type SettingStatics = {
	instances: Array<{ texts: Array<any>; buttons: Array<any> }>;
	reset: () => void;
};

function findButtonByText(text: string) {
	const settingClass = Setting as unknown as SettingStatics;
	for (const setting of settingClass.instances) {
		const found = setting.buttons.find((button: any) => button.buttonText === text);
		if (found) {
			return found;
		}
	}
	return undefined;
}

describe('EditPropertiesModal 备份集成', () => {
	beforeEach(() => {
		(Setting as unknown as SettingStatics).reset();
		__resetNotices();
		__resetBackupForTest();
		(globalThis as any).localStorage = {
			getItem: vi.fn(() => null),
			setItem: vi.fn(),
		};
	});

	it('点击 Apply 后文件属性变更且历史出现一条 content 备份记录', async () => {
		const app = createAppMock({ 'notes/a.md': 'hello world' });
		initBackup(app as never, { ...DEFAULT_BACKUP_SETTINGS });

		const files = [{ path: 'notes/a.md', name: 'a.md', parent: { path: 'notes' } }];
		const modal = new EditPropertiesModal(app as never, files as any);
		modal.onOpen();

		// 输入属性键值（Setting 顺序：Property Key / Property Value / Override / 操作按钮）
		const settings = (Setting as unknown as SettingStatics).instances;
		settings[0].texts[0].setValue('status');
		settings[1].texts[0].setValue('done');

		const apply = findButtonByText('应用属性');
		await apply?.click();

		// 文件内容已变更（frontmatter 写入 status）
		expect(app.vault.files.get('notes/a.md')).toContain('status: done');
		expect(__getNotices()).toContain('属性已更新。');

		// 历史出现一条记录，before/after blob 正确
		const history = await getBackup().getHistory();
		expect(history).toHaveLength(1);
		const record = history[0];
		expect(record.opType).toBe('properties');
		expect(record.files[0].kind).toBe('content');
		expect(record.files[0].path).toBe('notes/a.md');
		expect(
			await app.vault.adapter.read(`.file-cooker/backups/${record.id}/${record.files[0].beforeBlob}`)
		).toBe('hello world');
		expect(
			await app.vault.adapter.read(`.file-cooker/backups/${record.id}/${record.files[0].afterBlob}`)
		).toContain('status: done');
	});
});
