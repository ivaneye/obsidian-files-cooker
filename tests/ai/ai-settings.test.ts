import { describe, expect, it } from 'vitest';

// 被测对象：resolveAiSettings——用户已保存设置与默认值的合并行为
// 被测对象：isAiConfigured——命令前置的 AI 可用性检查
import { AiSettings, DEFAULT_AI_SETTINGS, isAiConfigured, resolveAiSettings } from 'src/ai/ai-settings';

/**
 * 测试目的：验证 resolveAiSettings 的默认值合并语义。
 * 测试内容：无数据 / 部分字段 / 空对象 / 未知字段四种输入。
 * 预期结果：缺省字段补默认值、enabled 恒默认 false、未知字段被忽略、默认值对象不被污染。
 */
describe('resolveAiSettings', () => {

    it('无已保存数据时返回完整默认值', () => {
        const resolved = resolveAiSettings(null);
        expect(resolved).toEqual(DEFAULT_AI_SETTINGS);
        // opt-in 约束：总开关必须默认关闭
        expect(resolved.enabled).toBe(false);
    });

    it('部分字段已保存时缺省字段补默认值', () => {
        const resolved = resolveAiSettings({ baseUrl: 'https://api.deepseek.com/v1', batchSize: 8 });
        expect(resolved.baseUrl).toBe('https://api.deepseek.com/v1');
        expect(resolved.batchSize).toBe(8);
        // 未保存字段保持默认
        expect(resolved.model).toBe(DEFAULT_AI_SETTINGS.model);
        expect(resolved.concurrency).toBe(DEFAULT_AI_SETTINGS.concurrency);
        expect(resolved.tagLanguage).toBe('auto');
    });

    it('空对象输入等价于默认值', () => {
        expect(resolveAiSettings({})).toEqual(DEFAULT_AI_SETTINGS);
    });

    it('未知字段被忽略且不污染返回值', () => {
        const resolved = resolveAiSettings({ unknownField: 1 } as never);
        expect((resolved as unknown as Record<string, unknown>).unknownField).toBeUndefined();
    });

    it('默认值对象不被合并过程污染', () => {
        resolveAiSettings({ batchSize: 99 });
        expect(DEFAULT_AI_SETTINGS.batchSize).toBe(5);
    });
});

describe('isAiConfigured', () => {

    function makeAi(overrides: Partial<AiSettings> = {}): AiSettings {
        return { ...DEFAULT_AI_SETTINGS, ...overrides };
    }

    function makeApp(apiKey: string | null) {
        return {
            secretStorage: {
                getSecret: () => apiKey,
            },
        } as never;
    }

    it('总开关关闭时不可用', () => {
        const ai = makeAi({ enabled: false, baseUrl: 'https://x', model: 'm' });
        expect(isAiConfigured(makeApp('k'), ai)).toBe(false);
    });

    it('缺 baseUrl / model / apiKey 任一项均不可用', () => {
        const base = { enabled: true };
        expect(isAiConfigured(makeApp('k'), makeAi({ ...base, baseUrl: '', model: 'm' }))).toBe(false);
        expect(isAiConfigured(makeApp('k'), makeAi({ ...base, baseUrl: 'https://x', model: '' }))).toBe(false);
        expect(isAiConfigured(makeApp(null), makeAi({ ...base, baseUrl: 'https://x', model: 'm', apiKey: '' }))).toBe(false);
    });

    it('配置完整（SecretStorage 有 Key）时可用', () => {
        const ai = makeAi({ enabled: true, baseUrl: 'https://x', model: 'm', apiKey: '' });
        expect(isAiConfigured(makeApp('secret-key'), ai)).toBe(true);
    });

    it('SecretStorage 无 Key 时回退明文 apiKey', () => {
        const ai = makeAi({ enabled: true, baseUrl: 'https://x', model: 'm', apiKey: 'plain' });
        expect(isAiConfigured(makeApp(null), ai)).toBe(true);
    });
});
