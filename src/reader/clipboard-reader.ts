import { App, Notice, TAbstractFile } from "obsidian";
import { Action } from "src/action/action";
import { ReadInfo } from "./read-info";
import { Readable } from "./readable";


export class ClipboardReader implements Readable {

    app: App;

    constructor(app: App) {
        this.app = app;
    }

    read(action: Action): void {
        let readInfo = new ReadInfo();

        let promiseStr = navigator.clipboard.readText();

        promiseStr.then(str => {
            let sp = str.split("\n");
            try {
                sp.forEach(f => {
                    let ff = this.app.vault.getAbstractFileByPath(f);
                    if (ff != null) {
                        readInfo.add(ff);
                    }
                });
                action.act(readInfo.getFiles());
            } catch (e) {
                new Notice(e.message);
            }
        }).catch(e => {
            new Notice("Clipboard Content Error!" + e);
        });
    }

}