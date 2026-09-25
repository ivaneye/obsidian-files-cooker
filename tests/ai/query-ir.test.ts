import { describe, expect, it } from 'vitest';

// 被测对象：query-ir——IR 结构校验、规范化与树遍历
import { validateQueryIR, walkConditions } from 'src/ai/query-ir';

/**
 * 测试目的：验证 IR v1 契约的校验与规范化行为。
 * 测试内容：合法 IR；缺版本/错版本/缺 conditions/未知节点/布尔子项缺失；
 *          字符串 trim；tag 去前导 #；walkConditions 遍历计数。
 * 预期结果：非法输入抛可识别错误；合法输入规范化返回。
 */

const validIR = {
    irVersion: 1,
    intent: '  去年标记读书但没读完的笔记  ',
    conditions: {
        and: [
            { tag: '#读书' },
            { property: { field: ' status ', op: 'notEquals', value: 'done' } },
            { fileModified: { op: 'gte', date: '2025-01-01' } },
        ],
    },
};

describe('validateQueryIR', () => {

    it('合法 IR 通过并规范化（trim、tag 去 #）', () => {
        const ir = validateQueryIR(validIR);
        expect(ir.irVersion).toBe(1);
        expect(ir.intent).toBe('去年标记读书但没读完的笔记');
        expect(ir.conditions).toBeDefined();
    });

    it('缺 irVersion 或版本非 1 抛错', () => {
        expect(() => validateQueryIR({ intent: 'x', conditions: { tag: 'a' } })).toThrow(/irVersion/);
        expect(() => validateQueryIR({ irVersion: 2, intent: 'x', conditions: { tag: 'a' } })).toThrow(/irVersion/);
    });

    it('缺 conditions 或 intent 抛错', () => {
        expect(() => validateQueryIR({ irVersion: 1, conditions: { tag: 'a' } })).toThrow(/intent/);
        expect(() => validateQueryIR({ irVersion: 1, intent: 'x' })).toThrow(/conditions/);
    });

    it('未知节点抛错', () => {
        expect(() => validateQueryIR({
            irVersion: 1, intent: 'x',
            conditions: { magic: 'a' },
        })).toThrow(/未知/);
    });

    it('布尔节点子项缺失或非数组抛错', () => {
        expect(() => validateQueryIR({ irVersion: 1, intent: 'x', conditions: { and: 'x' } })).toThrow();
        expect(() => validateQueryIR({ irVersion: 1, intent: 'x', conditions: { and: [] } })).toThrow();
        expect(() => validateQueryIR({ irVersion: 1, intent: 'x', conditions: { not: null } })).toThrow();
    });

    it('property 缺字段/op 非法抛错', () => {
        expect(() => validateQueryIR({
            irVersion: 1, intent: 'x',
            conditions: { property: { field: 'f', op: 'startsWith', value: 'v' } },
        })).toThrow(/op/);
        expect(() => validateQueryIR({
            irVersion: 1, intent: 'x',
            conditions: { property: { op: 'eq', value: 'v' } },
        })).toThrow();
    });

    it('tag 规范化为去前导 # 与空白', () => {
        const ir = validateQueryIR({ irVersion: 1, intent: 'x', conditions: { tag: ' #读书 ' } });
        expect((ir.conditions as { tag: string }).tag).toBe('读书');
    });

    it('非对象输入抛错', () => {
        expect(() => validateQueryIR('not-json')).toThrow();
        expect(() => validateQueryIR(null)).toThrow();
    });
});

describe('walkConditions', () => {

    it('深度优先遍历所有节点', () => {
        const visited: string[] = [];
        const validated = validateQueryIR(validIR);
        walkConditions(validated.conditions, (node) => {
            visited.push(Object.keys(node)[0]);
        });
        expect(visited).toEqual(['and', 'tag', 'property', 'fileModified']);
    });
});
