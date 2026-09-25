import fetch from 'node-fetch';
import { AiSettings } from './ai-settings';

/**
 * AI Provider：OpenAI 兼容 Chat API 客户端。
 *
 * 职责说明：
 * - 以 JSON 模式调用 {baseUrl}/chat/completions，DeepSeek / Kimi / GLM / Ollama 等兼容协议均可使用；
 * - 失败抛 Error（含 HTTP status 与 body 摘要），由调用方负责 Notice 化（模式对齐 flomo 同步）；
 * - 不做流式响应（元数据推断响应短，且需保持移动端兼容）。
 */

/** 对话消息结构。 */
export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

/** OpenAI 兼容服务的响应体中实际使用的字段。 */
interface ChatCompletionResponse {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
}

export class AiProvider {
	private settings: AiSettings;

	constructor(settings: AiSettings) {
		this.settings = settings;
	}

	/**
	 * 发起 JSON 模式对话并解析响应为对象。
	 * 请求体固定低 temperature（元数据推断求稳）与 json_object 响应格式；
	 * 若服务端因不支持 response_format 返回 400，自动降级为不带该字段的请求重试一次。
	 */
	async chatJson(messages: ChatMessage[]): Promise<unknown> {
		let res = await fetch(buildEndpoint(this.settings.baseUrl), {
			method: 'POST',
			headers: buildHeaders(this.settings.apiKey),
			body: JSON.stringify(buildRequestBody(this.settings.model, messages, true)),
		});

		if (!res.ok) {
			const status = res.status;
			const bodyText = (await res.text()).slice(0, 200);
			// 兼容不支持 json_object 模式的服务端：仅当 400 且错误与 response_format 相关时降级重试
			if (status === 400 && /response_format|json_object|json.?mode/i.test(bodyText)) {
				res = await fetch(buildEndpoint(this.settings.baseUrl), {
					method: 'POST',
					headers: buildHeaders(this.settings.apiKey),
					body: JSON.stringify(buildRequestBody(this.settings.model, messages, false)),
				});
			} else {
				throw new Error(`AI ${status}: ${bodyText}`);
			}
		}

		if (!res.ok) {
			const bodyText = (await res.text()).slice(0, 200);
			throw new Error(`AI ${res.status}: ${bodyText}`);
		}

		const data = (await res.json()) as ChatCompletionResponse;
		const content = data.choices?.[0]?.message?.content ?? '';
		const parsed = extractJsonObject(content);
		if (parsed == null) {
			throw new Error('AI 响应不是合法 JSON：' + content.slice(0, 100));
		}
		return parsed;
	}
}

/** 拼接请求端点（容忍 baseUrl 尾斜杠）。 */
export function buildEndpoint(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, '') + '/chat/completions';
}

/** 构造请求头（Bearer 鉴权 + JSON 内容类型）。 */
export function buildHeaders(apiKey: string): Record<string, string> {
	return {
		'Content-Type': 'application/json',
		'Authorization': 'Bearer ' + apiKey,
	};
}

/** 构造请求体；jsonMode=false 时省略 response_format（兼容不支持的服务端）。 */
export function buildRequestBody(model: string, messages: ChatMessage[], jsonMode: boolean): Record<string, unknown> {
	const body: Record<string, unknown> = {
		model,
		messages,
		temperature: 0.2,
	};
	if (jsonMode) {
		body['response_format'] = { type: 'json_object' };
	}
	return body;
}

/**
 * 从模型回复中提取 JSON 对象：
 * 依次尝试 直接解析 → 剥离 ``` 代码围栏 → 截取首个 { 到最后一个 } 之间的内容。
 * 全部失败返回 null（模型完全没输出 JSON）。
 */
export function extractJsonObject(content: string): unknown | null {
	const trimmed = (content ?? '').trim();
	if (trimmed === '') {
		return null;
	}
	// 1) 直接解析
	try {
		return JSON.parse(trimmed);
	} catch (e) {
		// 继续尝试
	}
	// 2) 剥离 Markdown 代码围栏
	const fenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
	try {
		return JSON.parse(fenced);
	} catch (e) {
		// 继续尝试
	}
	// 3) 截取首个 { 到最后一个 }（模型在 JSON 前后加了说明文字）
	const start = fenced.indexOf('{');
	const end = fenced.lastIndexOf('}');
	if (start >= 0 && end > start) {
		try {
			return JSON.parse(fenced.slice(start, end + 1));
		} catch (e) {
			// 放弃
		}
	}
	return null;
}
