import { App, Notice, TAbstractFile } from "obsidian";
import { RenameModal } from "src/modal/rename-modal";
import { Action, ActionModel } from "./action";

export class RenameAction implements Action {

    app: App;

    constructor(app: App) {
        this.app = app;
    }

    act(actionModels: ActionModel[]) {
        if (actionModels.length > 0) {
            let files = actionModels.map(model => model.file);
            new RenameModal(this.app, files).open();
        } else {
            new Notice("No Files Found!");
        }
    }
}