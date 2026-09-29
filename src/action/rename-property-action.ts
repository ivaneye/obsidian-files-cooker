import { App, Notice, TAbstractFile } from "obsidian";
import { RenamePropertyModal } from "src/modal/rename-property-modal";
import { Action, ActionModel } from "./action";

export class RenamePropertyAction implements Action {

    app: App;

    constructor(app: App) {
        this.app = app;
    }

    act(actionModels: ActionModel[]) {
        if (actionModels.length > 0) {
            let files = actionModels.map(model => model.file);
            new RenamePropertyModal(this.app, files).open();
        } else {
            new Notice("No Files Found!");
        }
    }
}
