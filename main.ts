import { Plugin, App, PluginSettingTab, Setting } from 'obsidian';
import { initBackup } from 'src/backup/backup-service';
import { DEFAULT_BACKUP_SETTINGS, deepMerge, renderBackupSettings } from 'src/backup/backup-settings';
import type { BackupSettings } from 'src/backup/backup-settings';
import { ClipboardCommand } from 'src/command/clipboard-command';
import { CurrentFileCommand } from 'src/command/current-file-command';
import { DataviewCommand } from 'src/command/dataview-command';
import { PresentationCommand } from 'src/command/presentation-command';
import { SearchCommand } from 'src/command/search-command';
import { ContextMenuCommand } from 'src/command/context-menu-command';
import { BasesCommand } from 'src/command/bases-command';
import { UndoCommand } from 'src/command/undo-command';

export default class FileCookerPlugin extends Plugin {
	settings: FileCookerPluginSettings;

	async onload() {

		await this.loadSettings();

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

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new FileCookerSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		// 深合并：嵌套 backup 段不会因浅拷贝丢失子字段
		this.settings = deepMerge<FileCookerPluginSettings>(DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

const DEFAULT_SETTINGS: FileCookerPluginSettings = {
	flomoAPI: '',
	limit: '300',
	backup: DEFAULT_BACKUP_SETTINGS,
}

interface FileCookerPluginSettings {
	flomoAPI: string;
	limit: string;
	backup: BackupSettings;
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

		containerEl.createEl('h2', { text: 'File Cooker 设置' });

		new Setting(containerEl)
			.setName('批量文件上限')
			.setDesc('配置批处理文件数量上限')
			.addText(text => text
				.setPlaceholder('输入数量上限')
				.setValue(this.plugin.settings.limit)
				.onChange(async (value) => {
					this.plugin.settings.limit = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('flomoAPI')
			.setDesc('配置 flomo API，用于同步笔记')
			.addText(text => text
				.setPlaceholder('输入 flomo API')
				.setValue(this.plugin.settings.flomoAPI)
				.onChange(async (value) => {
					this.plugin.settings.flomoAPI = value;
					await this.plugin.saveSettings();
				}));

		// 备份与撤销设置分区（独立渲染函数，避免 main.ts 膨胀）
		renderBackupSettings(containerEl, this.plugin);
	}
}
