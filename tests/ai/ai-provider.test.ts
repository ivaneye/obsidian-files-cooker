import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
	return await import('../mocks/obsidian');
});

// node-fetch 以 vi.hoisted 打桩，避免真实网络请求
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('node-fetch', () => ({ default: fetchMock }));

import { AiProvider } from 'src/ai/ai-provider';
import { DEFAULT_AI_SETTINGS } from 'src/ai/ai-settings';

/**
 * 测试目的：验证 AiProvider 的请求构造与错误处理契约。
 * 测试内容：URL 拼接、鉴权头、JSON 模式参数、非 2xx 抛错内容、响应解析。
 * 预期结果：请求形如 OpenAI 兼容 /chat/completions；失败抛含 status 与 body 摘要的 Error。
 */
describe('AiProvider.chatJson', () => {

    afterEach(() => {
        fetchMock.mockReset();
    });

    function createProvider(overrides: Record<string, unknown> = {}): AiProvider {
        return new AiProvider({
            ...DEFAULT_AI_SETTINGS,
            enabled: true,
            baseUrl: 'https://api.deepseek.com/v1',
            model: 'deepseek-chat',
            apiKey: 'sk-test',
            ...overrides,
        });
    }

    it('向 baseUrl 拼接 /chat/completions 发起请求（容忍尾斜杠）', async () => {
        fetchMock.mockResolvedValueOnce(okResponse({ results: [] }));

        await createProvider().chatJson([{ role: 'user', content: 'hi' }]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    });

    it('请求头携带 Bearer 鉴权与 JSON 内容类型', async () => {
        fetchMock.mockResolvedValueOnce(okResponse({ results: [] }));

        await createProvider().chatJson([{ role: 'user', content: 'hi' }]);
        const headers = fetchMock.mock.calls[0][1].headers;
        expect(headers['Authorization']).toBe('Bearer sk-test');
        expect(headers['Content-Type']).toBe('application/json');
    });

    it('请求体包含 model、JSON 模式与低 temperature', async () => {
        fetchMock.mockResolvedValueOnce(okResponse({ results: [] }));

        await createProvider().chatJson([{ role: 'user', content: 'hi' }]);
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.model).toBe('deepseek-chat');
        expect(body.temperature).toBe(0.2);
        expect(body.response_format).toEqual({ type: 'json_object' });
        expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    });

    it('解析 choices[0].message.content 为 JSON 对象返回', async () => {
        fetchMock.mockResolvedValueOnce(okResponse({ results: [{ path: 'a.md' }] }));

        const result = await createProvider().chatJson([{ role: 'user', content: 'hi' }]);
        expect(result).toEqual({ results: [{ path: 'a.md' }] });
    });

    it('非 2xx 抛错且包含 HTTP status 与 body 摘要', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 401,
            text: async () => '{"error":"invalid api key and a very long body'.repeat(20) + '"}',
        });

        await expect(createProvider().chatJson([{ role: 'user', content: 'hi' }]))
            .rejects
            .toThrow(/401/);
    });

    it('content 非法 JSON 时抛出可识别错误', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { content: 'not-json' } }] }),
        });

        await expect(createProvider().chatJson([{ role: 'user', content: 'hi' }]))
            .rejects
            .toThrow();
    });

    it('兼容围栏包裹的 JSON（```json ... ```）与前后说明文字', async () => {
        const fenced = '以下是结果：\n```json\n{"results":[{"path":"a.md"}]}\n```';
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { content: fenced } }] }),
        });

        const result = await createProvider().chatJson([{ role: 'user', content: 'hi' }]);
        expect(result).toEqual({ results: [{ path: 'a.md' }] });
    });

    it('400 且错误与 response_format 相关时自动降级重试（去除该字段）', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: async () => '{"error": "response_format is not supported"}',
            })
            .mockResolvedValueOnce(okResponse({ results: [] }));

        const result = await createProvider().chatJson([{ role: 'user', content: 'hi' }]);
        expect(result).toEqual({ results: [] });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body);
        expect(retryBody.response_format).toBeUndefined();
    });

    it('400 但与 response_format 无关时不降级，直接抛错', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 400,
            text: async () => '{"error": "invalid model"}',
        });

        await expect(createProvider().chatJson([{ role: 'user', content: 'hi' }]))
            .rejects
            .toThrow(/invalid model/);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

/** 构造 OpenAI 兼容的成功响应桩。 */
function okResponse(contentObj: unknown) {
    return {
        ok: true,
        status: 200,
        json: async () => ({
            choices: [{ message: { content: JSON.stringify(contentObj) } }],
        }),
    };
}
