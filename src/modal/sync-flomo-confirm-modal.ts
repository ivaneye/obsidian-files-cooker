import FileCookerPlugin from 'main';
import { Modal, Notice, Setting, TAbstractFile, TFile } from 'obsidian';
import fetch from 'node-fetch';

/**
 *  弹窗确认要同步到flomo的文件
 */
export class SyncFlomoConfirmModal extends Modal {
    resultArr: TAbstractFile[];
    plugin: FileCookerPlugin;

    constructor(plugin: FileCookerPlugin, resultArr: TAbstractFile[]) {
        super(plugin.app);
        this.plugin = plugin;
        this.resultArr = resultArr;
    }

    async onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Confirm Sync to flomo?" });

        if (this.resultArr.length == 0) {
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
            this.resultArr.forEach(info => {
                contentEl.createEl("div", { text: info.path });
            })

            new Setting(contentEl)
                .addButton((btn) =>
                    btn
                        .setButtonText("Confirm")
                        .setCta()
                        .onClick(async () => {
                            this.close();
                            for(let i = 0; i < this.resultArr.length; i++) {
                                let info = this.resultArr[i];
                                let cont = await this.app.vault.read((info as TFile));
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
