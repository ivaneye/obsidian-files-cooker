import { ConfirmModal } from "confirm-modal";
import { MoveInfo } from "move-info";
import { App, Notice, TAbstractFile } from "obsidian";

/**
 * 移动当前文件中的链接文件到指定目录
 */
export class CurrentFileMover {

    app: App;

    constructor(app: App) {
        this.app = app;
    }

    move(folder: TAbstractFile) {
        let path = folder.path;

        const moveInfos: MoveInfo[] = [];

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
                moveInfos.push({
                    sourceFile: ff,
                    targetDir: path
                })
            }
        }

        if (moveInfos.length > 0) {
            new ConfirmModal(this.app, moveInfos).open();
        } else {
            new Notice("No Effective Links in CurrentFile!");
        }
    }
}