import { Notice } from 'obsidian';
import FileCookerPlugin from 'main';
import { Action, ActionModel } from './action';
import { AiPropertiesModal } from 'src/modal/ai-properties-modal';
import { AiProvider } from 'src/ai/ai-provider';
import { buildTagVocabulary } from 'src/ai/prop-infer';
import { isAiConfigured, loadAiApiKey } from 'src/ai/ai-settings';

/**
 * AI 属性补全 Action：接收来源 Reader 产出的文件集合，前置 AI 配置检查后
 * 打开提案弹窗（推断 → 审核 → 应用均在弹窗内完成）。
 *
 * 与其他 Action 的一致性：空集合 Notice 阻断；AI 未配置时 Notice 阻断且
 * 不发起网络请求、不打开弹窗（模式同 flomoAPI 检查）。
 */
export class AiPropertiesAction implements Action {

	private readonly plugin: FileCookerPlugin;

	constructor(plugin: FileCookerPlugin) {
		this.plugin = plugin;
	}

	act(actionModels: ActionModel[]): void {
		if (actionModels.length === 0) {
			new Notice('No Files Found!');
			return;
		}

		const ai = this.plugin.settings.ai;
		if (!isAiConfigured(this.plugin.app, ai)) {
			new Notice('请先在设置中启用并配置 AI（服务地址 / 模型 / API Key）。');
			return;
		}

		const files = actionModels.map((model) => model.file);
		// 关键：Provider 必须拿到「解析后的 Key」——Key 存入 SecretStorage 后 settings.apiKey
		// 会被清空（防明文残留），若直接传 settings 会导致请求携带空鉴权（401）
		const resolvedKey = loadAiApiKey(this.plugin.app, ai) ?? '';
		const providerSettings = { ...ai, apiKey: resolvedKey };
		let vocabulary: string[] = [];
		try {
			// getTags 未进入稳定类型声明，运行时可用（半公开 API）
			const tags = (this.plugin.app.metadataCache as unknown as { getTags?: () => Record<string, unknown> }).getTags?.();
			vocabulary = buildTagVocabulary(tags ?? {});
		} catch (e) {
			vocabulary = [];
		}

		new AiPropertiesModal(this.plugin.app, files, {
			settings: providerSettings,
			provider: new AiProvider(providerSettings),
			vocabulary,
			inferOptions: {
				inferTags: ai.inferTags,
				inferAliases: ai.inferAliases,
				customProps: parseCustomProps(ai.customProps),
				tagLanguage: ai.tagLanguage,
			},
		}).open();
	}
}

/** 自定义属性名解析：逗号分隔、去空白、去空项。 */
function parseCustomProps(raw: string): string[] {
	return raw.split(',').map((item) => item.trim()).filter((item) => item !== '');
}
