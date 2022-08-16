import { App, Notice, TAbstractFile, TFile, TFolder, Vault } from "obsidian";
import { Action } from "src/action/action";
import { ReadInfo } from "./read-info";
import { Readable } from "./readable";


export class CurrentFileReader implements Readable {

    app: App;
    unResolvedFlag: boolean = false;

    constructor(app: App, unResolvedFlag?: boolean) {
        this.app = app;
        this.unResolvedFlag = unResolvedFlag;
    }

    read(action: Action): void {
        let readInfo = new ReadInfo();

        let currentFile = this.app.workspace.getActiveFile();

        if (currentFile == null) {
            new Notice("No active file!");
            return;
        }

        let currentFilePath = currentFile.path;

        let linkObj;
        if (!this.unResolvedFlag) {
            linkObj = this.app.metadataCache.resolvedLinks[currentFilePath];
        } else {
            linkObj = this.app.metadataCache.unresolvedLinks[currentFilePath];
        }

        try {
            if (!this.unResolvedFlag) {
                for (let key in linkObj) {
                    let ff = this.app.vault.getAbstractFileByPath(key);
                    if (ff != null) {
                        readInfo.add(ff);
                    }
                }
            } else {
                // 未解析的链接，创建虚拟文件对象
                for (let key in linkObj) {
                    let ff = new VirtualFile(key);
                    readInfo.add(ff);
                }
            }
            action.act(readInfo.getFiles());
        } catch (e) {
            new Notice(e.message);
        }
    }
}

/**
 * 如果没有实际文件，就创建一个虚文件
 * 结构和TAbstractFile一致，方便统一操作
 */
class VirtualFile {

    vault: Vault;
    path: string;
    name: string;
    parent: TFolder;

    constructor(path: string) {
        let idx = path.lastIndexOf("/");
        if (!path.endsWith(".md")) {
            path = path + ".md";
        }
        this.path = path;
        if (idx >= 0) {
            this.name = path.substring(idx, path.length);
        } else {
            this.name = path;
        }
    }
}