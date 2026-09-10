import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
	return await import('../mocks/obsidian');
});

import { Setting } from 'obsidian';
import { __getNotices, __resetNotices } from '../mocks/obsidian';
import { UndoHistoryModal } from 'src/modal/undo-history-modal';
import type { RevertResult } from 'src/backup/backup-service';
import type { UndoRecord } from 'src/backup/undo-record';

/**
 * 测试目的：验证 UndoHistoryModal 的展开/勾选→回滚交互与 drift 禁用逻辑。
 * 测试内容：最近记录默认展开且可回滚文件默认全选；记录标题点击展开/收起；
 *          drift 条目默认禁用，开启“覆盖被修改的文件”后才可用并默认勾选；
 *          回滚前二次确认，确认后以 revert(recordId, paths, force) 正确参数触发。
 * 预期结果：交互遵循“打开即可回滚”的直觉路径，drift 条目遵循 force 语义。
 */

function makeRecords(): UndoRecord[] {
	return [
		{
			id: 'rec-1',
			time: 1700000000000,
			opType: 'properties',
			opLabel: 'Edit properties',
			status: 'active',
			files: [
				{ kind: 'content', path: 'a.md', beforeBlob: 'f-0.before.md', afterBlob: 'f-0.after.md' },
				{ kind: 'content', path: 'b.md', beforeBlob: 'f-1.before.md', afterBlob: 'f-1.after.md' },
			],
		},
	];
}

function createStubService(records: UndoRecord[]) {
	const revert = vi.fn(
		async (recordId: string, paths: string[], force: boolean): Promise<RevertResult> => ({
			recordId,
			items: paths.map((path) => ({ path, status: 'reverted' })),
		})
	);
	const service = {
		getHistory: vi.fn(async () => records),
		checkDrift: vi.fn(async (recordId: string) => {
			if (recordId === 'rec-1') {
				return [
					{ path: 'a.md', kind: 'content', drifted: false },
					{ path: 'b.md', kind: 'content', drifted: true, reason: 'content-modified' },
				];
			}
			return [];
		}),
		revert,
	};
	return { service, revert };
}

type SettingStatics = {
	instances: Array<{ buttons: Array<any> }>;
	reset: () => void;
};

/** 测试用 Toggle 视图：真实 Obsidian 类型无 trigger/disabled，测试中以 mock 形态访问。 */
type MockToggle = {
	value: boolean;
	disabled: boolean;
	trigger(value: boolean): void;
};

function asMockToggle(toggle: unknown): MockToggle | undefined {
	return toggle as MockToggle | undefined;
}

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

describe('UndoHistoryModal 展开与回滚交互', () => {
	beforeEach(() => {
		(Setting as unknown as SettingStatics).reset();
		__resetNotices();
		// 回滚前二次确认：默认同意，便于驱动回滚流程
		vi.stubGlobal('window', { confirm: vi.fn(() => true) });
	});

	it('最近记录默认展开，可回滚文件默认全选，直接回滚触发 revert(recordId, paths, force=false)', async () => {
		const { service, revert } = createStubService(makeRecords());
		const modal = new UndoHistoryModal({} as never, { service: service as never });

		await modal.onOpen();

		expect(service.getHistory).toHaveBeenCalled();
		expect(service.checkDrift).toHaveBeenCalledWith('rec-1');

		// 最近记录默认展开 → a.md（无 drift）默认勾选且可用；b.md（drift）默认禁用
		const aToggle = asMockToggle(modal.fileToggles.get('rec-1')?.get('a.md'));
		const bToggle = asMockToggle(modal.fileToggles.get('rec-1')?.get('b.md'));
		expect(aToggle).toBeDefined();
		expect(bToggle).toBeDefined();
		expect(aToggle?.disabled).toBe(false);
		expect(aToggle?.value).toBe(true);
		expect(bToggle?.disabled).toBe(true);

		const revertButton = findButtonByText('回滚选中的文件');
		expect(revertButton).toBeDefined();
		await revertButton?.click();

		expect(revert).toHaveBeenCalledTimes(1);
		expect(revert).toHaveBeenCalledWith('rec-1', ['a.md'], false);
		expect(__getNotices().some((msg) => msg.includes('回滚完成'))).toBe(true);
	});

	it('drift 条目默认禁用且未勾选，开启“覆盖被修改的文件”后可用并默认勾选，回滚带 force=true', async () => {
		const { service, revert } = createStubService(makeRecords());
		const modal = new UndoHistoryModal({} as never, { service: service as never });

		await modal.onOpen();

		// 未开启强制覆盖：drift 条目禁用且触发无效
		const bToggle = asMockToggle(modal.fileToggles.get('rec-1')?.get('b.md'));
		expect(bToggle?.disabled).toBe(true);
		bToggle?.trigger(true);

		// 开启覆盖后重渲染：drift 条目可用，并因“默认全选”被勾选
		asMockToggle(modal.forceOverrideToggle)?.trigger(true);
		const bToggleAfterForce = asMockToggle(modal.fileToggles.get('rec-1')?.get('b.md'));
		expect(bToggleAfterForce?.disabled).toBe(false);
		expect(bToggleAfterForce?.value).toBe(true);

		bToggleAfterForce?.trigger(true);

		const revertButton = findButtonByText('回滚选中的文件');
		await revertButton?.click();

		expect(revert).toHaveBeenCalledTimes(1);
		// 默认全选 a.md + force 后全选 b.md，两者都在勾选集合中
		expect(revert).toHaveBeenCalledWith('rec-1', expect.arrayContaining(['b.md']), true);
	});

	it('记录标题整行点击可展开/收起', async () => {
		const { service } = createStubService(makeRecords());
		const modal = new UndoHistoryModal({} as never, { service: service as never });

		await modal.onOpen();

		// 最近记录默认展开：两条文件的 toggle 都存在
		expect(modal.fileToggles.get('rec-1')?.size).toBe(2);

		// 每次点击前重新获取当前渲染的标题元素（render() 会重建 DOM；标题位于记录卡片容器内）
		const findTitle = () => {
			const record = (modal as any).contentEl.children.find((c: any) => c.cls.includes('file-cooker-modal__record'));
			return record?.children.find((c: any) => c.cls.includes('record-title'));
		};
		expect(findTitle()).toBeDefined();

		// 点击标题收起 → 文件列表隐藏，toggle 引用清理
		findTitle().trigger('click');
		expect(modal.fileToggles.get('rec-1')?.size).toBeUndefined();

		// 再次点击展开 → 文件列表恢复
		findTitle().trigger('click');
		expect(modal.fileToggles.get('rec-1')?.size).toBe(2);
	});

	it('未勾选任何文件时点击回滚给出提示且不触发 revert', async () => {
		const { service, revert } = createStubService(makeRecords());
		const modal = new UndoHistoryModal({} as never, { service: service as never });

		await modal.onOpen();

		// 取消唯一可回滚文件的勾选
		asMockToggle(modal.fileToggles.get('rec-1')?.get('a.md'))?.trigger(false);

		const revertButton = findButtonByText('回滚选中的文件');
		await revertButton?.click();

		expect(revert).not.toHaveBeenCalled();
		expect(__getNotices().some((msg) => msg.includes('未勾选任何文件'))).toBe(true);
	});

	it('二次确认被拒绝时不触发 revert', async () => {
		const { service, revert } = createStubService(makeRecords());
		const modal = new UndoHistoryModal({} as never, { service: service as never });

		vi.stubGlobal('window', { confirm: vi.fn(() => false) });

		await modal.onOpen();

		const revertButton = findButtonByText('回滚选中的文件');
		await revertButton?.click();

		expect(revert).not.toHaveBeenCalled();
	});

	it('无历史时展示空态提示', async () => {
		const { service } = createStubService([]);
		const modal = new UndoHistoryModal({} as never, { service: service as never });

		await modal.onOpen();

		expect(service.getHistory).toHaveBeenCalled();
		expect(modal.fileToggles.size).toBe(0);
	});
});
