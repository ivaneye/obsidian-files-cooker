import { describe, expect, it } from 'vitest';

// 被测对象：prop-infer 的纯函数——prompt 构建、响应解析校验、值规范化
import {
    buildInferPrompts,
    buildTagVocabulary,
    normalizeTags,
    parseInferResponse,
} from 'src/ai/prop-infer';
import { DEFAULT_AI_SETTINGS } from 'src/ai/ai-settings';

/**
 * 测试目的：验证 AI 属性推断的 prompt 契约与响应校验规则。
 * 测试内容：词表构建（去 #、去重、上限）、prompt 字段注入、JSON 解析、path 回配、
 *          tags 规范化、相同值跳过。
 * 预期结果：发送内容符合设计契约；非法响应被拒绝；提案仅保留有效且有差异的条目。
 */

function inferOptions(overrides: Record<string, unknown> = {}) {
    return {
        inferTags: true,
        inferAliases: true,
        customProps: [] as string[],
        tagLanguage: 'auto' as const,
        ...overrides,
    };
}

describe('buildTagVocabulary', () => {

    it('去 #、去重并尊重上限', () => {
        const allTags = { '#读书': 5, '读书': 1, '#work': 2, '项目': 3 };
        const vocab = buildTagVocabulary(allTags, 3);
        // 键已含 '#读书' 与 '读书' 视为同一标签（去 # 后同名）
        expect(vocab).toEqual(['读书', 'work', '项目']);
    });

    it('超过上限时截断', () => {
        const allTags: Record<string, number> = {};
        for (let i = 0; i < 300; i++) {
            allTags[`t${i}`] = 1;
        }
        expect(buildTagVocabulary(allTags, 200)).toHaveLength(200);
    });
});

describe('buildInferPrompts', () => {

    it('system 提示包含 JSON Schema 与标签语言指令', () => {
        const files = [{ path: 'a.md', title: 'a', content: '内容', existing: { tags: ['x'] } }];
        const { messages } = buildInferPrompts(files, ['读书'], DEFAULT_AI_SETTINGS, inferOptions());
        const system = messages.find(m => m.role === 'system')!;
        expect(system.content).toContain('STRICT JSON');
        expect(system.content).toContain('tags');
    });

    it('tagLanguage=zh 时注入中文指令', () => {
        const files = [{ path: 'a.md', title: 'a', content: 'c', existing: {} }];
        const { messages } = buildInferPrompts(files, [], DEFAULT_AI_SETTINGS, inferOptions({ tagLanguage: 'zh' }));
        expect(messages.find(m => m.role === 'system')!.content).toContain('Chinese');
    });

    it('用户消息按文件注入 path/title/content/existing 与词表', () => {
        const files = [{ path: 'p/a.md', title: 'A', content: '正文'.repeat(3000), existing: { tags: ['t1'] } }];
        const { messages } = buildInferPrompts(files, ['读书'], { ...DEFAULT_AI_SETTINGS, contextChars: 100 }, inferOptions());
        const user = messages.find(m => m.role === 'user')!.content;
        expect(user).toContain('p/a.md');
        expect(user).toContain('A');
        // content 被截断到 contextChars
        expect(user.length).toBeLessThan('正文'.repeat(3000).length);
        expect(user).toContain('t1');
        expect(user).toContain('读书');
    });

    it('inferTags/inferAliases 关闭时不在指令中要求对应属性', () => {
        const files = [{ path: 'a.md', title: 'a', content: 'c', existing: {} }];
        const { messages } = buildInferPrompts(files, [], DEFAULT_AI_SETTINGS, inferOptions({ inferTags: false, inferAliases: false, customProps: ['status'] }));
        const system = messages.find(m => m.role === 'system')!.content;
        expect(system).not.toContain('"tags"');
        expect(system).not.toContain('"aliases"');
        expect(system).toContain('status');
    });
});

describe('parseInferResponse', () => {

    const files = [
        { path: 'a.md', title: 'A', content: '', existing: { tags: ['old'] } },
        { path: 'b.md', title: 'B', content: '', existing: {} },
    ];

    it('合法响应解析出按 path 回配的提案', () => {
        const proposals = parseInferResponse(
            { results: [{ path: 'a.md', props: { tags: ['读 书', '#New'] } }] },
            files,
        );
        expect(proposals).toHaveLength(1);
        expect(proposals[0].path).toBe('a.md');
        expect(proposals[0].props.tags).toEqual(['读 书', 'new']);
    });

    it('非法 JSON 抛出可识别错误', () => {
        expect(() => parseInferResponse('not-json', files)).toThrow(/JSON/);
    });

    it('path 无法回配的条目被丢弃', () => {
        const proposals = parseInferResponse(
            { results: [
                { path: 'a.md', props: { tags: ['keep'] } },
                { path: 'ghost.md', props: { tags: ['drop'] } },
            ] },
            files,
        );
        expect(proposals).toHaveLength(1);
        expect(proposals[0].path).toBe('a.md');
    });

    it('真实感模型输出：混合属性、脏值一并规范化', () => {
        const proposals = parseInferResponse(
            { results: [{
                path: 'a.md',
                props: {
                    tags: ['#读书', 'READING', '读书'],
                    aliases: ['  Cybernetics ', ''],
                    status: ' done ',
                    score: 4,
                    junk: { nested: true },
                },
            }] },
            files,
        );
        expect(proposals).toHaveLength(1);
        expect(proposals[0].props.tags).toEqual(['读书', 'reading']);
        expect(proposals[0].props.aliases).toEqual(['Cybernetics']);
        expect(proposals[0].props.status).toBe('done');
        expect(proposals[0].props.score).toBe(4);
        // 非标量值丢弃
        expect(proposals[0].props.junk).toBeUndefined();
    });

    it('响应结构缺失（results 非数组）时抛错', () => {
        expect(() => parseInferResponse({ results: 'oops' }, files)).toThrow();
        expect(() => parseInferResponse({}, files)).toThrow();
    });
});

describe('normalizeTags', () => {

    it('转小写、去 #、去空白、去重', () => {
        expect(normalizeTags(['#A', ' b ', 'a', '', '##C'])).toEqual(['a', 'b', 'c']);
    });
});
