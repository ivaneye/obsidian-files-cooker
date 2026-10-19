import FileCookerPlugin from 'main';
import { Editor, MarkdownView } from 'obsidian';
import { t } from 'src/i18n/index';
import { DataviewApi, getAPI } from 'obsidian-dataview';
import { Action } from 'src/action/action';
import { CopyAction } from 'src/action/copy-action';
import { DeleteAction } from 'src/action/delete-action';
import { EditPropertiesAction } from 'src/action/edit-properties-action';
import { AiPropertiesAction } from 'src/action/ai-properties-action';
import { MoveAction } from 'src/action/move-action';
import { RenameAction } from 'src/action/rename-action';
import { SyncFlomoAction } from 'src/action/sync-flomo-action';
import { ChooseCanvasModal } from 'src/modal/choose-canvas-modal';
import { ChooseFileModal } from 'src/modal/choose-file-modal';
import { ChooseFolderModal } from 'src/modal/choose-folder-modal';
import { DataviewReader } from 'src/reader/dataview-reader';
import { Command } from './command';

export class DataviewCommand implements Command {

    plugin: FileCookerPlugin;

    constructor(plugin: FileCookerPlugin) {
        this.plugin = plugin;
    }

    regist(): void {
        let dataviewApi = getAPI();

        this.registMoveFile(dataviewApi);
        this.registSyncFlomo(dataviewApi);
        this.registMergeFile(dataviewApi);
        this.registDeleteFile(dataviewApi);
        this.registCopyLinks(dataviewApi);
        this.registEditProp(dataviewApi);
        this.registAiCompleteProps(dataviewApi);

        // Rename Files
        this.registRenameFile(dataviewApi);
        // Canvas
        this.registAddFile2Canvas(dataviewApi);
        this.registAddTask2Canvas(dataviewApi);
    }

    private registRenameFile(dataviewApi: DataviewApi) {
        this.plugin.addCommand({
            id: "rename-in-dataview-results",
            name: t('重命名 Dataview 查询结果中的文件 ...'),
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    new DataviewReader(this.plugin, editor.getSelection()).read(new RenameAction(this.plugin.app));
                }
                return dataviewApi != null;
            }
        });
    }

    /**
     * Edit Properties 
     * https://github.com/lijyze/obsidian-state-switcher/blob/d0a80081b0fcc1b899eed2e3d7e834c2d5703875/src/util.ts#L42
     * @param dataviewApi        
     */
    private registEditProp(dataviewApi: DataviewApi) {
        this.plugin.addCommand({
            id: "edit-front-matter-in-dataview-results",
            name: t('编辑 Dataview 查询结果中的属性 ...'),
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    new DataviewReader(this.plugin, editor.getSelection()).read(new EditPropertiesAction(this.plugin.app));
                }
                return dataviewApi != null;
            }
        });
    }

    /**
     * AI 属性补全：推断提案 → 人工审核 → 应用
     */
    private registAiCompleteProps(dataviewApi: DataviewApi) {
        this.plugin.addCommand({
            id: "ai-complete-properties-in-dataview-results",
            name: t('AI 补全 Dataview 查询结果中的属性 ...'),
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    new DataviewReader(this.plugin, editor.getSelection()).read(new AiPropertiesAction(this.plugin));
                }
                return dataviewApi != null;
            }
        });
    }

    private registCopyLinks(dataviewApi: DataviewApi) {
        this.plugin.addCommand({
            id: 'copy-dataview-result-links',
            name: t('复制 Dataview 查询结果链接!'),
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    new DataviewReader(this.plugin, editor.getSelection()).read(new CopyAction(this.plugin.app));
                }
                return dataviewApi != null;
            }
        });
    }

    private registDeleteFile(dataviewApi: DataviewApi) {
        this.plugin.addCommand({
            id: 'delete-dataview-results',
            name: t('删除 Dataview 查询结果中的文件!'),
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    new DataviewReader(this.plugin, editor.getSelection()).read(new DeleteAction(this.plugin.app));
                }
                return dataviewApi != null;
            }
        });
    }

    private registMergeFile(dataviewApi: DataviewApi) {
        this.plugin.addCommand({
            id: 'merge-dataview-results-to',
            name: t('合并 Dataview 查询结果到 ...'),
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    new ChooseFileModal(this.plugin.app, new DataviewReader(this.plugin, editor.getSelection())).open();
                }
                return dataviewApi != null;
            }
        });
    }

    private registSyncFlomo(dataviewApi: DataviewApi) {
        this.plugin.addCommand({
            id: 'sync-dataview-results-to',
            name: t('同步 Dataview 查询结果到 flomo ...'),
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    new DataviewReader(this.plugin, editor.getSelection()).read(new SyncFlomoAction(this.plugin));
                }
                return dataviewApi != null;
            }
        });
    }

    private registMoveFile(dataviewApi: DataviewApi) {
        this.plugin.addCommand({
            id: 'move-dataview-results-to',
            name: t('移动 Dataview 查询结果到 ...'),
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    let actionFunc = (path: string): Action => { return new MoveAction(this.plugin.app, path); };
                    new ChooseFolderModal(this.plugin.app, new DataviewReader(this.plugin, editor.getSelection()), actionFunc).open();
                }
                return dataviewApi != null;
            }
        });
    }

    private registAddFile2Canvas(dataviewApi: DataviewApi) {
        this.plugin.addCommand({
            id: 'add-dataview-results-to-canvas',
            name: t('将 Dataview 查询结果添加到画布 ...'),
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    new ChooseCanvasModal(this.plugin.app, new DataviewReader(this.plugin, editor.getSelection())).open();
                }
                return dataviewApi != null;
            }
        });
    }

    private registAddTask2Canvas(dataviewApi: DataviewApi) {
        this.plugin.addCommand({
            id: 'add-dataview-task-to-canvas',
            name: t('将 Dataview 任务添加到画布 ...'),
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    new ChooseCanvasModal(this.plugin.app, new DataviewReader(this.plugin, editor.getSelection(), true)).open();
                }
                return dataviewApi != null;
            }
        });
    }
}