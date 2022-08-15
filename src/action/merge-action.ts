import { App, Notice, TAbstractFile } from "obsidian";
import { MergeConfirmModal } from "src/modal/merge-confirm-modal";
import { Action } from "./action";

export class MergeAction implements Action {

    app: App;
    targetFilePath: string;

    constructor(app: App, targetFilePath: string) {
        this.app = app;
        this.targetFilePath = targetFilePath;
    }

    async act(resultArr: TAbstractFile[]) {

        if (resultArr.length > 0) {
            new MergeConfirmModal(this.app, resultArr, this.targetFilePath).open();
        } else {
            new Notice("No Files Found!");
        }
    }

}