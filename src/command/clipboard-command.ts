import FileCookerPlugin from 'main';
import { t } from 'src/i18n/index';
import { Action } from 'src/action/action';
import { AddToCanvasAction } from 'src/action/add-to-canvas-action';
import { DeleteAction } from 'src/action/delete-action';
import { EditPropertiesAction } from 'src/action/edit-properties-action';
import { AiPropertiesAction } from 'src/action/ai-properties-action';
import { MoveAction } from 'src/action/move-action';
import { RenameAction } from 'src/action/rename-action';
import { SyncFlomoAction } from 'src/action/sync-flomo-action';
import { ChooseCanvasModal } from 'src/modal/choose-canvas-modal';
import { ChooseFileModal } from 'src/modal/choose-file-modal';
import { ChooseFolderModal } from 'src/modal/choose-folder-modal';
import { ClipboardReader } from 'src/reader/clipboard-reader';
import { Command } from './command';
import { ClipboardContentReader } from 'src/reader/clipboard-content-reader';

export class ClipboardCommand implements Command {

    plugin: FileCookerPlugin;

    constructor(plugin: FileCookerPlugin) {
        this.plugin = plugin;
    }

    regist(): void {
        this.registMoveFile();
        this.registSyncFlomo();
        this.registMergeFile();
        this.registDeleteFile();
        this.registEditProp();
        this.registAiCompleteProps();
        this.registRenameFile();
        // Canvas
        this.registAddFile2Canvas();
        this.registAddContToCanvas();
    }

    private registRenameFile() {
        this.plugin.addCommand({
            id: 'rename-files-in-clipboard',
            name: t('重命名剪贴板中的文件 ...'),
            callback: () => {
                new ClipboardReader(this.plugin).read(new RenameAction(this.plugin.app));
            }
        });
    }

    /**
     * Edit Properties 
     * https://github.com/lijyze/obsidian-state-switcher/blob/d0a80081b0fcc1b899eed2e3d7e834c2d5703875/src/util.ts#L42
     */
    private registEditProp() {
        this.plugin.addCommand({
            id: 'edit-front-matter-in-clipboard-files',
            name: t('编辑剪贴板文件的属性 ...'),
            callback: () => {
                new ClipboardReader(this.plugin).read(new EditPropertiesAction(this.plugin.app));
            }
        });
    }

    /**
     * AI 属性补全：推断提案 → 人工审核 → 应用
     */
    private registAiCompleteProps() {
        this.plugin.addCommand({
            id: 'ai-complete-properties-in-clipboard',
            name: t('AI 补全剪贴板文件的属性 ...'),
            callback: () => {
                new ClipboardReader(this.plugin).read(new AiPropertiesAction(this.plugin));
            }
        });
    }

    private registDeleteFile() {
        this.plugin.addCommand({
            id: 'delete-files-in-clipboard',
            name: t('删除剪贴板中的文件!'),
            callback: () => {
                new ClipboardReader(this.plugin).read(new DeleteAction(this.plugin.app));
            }
        });
    }

    private registMergeFile() {
        this.plugin.addCommand({
            id: 'merge-files-in-clipboard-to',
            name: t('合并剪贴板中的文件到 ...'),
            callback: () => {
                new ChooseFileModal(this.plugin.app, new ClipboardReader(this.plugin)).open();
            }
        });
    }

    private registSyncFlomo() {
        this.plugin.addCommand({
            id: 'sync-files-in-clipboard-to-flomo',
            name: t('同步剪贴板中的文件到 flomo ...'),
            callback: () => {
                new ClipboardReader(this.plugin).read(new SyncFlomoAction(this.plugin));
            }
        });
    }

    private registMoveFile() {
        this.plugin.addCommand({
            id: 'move-files-in-clipboard-to',
            name: t('移动剪贴板中的文件到 ...'),
            callback: () => {
                let actionFunc = (path: string): Action => { return new MoveAction(this.plugin.app, path); };
                new ChooseFolderModal(this.plugin.app, new ClipboardReader(this.plugin), actionFunc).open();
            }
        });
    }

    private registAddContToCanvas() {
        this.plugin.addCommand({
            id: "Add-content-to",
            name: t('将剪贴板中的内容添加到画布 ...'),
            callback: () => {
                new ChooseCanvasModal(this.plugin.app, new ClipboardContentReader(this.plugin)).open();
            }
        });
    }

    private registAddFile2Canvas() {
        this.plugin.addCommand({
            id: "add-files-in-clipboard-to-canvas",
            name: t('将剪贴板中的文件添加到目标画布 ...'),
            callback: () => {
                new ChooseCanvasModal(this.plugin.app, new ClipboardReader(this.plugin,)).open();
            }
        });
    }
}