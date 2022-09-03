import { App, Notice, TAbstractFile } from "obsidian";
import { Action, ActionModel } from "./action";

export class CopyAction implements Action {

    app: App;

    constructor(app: App) {
        this.app = app;
    }

    act(actionModels: ActionModel[]) {

        if (actionModels.length > 0) {
            let str = "";
            actionModels.forEach(model => {
                let ff = model.file;
                let name = ff.name;
                if (name.endsWith(".md")) {
                    name = name.substring(0, name.lastIndexOf("."));
                }
                str += "[[" + ff.path + "|" + name + "]]\n";
            })
            navigator.clipboard.writeText(str);
            new Notice("Copy links success!")
        } else {
            new Notice("No Files Found!");
        }
    }

}