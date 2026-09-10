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
            title: '重命名文件',
            description: '先设置前缀或后缀，再继续预览变更。',
            summaryLines: [`已选中 ${this.resultArr.length} 个文件。`],
            listItems: this.resultArr.map((info) => info.path),
            listLabel: '受影响的文件',
            emptyMessage: '没有可重命名的文件。',
            variant: 'input',
        });

        if (this.resultArr.length === 0) {
            addModalActions(contentEl, [
                {
                    text: '关闭',
                    onClick: () => this.close(),
                },
            ]);
        } else {

            addLabeledTextField(contentEl, '前缀', '输入前缀', (val) => {
				this.prefix = val;
			});
            addLabeledTextField(contentEl, '后缀', '输入后缀', (val) => {
				this.suffix = val;
			});

            addModalActions(contentEl, [
                {
                    text: '继续',
                    cta: true,
                    onClick: async () => {
                        if (isBlank(this.prefix as string) && isBlank(this.suffix as string)) {
                            showValidationNotice('前缀或后缀不能同时为空。');
                            return;
                        }
                        this.close();
                        new RenameConfirmModal(this.app, this.resultArr, this.prefix, this.suffix).open();
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
    }
}
