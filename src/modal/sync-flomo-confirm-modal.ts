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

        const listItems = this.actionModels.map((info) => (info.file ? info.file.path : 'Sync Selection'));
        renderModalLayout(contentEl, {
            title: 'Sync to flomo',
            description: 'Review items before syncing to flomo API.',
            summaryLines: [`${this.actionModels.length} items will be synced.`],
            listItems,
            listLabel: 'Affected files',
            emptyMessage: 'No files to sync.',
            variant: 'confirm',
        });

        if (this.actionModels.length === 0) {
            addModalActions(contentEl, [
                {
                    text: 'Close',
                    onClick: () => this.close(),
                },
            ]);
            return;
        }

        addModalActions(contentEl, [
            {
                text: 'Sync now',
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
                            new Notice(`Sync failed [${response.status}].`);
                            return;
                        }
                    }
                    new Notice('Sync completed.');
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
