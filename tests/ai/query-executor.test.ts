import { beforeEach, describe, expect, it, vi } from 'vitest';

// 控制 Dataview 可用性（模拟装/卸两种环境）
const getApiMock = vi.hoisted(() => vi.fn());
vi.mock('obsidian-dataview', () => ({ getAPI: getApiMock }));

// 记录传给 Reader 的查询文本与 action，用于断言分发与 CaptureAction 语义
const dqlState = vi.hoisted(() => ({ lastQueryStr: '', lastModels: [] as unknown[] }));
const searchState = vi.hoisted(() => ({ models: [] as unknown[] }));

vi.mock('src/reader/dataview-reader', () => ({
	DataviewReader: class {
		constructor(_plugin: unknown, public queryStr: string) {
			dqlState.lastQueryStr = queryStr;
		}
		read(action: { act: (models: unknown[]) => void }): void {
			action.act(dqlState.lastModels);
		}
	},
}));

vi.mock('src/reader/search-results-reader', () => ({
	SearchResultsReader: class {
		constructor(public plugin: unknown) {}
		read(action: { act: (models: unknown[]) => void }): void {
			action.act(searchState.models);
		}
	},
}));

import { ActionModel } from 'src/action/action';
import { CaptureAction, executeQuery, getAvailableTargets, recommendTarget } from 'src/ai/query-executor';
import { CompiledQuery } from 'src/ai/query-ir';

/**
 * 测试目的：验证能力检查（目标集合/推荐链）与执行编排（CaptureAction/DQL 分发/limit 截断）。
 * 测试内容：Dataview 装卸两种环境的目标集合；推荐优先级与无完整表达；CaptureAction 捕获；
 *          DQL 执行经既有 Reader 分发并提取文件；limit 截断；Bases 目标抛指引。
 * 预期结果：目标过滤与推荐符合单一事实来源契约；执行为只读并复用既有 Reader。
 */

function compiled(unsupported: string[]): CompiledQuery {
	return { text: 'QUERY', unsupported: unsupported as never[] };
}

function makePlugin(limit = '300') {
	return {
		app: { vault: {} },
		settings: { limit, ai: {} },
	} as never;
}

beforeEach(() => {
	getApiMock.mockReset();
	getApiMock.mockReturnValue({}); // 默认 Dataview 可用
	dqlState.lastModels = [];
	searchState.models = [];
});

describe('getAvailableTargets', () => {

	it('Dataview 可用时包含 dql 且优先级最高', () => {
		expect(getAvailableTargets()).toEqual(['dql', 'search', 'bases']);
	});

	it('Dataview 不可用时不含 dql', () => {
		getApiMock.mockReturnValue(null);
		expect(getAvailableTargets()).toEqual(['search', 'bases']);
	});
});

describe('recommendTarget', () => {

	const targets = ['dql', 'search', 'bases'] as const;

	it('优先选择不支持条件为空且优先级最高的目标', () => {
		const result = recommendTarget({
			dql: compiled(['content']),
			search: compiled([]),
			bases: compiled([]),
		}, [...targets]);
		expect(result).toBe('search');
	});

	it('dql 完整表达时优先 dql', () => {
		const result = recommendTarget({
			dql: compiled([]),
			search: compiled(['fileModified']),
			bases: compiled([]),
		}, [...targets]);
		expect(result).toBe('dql');
	});

	it('无完整表达目标时返回 undefined', () => {
		const result = recommendTarget({
			dql: compiled(['x']),
			search: compiled(['y']),
			bases: compiled(['z']),
		}, [...targets]);
		expect(result).toBeUndefined();
	});
});

describe('CaptureAction 与 executeQuery', () => {

	it('CaptureAction 捕获 act 传入的 ActionModel 列表', async () => {
		const capture = new CaptureAction();
		const models = [new ActionModel({ path: 'a.md' } as never)];
		capture.act(models);
		await expect(capture.promise).resolves.toBe(models);
	});

	it('DQL 执行：查询文本交给 DataviewReader 并提取命中文件', async () => {
		dqlState.lastModels = [new ActionModel({ path: 'a.md' } as never), new ActionModel({ path: 'b.md' } as never)];
		const files = await executeQuery('dql', 'LIST\nFROM #x', makePlugin(), { pollMs: 5, timeoutMs: 300 });
		expect(dqlState.lastQueryStr).toBe('LIST\nFROM #x');
		expect(files.map((f) => f.path)).toEqual(['a.md', 'b.md']);
	});

	it('命中数超过 limit 时截断', async () => {
		dqlState.lastModels = [
			new ActionModel({ path: 'a.md' } as never),
			new ActionModel({ path: 'b.md' } as never),
			new ActionModel({ path: 'c.md' } as never),
		];
		const files = await executeQuery('dql', 'Q', makePlugin('2'), { pollMs: 5, timeoutMs: 300 });
		expect(files).toHaveLength(2);
	});

	it('Bases 目标在 P3a 抛出指引（仅生成模式）', async () => {
		await expect(executeQuery('bases', 'filters: {}', makePlugin()))
			.rejects
			.toThrow(/\.base/);
	});
});
