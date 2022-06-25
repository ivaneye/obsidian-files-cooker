import { App, Modal, Notice, Setting, TAbstractFile } from 'obsidian';
import { FROM_CLIPBOARD, FROM_CURRENT_FILE, MoveInfo } from 'src/move/move-info';
import { Reader } from 'src/tools/reader';

/**
 *  弹窗确认要删除的文件
 */
export class DeleteModal extends Modal {
    type: string;
    paths: string[];
    reader: Reader;

    constructor(app: App, type: string) {
        super(app);
        this.type = type;
        this.reader = new Reader(app);
    }

    async onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Confirm Delete?" });

        let resultArr: TAbstractFile[] = [];
        if (this.type == FROM_CLIPBOARD) {
            resultArr = await this.reader.fromClipboard();
        } else if (this.type == FROM_CURRENT_FILE) {
            resultArr = this.reader.fromCurrentFile();
        }


        if (resultArr.length == 0) {
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
            resultArr.forEach(info => {
                contentEl.createEl("div", { text: info.path });
            })

            new Setting(contentEl)
                .addButton((btn) =>
                    btn
                        .setButtonText("Confirm")
                        .setCta()
                        .onClick(() => {
                            this.close();
                            resultArr.forEach(info => {
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
