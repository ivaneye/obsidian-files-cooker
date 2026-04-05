import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import { MoveInfo } from 'src/modal/move-info';
import { addModalActions, renderModalLayout } from './modal-ui';

/**
 *  弹窗确认要创建的文件
 */
export class CreateConfirmModal extends Modal {
    moveInfos: MoveInfo[];
    copyFlag: boolean;

    constructor(app: App, moveInfos: MoveInfo[]) {
        super(app);
        this.moveInfos = moveInfos;
    }

    onOpen() {
        const { contentEl } = this;

        const targetDir = this.moveInfos[0]?.targetDir ?? '-';
        renderModalLayout(contentEl, {
            title: 'Create files',
            description: 'The following files will be created in target folder.',
            summaryLines: [`${this.moveInfos.length} files will be created.`, `Target: ${targetDir}`],
            listItems: this.moveInfos.map((info) => `${info.targetDir}/${info.sourceFile.name}`),
            listLabel: 'Affected files',
            emptyMessage: 'No files to create.',
            variant: 'confirm',
        });

        addModalActions(contentEl, [
            {
                text: 'Create files',
                cta: true,
                onClick: async () => {
                    this.close();
                    for (const info of this.moveInfos) {
                        await this.app.vault.create(`${info.targetDir}/${info.sourceFile.name}`, '');
                    }
                    new Notice('Files created.');
                },
            },
            {
                text: 'Cancel',
                onClick: () => {
                    this.close();
                    new Notice('Operation canceled.');
                },
            },
        ]);
    }
}
