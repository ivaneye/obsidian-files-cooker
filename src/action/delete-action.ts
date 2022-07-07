import { App, Notice, TAbstractFile } from "obsidian";
import { DeleteConfirmModal } from "src/modal/delete-confirm-modal";
import { Action } from "./action";

export class DeleteAction implements Action {

    app: App;

    constructor(app: App) {
        this.app = app;
    }

    act(resultArr: TAbstractFile[]) {
        if (resultArr.length > 0) {
            new DeleteConfirmModal(this.app, resultArr).open();
        } else {
            new Notice("No Files Found!");
        }
    }

}