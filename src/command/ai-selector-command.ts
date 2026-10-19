import { Notice } from 'obsidian';
import { t } from 'src/i18n/index';
import FileCookerPlugin from 'main';
import { Command } from './command';
import { AiProvider } from 'src/ai/ai-provider';
import { isAiConfigured, loadAiApiKey } from 'src/ai/ai-settings';
import { QueryPlanner, collectVaultContext } from 'src/ai/query-planner';
import { executeQuery } from 'src/ai/query-executor';
import { AiSelectorModal } from 'src/modal/ai-selector-modal';

/**
 * 自然语言选择器命令：一句话描述 → AI 编译为 DQL / 搜索 / Bases 查询
 * → 审核执行 → 命中文件分发到既有批量 Action 管线。
 *
 * 前置检查与其他 AI 命令一致：未配置时 Notice + 跳转设置页，不发起网络请求。
 */
export class AiSelectorCommand implements Command {

	plugin: FileCookerPlugin;

	constructor(plugin: FileCookerPlugin) {
		this.plugin = plugin;
	}

	regist(): void {
		this.plugin.addCommand({
			id: 'find-files-with-natural-language',
			name: t('用自然语言查找文件 ...'),
			callback: () => {
				const ai = this.plugin.settings.ai;
				if (!isAiConfigured(this.plugin.app, ai)) {
					new Notice(t('请先在设置中启用并配置 AI（服务地址 / 模型 / API Key）。'));
					this.openSettings();
					return;
				}

				// Provider 必须拿到「解析后的 Key」——SecretStorage 接管后 settings.apiKey 已清空
				const providerSettings = { ...ai, apiKey: loadAiApiKey(this.plugin.app, ai) ?? '' };
				const planner = new QueryPlanner(
					providerSettings,
					new AiProvider(providerSettings),
					collectVaultContext(this.plugin.app),
				);

				new AiSelectorModal(this.plugin.app, {
					planner,
					executor: {
						execute: (target, text) => executeQuery(target, text, this.plugin),
					},
				}, this.plugin).open();
			},
		});
	}

	/** 跳转到本插件设置页（Obsidian setting API 为半公开，失败静默）。 */
	private openSettings(): void {
		try {
			const setting = (this.plugin.app as unknown as {
				setting?: { open?: () => void; openTabById?: (id: string) => void };
			}).setting;
			setting?.open?.();
			setting?.openTabById?.('obsidian-file-cooker');
		} catch (e) {
			// 设置页打开失败不阻塞提示
		}
	}
}
