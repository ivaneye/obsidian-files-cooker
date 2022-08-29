import FileCookerPlugin from 'main';
import { Editor, MarkdownView } from 'obsidian';
import { DataviewApi, getAPI } from 'obsidian-dataview';
import { Action } from 'src/action/action';
import { CopyAction } from 'src/action/copy-action';
import { DeleteAction } from 'src/action/delete-action';
import { EditFrontMatterAction } from 'src/action/edit-front-matter-action';
import { MoveAction } from 'src/action/move-action';
import { RenameAction } from 'src/action/rename-action';
import { SyncFlomoAction } from 'src/action/sync-flomo-action';
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

        // Rename Files
        this.registRenameFile(dataviewApi);
    }

    private registRenameFile(dataviewApi: DataviewApi) {
        this.plugin.addCommand({
            id: "rename-in-dataview-results",
            name: "Rename in dataview results ...",
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    new DataviewReader(this.plugin.app, editor.getSelection()).read(new RenameAction(this.plugin.app));
                }
                return dataviewApi != null;
            }
        });
    }

    /**
     * Edit Front Matter 
     * https://github.com/lijyze/obsidian-state-switcher/blob/d0a80081b0fcc1b899eed2e3d7e834c2d5703875/src/util.ts#L42
     * @param dataviewApi        
     */
    private registEditProp(dataviewApi: DataviewApi) {
        let metaedit = this.plugin.app.plugins.plugins["metaedit"];

        this.plugin.addCommand({
            id: "edit-front-matter-in-dataview-results",
            name: "Edit Front Matter in dataview results ...",
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    new DataviewReader(this.plugin.app, editor.getSelection()).read(new EditFrontMatterAction(this.plugin.app));
                }
                return dataviewApi != null && metaedit != null;
            }
        });
    }

    private registCopyLinks(dataviewApi: DataviewApi) {
        this.plugin.addCommand({
            id: 'copy-dataview-result-links',
            name: 'Copy dataview result links!',
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    new DataviewReader(this.plugin.app, editor.getSelection()).read(new CopyAction(this.plugin.app));
                }
                return dataviewApi != null;
            }
        });
    }

    private registDeleteFile(dataviewApi: DataviewApi) {
        this.plugin.addCommand({
            id: 'delete-dataview-results',
            name: 'Delete dataview query results!',
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    new DataviewReader(this.plugin.app, editor.getSelection()).read(new DeleteAction(this.plugin.app));
                }
                return dataviewApi != null;
            }
        });
    }

    private registMergeFile(dataviewApi: DataviewApi) {
        this.plugin.addCommand({
            id: 'merge-dataview-results-to',
            name: 'Merge dataview query results to ...',
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    new ChooseFileModal(this.plugin.app, new DataviewReader(this.plugin.app, editor.getSelection())).open();
                }
                return dataviewApi != null;
            }
        });
    }

    private registSyncFlomo(dataviewApi: DataviewApi) {
        this.plugin.addCommand({
            id: 'sync-dataview-results-to',
            name: 'Sync dataview query results to flomo ...',
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    new DataviewReader(this.plugin.app, editor.getSelection()).read(new SyncFlomoAction(this.plugin));
                }
                return dataviewApi != null;
            }
        });
    }

    private registMoveFile(dataviewApi: DataviewApi) {
        this.plugin.addCommand({
            id: 'move-dataview-results-to',
            name: 'Move dataview query results to ...',
            editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                if (!checking) {
                    let actionFunc = (path: string): Action => { return new MoveAction(this.plugin.app, path); };
                    new ChooseFolderModal(this.plugin.app, new DataviewReader(this.plugin.app, editor.getSelection()), actionFunc).open();
                }
                return dataviewApi != null;
            }
        });
    }
}