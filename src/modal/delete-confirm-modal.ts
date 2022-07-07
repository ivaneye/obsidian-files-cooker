import { App, Modal, Notice, Setting, TAbstractFile } from 'obsidian';

/**
 *  弹窗确认要删除的文件
 */
export class DeleteConfirmModal extends Modal {
    resultArr: TAbstractFile[];

    constructor(app: App, resultArr: TAbstractFile[]) {
        super(app);
        this.resultArr= resultArr;
    }

    async onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Confirm Delete?" });

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
                        .onClick(() => {
                            this.close();
                            this.resultArr.forEach(info => {
                                this.app.vault.trash(info, true);
                            })
                            new Notice("Delete Success!");
                        }))
                .addButton((btn) =>
                    btn
                        .setButtonText("Cancel")
                        .setCta()
                        .onClick(() => {
                            this.close();
                            new Notice("Delete Canceled!");
                        }));
        }
    }

    onClose() {
        let { contentEl } = this;
        contentEl.empty();
    }
}
