import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
	return await import('../mocks/obsidian');
});

// 控制 Dataview 可用性
const getApiMock = vi.hoisted(() => vi.fn());
vi.mock('obsidian-dataview', () => ({ getAPI: getApiMock }));

// mock 既有 Action / 选择弹窗模块，验证分发
const editAct = vi.hoisted(() => vi.fn());
const aiPropsAct = vi.hoisted(() => vi.fn());
const deleteAct = vi.hoisted(() => vi.fn());
const renameAct = vi.hoisted(() => vi.fn());
const folderOpen = vi.hoisted(() => vi.fn());
const fileOpen = vi.hoisted(() => vi.fn());
const canvasOpen = vi.hoisted(() => vi.fn());

vi.mock('src/action/edit-properties-action', () => ({
	EditPropertiesAction: class {
		act = editAct;
	},
}));
vi.mock('src/action/ai-properties-action', () => ({
	AiPropertiesAction: class {
		act = aiPropsAct;
	},
}));
vi.mock('src/action/delete-action', () => ({
	DeleteAction: class {
		act = deleteAct;
	},
}));
vi.mock('src/action/rename-action', () => ({
	RenameAction: class {
		act = renameAct;
	},
}));
vi.mock('src/action/move-action', () => ({
	MoveAction: class {
		constructor(_app: unknown, public folder: string) {}
	},
}));
vi.mock('src/modal/choose-folder-modal', () => ({
	ChooseFolderModal: class {
		open = folderOpen;
	},
}));
vi.mock('src/modal/choose-file-modal', () => ({
	ChooseFileModal: class {
		open = fileOpen;
	},
}));
vi.mock('src/modal/choose-canvas-modal', () => ({
	ChooseCanvasModal: class {
		open = canvasOpen;
	},
}));

import { __getNotices, __resetNotices, TFile } from '../mocks/obsidian';
import { AiSelectorModal } from 'src/modal/ai-selector-modal';
import { QueryIR } from 'src/ai/query-ir';

/**
 * 测试目的：验证自然语言选择器弹窗的三态流转、目标过滤、编辑执行与分发。
 * 测试内容：input→query 态；Dataview 缺席时目标过滤；编辑查询文本后按新文本执行；
 *          results 态清单与分发；规划失败停留 input 态。
 * 预期结果：执行为只读；分发复用既有 Action 管线；退化路径均有提示。
 */

const SAMPLE_IR: QueryIR = {
	irVersion: 1,
	intent: '去年的读书笔记',
	conditions: { and: [{ tag: '读书' }, { fileModified: { op: 'gte', date: '2025-01-01' } }] },
};

function makeDeps(overrides: {
	planner?: { generate: ReturnType<typeof vi.fn> };
	executor?: { execute: ReturnType<typeof vi.fn> };
} = {}) {
	return {
		planner: overrides.planner ?? { generate: vi.fn(async () => SAMPLE_IR) },
		executor: overrides.executor ?? { execute: vi.fn(async () => [new TFile('a.md'), new TFile('b.md')]) },
	};
}

function mdFile(path: string): TFile {
	return { path, name: path.split('/').pop() ?? path, parent: null } as unknown as TFile;
}

beforeEach(() => {
	__resetNotices();
	getApiMock.mockReset();
	getApiMock.mockReturnValue({}); // Dataview 可用
	(globalThis as any).localStorage = { getItem: vi.fn(() => null), setItem: vi.fn() };
});

describe('AiSelectorModal', () => {

	it('input→query：生成后进入提案态，目标包含 DQL（Dataview 可用）', async () => {
		const modal = new AiSelectorModal({} as never, makeDeps());
		modal.open();
		await modal.submitInput('去年的读书笔记');

		expect(modal.phase).toBe('query');
		expect(modal.ir?.intent).toBe('去年的读书笔记');
		expect(modal.availableTargets).toEqual(['dql', 'search', 'bases']);
		// tag 进 FROM、fileModified 进 WHERE，DQL 完整表达 → 推荐 dql
		expect(modal.recommendedTarget).toBe('dql');
	});

	it('Dataview 不可用时目标集合不含 dql', async () => {
		getApiMock.mockReturnValue(null);
		const modal = new AiSelectorModal({} as never, makeDeps());
		modal.open();
		await modal.submitInput('x');

		expect(modal.availableTargets).toEqual(['search', 'bases']);
	});

	it('编辑查询文本后执行，按编辑后的文本调用执行器', async () => {
		const executor = { execute: vi.fn(async () => [mdFile('a.md')]) };
		const modal = new AiSelectorModal({} as never, makeDeps({ executor }));
		modal.open();
		await modal.submitInput('x');

		modal.selectTarget('search');
		modal.setQueryText('tag:#读书 file:2025');
		await modal.runQuery();

		expect(executor.execute).toHaveBeenCalledWith('search', 'tag:#读书 file:2025');
		expect(modal.phase).toBe('results');
		expect(modal.results).toHaveLength(1);
	});

	it('分发：编辑属性以命中清单调用既有 Action 并关闭弹窗', async () => {
		const executor = { execute: vi.fn(async () => [mdFile('a.md'), mdFile('b.md')]) };
		const modal = new AiSelectorModal({} as never, makeDeps({ executor }));
		modal.open();
		await modal.submitInput('x');
		await modal.runQuery();

		modal.dispatch('properties');

		expect(editAct).toHaveBeenCalledTimes(1);
		const models = editAct.mock.calls[0][0] as Array<{ file: { path: string } }>;
		expect(models.map((m) => m.file.path)).toEqual(['a.md', 'b.md']);
		// 叠层方案 A：选择器保留，命中清单可继续使用
		expect((modal as unknown as { closed: boolean }).closed).toBe(false);
	});

	it('结果态可返回查询提案视图（保留编辑文本与目标选择）', async () => {
		const executor = { execute: vi.fn(async () => [mdFile('a.md')]) };
		const modal = new AiSelectorModal({} as never, makeDeps({ executor }));
		modal.open();
		await modal.submitInput('x');
		modal.selectTarget('search');
		modal.setQueryText('tag:#读书');
		await modal.runQuery();
		expect(modal.phase).toBe('results');

		// 点击操作条上的「返回查询」按钮
		const { Setting } = await import('obsidian');
		const settings = (Setting as unknown as { instances: Array<{ buttons: Array<{ buttonText: string; onClickHandler?: () => void }> }> }).instances;
		const lastSetting = settings[settings.length - 1];
		const backBtn = lastSetting.buttons.find((b) => b.buttonText === '返回查询');
		expect(backBtn).toBeDefined();
		backBtn!.onClickHandler?.();

		expect(modal.phase).toBe('query');
		// 编辑文本与目标选择保留
		expect(modal.selectedTarget).toBe('search');
		expect(modal.effectiveQueryText()).toBe('tag:#读书');
	});

	it('分发：移动经 ChooseFolderModal 的 readerAdapter 打开', async () => {
		const executor = { execute: vi.fn(async () => [mdFile('a.md')]) };
		const modal = new AiSelectorModal({} as never, makeDeps({ executor }));
		modal.open();
		await modal.submitInput('x');
		await modal.runQuery();

		modal.dispatch('move');

		expect(folderOpen).toHaveBeenCalledTimes(1);
	});

	it('规划失败：停留 input 态并给出提示', async () => {
		const planner = { generate: vi.fn(async () => { throw new Error('AI 响应不是合法 JSON'); }) };
		const modal = new AiSelectorModal({} as never, makeDeps({ planner }));
		modal.open();
		await modal.submitInput('x');

		expect(modal.phase).toBe('input');
		expect(__getNotices().some((n) => n.includes('规划失败'))).toBe(true);
	});
});
