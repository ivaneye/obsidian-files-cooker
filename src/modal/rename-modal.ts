import { App, Modal, Notice, Setting, TAbstractFile } from 'obsidian';
import { RenameConfirmModal } from './rename-confirm-modal';

/**
 *  重命名设置弹窗
 */
export class RenameModal extends Modal {
    resultArr: TAbstractFile[];
    prefix: String;
    suffix: String;

    constructor(app: App, resultArr: TAbstractFile[]) {
        super(app);
        this.resultArr = resultArr;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Rename Files" });

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
                .addText((txt) =>
                    txt.setPlaceholder("Prefix")
                        .onChange((val) => {
                            this.prefix = val;
                        })
                ).addText((txt) =>
                    txt.setPlaceholder("Suffix")
                        .onChange((val) => {
                            this.suffix = val;
                        })
                );

            new Setting(contentEl)
                .addButton((btn) =>
                    btn
                        .setButtonText("Confirm")
                        .setCta()
                        .onClick(async () => {
                            if ((this.prefix == null || this.prefix.trim() == "")
                               && (this.suffix == null || this.suffix.trim() == "")) {
                                new Notice("Prefix and Suffix could not be all empty!");
                                return;
                            }
                            this.close();
                            new RenameConfirmModal(this.app, this.resultArr, this.prefix, this.suffix).open();
                        }))
                .addButton((btn) =>
                    btn
                        .setButtonText("Cancel")
                        .setCta()
                        .onClick(() => {
                            this.close();
                            new Notice("Rename Canceled!");
                        }));
        }
    }
}