import { App, Setting } from 'obsidian';
import { deepMerge } from 'src/backup/backup-settings';

/**
 * AI 设置：默认值、解析合并、Key 存储与设置分区渲染。
 *
 * 职责说明：
 * - 定义 AiSettings 结构与默认值（总开关默认关闭，opt-in）；
 * - resolveAiSettings 提供默认值合并（用户数据缺段/缺字段时补齐）；
 * - API Key 优先存 Obsidian SecretStorage，settings 明文仅作回退；
 * - renderAiSettings 渲染 AI 设置分区，供 main.ts 的 SettingTab 调用。
 */

/** 标签语言选项。 */
export type TagLanguage = 'auto' | 'zh' | 'en';

/** AI 服务设置项。 */
export interface AiSettings {
	/** 总开关：默认关闭；关闭或配置不全时 AI 命令直接 Notice 阻断。 */
	enabled: boolean;
	/** OpenAI 兼容服务地址，如 https://api.deepseek.com/v1。 */
	baseUrl: string;
	/** 模型名，如 deepseek-chat。 */
	model: string;
	/** API Key 回退存储；优先 SecretStorage。 */
	apiKey: string;
	/** 每次请求包含的文件数。 */
	batchSize: number;
	/** 并发请求数上限。 */
	concurrency: number;
	/** 每篇笔记发送的正文截断字符数。 */
	contextChars: number;
	/** 是否推断 tags。 */
	inferTags: boolean;
	/** 是否推断 aliases。 */
	inferAliases: boolean;
	/** 自定义标量属性名（逗号分隔），空串=不推断。 */
	customProps: string;
	/** 标签语言偏好。 */
	tagLanguage: TagLanguage;
	/** 规划器是否注入库内上下文（词表/属性键/目录），用于自然语言选择器。 */
	vaultContext: boolean;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
	enabled: false,
	baseUrl: '',
	model: '',
	apiKey: '',
	batchSize: 5,
	concurrency: 3,
	contextChars: 1500,
	inferTags: true,
	inferAliases: true,
	customProps: '',
	tagLanguage: 'auto',
	vaultContext: true,
};

/** 设置分区渲染所需的最小插件接口（避免与 main.ts 循环依赖）。 */
export interface AiSettingsHost {
	/** Obsidian App 实例，用于 SecretStorage 读写。 */
	app: App;
	settings: { ai: AiSettings };
	saveSettings(): Promise<void>;
}

/** 判断字符串是否为空或纯空白。 */
function isBlank(value?: string | null): boolean {
	return value == null || value.trim() === '';
}

/**
 * 将用户已保存的 AI 设置合并到默认值上：
 * 缺段/缺字段补默认值，未知字段忽略（白名单拷贝），保证旧数据平滑迁移。
 */
export function resolveAiSettings(saved?: Partial<AiSettings> | null): AiSettings {
	const merged = deepMerge<AiSettings>(DEFAULT_AI_SETTINGS, saved ?? {});
	// 白名单拷贝：丢弃默认值之外的未知字段，避免历史/脏数据进入运行时配置
	const resolved = {} as AiSettings;
	(Object.keys(DEFAULT_AI_SETTINGS) as Array<keyof AiSettings>).forEach((key) => {
		resolved[key] = merged[key] as never;
	});
	return resolved;
}

/**
 * AI 可用性检查：总开关开启且 baseUrl/model/apiKey 均已配置。
 * 未通过时 AI 命令应 Notice 阻断，不发起网络请求。
 */
export function isAiConfigured(app: App, ai: AiSettings): boolean {
	if (!ai.enabled || isBlank(ai.baseUrl) || isBlank(ai.model)) {
		return false;
	}
	return loadAiApiKey(app, ai) != null;
}

/** SecretStorage 中 API Key 的固定 ID（小写字母数字与连字符）。 */
const API_KEY_SECRET_ID = 'file-cooker-ai-apikey';

/**
 * 读取可用的 API Key：优先 SecretStorage，异常或缺失时回退设置明文。
 * 返回 null 表示未配置。
 */
export function loadAiApiKey(app: App, ai: AiSettings): string | null {
	try {
		const secret = app.secretStorage?.getSecret(API_KEY_SECRET_ID);
		if (!isBlank(secret)) {
			return secret as string;
		}
	} catch (e) {
		// SecretStorage 不可用时静默回退明文
	}
	return isBlank(ai.apiKey) ? null : ai.apiKey;
}

/**
 * 保存 API Key：优先写 SecretStorage 并清除明文回退；
 * SecretStorage 不可用时降级为明文存储（设置页已标注风险）。
 */
export function saveAiApiKey(app: App, ai: AiSettings, value: string): void {
	if (isBlank(value)) {
		try {
			app.secretStorage?.setSecret(API_KEY_SECRET_ID, '');
		} catch (e) {
			// ignore
		}
		ai.apiKey = '';
		return;
	}
	try {
		app.secretStorage?.setSecret(API_KEY_SECRET_ID, value.trim());
		// SecretStorage 写入成功后清除明文回退
		ai.apiKey = '';
	} catch (e) {
		ai.apiKey = value.trim();
	}
}

/**
 * 渲染 AI 设置分区。
 * 说明：设置分区渲染为 UI 行为，不套用 TDD，经构建 + 手工验证（模式同 renderBackupSettings）。
 */
export function renderAiSettings(containerEl: HTMLElement, plugin: AiSettingsHost): void {
	const ai = plugin.settings.ai;

	containerEl.createEl('h2', { text: 'AI（实验性）' });
	containerEl.createEl('p', {
		text: 'AI 能力默认关闭。启用后，AI 仅在你主动触发对应命令时读取笔记内容生成提案，应用前需人工确认。',
		cls: 'setting-item-description',
	});

	new Setting(containerEl)
		.setName('启用 AI')
		.setDesc('总开关：关闭时所有 AI 命令直接提示并终止。')
		.addToggle((toggle) => {
			toggle.setValue(ai.enabled).onChange(async (value) => {
				ai.enabled = value;
				await plugin.saveSettings();
			});
		});

	new Setting(containerEl)
		.setName('服务地址 (baseUrl)')
		.setDesc('OpenAI 兼容地址，如 https://api.deepseek.com/v1 或 http://127.0.0.1:11434/v1（Ollama）。')
		.addText((text) => {
			text.setPlaceholder('https://api.deepseek.com/v1')
				.setValue(ai.baseUrl)
				.onChange(async (value) => {
					ai.baseUrl = value.trim();
					await plugin.saveSettings();
				});
		});

	new Setting(containerEl)
		.setName('模型')
		.setDesc('如 deepseek-chat、kimi-k2、gpt-4o-mini 等。')
		.addText((text) => {
			text.setPlaceholder('deepseek-chat')
				.setValue(ai.model)
				.onChange(async (value) => {
					ai.model = value.trim();
					await plugin.saveSettings();
				});
		});

	new Setting(containerEl)
		.setName('API Key')
		.setDesc('优先存入 Obsidian SecretStorage；不可用时降级为明文保存在配置文件中（有泄露风险）。')
		.addText((text) => {
			const stored = loadAiApiKey(plugin.app, ai);
			text.inputEl.setAttribute('type', 'password');
			text.setPlaceholder('sk-...')
				.setValue(stored ?? '')
				.onChange(async (value) => {
					saveAiApiKey(plugin.app, ai, value);
					await plugin.saveSettings();
				});
		});

	new Setting(containerEl)
		.setName('每批文件数')
		.setDesc('单次 AI 请求包含的文件数量，默认 5。')
		.addText((text) => {
			text.setPlaceholder(String(DEFAULT_AI_SETTINGS.batchSize))
				.setValue(String(ai.batchSize))
				.onChange(async (value) => {
					const parsed = parseInt(value, 10);
					ai.batchSize = Number.isNaN(parsed) || parsed <= 0
						? DEFAULT_AI_SETTINGS.batchSize
						: parsed;
					await plugin.saveSettings();
				});
		});

	new Setting(containerEl)
		.setName('并发请求数')
		.setDesc('同时进行的 AI 请求上限，默认 3。')
		.addText((text) => {
			text.setPlaceholder(String(DEFAULT_AI_SETTINGS.concurrency))
				.setValue(String(ai.concurrency))
				.onChange(async (value) => {
					const parsed = parseInt(value, 10);
					ai.concurrency = Number.isNaN(parsed) || parsed <= 0
						? DEFAULT_AI_SETTINGS.concurrency
						: parsed;
					await plugin.saveSettings();
				});
		});

	new Setting(containerEl)
		.setName('正文截断字符数')
		.setDesc('每篇笔记发送给 AI 的正文长度上限，调小可降低成本，默认 1500。')
		.addText((text) => {
			text.setPlaceholder(String(DEFAULT_AI_SETTINGS.contextChars))
				.setValue(String(ai.contextChars))
				.onChange(async (value) => {
					const parsed = parseInt(value, 10);
					ai.contextChars = Number.isNaN(parsed) || parsed <= 0
						? DEFAULT_AI_SETTINGS.contextChars
						: parsed;
					await plugin.saveSettings();
				});
		});

	new Setting(containerEl)
		.setName('推断 tags')
		.setDesc('按内容推断标签（优先复用库内已有标签）。')
		.addToggle((toggle) => {
			toggle.setValue(ai.inferTags).onChange(async (value) => {
				ai.inferTags = value;
				await plugin.saveSettings();
			});
		});

	new Setting(containerEl)
		.setName('推断 aliases')
		.setDesc('按内容推断别名（仅在明显有价值时给出）。')
		.addToggle((toggle) => {
			toggle.setValue(ai.inferAliases).onChange(async (value) => {
				ai.inferAliases = value;
				await plugin.saveSettings();
			});
		});

	new Setting(containerEl)
		.setName('自定义属性')
		.setDesc('额外推断的标量属性名，逗号分隔，如 status,domain；留空不推断。')
		.addText((text) => {
			text.setPlaceholder('status,domain')
				.setValue(ai.customProps)
				.onChange(async (value) => {
					ai.customProps = value.trim();
					await plugin.saveSettings();
				});
		});

	new Setting(containerEl)
		.setName('标签语言')
		.setDesc('生成标签的语言偏好。')
		.addDropdown((dropdown) => {
			dropdown
				.addOption('auto', '跟随笔记语言')
				.addOption('zh', '中文')
				.addOption('en', '英文')
				.setValue(ai.tagLanguage)
				.onChange(async (value) => {
					ai.tagLanguage = (['auto', 'zh', 'en'] as const).includes(value as TagLanguage)
						? (value as TagLanguage)
						: DEFAULT_AI_SETTINGS.tagLanguage;
					await plugin.saveSettings();
				});
		});
}
