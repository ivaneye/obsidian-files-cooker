import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import { t } from 'src/i18n/index';
import { getBackup } from 'src/backup/backup-service';
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
            title: t('创建文件'),
            description: t('以下文件将被创建到目标文件夹。'),
            summaryLines: [t('{n} 个文件将被创建。', { n: this.moveInfos.length }), t('目标：{dir}', { dir: targetDir })],
            listItems: this.moveInfos.map((info) => `${info.targetDir}/${info.sourceFile.name}`),
            listLabel: t('受影响的文件'),
            emptyMessage: t('没有可创建的文件。'),
            variant: 'confirm',
        });

        addModalActions(contentEl, [
            {
                text: t('创建文件'),
                cta: true,
                onClick: async () => {
                    this.close();
                    // 创建=新建：操作前记录路径，回滚 trash 掉新建文件
                    const recorder = getBackup().begin('create', t('创建文件'));
                    try {
                    for (const info of this.moveInfos) {
                        const path = `${info.targetDir}/${info.sourceFile.name}`;
                        await recorder.snapshotCreated(path, '');
                        await this.app.vault.create(path, '');
                    }
                    await recorder.finish();
                    new Notice(t('文件创建完成。'));
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
