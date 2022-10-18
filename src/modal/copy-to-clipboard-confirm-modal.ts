import { App, Modal, Notice, Setting, TAbstractFile, TFile } from 'obsidian';
import { MoveInfo } from 'src/modal/move-info';

/**
 *  弹窗确认拷贝到剪贴板的文件
 */
export class CopyToClipboardConfirmModal extends Modal {
    resultArr: TAbstractFile[];
    nameOnlyFlag: boolean;

    constructor(app: App, resultArr: TAbstractFile[]) {
        super(app);
        this.resultArr = resultArr;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Confirm copy to clipboard?" });

        let htmlStr = this.prepareHTMLStr();
        let el = contentEl.createEl("div");
        el.innerHTML = htmlStr;

        new Setting(contentEl)
            .addToggle((toggle) => {
                toggle.setTooltip("Copy name only!");
                toggle.onChange((val) => {
                    this.nameOnlyFlag = val;
                    htmlStr = this.prepareHTMLStr();
                    el.innerHTML = htmlStr;
                })
            })

        new Setting(contentEl)
            .addButton((btn) =>
                btn.setButtonText("Confirm")
                    .setCta()
                    .onClick(async () => {
                        this.close();
                        let str = this.prepareStr();
                        navigator.clipboard.writeText(str);
                        new Notice("Copy links success!")
                    }))
            .addButton((btn) =>
                btn
                    .setButtonText("Cancel")
                    .setCta()
                    .onClick(() => {
                        this.close();
                        new Notice("Copy to Clipboard Canceled!");
                    }));
    }

    prepareStr(): string {
        let str = "";
        if (this.nameOnlyFlag) {
            this.resultArr.forEach(ff => {
                let name = ff.name;
                if (name.endsWith(".md")) {
                    name = name.substring(0, name.lastIndexOf("."));
                }
                str += "[[" + name + "]]\n";
            })
        } else {
            this.resultArr.forEach(ff => {
                let name = ff.name;
                if (name.endsWith(".md")) {
                    name = name.substring(0, name.lastIndexOf("."));
                }
                str += "[[" + ff.path + "|" + name + "]]\n";
            })
        }
        return str;
    }

    prepareHTMLStr(): string {
        let str = "";
        if (this.nameOnlyFlag) {
            this.resultArr.forEach(ff => {
                let name = ff.name;
                if (name.endsWith(".md")) {
                    name = name.substring(0, name.lastIndexOf("."));
                }
                str += "[[" + name + "]]<br>";
            })
        } else {
            this.resultArr.forEach(ff => {
                let name = ff.name;
                if (name.endsWith(".md")) {
                    name = name.substring(0, name.lastIndexOf("."));
                }
                str += "[[" + ff.path + "|" + name + "]]<br>";
            })
        }
        return str;
    }
}