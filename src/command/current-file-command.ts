import FileCookerPlugin from 'main';
import { Editor, MarkdownView } from 'obsidian';
import { Action } from 'src/action/action';
import { CreateAction } from 'src/action/create-action';
import { DeleteAction } from 'src/action/delete-action';
import { EditPropertiesAction } from 'src/action/edit-properties-action';
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
        this.registRenameFile();
        // Canvas
        this.registAddFile2Canvas();
        this.registAddSelectionToCanvas();
    }

    private registRenameFile() {
        this.plugin.addCommand({
            id: "rename-in-current-file-links",
            name: "Rename in current file links ...",
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
            name: "Edit Properties in current file links ...",
            callback: () => {
                new CurrentFileReader(this.plugin).read(new EditPropertiesAction(this.plugin.app));
            }
        });
    }

    private registDeleteFile() {
        this.plugin.addCommand({
            id: "delete-links-in-current-file",
            name: "Delete link-files in current file!",
            callback: () => {
                new CurrentFileReader(this.plugin).read(new DeleteAction(this.plugin.app));
            }
        });
    }

    private registMergeFile() {
        this.plugin.addCommand({
            id: "merge-links-to",
            name: "Merge links in current file to ...",
            callback: () => {
                new ChooseFileModal(this.plugin.app, new CurrentFileReader(this.plugin)).open();
            }
        });
    }

    private registCreateFile() {
        this.plugin.addCommand({
            id: "create-links",
            name: "Create links in current file ...",
            callback: () => {
                let actionFunc = (path: string): Action => { return new CreateAction(this.plugin.app, path); };
                new ChooseFolderModal(this.plugin.app, new CurrentFileReader(this.plugin, ReadType.UN_RESOLVED_LINKS), actionFunc).open();
            }
        });
    }

    private registSyncFileToFlomo() {
        this.plugin.addCommand({
            id: "sync-links-to",
            name: "Sync links in current file to flomo ...",
            callback: () => {
                new CurrentFileReader(this.plugin).read(new SyncFlomoAction(this.plugin));
            }
        });
    }

    private registSyncContentToFlomo() {
        this.plugin.addCommand({
            id: "sync-content-to",
            name: "Sync content in current file to flomo ...",
            callback: () => {
                new CurrentFileReader(this.plugin, ReadType.CONTENT).read(new SyncFlomoAction(this.plugin));
            }
        });
    }

    private registSyncSelectionToFlomo() {
        this.plugin.addCommand({
            id: "sync-selection-to",
            name: "Sync selection in current file to flomo ...",
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
            name: "Add selection in current file to canvas ...",
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
            name: "Move links in current file to ...",
            callback: () => {
                let actionFunc = (path: string): Action => { return new MoveAction(this.plugin.app, path); };
                new ChooseFolderModal(this.plugin.app, new CurrentFileReader(this.plugin), actionFunc).open();
            }
        });
    }

    private registAddFile2Canvas() {
        this.plugin.addCommand({
            id: "add-links-to-canvas",
            name: "Add links in current file to target canvas ...",
            callback: () => {
                new ChooseCanvasModal(this.plugin.app, new CurrentFileReader(this.plugin)).open();
            }
        });
    }

}