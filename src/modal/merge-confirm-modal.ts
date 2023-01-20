import { App, Modal, Notice, Setting, TAbstractFile, TFile } from 'obsidian';
import hasMarkdownSuffix from 'src/utils/file-type-util';
import { getLinebreak } from 'src/utils/line-break-util';

/**
 *  弹窗确认要合并的文件
 */
export class MergeConfirmModal extends Modal {
    targetFilePath: string;
    resultArr: TAbstractFile[];
    lineBreak: string;

    constructor(app: App, resultArr: TAbstractFile[], targetFilePath: string) {
        super(app);
        this.targetFilePath = targetFilePath;
        this.resultArr = resultArr;
        this.lineBreak = getLinebreak();
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Confirm Merge?" });

        contentEl.createEl("div", { text: "Merge all files below -> " + this.targetFilePath + " !" });
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
                            targetFile = await this.app.vault.create(this.targetFilePath, "");
                        }
                        for (const key in this.resultArr) {
                            let info = this.resultArr[key];
                            if (hasMarkdownSuffix(info.name)) {
                                let cont = await this.app.vault.read((info as TFile));
                                cont = this.clearYaml(cont);
                                cont = this.demoteHeader(cont);
                                cont = "# " + info.name.substring(0, info.name.length - 3)
                                    + this.lineBreak + cont + this.lineBreak + this.lineBreak;
                                await this.app.vault.append((targetFile as TFile), cont);
                            } else {
                                let cont = `![[${info.name}]]${this.lineBreak}${this.lineBreak}`;
                                await this.app.vault.append((targetFile as TFile), cont);
                            }
                        }
                        new Notice("Merge Success!");
                    }))
            .addButton((btn) =>
                btn
                    .setButtonText("Cancel")
                    .setCta()
                    .onClick(() => {
                        this.close();
                        new Notice("Merge Canceled!");
                    }));
    }

    clearYaml(cont: string): string {
        if (cont.startsWith("---")) {
            let lines = cont.split(this.lineBreak);
            let results = "";
            let appendFlag = true;
            for (let idx in lines) {
                if (lines[idx] == "---") {
                    appendFlag = !appendFlag;
                    continue;
                }
                if (appendFlag) {
                    results = results + lines[idx] + this.lineBreak;
                }
            }
            return results;
        } else {
            return cont;
        }
    }

    demoteHeader(cont: string): string {
        let reg = /# /g;
        return cont.replace(reg, "## ");
    }
}
