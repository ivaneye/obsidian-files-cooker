import { App, Modal, Notice, TAbstractFile } from 'obsidian';
import { t } from 'src/i18n/index';
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
            title: t('重命名文件'),
            description: t('先设置前缀或后缀，再继续预览变更。'),
            summaryLines: [t('已选中 {n} 个文件。', { n: this.resultArr.length })],
            listItems: this.resultArr.map((info) => info.path),
            listLabel: t('受影响的文件'),
            emptyMessage: t('没有可重命名的文件。'),
            variant: 'input',
        });

        if (this.resultArr.length === 0) {
            addModalActions(contentEl, [
                {
                    text: t('关闭'),
                    onClick: () => this.close(),
                },
            ]);
        } else {

            addLabeledTextField(contentEl, t('前缀'), t('输入前缀'), (val) => {
				this.prefix = val;
			});
            addLabeledTextField(contentEl, t('后缀'), t('输入后缀'), (val) => {
				this.suffix = val;
			});

            addModalActions(contentEl, [
                {
                    text: t('继续'),
                    cta: true,
                    onClick: async () => {
                        if (isBlank(this.prefix as string) && isBlank(this.suffix as string)) {
                            showValidationNotice(t('前缀或后缀不能同时为空。'));
                            return;
                        }
                        this.close();
                        new RenameConfirmModal(this.app, this.resultArr, this.prefix, this.suffix).open();
                    },
                },
                {
                    text: t('取消'),
                    onClick: () => {
                        this.close();
                        new Notice(t('操作已取消。'));
                    },
                },
            ]);
        }
    }
}
