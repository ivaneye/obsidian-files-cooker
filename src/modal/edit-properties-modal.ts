import { App, Modal, Notice, Setting, TAbstractFile, TFile } from 'obsidian';

/**
 *  弹窗编辑Properties属性
 */
export class EditPropertiesModal extends Modal {
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

        contentEl.createEl("h1", { text: "Edit Properties" });

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
                    txt.setPlaceholder("Properties Key")
                        .onChange((val) => {
                            this.key = val;
                        })
                ).addText((txt) =>
                    txt.setPlaceholder("Properties Value")
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
                            for (let i = 0; i < this.resultArr.length; i++) {
                                let info = this.resultArr[i] as TFile;
                                let _this = this;
                                this.app.fileManager.processFrontMatter(info, (props) => {
                                    if (_this.val === '-') {
                                        // 删除属性
                                        delete props[_this.key];
                                    } else {
                                        if (_this.overrideFlag || !props[_this.key]) {
                                            props[_this.key] = _this.val;
                                        }
                                    }
                                });
                            }
                            new Notice("Edit Property Success!");
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