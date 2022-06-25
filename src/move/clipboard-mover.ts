import { ConfirmModal } from "src/move/confirm-modal";
import { MoveInfo } from "src/move/move-info";
import { App, Notice, TAbstractFile } from "obsidian";
import { Reader } from "src/tools/reader";


export class ClipboardMover {

    app: App;
    reader: Reader;

    constructor(app: App) {
        this.app = app;
        this.reader = new Reader(app);
    }

    async move(folder: TAbstractFile) {
        let path = folder.path;
        let moveInfos: MoveInfo[] = [];

        let resultArr = await this.reader.fromClipboard();

        if (resultArr.length > 0) {
            resultArr.forEach(ff => {
                moveInfos.push({
                    sourceFile: ff,
                    targetDir: path
                })
            })
            new ConfirmModal(this.app, moveInfos).open();
        } else {
            new Notice("No Effective Files in Clipboard!");
        }
    }
}