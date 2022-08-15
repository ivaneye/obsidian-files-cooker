import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import { MoveInfo } from 'src/modal/move-info';

/**
 *  弹窗确认要移动/拷贝的文件
 */
export class MoveConfirmModal extends Modal {
    moveInfos: MoveInfo[];
    copyFlag: boolean;

    constructor(app: App, moveInfos: MoveInfo[]) {
        super(app);
        this.moveInfos = moveInfos;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Confirm Move/Copy?" });

        this.moveInfos.forEach(info => {
            contentEl.createEl("div", { text: info.sourceFile.path + " -> " + info.targetDir + "/" + info.sourceFile.name });
        })

        new Setting(contentEl)
            .addToggle((toggle) => {
                toggle.setTooltip("Copy instead!");
                toggle.onChange((val) => {
                    this.copyFlag = val;
                })
            })

        new Setting(contentEl)
            .addButton((btn) =>
                btn.setButtonText("Confirm")
                    .setCta()
                    .onClick(async () => {
                        this.close();
                        if (this.copyFlag) {
                            for (const key in this.moveInfos) {
                                let info = this.moveInfos[key];
                                await this.app.vault.copy((info.sourceFile as TFile), info.targetDir + "/" + info.sourceFile.name);
                            }
                            new Notice("Copy Success!");
                        } else {
                            for (const key in this.moveInfos) {
                                let info = this.moveInfos[key];
                                await this.app.fileManager.renameFile(info.sourceFile, info.targetDir + "/" + info.sourceFile.name);
                            }
                            new Notice("Move Success!");
                        }
                    }))
            .addButton((btn) =>
                btn
                    .setButtonText("Cancel")
                    .setCta()
                    .onClick(() => {
                        this.close();
                        new Notice("Move Canceled!");
                    }));
    }
}