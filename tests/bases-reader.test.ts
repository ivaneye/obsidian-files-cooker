import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
	return await import('./mocks/obsidian');
});

import { __getNotices, __resetNotices } from './mocks/obsidian';
import { BasesReader } from 'src/reader/bases-reader';

function createPlugin(rows: unknown[] | null, existingPaths: string[] = []) {
	const existing = new Set(existingPaths);
	const metadataDestMap = new Map<string, any>();
	existingPaths.forEach((path) => {
		metadataDestMap.set(path, {
			path,
			name: path.split('/').pop() ?? path,
			parent: { path: '' },
		});
	});
	const app = {
		workspace: {
			getLeavesOfType: vi.fn((_type: string) => {
				if (rows == null) {
					return [];
				}
				return [{ view: { currentQueryResult: rows, containerEl: { querySelectorAll: vi.fn(() => []) } } }];
			}),
			activeLeaf: {
				view: {
					containerEl: {
						querySelectorAll: vi.fn(() => []),
					},
				},
			},
		},
		vault: {
			getAbstractFileByPath: vi.fn((path: string) => {
				if (!existing.has(path)) {
					return null;
				}
				return {
					path,
					name: path.split('/').pop() ?? path,
					parent: { path: '' },
				};
			}),
		},
		metadataCache: {
			getFirstLinkpathDest: vi.fn((linkpath: string) => metadataDestMap.get(linkpath) ?? null),
		},
	};

	return {
		app,
		settings: { limit: '20' },
	};
}

describe('BasesReader', () => {
	beforeEach(() => {
		__resetNotices();
	});

	it('2.1 数据源不可用时应阻断并提示', () => {
		// 目的：当 Bases 结果入口不可访问时，不继续执行 action。
		const plugin = createPlugin(null);
		const action = { act: vi.fn() };

		new BasesReader(plugin as never).read(action as never);

		expect(action.act).not.toHaveBeenCalled();
		expect(__getNotices()).toContain('Bases results unavailable! Please open a Bases query view and run a query first!');
	});

	it('2.1 空结果时应提示并不执行动作', () => {
		// 目的：当查询返回空数组时，避免误触发后续处理。
		const plugin = createPlugin([]);
		const action = { act: vi.fn() };

		new BasesReader(plugin as never).read(action as never);

		expect(action.act).not.toHaveBeenCalled();
		expect(__getNotices()).toContain('Has no bases results! Please run a query first!');
	});

	it('2.2 混合结果时仅处理可映射文件并提示忽略数量', () => {
		// 目的：验证可映射项会执行，无法映射项会计入 ignoredCount。
		const rows = [
			{ path: 'a.md' },
			{ path: 'missing.md' },
			{ random: true },
			{ file: { path: 'b.md' } },
			{ path: 'a.md' },
		];
		const plugin = createPlugin(rows, ['a.md', 'b.md']);
		const action = { act: vi.fn() };

		new BasesReader(plugin as never).read(action as never);

		expect(action.act).toHaveBeenCalledTimes(1);
		const models = action.act.mock.calls[0][0];
		expect(models).toHaveLength(2);
		expect(models[0].file.path).toBe('a.md');
		expect(models[1].file.path).toBe('b.md');
		expect(__getNotices()).toContain('Ignored 2 non-file bases results.');
	});

	it('2.2 全部不可映射时应提示忽略数量并告知无可处理文件', () => {
		// 目的：验证“全不可映射”边界，确保无文件动作发生。
		const rows = [{ random: true }, { path: 'missing.md' }];
		const plugin = createPlugin(rows, []);
		const action = { act: vi.fn() };

		new BasesReader(plugin as never).read(action as never);

		expect(action.act).not.toHaveBeenCalled();
		expect(__getNotices()).toContain('Ignored 2 non-file bases results.');
		expect(__getNotices()).toContain('No Files Found!');
	});

	it('2.2 task 模式下应输出仅基于文件的 checklist 内容', () => {
		// 目的：验证 task canvas 输入仅由映射后的文件生成，不使用 row 字段写入。
		const rows = [{ path: 'tasks/a.md' }, { file: { path: 'tasks/b.md' } }];
		const plugin = createPlugin(rows, ['tasks/a.md', 'tasks/b.md']);
		const action = { act: vi.fn() };

		new BasesReader(plugin as never, true).read(action as never);

		expect(action.act).toHaveBeenCalledTimes(1);
		const models = action.act.mock.calls[0][0];
		expect(models).toHaveLength(1);
		expect(models[0].file).toBeNull();
		expect(models[0].content).toContain('[[tasks/a.md]]');
		expect(models[0].content).toContain('[[tasks/b.md]]');
	});

	it('2.2 应支持 wiki 链接样式路径映射到文件', () => {
		// 目的：兼容 Bases 结果返回 [[path|alias]] 或 linkpath 形式。
		const rows = [{ file: '[[daily/note.md|Daily]]' }];
		const plugin = createPlugin(rows, ['daily/note.md']);
		const action = { act: vi.fn() };

		new BasesReader(plugin as never).read(action as never);

		expect(action.act).toHaveBeenCalledTimes(1);
		const models = action.act.mock.calls[0][0];
		expect(models).toHaveLength(1);
		expect(models[0].file.path).toBe('daily/note.md');
	});

	it('2.2 应支持函数型 row 返回文件路径对象', () => {
		// 目的：兼容内置 Bases 可能返回 getter/function row 的场景。
		const rows = [() => ({ file: { path: 'fn-row/note.md' } })];
		const plugin = createPlugin(rows, ['fn-row/note.md']);
		const action = { act: vi.fn() };

		new BasesReader(plugin as never).read(action as never);

		expect(action.act).toHaveBeenCalledTimes(1);
		const models = action.act.mock.calls[0][0];
		expect(models).toHaveLength(1);
		expect(models[0].file.path).toBe('fn-row/note.md');
	});

	it('2.2 应支持 key-access 风格函数 row', () => {
		// 目的：兼容 rowFn("path") 这种惰性取值模型。
		const rows = [
			((key?: string) => {
				if (key === 'path') {
					return 'fn-key/note.md';
				}
				return null;
			}) as any,
		];
		const plugin = createPlugin(rows, ['fn-key/note.md']);
		const action = { act: vi.fn() };

		new BasesReader(plugin as never).read(action as never);

		expect(action.act).toHaveBeenCalledTimes(1);
		const models = action.act.mock.calls[0][0];
		expect(models).toHaveLength(1);
		expect(models[0].file.path).toBe('fn-key/note.md');
	});

	it('2.2 rows 无法映射时应回退到 Bases DOM 链接解析', () => {
		// 目的：兼容内置 Bases 返回不可读 function row，但 UI 中已有 internal-link。
		const rows = [((): null => null) as any];
		const plugin = createPlugin(rows, ['dom/fallback.md']);
		const action = { act: vi.fn() };

		const fakeNode = {
			getAttribute: (attr: string) => (attr === 'data-href' ? 'dom/fallback.md' : null),
			dataset: {},
		};
		(plugin as any).app.workspace.getLeavesOfType.mockReturnValue([
			{
				view: {
					currentQueryResult: rows,
					containerEl: {
						querySelectorAll: vi.fn(() => [fakeNode]),
					},
				},
			},
		]);

		new BasesReader(plugin as never).read(action as never);

		expect(action.act).toHaveBeenCalledTimes(1);
		const models = action.act.mock.calls[0][0];
		expect(models).toHaveLength(1);
		expect(models[0].file.path).toBe('dom/fallback.md');
	});

	it('2.2 应优先对齐 Bases 视图可见结果，过滤掉不可见行', () => {
		// 目的：当 rows 含未过滤数据时，仅处理当前视图中可见的文件。
		const rows = [{ path: 'note-2.md' }, { path: 'note-20.md' }, { path: 'note-x.md' }];
		const plugin = createPlugin(rows, ['note-2.md', 'note-20.md', 'note-x.md']);
		const action = { act: vi.fn() };

		const fakeNodes: any[] = [
			{
				getAttribute: (attr: string) => (attr === 'data-href' ? 'note-2.md' : null),
				dataset: {},
				style: {},
				offsetParent: {},
				getClientRects: () => [1],
				closest: () => ({ style: {} }),
			},
			{
				getAttribute: (attr: string) => (attr === 'data-href' ? 'note-20.md' : null),
				dataset: {},
				style: {},
				offsetParent: {},
				getClientRects: () => [1],
				closest: () => ({ style: {} }),
			},
			{
				getAttribute: (attr: string) => (attr === 'data-href' ? 'note-x.md' : null),
				dataset: {},
				style: { display: 'none' },
				offsetParent: null,
				getClientRects: (): any[] => [],
				closest: () => ({ style: { display: 'none' } }),
			},
		];
		(plugin as any).app.workspace.getLeavesOfType.mockReturnValue([
			{
				view: {
					getViewType: () => 'bases',
					currentQueryResult: rows,
					containerEl: {
						querySelectorAll: vi.fn((selector: string) => {
							if (selector.includes('tr') || selector.includes('table-view-table')) {
								return fakeNodes;
							}
							return [];
						}),
					},
				},
			},
		]);
		(plugin as any).app.workspace.activeLeaf = {
			view: {
				getViewType: () => 'bases',
				containerEl: {
					querySelectorAll: vi.fn((selector: string) => {
						if (selector.includes('tr') || selector.includes('table-view-table')) {
							return fakeNodes;
						}
						return [];
					}),
				},
			},
		};

		new BasesReader(plugin as never).read(action as never);

		expect(action.act).toHaveBeenCalledTimes(1);
		const models = action.act.mock.calls[0][0];
		expect(models).toHaveLength(2);
		expect(models.map((m: any) => m.file.path)).toEqual(['note-2.md', 'note-20.md']);
	});
});
