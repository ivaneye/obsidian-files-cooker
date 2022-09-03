import { App, Notice, TAbstractFile } from "obsidian";
import { CreateConfirmModal } from "src/modal/create-confirm-modal";
import { MoveInfo } from "../modal/move-info";
import { Action, ActionModel } from "./action";

export class CreateAction implements Action {

    app: App;
    targetPath: string;

    constructor(app: App, targetPath: string) {
        this.app = app;
        this.targetPath = targetPath;
    }

    act(actionModels: ActionModel[]) {

        const moveInfos: MoveInfo[] = [];

        if (actionModels.length > 0) {
            actionModels.forEach(model => {
                let ff = model.file;
                moveInfos.push({
                    sourceFile: ff,
                    targetDir: this.targetPath
                })
            })
            new CreateConfirmModal(this.app, moveInfos).open();
        } else {
            new Notice("No Files Found!");
        }
    }

}