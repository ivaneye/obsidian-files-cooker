import { App, Notice, TAbstractFile } from "obsidian";
import { Action } from "src/action/action";
import { Readable } from "./readable";


export class ClipboardReader implements Readable {

    app: App;

    constructor(app: App) {
        this.app = app;
    }

    read(action: Action): void {
        let resultArr: TAbstractFile[] = [];

        let promiseStr = navigator.clipboard.readText();

        promiseStr.then(str => {
            let sp = str.split("\n");
            sp.forEach(f => {
                let ff = this.app.vault.getAbstractFileByPath(f);
                if (ff != null) {
                    resultArr.push(ff);
                }
            });
            action.act(resultArr);
        }).catch(e => {
            new Notice("Clipboard Content Error!" + e);
        });
    }

}