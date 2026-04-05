import { App, Modal, Notice, Setting, TAbstractFile } from 'obsidian';
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
            title: 'Delete files',
            description: 'Please review the files before deleting.',
            summaryLines:
                this.resultArr.length > 0
                    ? [`${this.resultArr.length} files will be deleted permanently.`]
                    : undefined,
            listItems: this.resultArr.map((info) => info.path),
            listLabel: 'Affected files',
            emptyMessage: 'No files to delete.',
            variant: 'danger',
        });

        if (this.resultArr.length === 0) {
            addModalActions(contentEl, [
                {
                    text: 'Close',
                    onClick: () => this.close(),
                },
            ]);
        } else {
            addModalActions(contentEl, [
                {
                    text: 'Delete now',
                    cta: true,
                    warning: true,
                    onClick: () => {
                        // 事件分支：仅确认时执行删除
                        this.close();
                        this.resultArr.forEach(info => {
                            this.app.vault.trash(info, true);
                        });
                        new Notice('Delete completed.');
                    },
                },
                {
                    text: 'Cancel',
                    onClick: () => {
                        // 事件分支：取消时仅关闭与反馈
                        this.close();
                        new Notice('Operation canceled.');
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
