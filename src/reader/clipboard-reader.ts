import FileCookerPlugin from "main";
import { App, Notice, TAbstractFile } from "obsidian";
import { Action } from "src/action/action";
import { ReadInfo } from "./read-info";
import { Readable } from "./readable";


export class ClipboardReader implements Readable {

    plugin: FileCookerPlugin;
    app: App;

    constructor(plugin: FileCookerPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
    }

    read(action: Action): void {
        let readInfo = new ReadInfo(this.plugin.settings.limit);

        let promiseStr = navigator.clipboard.readText();

        promiseStr.then(str => {
            let lines = str.split(/\r?\n/);
            try {
                lines.forEach(line => {
                    let f = line;
                    if (f.startsWith("[[")) {
                        f = f.substring(2, f.length);
                    }
                    if (f.endsWith("]]")) {
                        f = f.substring(0, f.length - 2);
                    }
                    if (!f.endsWith(".md")
                        && !f.endsWith(".MD")
                        && !f.endsWith(".Md")
                        && !f.endsWith(".mD")
                        && !f.endsWith(".canvas")) {
                        f = f + ".md";
                    }
                    let ff = this.app.vault.getAbstractFileByPath(f);
                    if (ff != null) {
                        readInfo.addFile(ff);
                    } else {
                        console.log("can not find file :" + f);
                    }
                });
                action.act(readInfo.getModels());
            } catch (e) {
                new Notice(e.message);
            }
        }).catch(e => {
            new Notice("Clipboard Content Error!" + e);
        });
    }

}