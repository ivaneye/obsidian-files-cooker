import { App, Modal, Notice, TAbstractFile } from 'obsidian';
import { RenameConfirmModal } from './rename-confirm-modal';
import {
	addLabeledTextField,
	addModalActions,
	isBlank,
	renderModalLayout,
	showValidationNotice,
} from './modal-ui';

/**
 *  重命名设置弹窗
 */
export class RenameModal extends Modal {
    resultArr: TAbstractFile[];
    prefix: String;
    suffix: String;

    constructor(app: App, resultArr: TAbstractFile[]) {
        super(app);
        this.resultArr = resultArr;
    }

    onOpen() {
        const { contentEl } = this;

        renderModalLayout(contentEl, {
            title: 'Rename files',
            description: 'Set prefix or suffix before continuing to preview changes.',
            summaryLines: [`${this.resultArr.length} files selected.`],
            listItems: this.resultArr.map((info) => info.path),
            listLabel: 'Affected files',
            emptyMessage: 'No files to rename.',
            variant: 'input',
        });

        if (this.resultArr.length === 0) {
            addModalActions(contentEl, [
                {
                    text: 'Close',
                    onClick: () => this.close(),
                },
            ]);
        } else {

            addLabeledTextField(contentEl, 'Prefix', 'Input prefix', (val) => {
				this.prefix = val;
			});
            addLabeledTextField(contentEl, 'Suffix', 'Input suffix', (val) => {
				this.suffix = val;
			});

            addModalActions(contentEl, [
                {
                    text: 'Continue',
                    cta: true,
                    onClick: async () => {
                        if (isBlank(this.prefix as string) && isBlank(this.suffix as string)) {
                            showValidationNotice('Prefix or suffix is required.');
                            return;
                        }
                        this.close();
                        new RenameConfirmModal(this.app, this.resultArr, this.prefix, this.suffix).open();
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
}
