import { App, Modal, Notice, TFile } from 'obsidian';
import { MoveInfo } from 'src/modal/move-info';
import { addLabeledToggleField, addModalActions, renderModalLayout } from './modal-ui';

/**
 *  弹窗确认要移动/拷贝的文件
 */
export class MoveConfirmModal extends Modal {
    moveInfos: MoveInfo[];
    copyFlag: boolean;

    constructor(app: App, moveInfos: MoveInfo[]) {
        super(app);
        this.moveInfos = moveInfos;
        this.copyFlag = false;
    }

    onOpen() {
        const { contentEl } = this;

        const targetDir = this.moveInfos[0]?.targetDir ?? '-';
        const listItems = this.moveInfos.map((info) => `${info.sourceFile.path} -> ${info.targetDir}/${info.sourceFile.name}`);
        renderModalLayout(contentEl, {
            title: 'Move or copy files',
            description: 'Review source files and choose move/copy mode before confirm.',
            summaryLines: [
                `${this.moveInfos.length} files will be processed.`,
                `Target: ${targetDir}`,
            ],
            listItems,
            listLabel: 'Affected files',
            emptyMessage: 'No files to process.',
            variant: 'confirm',
        });

		addLabeledToggleField(contentEl, 'Copy instead of moving files', 'Copy files to target instead of moving them', this.copyFlag, (val) => {
			this.copyFlag = val;
		});

		addModalActions(contentEl, [
			{
				text: 'Apply operation',
				cta: true,
				onClick: async () => {
                    this.close();
                    if (this.copyFlag) {
                        for (const info of this.moveInfos) {
                            await this.app.vault.copy((info.sourceFile as TFile), `${info.targetDir}/${info.sourceFile.name}`);
                        }
                        new Notice('Files copied.');
                    } else {
                        for (const info of this.moveInfos) {
                            await this.app.fileManager.renameFile(info.sourceFile, `${info.targetDir}/${info.sourceFile.name}`);
                        }
                        new Notice('Files moved.');
                    }
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
