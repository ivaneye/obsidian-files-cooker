import FileCookerPlugin from 'main';
import { Action } from 'src/action/action';
import { CopyAction } from 'src/action/copy-action';
import { DeleteAction } from 'src/action/delete-action';
import { EditPropertiesAction } from 'src/action/edit-properties-action';
import { MoveAction } from 'src/action/move-action';
import { RenameAction } from 'src/action/rename-action';
import { SyncFlomoAction } from 'src/action/sync-flomo-action';
import { ChooseCanvasModal } from 'src/modal/choose-canvas-modal';
import { ChooseFileModal } from 'src/modal/choose-file-modal';
import { ChooseFolderModal } from 'src/modal/choose-folder-modal';
import { BasesReader } from 'src/reader/bases-reader';
import { Command } from './command';

export class BasesCommand implements Command {

    plugin: FileCookerPlugin;

    constructor(plugin: FileCookerPlugin) {
        this.plugin = plugin;
    }

    regist(): void {
        this.registMoveFile();
        this.registSyncFlomo();
        this.registMergeFile();
        this.registDeleteFile();
        this.registCopyLinks();
        this.registEditProp();
        this.registRenameFile();
        this.registAddFile2Canvas();
        this.registAddTask2Canvas();
    }

    private registRenameFile() {
        this.plugin.addCommand({
            id: 'rename-in-bases-results',
            name: 'Rename in bases results ...',
            callback: () => {
                new BasesReader(this.plugin).read(new RenameAction(this.plugin.app));
            }
        });
    }

    private registEditProp() {
        this.plugin.addCommand({
            id: 'edit-front-matter-in-bases-results',
            name: 'Edit Properties in bases results ...',
            callback: () => {
                new BasesReader(this.plugin).read(new EditPropertiesAction(this.plugin.app));
            }
        });
    }

    private registCopyLinks() {
        this.plugin.addCommand({
            id: 'copy-bases-result-links',
            name: 'Copy bases result links!',
            callback: () => {
                new BasesReader(this.plugin).read(new CopyAction(this.plugin.app));
            }
        });
    }

    private registDeleteFile() {
        this.plugin.addCommand({
            id: 'delete-bases-results',
            name: 'Delete bases query results!',
            callback: () => {
                new BasesReader(this.plugin).read(new DeleteAction(this.plugin.app));
            }
        });
    }

    private registMergeFile() {
        this.plugin.addCommand({
            id: 'merge-bases-results-to',
            name: 'Merge bases query results to ...',
            callback: () => {
                new ChooseFileModal(this.plugin.app, new BasesReader(this.plugin)).open();
            }
        });
    }

    private registSyncFlomo() {
        this.plugin.addCommand({
            id: 'sync-bases-results-to',
            name: 'Sync bases query results to flomo ...',
            callback: () => {
                new BasesReader(this.plugin).read(new SyncFlomoAction(this.plugin));
            }
        });
    }

    private registMoveFile() {
        this.plugin.addCommand({
            id: 'move-bases-results-to',
            name: 'Move bases query results to ...',
            callback: () => {
                let actionFunc = (path: string): Action => { return new MoveAction(this.plugin.app, path); };
                new ChooseFolderModal(this.plugin.app, new BasesReader(this.plugin), actionFunc).open();
            }
        });
    }

    private registAddFile2Canvas() {
        this.plugin.addCommand({
            id: 'add-bases-results-to-canvas',
            name: 'Add bases query results to canvas...',
            callback: () => {
                new ChooseCanvasModal(this.plugin.app, new BasesReader(this.plugin)).open();
            }
        });
    }

    private registAddTask2Canvas() {
        this.plugin.addCommand({
            id: 'add-bases-task-to-canvas',
            name: 'Add bases task to canvas...',
            callback: () => {
                new ChooseCanvasModal(this.plugin.app, new BasesReader(this.plugin, true)).open();
            }
        });
    }
}
