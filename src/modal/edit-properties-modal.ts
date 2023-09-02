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
                                // todo : 支持添加、删除单个标签值，alias值
                                this.app.fileManager.processFrontMatter(info, (props) => {
                                    let _k = _this.key.trim();
                                    let _v = _this.val.trim();
                                    if (_k === 'tags' || _k === 'alias' || _k === 'cssclasses') {
                                        // 多值标签
                                        let _vals = _v.split(',');
                                        // 初始化属性
                                        if (!props[_k]) {
                                            props[_k] = [];
                                        } else if (!(props[_k] instanceof Array)) {
                                            props[_k] = props[_k].split(',');
                                        }
                                        _vals.forEach(_t => {
                                            let it = _t.trim();
                                            if (it.indexOf('-') === 0) {
                                                let _tv = it.substring(1, it.length);
                                                let idx = -1;
                                                for (let i = 0; i < props[_k].length; i++) {
                                                    if (props[_k][i] === _tv) {
                                                        idx = i;
                                                        break;
                                                    }
                                                }
                                                delete props[_k][idx];
                                            } else {
                                                props[_k].push(it);
                                            }
                                        })
                                    } else {
                                        // 单值标签
                                        if (_v === '-') {
                                            // 删除属性
                                            delete props[_k];
                                        } else if (_this.overrideFlag || !props[_k]) {
                                            props[_k] = _v;
                                        }
                                    }
                                });
                            }
                            new Notice("Modify Property Success!");
                        }))
                .addButton((btn) =>
                    btn
                        .setButtonText("Cancel")
                        .setCta()
                        .onClick(() => {
                            this.close();
                            new Notice("Modify Property Canceled!");
                        }));
        }
    }
}