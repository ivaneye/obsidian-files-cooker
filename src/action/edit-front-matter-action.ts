import { App, Notice, TAbstractFile } from "obsidian";
import { EditFrontMatterModal } from "src/modal/edit-front-matter-modal";
import { Action } from "./action";

export class EditFrontMatterAction implements Action {

    app: App;

    constructor(app: App) {
        this.app = app;
    }

    act(resultArr: TAbstractFile[]) {
        if (resultArr.length > 0) {
            new EditFrontMatterModal(this.app, resultArr).open();
        } else {
            new Notice("No Files Found!");
        }
    }
}