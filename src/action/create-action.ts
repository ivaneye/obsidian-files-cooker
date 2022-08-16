import { App, Notice, TAbstractFile } from "obsidian";
import { CreateConfirmModal } from "src/modal/create-confirm-modal";
import { MoveInfo } from "../modal/move-info";
import { Action } from "./action";

export class CreateAction implements Action {

    app: App;
    targetPath: string;

    constructor(app: App, targetPath: string) {
        this.app = app;
        this.targetPath = targetPath;
    }

    act(resultArr: TAbstractFile[]) {

        const moveInfos: MoveInfo[] = [];

        if (resultArr.length > 0) {
            resultArr.forEach(ff => {
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