import { App, Notice, TAbstractFile } from "obsidian";
import { RenameModal } from "src/modal/rename-modal";
import { Action } from "./action";

export class RenameAction implements Action {

    app: App;

    constructor(app: App) {
        this.app = app;
    }

    act(resultArr: TAbstractFile[]) {
        if (resultArr.length > 0) {
            new RenameModal(this.app, resultArr).open();
        } else {
            new Notice("No Files Found!");
        }
    }
}