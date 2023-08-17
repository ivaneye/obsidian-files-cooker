import { Plugin, App, PluginSettingTab, Setting } from 'obsidian';
import { ClipboardCommand } from 'src/command/clipboard-command';
import { CurrentFileCommand } from 'src/command/current-file-command';
import { DataviewCommand } from 'src/command/dataview-command';
import { SearchCommand } from 'src/command/search-command';
import * as internal from 'stream';

export default class FileCookerPlugin extends Plugin {
	settings: FileCookerPluginSettings;

	async onload() {

		await this.loadSettings();

		new CurrentFileCommand(this).regist();
		new ClipboardCommand(this).regist();
		new DataviewCommand(this).regist();
		new SearchCommand(this).regist();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new FileCookerSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

const DEFAULT_SETTINGS: FileCookerPluginSettings = {
	flomoAPI: '',
	limit: '300'
}

interface FileCookerPluginSettings {
	flomoAPI: string;
	limit: string;
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

		containerEl.createEl('h2', { text: 'Settings for File Cooker!' });

		new Setting(containerEl)
			.setName('Limit')
			.setDesc('config batch file limit')
			.addText(text => text
				.setPlaceholder('Enter batch file limit')
				.setValue(this.plugin.settings.limit)
				.onChange(async (value) => {
					this.plugin.settings.limit = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('flomoAPI')
			.setDesc('config flomo API to sync notes')
			.addText(text => text
				.setPlaceholder('Enter flomo API')
				.setValue(this.plugin.settings.flomoAPI)
				.onChange(async (value) => {
					this.plugin.settings.flomoAPI = value;
					await this.plugin.saveSettings();
				}));
	}
}