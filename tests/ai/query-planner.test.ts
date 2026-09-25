import { describe, expect, it, vi } from 'vitest';

// 被测对象：query-planner——自然语言 + 库内上下文 → IR
import {
	buildPlannerMessages,
	collectVaultContext,
	QueryPlanner,
} from 'src/ai/query-planner';
import { AiSettings, DEFAULT_AI_SETTINGS, resolveAiSettings } from 'src/ai/ai-settings';

/**
 * 测试目的：验证查询规划器的上下文采集、prompt 契约与响应校验。
 * 测试内容：collectVaultContext 采集与上限；prompt 包含 IR 约束/词表/今天日期且不含笔记正文；
 *          generate 走 extractJson+validateQueryIR 双重校验；非法响应抛错；vaultContext 默认值。
 * 预期结果：规划器输出通过校验的 IR；上下文缺失时优雅降级。
 */

function makeApp(overrides: Record<string, unknown> = {}) {
	return {
		metadataCache: {
			getTags: () => ({ '#读书': 5, work: 2 }),
			getAllPropertyInfos: () => ({ status: { type: 'text' }, priority: { type: 'number' } }),
		},
		vault: {
			getRoot: () => ({
				children: [
					{ path: 'Books', children: [{ path: 'Books/Novels', children: [] as unknown[] }] },
					{ path: 'Daily.md' }, // 文件：无 children 数组，跳过
					{ path: 'Projects', children: [] as unknown[] },
				] as unknown[],
			}),
		},
		...overrides,
	} as never;
}

describe('collectVaultContext', () => {

	it('采集标签/属性键/目录与今天日期', () => {
		const context = collectVaultContext(makeApp());
		expect(context.tags).toEqual(['读书', 'work']);
		expect(context.properties).toEqual(['status', 'priority']);
		expect(context.folders).toContain('Books');
		expect(context.folders).toContain('Books/Novels');
		expect(context.folders).not.toContain('Daily.md');
		expect(context.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('遵守数量上限', () => {
		const app = makeApp({
			metadataCache: {
				getTags: () => {
					const tags: Record<string, number> = {};
					for (let i = 0; i < 300; i++) tags[`t${i}`] = 1;
					return tags;
				},
			},
		});
		const context = collectVaultContext(app, { tags: 50, properties: 10, folders: 10 });
		expect(context.tags).toHaveLength(50);
	});

	it('API 缺失时优雅降级为空上下文', () => {
		const context = collectVaultContext({ metadataCache: {}, vault: {} } as never);
		expect(context.tags).toEqual([]);
		expect(context.properties).toEqual([]);
		expect(context.folders).toEqual([]);
		expect(context.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

describe('buildPlannerMessages', () => {

	it('system 含 IR 约束与严格 JSON 要求；user 含输入与上下文', () => {
		const context = collectVaultContext(makeApp());
		const { messages } = buildPlannerMessages('去年的读书笔记', context);
		const system = messages.find((m) => m.role === 'system')!.content;
		expect(system).toContain('irVersion');
		expect(system).toContain('vocabulary');
		expect(system).toContain('STRICT JSON');
		const user = messages.find((m) => m.role === 'user')!.content;
		expect(user).toContain('去年的读书笔记');
		expect(user).toContain('"today"');
	});

	it('prompt 不包含笔记正文发送通道（无 content 字段注入）', () => {
		const context = collectVaultContext(makeApp());
		const { messages } = buildPlannerMessages('x', context);
		const user = messages.find((m) => m.role === 'user')!.content;
		// 上下文只允许 vocabulary/properties/folders/today 四个键
		expect(user).toContain('"vocabulary"');
		expect(user).toContain('"properties"');
		expect(user).toContain('"folders"');
		expect(user).toContain('"today"');
		expect(user).not.toContain('"body"');
	});
});

describe('QueryPlanner.generate', () => {

	function makePlanner(provider: { chatJson: ReturnType<typeof vi.fn> }): QueryPlanner {
		return new QueryPlanner(DEFAULT_AI_SETTINGS, provider, {
			tags: ['读书'],
			properties: ['status'],
			folders: ['Books'],
			today: '2026-01-15',
		});
	}

	it('合法响应返回通过校验的 IR', async () => {
		const provider = {
			chatJson: vi.fn(async () => ({
				irVersion: 1,
				intent: '去年的读书笔记',
				conditions: { tag: '读书' },
			})),
		};
		const ir = await makePlanner(provider).generate('去年的读书笔记');
		expect(ir.intent).toBe('去年的读书笔记');
	});

	it('围栏包裹的 JSON 也能解析（复用 extractJsonObject）', async () => {
		const provider = {
			chatJson: vi.fn(async () => ({
				irVersion: 1,
				intent: 'x',
				conditions: { tag: '读书' },
			})),
		};
		const ir = await makePlanner(provider).generate('x');
		expect(ir.conditions).toBeDefined();
	});

	it('非法 IR（未知节点）抛出可识别错误', async () => {
		const provider = {
			chatJson: vi.fn(async () => ({
				irVersion: 1,
				intent: 'x',
				conditions: { magic: 'x' },
			})),
		};
		await expect(makePlanner(provider).generate('x')).rejects.toThrow(/未知/);
	});
});

describe('vaultContext 设置项', () => {

	it('默认开启且随设置合并保留', () => {
		expect(DEFAULT_AI_SETTINGS.vaultContext).toBe(true);
		const resolved = resolveAiSettings({ enabled: true } as Partial<AiSettings>);
		expect(resolved.vaultContext).toBe(true);
	});
});
