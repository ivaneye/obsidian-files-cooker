import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import { MoveInfo } from 'src/modal/move-info';

/**
 *  弹窗确认要创建的文件
 */
export class CreateConfirmModal extends Modal {
    moveInfos: MoveInfo[];
    copyFlag: boolean;

    constructor(app: App, moveInfos: MoveInfo[]) {
        super(app);
        this.moveInfos = moveInfos;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Confirm Create?" });

        this.moveInfos.forEach(info => {
            contentEl.createEl("div", { text: info.targetDir + "/" + info.sourceFile.name });
        })

        new Setting(contentEl)
            .addButton((btn) =>
                btn.setButtonText("Confirm")
                    .setCta()
                    .onClick(async () => {
                        this.close();
                        for (const key in this.moveInfos) {
                            let info = this.moveInfos[key];
                            await this.app.vault.create(info.targetDir + "/" + info.sourceFile.name, "");
                        }
                        new Notice("Create Success!");
                    }))
            .addButton((btn) =>
                btn
                    .setButtonText("Cancel")
                    .setCta()
                    .onClick(() => {
                        this.close();
                        new Notice("Create Canceled!");
                    }));
    }
}