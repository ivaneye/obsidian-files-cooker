import { App, Modal, Notice, Setting, TAbstractFile } from 'obsidian';
import hasMarkdownSuffix from 'src/utils/file-type-util';

/**
 *  重命名确认弹窗
 */
export class RenameConfirmModal extends Modal {
    resultArr: TAbstractFile[];
    prefix: String;
    suffix: String;

    constructor(app: App, resultArr: TAbstractFile[], prefix: String, suffix: String) {
        super(app);
        this.resultArr = resultArr;
        this.prefix = prefix;
        this.suffix = suffix;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Rename Files" });

        this.resultArr.forEach(info => {
            let name = this.newName(info.name);
            contentEl.createEl("div", { text: info.name + "->" + name });
        })

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Confirm")
                    .setCta()
                    .onClick(async () => {
                        if ((this.prefix == null || this.prefix.trim() == "")
                            && (this.suffix == null || this.suffix.trim() == "")) {
                            new Notice("Prefix and Suffix could not be all empty!");
                            return;
                        }
                        this.close();
                        for (let i = 0; i < this.resultArr.length; i++) {
                            let info = this.resultArr[i];
                            let name = this.newName(info.name);
                            await this.app.fileManager.renameFile(info, info.parent.path + "/" + name);
                        }
                        new Notice("Rename Success!");
                    }))
            .addButton((btn) =>
                btn
                    .setButtonText("Cancel")
                    .setCta()
                    .onClick(() => {
                        this.close();
                        new Notice("Rename Canceled!");
                    }));

    }

    newName(name: String): String {
        let tName = name + "";
        let suf = "";
        if (hasMarkdownSuffix(tName)) {
            tName = tName.replace(".md", "");
            suf = ".md";
        }
        if (this.prefix && this.prefix.trim() != "") {
            if (this.prefix.startsWith("-")) {
                let t = this.prefix.substring(1, this.prefix.length);
                if (tName.startsWith(t)) {
                    tName = tName.substring(t.length, tName.length);
                }
            } else {
                tName = this.prefix + tName;
            }
        }
        if (this.suffix && this.suffix.trim() != "") {
            if (this.suffix.startsWith("-")) {
                let t = this.suffix.substring(1, this.suffix.length);
                if (tName.endsWith(t)) {
                    tName = tName.substring(0, tName.length - t.length);
                }
            } else {
                tName = tName + this.suffix;
            }
        }
        return tName + suf;
    }
}