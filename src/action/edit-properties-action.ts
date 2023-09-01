import { App, Notice, TAbstractFile } from "obsidian";
import { EditPropertiesModal } from "src/modal/edit-properties-modal";
import { Action, ActionModel } from "./action";

export class EditPropertiesAction implements Action {

    app: App;

    constructor(app: App) {
        this.app = app;
    }

    act(actionModels: ActionModel[]) {
        if (actionModels.length > 0) {
            let files = actionModels.map(model => model.file);
            new EditPropertiesModal(this.app, files).open();
        } else {
            new Notice("No Files Found!");
        }
    }
}