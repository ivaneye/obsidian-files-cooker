import { describe, expect, it } from 'vitest';

// 被测对象：compileDql——IR → DQL 确定性编译
import { compileDql } from 'src/ai/compile-dql';
import { QueryIR } from 'src/ai/query-ir';

/**
 * 测试目的：验证 IR → DQL 编译的 FROM/WHERE 划分与表达式语义。
 * 测试内容：tag/folder 进 FROM、无来源 FROM ""、property 各 op、fileModified、
 *          filename、and/or/not、content/task 标注 unsupported、引号转义。
 * 预期结果：相同 IR 输出恒定；不支持的节点进入 unsupported 且不污染查询语义。
 */

function ir(conditions: object): QueryIR {
    return { irVersion: 1, intent: '测试', conditions } as QueryIR;
}

describe('compileDql', () => {

    it('根 and：tag/folder 进 FROM（OR 连接），其余进 WHERE', () => {
        const result = compileDql(ir({
            and: [
                { tag: '读书' },
                { folder: 'Books' },
                { property: { field: 'status', op: 'notEquals', value: 'done' } },
                { fileModified: { op: 'gte', date: '2025-01-01' } },
            ],
        }));
        expect(result.text).toBe(
            'LIST\nFROM #读书 OR "Books"\nWHERE status != "done" AND file.mday >= date(2025-01-01)',
        );
        expect(result.unsupported).toEqual([]);
    });

    it('无来源条件时 FROM 为空串', () => {
        const result = compileDql(ir({ property: { field: 'status', op: 'eq', value: 'done' } }));
        expect(result.text).toBe('LIST\nFROM ""\nWHERE status = "done"');
    });

    it('无 WHERE 条件时省略 WHERE 行', () => {
        const result = compileDql(ir({ tag: '读书' }));
        expect(result.text).toBe('LIST\nFROM #读书');
    });

    it('property contains/isEmpty/数值比较', () => {
        const result = compileDql(ir({
            and: [
                { property: { field: 'note', op: 'contains', value: '关键' } },
                { property: { field: 'memo', op: 'isEmpty', value: '' } },
                { property: { field: 'priority', op: 'gte', value: 3 } },
                { property: { field: 'done', op: 'eq', value: true } },
            ],
        }));
        expect(result.text).toBe(
            'LIST\nFROM ""\nWHERE contains(note, "关键") AND !memo AND priority >= 3 AND done = true',
        );
    });

    it('filename 与 or/not 表达式', () => {
        const result = compileDql(ir({
            and: [
                { filename: '读书' },
                {
                    or: [
                        { property: { field: 'status', op: 'eq', value: 'todo' } },
                        { property: { field: 'priority', op: 'gt', value: 3 } },
                    ],
                },
                { not: { tag: 'archived' } },
            ],
        }));
        expect(result.text).toContain('WHERE contains(file.name, "读书")');
        expect(result.text).toContain('(status = "todo" OR priority > 3)');
        // not 内的 tag 无法进 FROM（语义取反），转为 WHERE 表达式
        expect(result.text).toContain('!(contains(file.tags, "#archived"))');
    });

    it('content 与 task 节点标注 unsupported，不进入查询', () => {
        const result = compileDql(ir({
            and: [
                { tag: '读书' },
                { content: '维纳' },
                { task: 'todo' },
            ],
        }));
        expect(result.text).toBe('LIST\nFROM #读书');
        expect(result.unsupported).toEqual([
            { content: '维纳' },
            { task: 'todo' },
        ]);
    });

    it('字符串值内含双引号时转义', () => {
        const result = compileDql(ir({ property: { field: 'title', op: 'eq', value: '说"你好"' } }));
        expect(result.text).toContain('title = "说\\"你好\\""');
    });
});
