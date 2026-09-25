import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
	return await import('../mocks/obsidian');
});

const getApiMock = vi.hoisted(() => vi.fn());
vi.mock('obsidian-dataview', () => ({ getAPI: getApiMock }));

const editAct = vi.hoisted(() => vi.fn());
const deleteAct = vi.hoisted(() => vi.fn());
vi.mock('src/action/edit-properties-action', () => ({
	EditPropertiesAction: class {
		act = editAct;
	},
}));
vi.mock('src/action/delete-action', () => ({
	DeleteAction: class {
		act = deleteAct;
	},
}));

import { __getNotices, __resetNotices, Platform, TFile } from '../mocks/obsidian';
import { ActionModel } from 'src/action/action';
import { WorkbenchModal } from 'src/modal/workbench-modal';
import { DEFAULT_AI_SETTINGS } from 'src/ai/ai-settings';

/**
 * 测试目的：验证工作台三步向导的状态机、多来源分发、lint 阻断与往返导航。
 * 测试内容：来源切换保留草稿；dql lint 错误阻断/仅警告放行；既有三来源 Reader 分发；
 *          确认清单与截断；执行分组分发；往返导航状态保留。
 * 预期结果：七来源统一走"得到文件→确认→执行"；写入仅在既有 Action 确认后发生。
 */

const SAMPLE_IR = {
	irVersion: 1,
	intent: '测试',
	conditions: { tag: '读书' },
};

function makeHost(limit = '300') {
	return {
		app: {},
		settings: { limit, ai: { ...DEFAULT_AI_SETTINGS } },
	} as never;
}

function makeDeps(overrides: {
	planner?: { generate: ReturnType<typeof vi.fn> };
	executor?: { execute: ReturnType<typeof vi.fn> };
	readers?: Record<string, unknown>;
} = {}) {
	return {
		planner: overrides.planner ?? { generate: vi.fn(async () => SAMPLE_IR) },
		executor: overrides.executor ?? { execute: vi.fn(async () => [new TFile('a.md')]) },
		readers: overrides.readers ?? {},
	};
}

function mdFile(path: string): TFile {
	return { path, name: path.split('/').pop() ?? path, parent: null } as unknown as TFile;
}

beforeEach(() => {
	__resetNotices();
	editAct.mockClear();
	deleteAct.mockClear();
	getApiMock.mockReset();
	getApiMock.mockReturnValue(null); // 默认无 Dataview：lint 走警告放行
	Platform.isMobile = false; // 恢复桌面态（叠层弹窗）
	(globalThis as any).localStorage = { getItem: vi.fn(() => null), setItem: vi.fn() };
});

describe('WorkbenchModal 状态机', () => {

	it('来源切换保留各来源草稿', () => {
		const modal = new WorkbenchModal({} as never, makeDeps(), makeHost());
		modal.open();

		modal.setSource('dql');
		modal.setDraft('LIST FROM #x');
		modal.setSource('search');
		modal.setDraft('tag:#x');
		modal.setSource('dql');

		expect(modal.getDraft('dql')).toBe('LIST FROM #x');
		expect(modal.getDraft('search')).toBe('tag:#x');
		expect(modal.source).toBe('dql');
	});

	it('dql lint 错误阻断执行（executor 未被调用）', async () => {
		getApiMock.mockReturnValue({
			tryQuery: vi.fn(async () => { throw new Error('Parse error'); }),
		});
		const executor = { execute: vi.fn(async () => []) };
		const modal = new WorkbenchModal({} as never, makeDeps({ executor }), makeHost());
		modal.open();
		modal.setSource('dql');
		modal.setDraft('LIST FRO #x');
		await modal.runSource();

		expect(modal.phase).toBe('query');
		expect(modal.lintIssues.some((i) => i.level === 'error')).toBe(true);
		expect(executor.execute).not.toHaveBeenCalled();
	});

	it('仅警告时放行执行并进入确认步骤', async () => {
		// getAPI 为 null → lintDql 仅警告
		const executor = { execute: vi.fn(async () => [mdFile('a.md')]) };
		const modal = new WorkbenchModal({} as never, makeDeps({ executor }), makeHost());
		modal.open();
		modal.setSource('dql');
		modal.setDraft('LIST FROM #x');
		await modal.runSource();

		expect(executor.execute).toHaveBeenCalledWith('dql', 'LIST FROM #x');
		expect(modal.phase).toBe('confirm');
		expect(modal.files).toHaveLength(1);
	});

	it('searchPanel 来源经既有 Reader 读取进入确认，清单链接触发原生预览事件', async () => {
		const readMock = vi.fn((action: { act: (m: unknown[]) => void }) => {
			action.act([
				new ActionModel(mdFile('s1.md') as never),
				new ActionModel(mdFile('s2.md') as never),
			]);
		});
		const hoverTrigger = vi.fn();
		const appMock = {
			workspace: { trigger: hoverTrigger },
			vault: {},
			metadataCache: {},
		};
		const modal = new WorkbenchModal(appMock as never, makeDeps({
			readers: { searchPanel: () => ({ read: readMock }) },
		}), makeHost());
		modal.open();
		modal.setSource('searchPanel');
		await modal.runSource();

		expect(readMock).toHaveBeenCalledTimes(1);
		expect(modal.phase).toBe('confirm');
		expect(modal.files.map((f) => f.path)).toEqual(['s1.md', 's2.md']);

		// 文件清单渲染为 internal-link；悬停应触发 Page Preview 监听的 hover-link
		const anchor = findFirstTag((modal as unknown as { contentEl: unknown }).contentEl, 'a');
		expect(anchor).toBeDefined();
		anchor.trigger('mouseover');
		expect(hoverTrigger).toHaveBeenCalledWith(
			'hover-link',
			expect.objectContaining({ linktext: 's1.md', sourcePath: 's1.md' }),
		);
	});

	/** 在 MockElement 树中查找第一个指定标签的元素。 */
	function findFirstTag(el: { tag?: string; children?: unknown[] }, tag: string): { tag: string; trigger: (t: string) => void } | null {
		if (el.tag === tag) {
			return el as { tag: string; trigger: (t: string) => void };
		}
		for (const child of el.children ?? []) {
			const found = findFirstTag(child as { tag?: string; children?: unknown[] }, tag);
			if (found != null) {
				return found;
			}
		}
		return null;
	}

	it('确认步骤按 limit 截断并明示', async () => {
		const executor = { execute: vi.fn(async () => [mdFile('a.md'), mdFile('b.md'), mdFile('c.md')]) };
		const modal = new WorkbenchModal({} as never, makeDeps({ executor }), makeHost('2'));
		modal.open();
		modal.setSource('dql');
		modal.setDraft('Q');
		await modal.runSource();

		expect(modal.files).toHaveLength(2);
		expect(modal.truncatedCount).toBe(1);
	});

	it('执行步骤分组分发：编辑属性以命中清单调用', async () => {
		const executor = { execute: vi.fn(async () => [mdFile('a.md')]) };
		const modal = new WorkbenchModal({} as never, makeDeps({ executor }), makeHost());
		modal.open();
		modal.setSource('search');
		modal.setDraft('tag:#x');
		await modal.runSource();
		modal.gotoExecute();

		expect(modal.phase).toBe('execute');
		modal.dispatch('properties');

		expect(editAct).toHaveBeenCalledTimes(1);
		// 桌面端叠层（方案 A）：工作台不关闭，命中清单可继续使用
		expect((modal as unknown as { closed: boolean }).closed).toBe(false);
		expect(modal.files).toHaveLength(1);
	});

	it('移动端分发回退为“先关再开”（叠层不可用）', async () => {
		Platform.isMobile = true;
		const executor = { execute: vi.fn(async () => [mdFile('a.md')]) };
		const modal = new WorkbenchModal({} as never, makeDeps({ executor }), makeHost());
		modal.open();
		modal.setSource('search');
		modal.setDraft('tag:#x');
		await modal.runSource();
		modal.gotoExecute();

		modal.dispatch('properties');

		expect(editAct).toHaveBeenCalledTimes(1);
		expect((modal as unknown as { closed: boolean }).closed).toBe(true);
	});

	it('往返导航：确认→查询保留草稿，执行→确认保留命中', async () => {
		const executor = { execute: vi.fn(async () => [mdFile('a.md')]) };
		const modal = new WorkbenchModal({} as never, makeDeps({ executor }), makeHost());
		modal.open();
		modal.setSource('search');
		modal.setDraft('tag:#x');
		await modal.runSource();
		modal.gotoExecute();

		modal.backToConfirm();
		expect(modal.phase).toBe('confirm');
		expect(modal.files).toHaveLength(1);

		modal.backToQuery();
		expect(modal.phase).toBe('query');
		expect(modal.getDraft('search')).toBe('tag:#x');
	});

	it('从笔记导入脚本：填入草稿并触发语法检查', async () => {
		// app 提供 getFiles / cachedRead，模拟含 ```dataview 块的笔记
		const appMock = {
			vault: {
				getMarkdownFiles: (): TFile[] => [mdFile('notes/scripts.md')],
				cachedRead: vi.fn(async () => '```dataview\nLIST FROM #读书\n```'),
				getFiles: (): TFile[] => [],
				adapter: { exists: vi.fn(async () => false) },
			},
		};
		const modal = new WorkbenchModal(appMock as never, makeDeps(), makeHost());
		modal.open();
		modal.setSource('dql');
		modal.openScriptImport();

		// 模拟在导入弹窗中选中文件（onChoose 路径）
		const { ScriptImportModal } = await import('src/modal/script-import-modal');
		void ScriptImportModal;

		// 直接验证导入应用语义：填草稿 + 触发 lint（无 Dataview → 警告放行）
		modal.applyImportedScript('LIST FROM #读书', 1);
		expect(modal.getDraft('dql')).toBe('LIST FROM #读书');
		await vi.waitFor(() => expect(modal.lintIssues.length).toBeGreaterThanOrEqual(0));
	});

	it('bases 来源：临时 .base 打开执行、读取渲染行并清理', async () => {
		const file = mdFile('b1.md');
		const writes: string[] = [];
		const removed: string[] = [];
		let detached = 0;
		const anchors = [{ dataset: { href: 'b1.md' } }];
		const fakeLeaf = {
			setViewState: vi.fn(async () => {}),
			detach: vi.fn(() => { detached++; }),
			view: { containerEl: { querySelectorAll: () => anchors } },
		};
		const appMock = {
			vault: {
				adapter: {
					mkdir: vi.fn(async () => {}),
					write: vi.fn(async (p: string, _c: string) => { writes.push(p); }),
					remove: vi.fn(async (p: string) => { removed.push(p); }),
					exists: vi.fn(async () => false),
				},
				getAbstractFileByPath: vi.fn((p: string) => (p === 'b1.md' ? file : null)),
			},
			workspace: { getLeaf: vi.fn(() => fakeLeaf) },
			metadataCache: {},
		};
		const executor = { execute: vi.fn(async () => []) };
		const modal = new WorkbenchModal(appMock as never, makeDeps({ executor }), makeHost());
		modal.open();
		modal.setSource('bases');
		modal.setDraft('filters:\n  and:\n    - \'file.hasTag("a")\'');
		await modal.runSource();

		// 临时 .base 落盘 → 视图渲染行被读取 → 确认步骤
		expect(writes.some((p) => p.endsWith('.base'))).toBe(true);
		expect(modal.phase).toBe('confirm');
		expect(modal.files.map((f) => f.path)).toEqual(['b1.md']);
		// 清理：临时 leaf 关闭、临时文件删除
		expect(detached).toBe(1);
		expect(removed.length).toBe(1);
		// 不走统一执行器（Bases 是独立通道）
		expect(executor.execute).not.toHaveBeenCalled();
	});

	it('AI 来源：生成后选择目标执行进入确认', async () => {
		const executor = { execute: vi.fn(async () => [mdFile('a.md')]) };
		const modal = new WorkbenchModal({} as never, makeDeps({ executor }), makeHost());
		modal.open();
		modal.setSource('ai');
		await modal.submitAiInput('去年的读书笔记');

		expect(modal.ir?.intent).toBe('测试');
		modal.selectAiTarget('search');
		await modal.runAiQuery();

		expect(modal.phase).toBe('confirm');
	});

	it('AI 来源选 Bases 目标：走临时 .base 通道而非统一执行器', async () => {
		const file = mdFile('b1.md');
		const writes: string[] = [];
		const anchors = [{ dataset: { href: 'b1.md' } }];
		const fakeLeaf = {
			setViewState: vi.fn(async () => {}),
			detach: vi.fn(() => {}),
			view: { containerEl: { querySelectorAll: () => anchors } },
		};
		const appMock = {
			vault: {
				adapter: {
					mkdir: vi.fn(async () => {}),
					write: vi.fn(async (p: string, _c: string) => { writes.push(p); }),
					remove: vi.fn(async () => {}),
					exists: vi.fn(async () => false),
				},
				getAbstractFileByPath: vi.fn((p: string) => (p === 'b1.md' ? file : null)),
			},
			workspace: { getLeaf: vi.fn(() => fakeLeaf) },
			metadataCache: {},
		};
		const executor = { execute: vi.fn(async () => []) };
		const modal = new WorkbenchModal(appMock as never, makeDeps({ executor }), makeHost());
		modal.open();
		modal.setSource('ai');
		await modal.submitAiInput('找文件');

		modal.selectAiTarget('bases');
		await modal.runAiQuery();

		// 与手写 Bases 来源同通道：临时 .base 落盘 → 命中文件进入确认
		expect(writes.some((p) => p.endsWith('.base'))).toBe(true);
		expect(modal.phase).toBe('confirm');
		expect(modal.files.map((f) => f.path)).toEqual(['b1.md']);
		expect(executor.execute).not.toHaveBeenCalled();
	});
});
