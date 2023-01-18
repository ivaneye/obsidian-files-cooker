import { App, Notice, TAbstractFile } from "obsidian";
import { AddToCanvasConfirmModal } from "src/modal/add-to-canvas-confirm-modal";
import { Action, ActionModel } from "./action";

export class AddToCanvasAction implements Action {

    app: App;
    targetFilePath: string;

    constructor(app: App, targetFilePath: string) {
        this.app = app;
        this.targetFilePath = targetFilePath;
    }

    async act(actionModels: ActionModel[]) {

        if (actionModels.length > 0) {
            let files = actionModels.map(model => model.file);
            new AddToCanvasConfirmModal(this.app, files, this.targetFilePath).open();
        } else {
            new Notice("No Files Found!");
        }
    }

}