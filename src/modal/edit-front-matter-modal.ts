import { App, Modal, Notice, Setting, TAbstractFile } from 'obsidian';

/**
 *  弹窗编辑Front Matter属性
 */
export class EditFrontMatterModal extends Modal {
    resultArr: TAbstractFile[];
    key: String;
    val: String;

    constructor(app: App, resultArr: TAbstractFile[]) {
        super(app);
        this.resultArr = resultArr;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Edit Front Matter" });

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
                    txt.setPlaceholder("Front Matter Key")
                        .onChange((val) => {
                            this.key = val;
                        })
                ).addText((txt) =>
                    txt.setPlaceholder("Front Matter Value")
                        .onChange((val) => {
                            this.val = val;
                        })
                )
                .addButton((btn) =>
                    btn
                        .setButtonText("Confirm")
                        .setCta()
                        .onClick(() => {
                            this.close();
                            let api = this.app.plugins.plugins["metaedit"].api;
                            this.resultArr.forEach(async info => {
                                let val = await api.getPropertyValue(this.key, info);
                                if (val == null) {
                                    api.createYamlProperty(this.key, this.val, info);
                                } else {
                                    api.update(this.key, this.val, info);
                                }
                            })
                            new Notice("Edit Success!");
                        }))
                .addButton((btn) =>
                    btn
                        .setButtonText("Cancel")
                        .setCta()
                        .onClick(() => {
                            this.close();
                            new Notice("Edit Canceled!");
                        }));
        }
    }
}