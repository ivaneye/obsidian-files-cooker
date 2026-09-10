import { App, Modal, Notice, TFile } from 'obsidian';
import { getBackup } from 'src/backup/backup-service';
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
            title: '移动或复制文件',
            description: '请确认源文件并选择移动或复制模式。',
            summaryLines: [
                `${this.moveInfos.length} 个文件将被处理。`,
                `目标：${targetDir}`,
            ],
            listItems,
            listLabel: '受影响的文件',
            emptyMessage: '没有可处理的文件。',
            variant: 'confirm',
        });

		addLabeledToggleField(contentEl, '复制而不是移动', '复制文件到目标位置（保留原文件）', this.copyFlag, (val) => {
			this.copyFlag = val;
		});

		addModalActions(contentEl, [
			{
				text: '应用操作',
				cta: true,
				onClick: async () => {
                    this.close();
                    // 移动=路径变更（回滚走反向 renameFile）；复制=新建（回滚 trash 掉新建文件）
                    const recorder = getBackup().begin(
                        this.copyFlag ? 'create' : 'move',
                        this.copyFlag ? '复制文件' : '移动文件'
                    );
                    try {
                    if (this.copyFlag) {
                        for (const info of this.moveInfos) {
                            const newPath = `${info.targetDir}/${info.sourceFile.name}`;
                            await recorder.snapshotCreated(newPath, '');
                            await this.app.vault.copy((info.sourceFile as TFile), newPath);
                        }
                        new Notice('文件复制完成。');
                    } else {
                        for (const info of this.moveInfos) {
                            const newPath = `${info.targetDir}/${info.sourceFile.name}`;
                            await recorder.snapshotPath(info.sourceFile as TFile, newPath);
                            await this.app.fileManager.renameFile(info.sourceFile, newPath);
                        }
                        new Notice('文件移动完成。');
                    }
                    await recorder.finish();
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
