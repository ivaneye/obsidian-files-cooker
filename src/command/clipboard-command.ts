import FileCookerPlugin from 'main';
import { Action } from 'src/action/action';
import { DeleteAction } from 'src/action/delete-action';
import { EditFrontMatterAction } from 'src/action/edit-front-matter-action';
import { MoveAction } from 'src/action/move-action';
import { RenameAction } from 'src/action/rename-action';
import { SyncFlomoAction } from 'src/action/sync-flomo-action';
import { ChooseFileModal } from 'src/modal/choose-file-modal';
import { ChooseFolderModal } from 'src/modal/choose-folder-modal';
import { ClipboardReader } from 'src/reader/clipboard-reader';
import { Command } from './command';

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
    }

    private registRenameFile() {
        this.plugin.addCommand({
            id: 'rename-in-clipboard-files',
            name: 'Rename in clipboard files ...',
            callback: () => {
                new ClipboardReader(this.plugin.app).read(new RenameAction(this.plugin.app));
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
                    new ClipboardReader(this.plugin.app).read(new EditFrontMatterAction(this.plugin.app));
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
                new ClipboardReader(this.plugin.app).read(new DeleteAction(this.plugin.app));
            }
        });
    }

    private registMergeFile() {
        this.plugin.addCommand({
            id: 'merge-files-to',
            name: 'Merge files to ...',
            callback: () => {
                new ChooseFileModal(this.plugin.app, new ClipboardReader(this.plugin.app)).open();
            }
        });
    }

    private registSyncFlomo() {
        this.plugin.addCommand({
            id: 'sync-files-to-flomo',
            name: 'Sync files to flomo ...',
            callback: () => {
                new ClipboardReader(this.plugin.app).read(new SyncFlomoAction(this.plugin));
            }
        });
    }

    private registMoveFile() {
        this.plugin.addCommand({
            id: 'move-files-to',
            name: 'Move files to ...',
            callback: () => {
                let actionFunc = (path: string): Action => { return new MoveAction(this.plugin.app, path); };
                new ChooseFolderModal(this.plugin.app, new ClipboardReader(this.plugin.app), actionFunc).open();
            }
        });
    }
}