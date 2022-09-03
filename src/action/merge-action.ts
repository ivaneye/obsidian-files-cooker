import { App, Notice, TAbstractFile } from "obsidian";
import { MergeConfirmModal } from "src/modal/merge-confirm-modal";
import { Action, ActionModel } from "./action";

export class MergeAction implements Action {

    app: App;
    targetFilePath: string;

    constructor(app: App, targetFilePath: string) {
        this.app = app;
        this.targetFilePath = targetFilePath;
    }

    async act(actionModels: ActionModel[]) {

        if (actionModels.length > 0) {
            let files = actionModels.map(model => model.file);
            new MergeConfirmModal(this.app, files, this.targetFilePath).open();
        } else {
            new Notice("No Files Found!");
        }
    }

}