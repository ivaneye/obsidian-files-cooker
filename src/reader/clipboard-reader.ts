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
            let lines = str.split("\n");
            try {
                lines.forEach(line => {
                    let f = line;
                    if (f.startsWith("[[")) {
                        f = f.substring(2, f.length);
                    }
                    if (f.endsWith("]]")) {
                        f = f.substring(0, f.length - 2);
                    }
                    if (!f.endsWith(".md") && !f.endsWith(".MD") && !f.endsWith(".Md") && !f.endsWith(".mD")) {
                        f = f + ".md";
                    }
                    console.log("f = " + f);
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