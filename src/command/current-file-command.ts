import FileCookerPlugin from 'main';
import { Editor, MarkdownView } from 'obsidian';
import { t } from 'src/i18n/index';
import { Action } from 'src/action/action';
import { CreateAction } from 'src/action/create-action';
import { DeleteAction } from 'src/action/delete-action';
import { EditPropertiesAction } from 'src/action/edit-properties-action';
import { AiPropertiesAction } from 'src/action/ai-properties-action';
import { MoveAction } from 'src/action/move-action';
import { RenameAction } from 'src/action/rename-action';
import { SyncFlomoAction } from 'src/action/sync-flomo-action';
import { ChooseCanvasModal } from 'src/modal/choose-canvas-modal';
import { ChooseFileModal } from 'src/modal/choose-file-modal';
import { ChooseFolderModal } from 'src/modal/choose-folder-modal';
import { CurrentFileReader, ReadType } from 'src/reader/current-file-reader';
import { Command } from './command';
import { AddToCanvasAction } from 'src/action/add-to-canvas-action';

export class CurrentFileCommand implements Command {

    plugin: FileCookerPlugin;

    constructor(plugin: FileCookerPlugin) {
        this.plugin = plugin;
    }

    regist(): void {
        this.registMoveFile();
        this.registSyncContentToFlomo();
        this.registSyncSelectionToFlomo();
        this.registSyncFileToFlomo();
        this.registCreateFile();
        this.registMergeFile();
        this.registDeleteFile();
        this.registEditProp();
        this.registAiCompleteProps();
        this.registRenameFile();
        // Canvas
        this.registAddFile2Canvas();
        this.registAddSelectionToCanvas();
    }

    private registRenameFile() {
        this.plugin.addCommand({
            id: "rename-in-current-file-links",
            name: t('重命名当前文件链接中的文件 ...'),
            callback: () => {
                new CurrentFileReader(this.plugin).read(new RenameAction(this.plugin.app));
            }
        });
    }

    /**
     * Edit Properties
     * https://github.com/lijyze/obsidian-state-switcher/blob/d0a80081b0fcc1b899eed2e3d7e834c2d5703875/src/util.ts#L42
     */
    private registEditProp() {
        this.plugin.addCommand({
            id: "edit-front-matter-in-current-file-links",
            name: t('编辑当前文件链接中的属性 ...'),
            callback: () => {
                new CurrentFileReader(this.plugin).read(new EditPropertiesAction(this.plugin.app));
            }
        });
    }

    /**
     * AI 属性补全：推断提案 → 人工审核 → 应用
     */
    private registAiCompleteProps() {
        this.plugin.addCommand({
            id: "ai-complete-properties-in-current-file-links",
            name: t('AI 补全当前文件链接中的属性 ...'),
            callback: () => {
                new CurrentFileReader(this.plugin).read(new AiPropertiesAction(this.plugin));
            }
        });
    }

    private registDeleteFile() {
        this.plugin.addCommand({
            id: "delete-links-in-current-file",
            name: t('删除当前文件中的链接文件!'),
            callback: () => {
                new CurrentFileReader(this.plugin).read(new DeleteAction(this.plugin.app));
            }
        });
    }

    private registMergeFile() {
        this.plugin.addCommand({
            id: "merge-links-to",
            name: t('合并当前文件中的链接到 ...'),
            callback: () => {
                new ChooseFileModal(this.plugin.app, new CurrentFileReader(this.plugin)).open();
            }
        });
    }

    private registCreateFile() {
        this.plugin.addCommand({
            id: "create-links",
            name: t('创建当前文件中的链接 ...'),
            callback: () => {
                let actionFunc = (path: string): Action => { return new CreateAction(this.plugin.app, path); };
                new ChooseFolderModal(this.plugin.app, new CurrentFileReader(this.plugin, ReadType.UN_RESOLVED_LINKS), actionFunc).open();
            }
        });
    }

    private registSyncFileToFlomo() {
        this.plugin.addCommand({
            id: "sync-links-to",
            name: t('同步当前文件中的链接到 flomo ...'),
            callback: () => {
                new CurrentFileReader(this.plugin).read(new SyncFlomoAction(this.plugin));
            }
        });
    }

    private registSyncContentToFlomo() {
        this.plugin.addCommand({
            id: "sync-content-to",
            name: t('同步当前文件中的内容到 flomo ...'),
            callback: () => {
                new CurrentFileReader(this.plugin, ReadType.CONTENT).read(new SyncFlomoAction(this.plugin));
            }
        });
    }

    private registSyncSelectionToFlomo() {
        this.plugin.addCommand({
            id: "sync-selection-to",
            name: t('同步当前文件中的选区到 flomo ...'),
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    new CurrentFileReader(this.plugin, ReadType.SELECTION, editor.getSelection()).read(new SyncFlomoAction(this.plugin));
                }
                return editor.getSelection() != "";
            }
        });
    }

    private registAddSelectionToCanvas() {
        this.plugin.addCommand({
            id: "Add-selection-to",
            name: t('将当前文件中的选区添加到画布 ...'),
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    new ChooseCanvasModal(this.plugin.app, new CurrentFileReader(this.plugin, ReadType.SELECTION, editor.getSelection())).open();
                }
                return editor.getSelection() != "";
            }
        });
    }

    private registMoveFile() {
        this.plugin.addCommand({
            id: "move-links-to",
            name: t('移动当前文件中的链接到 ...'),
            callback: () => {
                let actionFunc = (path: string): Action => { return new MoveAction(this.plugin.app, path); };
                new ChooseFolderModal(this.plugin.app, new CurrentFileReader(this.plugin), actionFunc).open();
            }
        });
    }

    private registAddFile2Canvas() {
        this.plugin.addCommand({
            id: "add-links-to-canvas",
            name: t('将当前文件中的链接添加到目标画布 ...'),
            callback: () => {
                new ChooseCanvasModal(this.plugin.app, new CurrentFileReader(this.plugin)).open();
            }
        });
    }

}