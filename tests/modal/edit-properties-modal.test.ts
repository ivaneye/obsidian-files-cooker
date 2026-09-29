import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
	return await import('../mocks/obsidian');
});

import { Setting } from 'obsidian';
import type { TFile } from 'obsidian';
import { __getNotices, __resetNotices } from '../mocks/obsidian';
import { createAppMock } from '../mocks/vault-mock';
import { DEFAULT_BACKUP_SETTINGS } from 'src/backup/backup-settings';
import { __resetBackupForTest, initBackup } from 'src/backup/backup-service';
import { EditPropertiesModal } from 'src/modal/edit-properties-modal';
import { parseScalarInput } from 'src/modal/modal-ui';

/**
 * 测试目的：回归 GitHub issue #18 —— 编辑属性输入 true/false 时被写成字符串 "true"/"false"，
 * YAML 序列化加引号后破坏 Obsidian 的 Checkbox（布尔）属性。
 * 测试内容：parseScalarInput 类型解析、弹窗写入路径的标量类型、Override 覆盖既有布尔值。
 * 预期结果：true/false（忽略大小写）以布尔值进入 frontmatter；其他输入保持字符串。
 */

function mdFile(path: string): TFile {
	return { path, name: path.split('/').pop() ?? path, parent: null } as unknown as TFile;
}

/** 捕获 processFrontMatter 回调收到的 props，便于断言写入值的类型。 */
function captureFrontMatterWrites(app: ReturnType<typeof createAppMock>): Array<Record<string, unknown>> {
	const captured: Array<Record<string, unknown>> = [];
	(app.fileManager as any).processFrontMatter = vi.fn(
		async (_file: unknown, fn: (props: Record<string, unknown>) => void) => {
			const props: Record<string, unknown> = {};
			fn(props);
			captured.push(props);
		}
	);
	return captured;
}

/** 打开弹窗并填入 键/值/覆盖 开关后点击“应用属性”。 */
async function applyProperties(
	modal: EditPropertiesModal,
	key: string,
	value: string,
	override: boolean
): Promise<void> {
	modal.onOpen();
	const settings = (Setting as unknown as { instances: Array<any> }).instances;
	settings[0].texts[0].setValue(key);
	settings[1].texts[0].setValue(value);
	settings[2].toggles[0].trigger(override);
	const apply = settings[3].buttons.find((btn: any) => btn.buttonText === '应用属性');
	await apply?.click();
}

/** 直接驱动 processFrontMatter 回调，断言写入后 props 的完整状态。 */
async function runOnProps(
	initial: Record<string, unknown>,
	key: string,
	value: string,
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
	const modal = new EditPropertiesModal(app as never, [mdFile('a.md')]);
	await applyProperties(modal, key, value, override);
	return result;
}

describe('parseScalarInput 类型解析', () => {
	it('true/false 忽略大小写解析为布尔值', () => {
		expect(parseScalarInput('true')).toBe(true);
		expect(parseScalarInput('false')).toBe(false);
		expect(parseScalarInput('True')).toBe(true);
		expect(parseScalarInput('FALSE')).toBe(false);
		expect(parseScalarInput(' true ')).toBe(true);
	});

	it('其他输入保持字符串（不猜测数字/文本意图）', () => {
		expect(parseScalarInput('hello')).toBe('hello');
		expect(parseScalarInput('yes')).toBe('yes');
		expect(parseScalarInput('123')).toBe('123');
		expect(parseScalarInput('')).toBe('');
	});
});

describe('EditPropertiesModal 布尔属性写入', () => {
	beforeEach(() => {
		(Setting as unknown as { reset(): void }).reset();
		__resetNotices();
		__resetBackupForTest();
		(globalThis as any).localStorage = {
			getItem: vi.fn(() => null),
			setItem: vi.fn(),
		};
	});

	it('输入 true 写入布尔值而非字符串 "true"（issue #18）', async () => {
		const app = createAppMock({ 'a.md': '---\nstatus: open\n---\nbody' });
		initBackup(app as never, DEFAULT_BACKUP_SETTINGS);
		const writes = captureFrontMatterWrites(app);

		const modal = new EditPropertiesModal(app as never, [mdFile('a.md')]);
		await applyProperties(modal, 'Done', 'true', true);

		expect(writes[0]['Done']).toBe(true);
		expect(writes[0]['Done']).not.toBe('true');
		expect(__getNotices()).toContain('属性已更新。');
	});

	it('输入 false 写入布尔值；文本值保持字符串', async () => {
		const app = createAppMock({ 'a.md': 'body' });
		initBackup(app as never, DEFAULT_BACKUP_SETTINGS);
		const writes = captureFrontMatterWrites(app);

		const modal = new EditPropertiesModal(app as never, [mdFile('a.md')]);
		await applyProperties(modal, 'Done', 'false', true);
		expect(writes[0]['Done']).toBe(false);

		const modal2 = new EditPropertiesModal(app as never, [mdFile('a.md')]);
		(Setting as unknown as { reset(): void }).reset();
		await applyProperties(modal2, 'Note', 'plain text', true);
		expect(writes[1]['Note']).toBe('plain text');
	});

	it('Override 关闭且属性不存在时仍写入布尔值', async () => {
		const app = createAppMock({ 'a.md': 'body' });
		initBackup(app as never, DEFAULT_BACKUP_SETTINGS);
		const writes = captureFrontMatterWrites(app);

		const modal = new EditPropertiesModal(app as never, [mdFile('a.md')]);
		await applyProperties(modal, 'Done', 'true', false);

		expect(writes[0]['Done']).toBe(true);
	});
});

describe('标签列表写入（issue #16 / #17 回归）', () => {
	beforeEach(() => {
		(Setting as unknown as { reset(): void }).reset();
		__resetNotices();
		__resetBackupForTest();
		(globalThis as any).localStorage = {
			getItem: vi.fn(() => null),
			setItem: vi.fn(),
		};
	});

	it('#17 删除唯一 tag 后移除空属性，不残留空数组项', async () => {
		const result = await runOnProps({ tags: ['tst'] }, 'tags', '-tst', true);
		expect(result).toEqual({});
	});

	it('#17 删除其中一个 tag 用 splice 移除，无空洞（null 项）', async () => {
		const result = await runOnProps({ tags: ['a', 'tst', 'b'] }, 'tags', '-tst', true);
		expect(result['tags']).toEqual(['a', 'b']);
		expect(result['tags']).not.toContain(undefined);
	});

	it('#16 添加已存在的 tag 不产生重复', async () => {
		const result = await runOnProps({ tags: ['tst'] }, 'tags', 'tst', false);
		expect(result['tags']).toEqual(['tst']);
	});

	it('#16 tags 去重忽略大小写；alias 保持大小写敏感', async () => {
		const tags = await runOnProps({ tags: ['tst'] }, 'tags', 'Tst', false);
		expect(tags['tags']).toEqual(['tst']);

		const alias = await runOnProps({ alias: ['Book'] }, 'alias', 'book', false);
		expect(alias['alias']).toEqual(['Book', 'book']);
	});

	it('混合增删一次完成：新增去重、删除拼接移除', async () => {
		const result = await runOnProps({ tags: ['a', 'b'] }, 'tags', 'c, -b', true);
		expect(result['tags']).toEqual(['a', 'c']);
	});
});
