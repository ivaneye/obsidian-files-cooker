import { App, Modal, Notice, Setting, TAbstractFile } from 'obsidian';
import { text } from 'stream/consumers';

/**
 *  弹窗编辑Front Matter属性
 */
export class EditFrontMatterModal extends Modal {
    resultArr: TAbstractFile[];
    key: String;
    val: String;
    overrideFlag: boolean;

    constructor(app: App, resultArr: TAbstractFile[]) {
        super(app);
        this.resultArr = resultArr;
        let tmpFlag = localStorage.getItem("overrideFlag");
        if (tmpFlag && "true" == tmpFlag) {
            this.overrideFlag = true;
        }
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
                ).addToggle((toggle) => {
                    toggle.setValue(this.overrideFlag);
                    toggle.setTooltip("Override if exists!");
                    toggle.onChange((val) => {
                        localStorage.setItem("overrideFlag", val + "");
                        this.overrideFlag = val;
                    })
                });

            new Setting(contentEl)
                .addButton((btn) =>
                    btn
                        .setButtonText("Confirm")
                        .setCta()
                        .onClick(async () => {
                            if (this.key == null || this.key.trim() == "") {
                                new Notice("Key could not be empty!");
                                return;
                            }
                            if (this.val == null || this.val.trim() == "") {
                                new Notice("Value could not be empty!");
                                return;
                            }
                            this.close();
                            let api = this.app.plugins.plugins["metaedit"].api;
                            let c_num = 0;
                            let u_num = 0;
                            for (let i = 0; i < this.resultArr.length; i++) {
                                let info = this.resultArr[i];
                                let val = await api.getPropertyValue(this.key, info);
                                if (val == null) {
                                    api.createYamlProperty(this.key, this.val, info);
                                    c_num += 1;
                                } else if (this.overrideFlag || val.trim() == "") {
                                    api.update(this.key, this.val, info);
                                    u_num += 1;
                                }
                            }
                            new Notice("Edit Success!");
                            new Notice("Add " + c_num + " !");
                            new Notice("Update " + u_num + " !");
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