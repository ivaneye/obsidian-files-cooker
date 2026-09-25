import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
	return await import('../mocks/obsidian');
});

// 控制 Dataview API
const getApiMock = vi.hoisted(() => vi.fn());
vi.mock('obsidian-dataview', () => ({ getAPI: getApiMock }));

import { lintBases, lintDql, lintSearch } from 'src/validation/query-lint';

/**
 * 测试目的：验证三种查询脚本的语法检查规则。
 * 测试内容：搜索/Bases 的结构错误（配平、缺键）与警告（未知操作符/顶层键）；
 *          DQL 的 Dataview 缺席降级、试跑抛错转 error、通过返回空。
 * 预期结果：error 阻断执行；warning 仅提示；检查为纯函数或只读试跑。
 */

describe('lintSearch', () => {

	it('白名单操作符的合法脚本无问题', () => {
		const issues = lintSearch('tag:#读书 path:"Books" file:x line:(a b) content:维纳 task-todo:() [status:done]');
		expect(issues).toEqual([]);
	});

	it('括号不配平为 error', () => {
		const issues = lintSearch('(tag:#a OR tag:#b');
		expect(issues.some((i) => i.level === 'error' && i.message.includes('括号'))).toBe(true);
	});

	it('引号不配平为 error', () => {
		const issues = lintSearch('path:"Books');
		expect(issues.some((i) => i.level === 'error' && i.message.includes('引号'))).toBe(true);
	});

	it('未知操作符为 warning（不阻断）', () => {
		const issues = lintSearch('magic:foo tag:#a');
		expect(issues.some((i) => i.level === 'warning' && i.message.includes('magic'))).toBe(true);
		expect(issues.every((i) => i.level !== 'error')).toBe(true);
	});

	it('方括号属性形式不误报', () => {
		const issues = lintSearch('[status:done] -[status:doing] [notes:null]');
		expect(issues).toEqual([]);
	});
});

describe('lintBases', () => {

	it('合法 filters 与 views 无问题', () => {
		const issues = lintBases('filters:\n  and:\n    - \'file.hasTag("a")\'\nviews:\n  - type: table');
		expect(issues).toEqual([]);
	});

	it('缺 filters: 为 error', () => {
		const issues = lintBases('views:\n  - type: table');
		expect(issues.some((i) => i.level === 'error' && i.message.includes('filters'))).toBe(true);
	});

	it('引号不配平为 error', () => {
		// 少写收尾单引号的真实场景
		const issues = lintBases('filters:\n  and:\n    - \'file.hasTag("Books)');
		expect(issues.some((i) => i.level === 'error' && i.message.includes('引号'))).toBe(true);
	});

	it('未知顶层键为 warning', () => {
		const issues = lintBases('filters:\n  and: []\nextra: 1');
		expect(issues.some((i) => i.level === 'warning' && i.message.includes('extra'))).toBe(true);
	});
});

describe('lintDql', () => {

	it('Dataview 缺失时仅警告"无法检查"', async () => {
		getApiMock.mockReturnValue(null);
		const issues = await lintDql('LIST FROM #x');
		expect(issues.some((i) => i.level === 'warning' && i.message.includes('无法检查'))).toBe(true);
		expect(issues.every((i) => i.level !== 'error')).toBe(true);
	});

	it('tryQuery 抛错转为 error 并带原因', async () => {
		getApiMock.mockReturnValue({
			tryQuery: vi.fn(async () => { throw new Error('Parse error at token'); }),
		});
		const issues = await lintDql('LIST FRO #x');
		expect(issues.some((i) => i.level === 'error' && i.message.includes('Parse error'))).toBe(true);
	});

	it('试跑通过返回空问题列表', async () => {
		getApiMock.mockReturnValue({
			tryQuery: vi.fn(async () => ({ values: [] })),
		});
		const issues = await lintDql('LIST FROM #x');
		expect(issues).toEqual([]);
	});
});
