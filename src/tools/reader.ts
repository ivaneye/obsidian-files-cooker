
import { App, Notice, TAbstractFile } from 'obsidian';

export class Reader {
    app: App;

    constructor(app: App) {
        this.app = app;
    }

    async fromClipboard(): Promise<TAbstractFile[]> {
        let resultArr: TAbstractFile[] = [];
        try {
            let str = await navigator.clipboard.readText();

            let sp = str.split("\n");
            sp.forEach(f => {
                let ff = this.app.vault.getAbstractFileByPath(f);
                if (ff != null) {
                    resultArr.push(ff);
                }
            });

        } catch (e) {
            new Notice("Clipboard Content Error!" + e);
        }
        return resultArr;
    }

    fromCurrentFile(): TAbstractFile[] {
        let resultArr: TAbstractFile[] = [];

        let currentFile = this.app.workspace.getActiveFile();

        if (currentFile == null) {
            new Notice("No active file!");
            return resultArr;
        }

        let currentFilePath = currentFile.path;

        let linkObj = this.app.metadataCache.resolvedLinks[currentFilePath];

        for (let key in linkObj) {
            let ff = this.app.vault.getAbstractFileByPath(key);
            if (ff != null) {
                resultArr.push(ff);
            }
        }

        return resultArr;
    }
}