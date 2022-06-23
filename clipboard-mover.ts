import { ConfirmModal } from "confirm-modal";
import { MoveInfo } from "move-info";
import { App, Notice, TAbstractFile } from "obsidian";


export class ClipboardMover {

    app: App;

    constructor(app: App) {
        this.app = app;
    }

    move(folder: TAbstractFile) {
        let path = folder.path;
	
        let clip = navigator.clipboard.readText();

        clip.then(str => {
            let sp = str.split("\n");
            const moveInfos: MoveInfo[] = [];
            sp.forEach(f => {
                let ff = this.app.vault.getAbstractFileByPath(f);
                if(ff != null) {
                    moveInfos.push({
                        sourceFile: ff,
                        targetDir: path
                    })
                }
            })
            if(moveInfos.length > 0) {
                new ConfirmModal(this.app, moveInfos).open();
            } else {
                new Notice("No Effective Files in Clipboard!");
            }
        }).catch(e => {
            new Notice("Clipboard Content Error!" + e);
        })
    }
}