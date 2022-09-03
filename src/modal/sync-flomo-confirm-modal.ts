import FileCookerPlugin from 'main';
import { Modal, Notice, Setting, TFile } from 'obsidian';
import fetch from 'node-fetch';
import { ActionModel } from 'src/action/action';

/**
 *  弹窗确认要同步到flomo的文件
 */
export class SyncFlomoConfirmModal extends Modal {
    actionModels: ActionModel[];
    plugin: FileCookerPlugin;

    constructor(plugin: FileCookerPlugin, actionModels: ActionModel[]) {
        super(plugin.app);
        this.plugin = plugin;
        this.actionModels = actionModels;
    }

    async onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Confirm Sync to flomo?" });

        if (this.actionModels.length == 0) {
            contentEl.createEl("div", { text: "No files found!" });

            new Setting(contentEl)
                .addButton((btn) =>
                    btn
                        .setButtonText("Close")
                        .setCta()
                        .onClick(() => {
                            this.close();
                        }));
        } else {
            this.actionModels.forEach(info => {
                if (info.file != null) {
                    contentEl.createEl("div", { text: info.file.path });
                } else {
                    contentEl.createEl("div", { text: "Sync Selection" });
                }
            })

            new Setting(contentEl)
                .addButton((btn) =>
                    btn
                        .setButtonText("Confirm")
                        .setCta()
                        .onClick(async () => {
                            this.close();
                            for (let i = 0; i < this.actionModels.length; i++) {
                                let info = this.actionModels[i];
                                let cont;
                                if (info.file != null) {
                                    cont = await this.app.vault.read((info.file as TFile));
                                } else {
                                    cont = info.content;
                                }
                                // 👇️ const response: Response
                                const response = await fetch(this.plugin.settings.flomoAPI, {
                                    method: 'POST',
                                    body: JSON.stringify({
                                        content: cont
                                    }),
                                    headers: {
                                        'Content-Type': 'application/json',
                                        Accept: 'application/json',
                                    },
                                });

                                if (!response.ok) {
                                    new Notice(`Sync to flomo Error!${response.text}[${response.status}]`);
                                    return;
                                }
                            }
                            new Notice("Sync to flomo Success!");
                        }))
                .addButton((btn) =>
                    btn
                        .setButtonText("Cancel")
                        .setCta()
                        .onClick(() => {
                            this.close();
                            new Notice("Sync to flomo Canceled!");
                        }));
        }
    }
}
