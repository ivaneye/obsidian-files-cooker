import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
	return await import('../mocks/obsidian');
});

import { DEFAULT_BACKUP_SETTINGS, deepMerge, BackupSettings } from 'src/backup/backup-settings';

/**
 * 测试目的：验证备份设置的默认值与深合并纯函数行为。
 * 测试内容：默认值、嵌套对象深合并（浅拷贝会丢子字段的场景）、原始值覆盖、null 输入容错。
 * 预期结果：默认值正确；深合并保留未覆盖的嵌套子字段。
 */

describe('BackupSettings 默认值', () => {
	it('默认开启备份、目录为 .file-cooker/backups、保留 20 次', () => {
		expect(DEFAULT_BACKUP_SETTINGS).toEqual({
			enabled: true,
			backupFolder: '.file-cooker/backups',
			retention: 20,
		});
	});
});

describe('deepMerge 深合并', () => {
	it('嵌套 backup 段部分覆盖时保留未覆盖的子字段（修复 Object.assign 浅拷贝缺陷）', () => {
		const defaults = {
			flomoAPI: '',
			limit: '300',
			backup: DEFAULT_BACKUP_SETTINGS,
		};
		const stored = {
			limit: '500',
			backup: { retention: 5 },
		};

		const merged = deepMerge(defaults, stored);

		expect(merged).toEqual({
			flomoAPI: '',
			limit: '500',
			backup: { enabled: true, backupFolder: '.file-cooker/backups', retention: 5 },
		});
	});

	it('完整 backup 段覆盖时以存储值为准', () => {
		const custom: BackupSettings = { enabled: false, backupFolder: 'backups/x', retention: 3 };
		const merged = deepMerge<{ backup: BackupSettings }>(
			{ backup: DEFAULT_BACKUP_SETTINGS },
			{ backup: custom }
		);
		expect(merged.backup).toEqual(custom);
	});

	it('数组与原始值直接覆盖而非合并', () => {
		const merged = deepMerge({ tags: ['a'], count: 1 }, { tags: ['b'], count: 2 });
		expect(merged).toEqual({ tags: ['b'], count: 2 });
	});

	it('null / undefined 来源被忽略', () => {
		const merged = deepMerge({ a: 1, nested: { x: 1 } }, null, undefined);
		expect(merged).toEqual({ a: 1, nested: { x: 1 } });
	});

	it('多层嵌套逐层合并', () => {
		const merged = deepMerge({ a: { b: { c: 1, d: 2 } } }, { a: { b: { c: 9 } } });
		expect(merged).toEqual({ a: { b: { c: 9, d: 2 } } });
	});
});
