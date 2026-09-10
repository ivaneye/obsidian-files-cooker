import { App, Modal, Notice, Setting, TAbstractFile, TFile } from 'obsidian';
import { getBackup } from 'src/backup/backup-service';
import hasMarkdownSuffix from 'src/utils/file-type-util';
import { getLinebreak } from 'src/utils/line-break-util';
import { addModalActions, renderModalLayout } from './modal-ui';

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

        renderModalLayout(contentEl, {
            title: '合并文件',
            description: '合并前请确认源文件。',
            summaryLines: [`${this.resultArr.length} 个文件将被合并。`, `目标：${this.targetFilePath}`],
            listItems: this.resultArr.map((info) => info.path),
            listLabel: '受影响的文件',
            emptyMessage: '没有可合并的文件。',
            variant: 'confirm',
        });

        addModalActions(contentEl, [
            {
                text: '合并文件',
                cta: true,
                onClick: async () => {
                    this.close();
                    // 合并仅记录目标文件（源文件只读不记录），回滚还原目标内容
                    const recorder = getBackup().begin('merge', '合并文件');
                    try {
                    let targetFile = this.app.vault.getAbstractFileByPath(this.targetFilePath);
                    if (targetFile == null) {
                        targetFile = await this.app.vault.create(this.targetFilePath, '');
                    }
                    await recorder.snapshotContentBefore(targetFile as TFile);
                    for (const info of this.resultArr) {
                        if (hasMarkdownSuffix(info.name)) {
                            let cont = await this.app.vault.read((info as TFile));
                            cont = this.clearYaml(cont);
                            cont = this.demoteHeader(cont);
                            cont = `# ${info.name.substring(0, info.name.length - 3)}${this.lineBreak}${cont}${this.lineBreak}${this.lineBreak}`;
                            await this.app.vault.append((targetFile as TFile), cont);
                        } else {
                            const cont = `![[${info.name}]]${this.lineBreak}${this.lineBreak}`;
                            await this.app.vault.append((targetFile as TFile), cont);
                        }
                    }
                    await recorder.finish();
                    new Notice('文件合并完成。');
                    } catch (e) {
                        recorder.abort();
                        new Notice('操作失败：' + (e as Error).message);
                    }
                },
            },
            {
                text: '取消',
                onClick: () => {
                    this.close();
                    new Notice('操作已取消。');
                },
            },
        ]);
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
