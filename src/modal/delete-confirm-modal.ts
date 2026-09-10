import { App, Modal, Notice, Setting, TAbstractFile, TFile } from 'obsidian';
import { getBackup } from 'src/backup/backup-service';
import { addModalActions, renderModalLayout } from './modal-ui';

/**
 *  弹窗确认要删除的文件
 */
export class DeleteConfirmModal extends Modal {
    resultArr: TAbstractFile[];

    constructor(app: App, resultArr: TAbstractFile[]) {
        super(app);
        this.resultArr= resultArr;
    }

    async onOpen() {
        const { contentEl } = this;

        renderModalLayout(contentEl, {
            title: '删除文件',
            description: '请先确认要删除的文件。',
            summaryLines:
                this.resultArr.length > 0
                    ? [`${this.resultArr.length} 个文件将被永久删除。`]
                    : undefined,
            listItems: this.resultArr.map((info) => info.path),
            listLabel: '受影响的文件',
            emptyMessage: '没有可删除的文件。',
            variant: 'danger',
        });

        if (this.resultArr.length === 0) {
            addModalActions(contentEl, [
                {
                    text: '关闭',
                    onClick: () => this.close(),
                },
            ]);
        } else {
            addModalActions(contentEl, [
                {
                    text: '立即删除',
                    cta: true,
                    warning: true,
                    onClick: async () => {
                        // 事件分支：仅确认时执行删除；删除为内容写，undo 用快照重建文件
                        this.close();
                        const recorder = getBackup().begin('delete', '删除文件');
                        try {
                        for (const info of this.resultArr) {
                            await recorder.snapshotContentBefore(info as TFile);
                            await this.app.vault.trash(info, true);
                        }
                        await recorder.finish();
                        new Notice('删除完成。');
                        } catch (e) {
                            recorder.abort();
                            new Notice('操作失败：' + (e as Error).message);
                        }
                    },
                },
                {
                    text: '取消',
                    onClick: () => {
                        // 事件分支：取消时仅关闭与反馈
                        this.close();
                        new Notice('操作已取消。');
                    },
                },
            ]);
        }
    }

    // onClose() {
    //     let { contentEl } = this;
    //     contentEl.empty();
    // }
}
