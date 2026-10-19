import { Plugin, App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { initI18n, t } from 'src/i18n/index';
import type { LanguageSetting } from 'src/i18n/index';
import { initBackup } from 'src/backup/backup-service';
import { DEFAULT_BACKUP_SETTINGS, deepMerge, renderBackupSettings } from 'src/backup/backup-settings';
import type { BackupSettings } from 'src/backup/backup-settings';
import { DEFAULT_AI_SETTINGS, renderAiSettings } from 'src/ai/ai-settings';
import type { AiSettings } from 'src/ai/ai-settings';
import { ClipboardCommand } from 'src/command/clipboard-command';
import { CurrentFileCommand } from 'src/command/current-file-command';
import { DataviewCommand } from 'src/command/dataview-command';
import { PresentationCommand } from 'src/command/presentation-command';
import { SearchCommand } from 'src/command/search-command';
import { ContextMenuCommand } from 'src/command/context-menu-command';
import { BasesCommand } from 'src/command/bases-command';
import { UndoCommand } from 'src/command/undo-command';
import { AiSelectorCommand } from 'src/command/ai-selector-command';
import { WorkbenchCommand } from 'src/command/workbench-command';

export default class FileCookerPlugin extends Plugin {
	settings: FileCookerPluginSettings;

	async onload() {

		await this.loadSettings();
		initI18n(this.settings.language);

		// 初始化备份服务单例（批量写操作的回滚能力依赖它）
		initBackup(this.app, this.settings.backup);

		new CurrentFileCommand(this).regist();
		new ClipboardCommand(this).regist();
		new DataviewCommand(this).regist();
		new BasesCommand(this).regist();
		new SearchCommand(this).regist();
		new PresentationCommand(this).regist();
		new ContextMenuCommand(this).regist();
		new UndoCommand(this).regist();
		new AiSelectorCommand(this).regist();
		new WorkbenchCommand(this).regist();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new FileCookerSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		// 深合并：嵌套 backup 段不会因浅拷贝丢失子字段
		this.settings = deepMerge<FileCookerPluginSettings>(DEFAULT_SETTINGS, await this.loadData());
		initI18n(this.settings.language);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

const DEFAULT_SETTINGS: FileCookerPluginSettings = {
	flomoAPI: '',
	limit: '300',
	language: 'auto',
	backup: DEFAULT_BACKUP_SETTINGS,
	ai: DEFAULT_AI_SETTINGS,
}

interface FileCookerPluginSettings {
	flomoAPI: string;
	limit: string;
	language: LanguageSetting;
	backup: BackupSettings;
	ai: AiSettings;
}

class FileCookerSettingTab extends PluginSettingTab {
	plugin: FileCookerPlugin;

	constructor(app: App, plugin: FileCookerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: t('File Cooker 设置') });

		new Setting(containerEl)
			.setName(t('界面语言'))
			.setDesc(t('跟随 Obsidian 界面语言；也可固定为中文或英文。'))
			.addDropdown(dropdown => dropdown
				.addOption('auto', t('自动（跟随 Obsidian）'))
				.addOption('zh', t('中文'))
				.addOption('en', t('英文'))
				.setValue(this.plugin.settings.language)
				.onChange(async (value) => {
					this.plugin.settings.language = value as LanguageSetting;
					initI18n(this.plugin.settings.language);
					await this.plugin.saveSettings();
					this.display();
					// 设置页 / 弹窗 / 菜单文案即时生效；命令面板命令名在建命令时固化，需重载
					new Notice(t('界面语言已切换。命令面板中的命令名将在重新加载 Obsidian 后生效。'));
				}));

		new Setting(containerEl)
			.setName(t('批量文件上限'))
			.setDesc(t('配置批处理文件数量上限'))
			.addText(text => text
				.setPlaceholder(t('输入数量上限'))
				.setValue(this.plugin.settings.limit)
				.onChange(async (value) => {
					this.plugin.settings.limit = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('flomo API 地址'))
			.setDesc(t('配置 flomo API，用于同步笔记'))
			.addText(text => text
				.setPlaceholder(t('输入 flomo API'))
				.setValue(this.plugin.settings.flomoAPI)
				.onChange(async (value) => {
					this.plugin.settings.flomoAPI = value;
					await this.plugin.saveSettings();
				}));

		// 备份与撤销设置分区（独立渲染函数，避免 main.ts 膨胀）
		renderBackupSettings(containerEl, this.plugin);

		// AI 设置分区（实验性，默认关闭）
		renderAiSettings(containerEl, this.plugin);
	}
}
