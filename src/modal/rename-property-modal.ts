import { App, Modal, Notice, TAbstractFile, TFile } from 'obsidian';
import { t } from 'src/i18n/index';
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
 * 批量重命名属性键（issue #15）：把旧键的值移动到新键，旧键删除，值保持不变。
 * 属性重命名为内容写：操作前逐文件快照，成功提交、异常丢弃。
 */
export class RenamePropertyModal extends Modal {
	resultArr: TAbstractFile[];
	oldKey: String;
	newKey: String;
	overrideFlag: boolean;

	constructor(app: App, resultArr: TAbstractFile[]) {
		super(app);
		this.resultArr = resultArr;
		let tmpFlag = localStorage.getItem('overrideFlag');
		if (tmpFlag && 'true' == tmpFlag) {
			this.overrideFlag = true;
		}
	}

	onOpen() {
		const { contentEl } = this;

		renderModalLayout(contentEl, {
			title: t('重命名属性'),
			description: t('将选中文件中的属性键重命名，属性值保持不变。'),
			summaryLines: [t('已选中 {n} 个文件。', { n: this.resultArr.length })],
			listItems: this.resultArr.map((info) => info.path),
			listLabel: t('受影响的文件'),
			emptyMessage: t('没有可编辑的文件。'),
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
			addLabeledTextField(contentEl, t('旧属性键'), t('输入旧属性键'), (val) => {
				this.oldKey = val;
			});
			addLabeledTextField(contentEl, t('新属性键'), t('输入新属性键'), (val) => {
				this.newKey = val;
			});
			addLabeledToggleField(
				contentEl,
				t('覆盖已有属性'),
				t('新属性已存在时覆盖！'),
				Boolean(this.overrideFlag),
				(val) => {
					localStorage.setItem('overrideFlag', val + '');
					this.overrideFlag = val;
				}
			);

			addModalActions(contentEl, [
				{
					text: t('重命名'),
					cta: true,
					onClick: async () => {
						const oldKey = (this.oldKey as string ?? '').trim();
						const newKey = (this.newKey as string ?? '').trim();
						if (isBlank(oldKey)) {
							showValidationNotice(t('旧属性键不能为空。'));
							return;
						}
						if (isBlank(newKey)) {
							showValidationNotice(t('新属性键不能为空。'));
							return;
						}
						if (oldKey === newKey) {
							showValidationNotice(t('新旧属性键不能相同。'));
							return;
						}
						this.close();
						// 属性重命名为内容写：操作前逐文件快照，成功提交、异常丢弃
						const recorder = getBackup().begin('properties', t('重命名属性'));
						try {
							for (let i = 0; i < this.resultArr.length; i++) {
								const info = this.resultArr[i] as TFile;
								await recorder.snapshotContentBefore(info);
								await this.app.fileManager.processFrontMatter(info, (props) => {
									if (props[oldKey] === undefined) {
										// 该文件没有旧键，无需处理
										return;
									}
									if (props[newKey] !== undefined && !this.overrideFlag) {
										// 新键已存在且未开启覆盖，跳过避免丢值
										return;
									}
									props[newKey] = props[oldKey];
									delete props[oldKey];
								});
							}
							await recorder.finish();
							new Notice(t('属性已重命名。'));
						} catch (e) {
							recorder.abort();
							new Notice(t('操作失败：{msg}', { msg: (e as Error).message }));
						}
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
