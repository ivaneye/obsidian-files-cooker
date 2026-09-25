import { describe, expect, it } from 'vitest';

// 被测对象：script-extract——从笔记内容提取围栏代码块脚本
import { extractDataviewBlocks, extractFencedBlocks, extractQueryBlocks } from 'src/utils/script-extract';

/**
 * 测试目的：验证从 Markdown 内容提取脚本代码块的规则。
 * 测试内容：单块/多块提取、dataviewjs 排除、非目标语言跳过（含围栏嵌套）、
 *          query/search 块提取、无块返回空、内容 trim。
 * 预期结果：仅提取目标语言的围栏内容；相同输入恒定输出。
 */

describe('extractDataviewBlocks', () => {

    it('提取单个 ```dataview 块并 trim', () => {
        const content = ['前言', '```dataview', 'LIST FROM #读书', '```', '后记'].join('\n');
        expect(extractDataviewBlocks(content)).toEqual(['LIST FROM #读书']);
    });

    it('提取多个块（按出现顺序）', () => {
        const content = [
            '```dataview', 'LIST FROM #a', '```',
            '中间文字',
            '```dataview', 'TABLE status FROM #b', '```',
        ].join('\n');
        expect(extractDataviewBlocks(content)).toEqual(['LIST FROM #a', 'TABLE status FROM #b']);
    });

    it('dataviewjs 块被排除（是 JS 不是 DQL）', () => {
        const content = ['```dataviewjs', 'dv.list([1])', '```'].join('\n');
        expect(extractDataviewBlocks(content)).toEqual([]);
    });

    it('其他语言代码块跳过且不误吞内容', () => {
        const content = [
            '```js', 'const x = "```dataview`";', '```',
            '```dataview', 'LIST FROM #c', '```',
        ].join('\n');
        expect(extractDataviewBlocks(content)).toEqual(['LIST FROM #c']);
    });

    it('无目标块返回空数组', () => {
        expect(extractDataviewBlocks('没有任何代码块')).toEqual([]);
    });
});

describe('extractQueryBlocks', () => {

    it('提取 ```query 与 ```search 块', () => {
        const content = [
            '```query', 'tag:#读书 path:"Books"', '```',
            '```search', 'tag:#work', '```',
        ].join('\n');
        expect(extractQueryBlocks(content)).toEqual([
            'tag:#读书 path:"Books"',
            'tag:#work',
        ]);
    });
});

describe('extractFencedBlocks 通用围栏扫描', () => {

    it('未闭合围栏取到文末（容忍编辑中的笔记）', () => {
        const content = ['```dataview', 'LIST FROM #d'].join('\n');
        expect(extractDataviewBlocks(content)).toEqual(['LIST FROM #d']);
    });

    it('extractFencedBlocks 支持自定义语言集合', () => {
        const content = ['```bases', 'filters:', '  and: []', '```'].join('\n');
        expect(extractFencedBlocks(content, new Set(['bases']))).toEqual(['filters:\n  and: []']);
    });
});
