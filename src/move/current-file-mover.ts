import { ConfirmModal } from "src/move/confirm-modal";
import { MoveInfo } from "src/move/move-info";
import { App, Notice, TAbstractFile } from "obsidian";
import { Reader } from "src/tools/reader";

/**
 * 移动当前文件中的链接文件到指定目录
 */
export class CurrentFileMover {

    app: App;
    reader: Reader;

    constructor(app: App) {
        this.app = app;
        this.reader = new Reader(app);
    }

    move(folder: TAbstractFile) {
        let path = folder.path;

        const moveInfos: MoveInfo[] = [];

        let resultArr = this.reader.fromCurrentFile();

        if (resultArr.length > 0) {
            resultArr.forEach(ff => {
                moveInfos.push({
                    sourceFile: ff,
                    targetDir: path
                })
            })
            new ConfirmModal(this.app, moveInfos).open();
        } else {
            new Notice("No Effective Links in CurrentFile!");
        }
    }
}