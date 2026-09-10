import { App, Modal, Notice, TAbstractFile, TFile } from 'obsidian';
import { getBackup } from 'src/backup/backup-service';
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
            title: '编辑属性',
            description: '为选中的文件配置属性键/值和覆盖选项。',
            summaryLines: [`已选中 ${this.resultArr.length} 个文件。`],
            listItems: this.resultArr.map((info) => info.path),
            listLabel: '受影响的文件',
            emptyMessage: '没有可编辑的文件。',
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

            addLabeledTextField(contentEl, '属性键', '输入属性键', (val) => {
				this.key = val;
			});
            addLabeledTextField(contentEl, '属性值', '输入属性值', (val) => {
				this.val = val;
			});
            addLabeledToggleField(
				contentEl,
				'覆盖已有属性',
				'属性已存在时覆盖！',
				Boolean(this.overrideFlag),
				(val) => {
					localStorage.setItem('overrideFlag', val + '');
					this.overrideFlag = val;
				}
			);

            addModalActions(contentEl, [
                {
                    text: '应用属性',
                    cta: true,
                    onClick: async () => {
                        if (isBlank(this.key as string)) {
                            showValidationNotice('属性键不能为空。');
                            return;
                        }
                        if (isBlank(this.val as string)) {
                            showValidationNotice('属性值不能为空。');
                            return;
                        }
                        this.close();
                        // 属性编辑为内容写：操作前逐文件快照，成功提交、异常丢弃
                        const recorder = getBackup().begin('properties', '编辑属性');
                        try {
                        for (let i = 0; i < this.resultArr.length; i++) {
                            const info = this.resultArr[i] as TFile;
                            await recorder.snapshotContentBefore(info);
                            const self = this;
                            // todo : 支持添加、删除单个标签值，alias值
                            await this.app.fileManager.processFrontMatter(info, (props) => {
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
                        await recorder.finish();
                        new Notice('属性已更新。');
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
    }
}
