import { App, Notice, TAbstractFile } from "obsidian";
import { CopyToClipboardConfirmModal } from "src/modal/copy-to-clipboard-confirm-modal";
import { Action, ActionModel } from "./action";

export class CopyAction implements Action {

    app: App;

    constructor(app: App) {
        this.app = app;
    }

    act(actionModels: ActionModel[]) {

        if (actionModels.length > 0) {
            let files = actionModels.map(model => model.file);
            new CopyToClipboardConfirmModal(this.app, files).open();
        } else {
            new Notice("No Files Found!");
        }
    }

}