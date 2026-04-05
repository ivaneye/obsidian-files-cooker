import { App, Modal, Notice, TAbstractFile, TFile } from 'obsidian';
import {
	addLabeledTextField,
	addLabeledToggleField,
	addModalActions,
	isBlank,
	renderModalLayout,
	showValidationNotice,
} from './modal-ui';

/**
 *  弹窗编辑Properties属性
 */
export class EditPropertiesModal extends Modal {
    resultArr: TAbstractFile[];
    key: String;
    val: String;
    overrideFlag: boolean;

    constructor(app: App, resultArr: TAbstractFile[]) {
        super(app);
        this.resultArr = resultArr;
        let tmpFlag = localStorage.getItem("overrideFlag");
        if (tmpFlag && "true" == tmpFlag) {
            this.overrideFlag = true;
        }
    }

    onOpen() {
        const { contentEl } = this;

        renderModalLayout(contentEl, {
            title: 'Edit properties',
            description: 'Configure key/value and override option for selected files.',
            summaryLines: [`${this.resultArr.length} files selected.`],
            listItems: this.resultArr.map((info) => info.path),
            listLabel: 'Affected files',
            emptyMessage: 'No files to edit.',
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

            addLabeledTextField(contentEl, 'Property Key', 'Input property key', (val) => {
				this.key = val;
			});
            addLabeledTextField(contentEl, 'Property Value', 'Input property value', (val) => {
				this.val = val;
			});
            addLabeledToggleField(
				contentEl,
				'Override Existing',
				'Override if exists!',
				Boolean(this.overrideFlag),
				(val) => {
					localStorage.setItem('overrideFlag', val + '');
					this.overrideFlag = val;
				}
			);

            addModalActions(contentEl, [
                {
                    text: 'Apply properties',
                    cta: true,
                    onClick: async () => {
                        if (isBlank(this.key as string)) {
                            showValidationNotice('Property key is required.');
                            return;
                        }
                        if (isBlank(this.val as string)) {
                            showValidationNotice('Property value is required.');
                            return;
                        }
                        this.close();
                        for (let i = 0; i < this.resultArr.length; i++) {
                            const info = this.resultArr[i] as TFile;
                            const self = this;
                            // todo : 支持添加、删除单个标签值，alias值
                            this.app.fileManager.processFrontMatter(info, (props) => {
                                const k = self.key.trim();
                                const v = self.val.trim();
                                if (k === 'tags' || k === 'alias' || k === 'cssclasses') {
                                    const vals = v.split(',');
                                    if (!props[k]) {
                                        props[k] = [];
                                    } else if (!(props[k] instanceof Array)) {
                                        props[k] = props[k].split(',');
                                    }
                                    vals.forEach((item) => {
                                        const normalized = item.trim();
                                        if (normalized.indexOf('-') === 0) {
                                            const toDelete = normalized.substring(1, normalized.length);
                                            let idx = -1;
                                            for (let i = 0; i < props[k].length; i++) {
                                                if (props[k][i] === toDelete) {
                                                    idx = i;
                                                    break;
                                                }
                                            }
                                            delete props[k][idx];
                                        } else {
                                            props[k].push(normalized);
                                        }
                                    });
                                } else if (v === '-') {
                                    delete props[k];
                                } else if (self.overrideFlag || !props[k]) {
                                    props[k] = v;
                                }
                            });
                        }
                        new Notice('Properties updated.');
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
