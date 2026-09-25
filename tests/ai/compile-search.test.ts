import { describe, expect, it } from 'vitest';

// 被测对象：compileSearch——IR → Obsidian 搜索语法确定性编译
import { compileSearch } from 'src/ai/compile-search';
import { QueryIR } from 'src/ai/query-ir';

/**
 * 测试目的：验证 IR → 搜索语法编译的操作符映射与布尔组合。
 * 测试内容：tag/path/file/content/task-todo/task-done、property 精确与取反与 null、
 *          and 空格组合、or 括号、not -(...)、fileModified 标注 unsupported。
 * 预期结果：操作符输出符合 Obsidian 搜索语法；不支持节点进入 unsupported。
 */

function ir(conditions: object): QueryIR {
    return { irVersion: 1, intent: '测试', conditions } as QueryIR;
}

describe('compileSearch', () => {

    it('and 组合：tag/folder/content/task 空格连接', () => {
        const result = compileSearch(ir({
            and: [
                { tag: '读书' },
                { folder: 'Books' },
                { content: '维纳' },
                { task: 'todo' },
            ],
        }));
        expect(result.text).toBe('tag:#读书 path:"Books" content:"维纳" task-todo:()');
        expect(result.unsupported).toEqual([]);
    });

    it('task done 与 property 精确/取反/null', () => {
        const result = compileSearch(ir({
            and: [
                { task: 'done' },
                { property: { field: 'status', op: 'eq', value: 'done' } },
                { property: { field: 'status', op: 'notEquals', value: 'doing' } },
                { property: { field: 'notes', op: 'isEmpty', value: '' } },
            ],
        }));
        expect(result.text).toBe(
            'task-done:() [status:done] -[status:doing] [notes:null]',
        );
    });

    it('or 用括号 + OR 连接，not 用 -(...) 前缀', () => {
        const result = compileSearch(ir({
            and: [
                {
                    or: [
                        { tag: '读书' },
                        { tag: 'work' },
                    ],
                },
                { not: { folder: 'Archive' } },
            ],
        }));
        expect(result.text).toBe('(tag:#读书 OR tag:#work) -path:"Archive"');
    });

    it('filename → file: 操作符，含空格值自动加引号', () => {
        const result = compileSearch(ir({
            and: [
                { filename: '读书' },
                { filename: 'my note' },
            ],
        }));
        expect(result.text).toBe('file:读书 file:"my note"');
    });

    it('fileModified 标注 unsupported', () => {
        const result = compileSearch(ir({
            and: [
                { tag: '读书' },
                { fileModified: { op: 'gte', date: '2025-01-01' } },
            ],
        }));
        expect(result.text).toBe('tag:#读书');
        expect(result.unsupported).toEqual([{ fileModified: { op: 'gte', date: '2025-01-01' } }]);
    });

    it('数值比较标注 unsupported（搜索无对应操作符）', () => {
        const result = compileSearch(ir({
            property: { field: 'priority', op: 'gte', value: 3 },
        }));
        expect(result.text).toBe('');
        expect(result.unsupported).toHaveLength(1);
    });
});

describe('compileSearch 否定与特殊字符（用户验收反馈）', () => {

	function ir(conditions: object): QueryIR {
		return { irVersion: 1, intent: '测试', conditions } as QueryIR;
	}

	it('content 特殊字符（如 [[）恒加引号，not 单子句输出 -content:"[["', () => {
		const result = compileSearch(ir({ not: { content: '[[' } }));
		expect(result.text).toBe('-content:"[["');
	});

	it('not 覆盖 or 组合时保留括号', () => {
		const result = compileSearch(ir({
			not: { or: [{ tag: 'a' }, { tag: 'b' }] },
		}));
		expect(result.text).toBe('-(tag:#a OR tag:#b)');
	});
});
