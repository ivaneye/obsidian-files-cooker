import { App, Modal, Notice, Setting, TAbstractFile } from 'obsidian';
import hasMarkdownSuffix from 'src/utils/file-type-util';
import { getLinebreak } from 'src/utils/line-break-util';

/**
 *  弹窗确认拷贝到剪贴板的文件
 */
export class CopyToClipboardConfirmModal extends Modal {
    resultArr: TAbstractFile[];
    nameOnlyFlag: boolean;
    lineBreak: string;

    constructor(app: App, resultArr: TAbstractFile[]) {
        super(app);
        this.resultArr = resultArr;
        this.lineBreak = getLinebreak();
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
                if (hasMarkdownSuffix(name)) {
                    name = name.substring(0, name.lastIndexOf("."));
                }
                str += "[[" + name + "]]" + this.lineBreak;
            })
        } else {
            this.resultArr.forEach(ff => {
                let name = ff.name;
                if (hasMarkdownSuffix(name)) {
                    name = name.substring(0, name.lastIndexOf("."));
                }
                str += "[[" + ff.path + "|" + name + "]]" + this.lineBreak;
            })
        }
        return str;
    }

    prepareHTMLStr(): string {
        let str = "";
        if (this.nameOnlyFlag) {
            this.resultArr.forEach(ff => {
                let name = ff.name;
                if (hasMarkdownSuffix(name)) {
                    name = name.substring(0, name.lastIndexOf("."));
                }
                str += "[[" + name + "]]<br>";
            })
        } else {
            this.resultArr.forEach(ff => {
                let name = ff.name;
                if (hasMarkdownSuffix(name)) {
                    name = name.substring(0, name.lastIndexOf("."));
                }
                str += "[[" + ff.path + "|" + name + "]]<br>";
            })
        }
        return str;
    }
}