import { Notice } from 'obsidian';
import FileCookerPlugin from 'main';
import { Command } from './command';
import { AiProvider } from 'src/ai/ai-provider';
import { isAiConfigured, loadAiApiKey } from 'src/ai/ai-settings';
import { QueryPlanner, collectVaultContext } from 'src/ai/query-planner';
import { executeQuery } from 'src/ai/query-executor';
import { WorkbenchModal } from 'src/modal/workbench-modal';

/**
 * 统一工作台命令：查询（AI 生成 / 手写脚本 / 既有三来源）→ 确认 → 执行。
 *
 * 与其他 AI 命令不同：AI 未配置**不阻断**工作台——AI 来源在选择时才检查，
 * 手写脚本与既有三来源零 AI 依赖，未配置 AI 的用户也能完整使用。
 */
export class WorkbenchCommand implements Command {

	plugin: FileCookerPlugin;

	constructor(plugin: FileCookerPlugin) {
		this.plugin = plugin;
	}

	regist(): void {
		this.plugin.addCommand({
			id: 'open-file-cooker-workbench',
			name: 'Open File Cooker workbench ...',
			callback: () => this.openWorkbench(),
		});

		// 侧边栏 ribbon：文件烹饪台主入口
		this.plugin.addRibbonIcon('cooking-pot', 'File Cooker 工作台', () => this.openWorkbench());
	}

	private openWorkbench(): void {
		const ai = this.plugin.settings.ai;
		let planner: unknown = null;
		if (isAiConfigured(this.plugin.app, ai)) {
			// Provider 必须拿到「解析后的 Key」（SecretStorage 接管后明文字段已清空）
			const providerSettings = { ...ai, apiKey: loadAiApiKey(this.plugin.app, ai) ?? '' };
			planner = new QueryPlanner(
				providerSettings,
				new AiProvider(providerSettings),
				collectVaultContext(this.plugin.app),
			);
		}

		new WorkbenchModal(this.plugin.app, {
			planner: planner as { generate(input: string): Promise<import('src/ai/query-ir').QueryIR> },
			executor: {
				execute: (target, text) => executeQuery(target, text, this.plugin),
			},
		}, this.plugin).open();
	}
}
