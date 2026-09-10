import FileCookerPlugin from 'main';
import { Modal, Notice, Setting, TFile } from 'obsidian';
import fetch from 'node-fetch';
import { ActionModel } from 'src/action/action';
import { addModalActions, renderModalLayout } from './modal-ui';

/**
 *  弹窗确认要同步到flomo的文件
 */
export class SyncFlomoConfirmModal extends Modal {
    actionModels: ActionModel[];
    plugin: FileCookerPlugin;

    constructor(plugin: FileCookerPlugin, actionModels: ActionModel[]) {
        super(plugin.app);
        this.plugin = plugin;
        this.actionModels = actionModels;
    }

    async onOpen() {
        const { contentEl } = this;

        const listItems = this.actionModels.map((info) => (info.file ? info.file.path : '同步选区'));
        renderModalLayout(contentEl, {
            title: '同步到 flomo',
            description: '同步到 flomo 前请确认内容。',
            summaryLines: [`${this.actionModels.length} 条内容将被同步。`],
            listItems,
            listLabel: '受影响的文件',
            emptyMessage: '没有可同步的内容。',
            variant: 'confirm',
        });

        if (this.actionModels.length === 0) {
            addModalActions(contentEl, [
                {
                    text: '关闭',
                    onClick: () => this.close(),
                },
            ]);
            return;
        }

        addModalActions(contentEl, [
            {
                text: '立即同步',
                cta: true,
                onClick: async () => {
                    this.close();
                    for (let i = 0; i < this.actionModels.length; i++) {
                        const info = this.actionModels[i];
                        const cont = info.file ? await this.app.vault.read((info.file as TFile)) : info.content;
                        const response = await fetch(this.plugin.settings.flomoAPI, {
                            method: 'POST',
                            body: JSON.stringify({ content: cont }),
                            headers: {
                                'Content-Type': 'application/json',
                                Accept: 'application/json',
                            },
                        });

                        if (!response.ok) {
                            new Notice(`同步失败 [${response.status}]。`);
                            return;
                        }
                    }
                    new Notice('同步完成。');
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
