import { App, Modal, Notice, TAbstractFile } from 'obsidian';
import { getBackup } from 'src/backup/backup-service';
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
            title: '重命名预览',
            description: '应用前请确认新的文件名。',
            summaryLines: [`${this.resultArr.length} 个文件将被重命名。`],
            listItems: this.resultArr.map((info) => `${info.name} -> ${this.newName(info.name)}`),
            listLabel: '计划变更',
            emptyMessage: '没有可重命名的文件。',
            variant: 'confirm',
        });

        addModalActions(contentEl, [
            {
                text: '应用重命名',
                cta: true,
                onClick: async () => {
                    if ((this.prefix == null || this.prefix.trim() == "")
                        && (this.suffix == null || this.suffix.trim() == "")) {
                        new Notice("前缀或后缀不能同时为空。");
                        return;
                    }
                    this.close();
                    // 重命名为路径变更：操作前记录旧→新路径，回滚走反向 renameFile
                    const recorder = getBackup().begin('rename', '重命名文件');
                    try {
                    for (let i = 0; i < this.resultArr.length; i++) {
                        let info = this.resultArr[i];
                        let name = this.newName(info.name);
                        await recorder.snapshotPath(info, info.parent.path + "/" + name);
                        await this.app.fileManager.renameFile(info, info.parent.path + "/" + name);
                    }
                    await recorder.finish();
                    new Notice("重命名完成。");
                    } catch (e) {
                        recorder.abort();
                        new Notice("操作失败：" + (e as Error).message);
                    }
                },
            },
            {
                text: '取消',
                onClick: () => {
                    this.close();
                    new Notice("操作已取消。");
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
