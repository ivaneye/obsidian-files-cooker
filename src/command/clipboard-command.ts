import FileCookerPlugin from 'main';
import { Action } from 'src/action/action';
import { AddToCanvasAction } from 'src/action/add-to-canvas-action';
import { DeleteAction } from 'src/action/delete-action';
import { EditFrontMatterAction } from 'src/action/edit-front-matter-action';
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
        this.registRenameFile();
        // Canvas
        this.registAddFile2Canvas();
        this.registAddContToCanvas();
    }

    private registRenameFile() {
        this.plugin.addCommand({
            id: 'rename-files-in-clipboard',
            name: 'Rename files in clipboard ...',
            callback: () => {
                new ClipboardReader(this.plugin).read(new RenameAction(this.plugin.app));
            }
        });
    }

    /**
     * Edit Front Matter 
     * https://github.com/lijyze/obsidian-state-switcher/blob/d0a80081b0fcc1b899eed2e3d7e834c2d5703875/src/util.ts#L42
     */
    private registEditProp() {
        let metaedit = this.plugin.app.plugins.plugins["metaedit"];

        this.plugin.addCommand({
            id: 'edit-front-matter-in-clipboard-files',
            name: 'Edit Front Matter in clipboard files ...',
            checkCallback: (checking: boolean) => {
                if (!checking) {
                    new ClipboardReader(this.plugin).read(new EditFrontMatterAction(this.plugin.app));
                }
                return metaedit != null;
            }
        });
    }

    private registDeleteFile() {
        this.plugin.addCommand({
            id: 'delete-files-in-clipboard',
            name: 'Delete files in clipboard!',
            callback: () => {
                new ClipboardReader(this.plugin).read(new DeleteAction(this.plugin.app));
            }
        });
    }

    private registMergeFile() {
        this.plugin.addCommand({
            id: 'merge-files-in-clipboard-to',
            name: 'Merge files in clipboard to ...',
            callback: () => {
                new ChooseFileModal(this.plugin.app, new ClipboardReader(this.plugin)).open();
            }
        });
    }

    private registSyncFlomo() {
        this.plugin.addCommand({
            id: 'sync-files-in-clipboard-to-flomo',
            name: 'Sync files in clipboard to flomo ...',
            callback: () => {
                new ClipboardReader(this.plugin).read(new SyncFlomoAction(this.plugin));
            }
        });
    }

    private registMoveFile() {
        this.plugin.addCommand({
            id: 'move-files-in-clipboard-to',
            name: 'Move files in clipboard to ...',
            callback: () => {
                let actionFunc = (path: string): Action => { return new MoveAction(this.plugin.app, path); };
                new ChooseFolderModal(this.plugin.app, new ClipboardReader(this.plugin), actionFunc).open();
            }
        });
    }

    private registAddContToCanvas() {
        this.plugin.addCommand({
            id: "Add-content-to",
            name: "Add content in clipboard to canvas ...",
            callback: () => {
                let actionFunc = (path: string): Action => { return new AddToCanvasAction(this.plugin.app, path); };
                new ChooseCanvasModal(this.plugin.app, new ClipboardContentReader(this.plugin, actionFunc)).open();
            }
        });
    }

    private registAddFile2Canvas() {
        this.plugin.addCommand({
            id: "add-files-in-clipboard-to-canvas",
            name: "Add files in clipboard to target canvas ...",
            callback: () => {
                let actionFunc = (path: string): Action => { return new AddToCanvasAction(this.plugin.app, path); };
                new ChooseCanvasModal(this.plugin.app, new ClipboardReader(this.plugin, actionFunc)).open();
            }
        });
    }
}