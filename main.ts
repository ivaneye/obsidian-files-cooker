import { Plugin, App, PluginSettingTab, Setting } from 'obsidian';
import { ClipboardCommand } from 'src/command/clipboard-command';
import { CurrentFileCommand } from 'src/command/current-file-command';
import { DataviewCommand } from 'src/command/dataview-command';

export default class FileCookerPlugin extends Plugin {
	settings: FileCookerPluginSettings;

	async onload() {

		await this.loadSettings();

		new CurrentFileCommand(this).regist();
		new ClipboardCommand(this).regist();
		new DataviewCommand(this).regist();

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
	flomoAPI: ''
}

interface FileCookerPluginSettings {
	flomoAPI: string;
}

class FileCookerSettingTab extends PluginSettingTab {
	plugin: FileCookerPlugin;

	constructor(app: App, plugin: FileCookerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for File Cooker!'});

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