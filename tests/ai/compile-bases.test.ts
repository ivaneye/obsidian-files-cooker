import { describe, expect, it } from 'vitest';

// 被测对象：compileBases——IR → Bases YAML 确定性编译
import { compileBases } from 'src/ai/compile-bases';
import { QueryIR } from 'src/ai/query-ir';

/**
 * 测试目的：验证 IR → Bases YAML 编译的 filters 结构与函数映射。
 * 测试内容：and/or 顶层键、file.hasTag/inFolder、属性 ==/!=/contains/isEmpty/数值比较、
 *          content/task/fileModified/嵌套布尔标注 unsupported、产物含最小 views。
 * 预期结果：YAML 结构合法（单引号字符串），不支持的节点不进入 filters。
 */

function ir(conditions: object): QueryIR {
    return { irVersion: 1, intent: '测试', conditions } as QueryIR;
}

describe('compileBases', () => {

    it('根 and：filters.and 列出各条件，产物含最小 views', () => {
        const result = compileBases(ir({
            and: [
                { tag: '读书' },
                { folder: 'Books' },
                { property: { field: 'status', op: 'notEquals', value: 'done' } },
            ],
        }));
        expect(result.text).toBe(
            [
                'filters:',
                '  and:',
                '    - \'file.hasTag("读书")\'',
                '    - \'file.inFolder("Books")\'',
                '    - \'status != "done"\'',
                'views:',
                '  - type: table',
                '    name: 全部',
            ].join('\n'),
        );
        expect(result.unsupported).toEqual([]);
    });

    it('根 or 使用 filters.or', () => {
        const result = compileBases(ir({
            or: [{ tag: '读书' }, { tag: 'work' }],
        }));
        expect(result.text).toContain('  or:');
        expect(result.text).toContain('- \'file.hasTag("读书")\'');
    });

    it('属性 contains/isEmpty/数值比较与根单条件', () => {
        const result = compileBases(ir({
            and: [
                { property: { field: 'note', op: 'contains', value: '关键' } },
                { property: { field: 'memo', op: 'isEmpty', value: '' } },
                { property: { field: 'priority', op: 'gt', value: 3 } },
            ],
        }));
        expect(result.text).toContain('- \'note.contains("关键")\'');
        expect(result.text).toContain('- \'memo.isEmpty()\'');
        expect(result.text).toContain('- \'priority > 3\'');
    });

    it('content/task/fileModified/嵌套布尔标注 unsupported', () => {
        const result = compileBases(ir({
            and: [
                { tag: '读书' },
                { content: '维纳' },
                { task: 'todo' },
                { fileModified: { op: 'gte', date: '2025-01-01' } },
                { or: [{ tag: 'x' }] },
            ],
        }));
        expect(result.text).toContain('- \'file.hasTag("读书")\'');
        expect(result.unsupported).toHaveLength(4);
    });

    it('单引号值以 YAML 转义形式落盘（两次单引号为转义）', () => {
        const result = compileBases(ir({ property: { field: 'title', op: 'eq', value: "it's" } }));
        // YAML 单引号字符串中 ' 转义为两个单引号，解析后即为 it's
        expect(result.text).toContain("title == \"it''s\"");
    });
});
