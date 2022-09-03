import { App, Notice, TAbstractFile } from "obsidian";
import { EditFrontMatterModal } from "src/modal/edit-front-matter-modal";
import { Action, ActionModel } from "./action";

export class EditFrontMatterAction implements Action {

    app: App;

    constructor(app: App) {
        this.app = app;
    }

    act(actionModels: ActionModel[]) {
        if (actionModels.length > 0) {
            let files = actionModels.map(model => model.file);
            new EditFrontMatterModal(this.app, files).open();
        } else {
            new Notice("No Files Found!");
        }
    }
}