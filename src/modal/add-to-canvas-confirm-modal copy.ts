import { App, ItemView, Modal, Notice, requireApiVersion, Setting, TAbstractFile, TFile } from 'obsidian';

/**
 *  弹窗确认要添加到Canvas的文件
 */
export class AddToCanvasConfirmModal extends Modal {
    targetFilePath: string;
    resultArr: TAbstractFile[];

    constructor(app: App, resultArr: TAbstractFile[], targetFilePath: string) {
        super(app);
        this.targetFilePath = targetFilePath;
        this.resultArr = resultArr;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Confirm Add to Canvas?" });

        contentEl.createEl("div", { text: "Add all files below to Canvas -> " + this.targetFilePath + " !" });
        this.resultArr.forEach(info => {
            contentEl.createEl("div", { text: info.path });
        })

        new Setting(contentEl)
            .addButton((btn) =>
                btn.setButtonText("Confirm")
                    .setCta()
                    .onClick(async () => {
                        this.close();
                        let targetFile = this.app.vault.getAbstractFileByPath(this.targetFilePath);
                        if (targetFile == null) {
                            console.log("can not find " + this.targetFilePath)
                            targetFile = await this.app.vault.create(this.targetFilePath, "");
                        }
                        console.log(targetFile);
                        await this.app.workspace.getLeaf(true).openFile(targetFile as TFile);

                        // Conditions to check
                        const canvasView = app.workspace.getActiveViewOfType(ItemView);

                        if (canvasView?.getViewType() === "canvas") {
                            const canvas = canvasView?.canvas;

                            let idx = 0;
                            for (const key in this.resultArr) {
                                let file = this.resultArr[key] as TFile;
                                let tempChildNode;
                                if (!requireApiVersion("1.1.10")) {
                                    tempChildNode = canvas.createFileNode(file, "", { x: 20 + (220 * idx), y: 20, height: 200, width: 200 }, true);
                                } else {
                                    tempChildNode = canvas.createFileNode({
                                        file: file,
                                        pos: {
                                            x: 20 + (220 * idx),
                                            y: 20,
                                            width: 200,
                                            height: 200
                                        },
                                        size: {
                                            x: 20,
                                            y: 20,
                                            width: 200,
                                            height: 200
                                        },
                                        save: true,
                                        focus: false,
                                    });
                                }
                                canvas.deselectAll();
                                canvas.addNode(tempChildNode);
                                idx++;
                            }

                            canvas.requestSave();

                            new Notice("Add to Canvas Success!");
                        } else {
                            new Notice(targetFile.name + " is not a Canvas!");
                        }
                    }))
            .addButton((btn) =>
                btn
                    .setButtonText("Cancel")
                    .setCta()
                    .onClick(() => {
                        this.close();
                        new Notice("Add to Canvas Canceled!");
                    }));
    }
}
