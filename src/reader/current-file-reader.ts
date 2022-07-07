import { App, Notice, TAbstractFile } from "obsidian";
import { Action } from "src/action/action";
import { Readable } from "./readable";


export class CurrentFileReader implements Readable {

    app: App;

    constructor(app: App) {
        this.app = app;
    }

    read(action: Action): void {
        let resultArr: TAbstractFile[] = [];

        let currentFile = this.app.workspace.getActiveFile();

        if (currentFile == null) {
            new Notice("No active file!");
            return;
        }

        let currentFilePath = currentFile.path;

        let linkObj = this.app.metadataCache.resolvedLinks[currentFilePath];

        for (let key in linkObj) {
            let ff = this.app.vault.getAbstractFileByPath(key);
            if (ff != null) {
                resultArr.push(ff);
            }
        }

        action.act(resultArr);
    }

}