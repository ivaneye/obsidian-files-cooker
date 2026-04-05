import { App, Modal, Notice, TAbstractFile } from 'obsidian';
import hasMarkdownSuffix from 'src/utils/file-type-util';
import { addModalActions, renderModalLayout } from './modal-ui';

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

        renderModalLayout(contentEl, {
            title: 'Rename preview',
            description: 'Review renamed file names before applying changes.',
            summaryLines: [`${this.resultArr.length} files will be renamed.`],
            listItems: this.resultArr.map((info) => `${info.name} -> ${this.newName(info.name)}`),
            listLabel: 'Planned changes',
            emptyMessage: 'No files to rename.',
            variant: 'confirm',
        });

        addModalActions(contentEl, [
            {
                text: 'Apply rename',
                cta: true,
                onClick: async () => {
                    if ((this.prefix == null || this.prefix.trim() == "")
                        && (this.suffix == null || this.suffix.trim() == "")) {
                        new Notice("Prefix or suffix is required.");
                        return;
                    }
                    this.close();
                    for (let i = 0; i < this.resultArr.length; i++) {
                        let info = this.resultArr[i];
                        let name = this.newName(info.name);
                        await this.app.fileManager.renameFile(info, info.parent.path + "/" + name);
                    }
                    new Notice("Rename completed.");
                },
            },
            {
                text: 'Cancel',
                onClick: () => {
                    this.close();
                    new Notice("Operation canceled.");
                },
            },
        ]);

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
