import { App, FileManager, Modal, Notice, Setting } from 'obsidian';
import { MoveInfo } from 'src/modal/move-info';

/**
 *  弹窗确认要移动的文件
 */
export class ConfirmModal extends Modal {
    moveInfos: MoveInfo[];

    constructor(app: App, moveInfos: MoveInfo[]) {
        super(app);
        this.moveInfos = moveInfos;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Confirm Move?" });

        this.moveInfos.forEach(info => {
            contentEl.createEl("div", { text: info.sourceFile.path + " -> " + info.targetDir + "/" + info.sourceFile.name });
        })

        new Setting(contentEl)
            .addButton((btn) =>
                btn.setButtonText("Confirm")
                    .setCta()
                    .onClick(async () => {
                        this.close();
                        for (const key in this.moveInfos) {
                            let info = this.moveInfos[key];
                            await this.app.fileManager.renameFile(info.sourceFile, info.targetDir + "/" + info.sourceFile.name);
                        }
                        new Notice("Move Success!");
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

    // onClose() {
    //     let { contentEl } = this;
    //     contentEl.empty();
    // }
}