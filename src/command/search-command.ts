import FileCookerPlugin from 'main';
import { Action } from 'src/action/action';
import { AddToCanvasAction } from 'src/action/add-to-canvas-action';
import { DeleteAction } from 'src/action/delete-action';
import { EditPropertiesAction } from 'src/action/edit-properties-action';
import { MoveAction } from 'src/action/move-action';
import { RenameAction } from 'src/action/rename-action';
import { SyncFlomoAction } from 'src/action/sync-flomo-action';
import { ChooseCanvasModal } from 'src/modal/choose-canvas-modal';
import { ChooseFileModal } from 'src/modal/choose-file-modal';
import { ChooseFolderModal } from 'src/modal/choose-folder-modal';
import { SearchResultsReader } from 'src/reader/search-results-reader';
import { Command } from './command';

export class SearchCommand implements Command {

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
        this.registRenameFile();
        // Canvas
        this.registAddFile2Canvas();
    }

    private registRenameFile() {
        this.plugin.addCommand({
            id: 'rename-files-in-searchresults',
            name: 'Rename files in searchresults ...',
            callback: () => {
                new SearchResultsReader(this.plugin).read(new RenameAction(this.plugin.app));
            }
        });
    }

    /**
     * Edit Properties 
     * https://github.com/lijyze/obsidian-state-switcher/blob/d0a80081b0fcc1b899eed2e3d7e834c2d5703875/src/util.ts#L42
     */
    private registEditProp() {
        this.plugin.addCommand({
            id: 'edit-front-matter-in-searchresults-files',
            name: 'Edit Properties in searchresults files ...',
            callback: () => {
                new SearchResultsReader(this.plugin).read(new EditPropertiesAction(this.plugin.app));
            }
        });
    }

    private registDeleteFile() {
        this.plugin.addCommand({
            id: 'delete-files-in-searchresults',
            name: 'Delete files in searchresults!',
            callback: () => {
                new SearchResultsReader(this.plugin).read(new DeleteAction(this.plugin.app));
            }
        });
    }

    private registMergeFile() {
        this.plugin.addCommand({
            id: 'merge-files-in-searchresults-to',
            name: 'Merge files in searchresults to ...',
            callback: () => {
                new ChooseFileModal(this.plugin.app, new SearchResultsReader(this.plugin)).open();
            }
        });
    }

    private registSyncFlomo() {
        this.plugin.addCommand({
            id: 'sync-files-in-searchresults-to-flomo',
            name: 'Sync files in searchresults to flomo ...',
            callback: () => {
                new SearchResultsReader(this.plugin).read(new SyncFlomoAction(this.plugin));
            }
        });
    }

    private registMoveFile() {
        this.plugin.addCommand({
            id: 'move-files-in-searchresults-to',
            name: 'Move files in searchresults to ...',
            callback: () => {
                let actionFunc = (path: string): Action => { return new MoveAction(this.plugin.app, path); };
                new ChooseFolderModal(this.plugin.app, new SearchResultsReader(this.plugin), actionFunc).open();
            }
        });
    }

    private registAddFile2Canvas() {
        this.plugin.addCommand({
            id: "add-files-in-searchresults-to-canvas",
            name: "Add files in searchresults to target canvas ...",
            callback: () => {
                new ChooseCanvasModal(this.plugin.app, new SearchResultsReader(this.plugin)).open();
            }
        });
    }
}