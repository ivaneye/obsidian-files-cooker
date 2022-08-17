import { App, Notice, TAbstractFile, TFile, TFolder, Vault } from "obsidian";
import { Action } from "src/action/action";
import { ReadInfo } from "./read-info";
import { Readable } from "./readable";


export enum ReadType {
    LINKS, UN_RESOLVED_LINKS, CONTENT
}


export class CurrentFileReader implements Readable {

    app: App;
    readType: ReadType = ReadType.LINKS;

    constructor(app: App, readType?: ReadType) {
        this.app = app;
        this.readType = readType;
    }

    read(action: Action): void {
        let readInfo = new ReadInfo();

        let currentFile = this.app.workspace.getActiveFile();

        if (currentFile == null) {
            new Notice("No active file!");
            return;
        }

        let currentFilePath = currentFile.path;

        let paths = [];
        if (this.readType == ReadType.CONTENT) {
            paths.push(currentFilePath);
        } else if (this.readType == ReadType.UN_RESOLVED_LINKS) {
            let linkObj = this.app.metadataCache.unresolvedLinks[currentFilePath];
            for (let key in linkObj) {
                paths.push(key);
            }
        } else {
            let linkObj = this.app.metadataCache.resolvedLinks[currentFilePath];
            for (let key in linkObj) {
                paths.push(key);
            }
        }

        try {
            if (this.readType == ReadType.UN_RESOLVED_LINKS) {
                // 未解析的链接，创建虚拟文件对象
                paths.forEach(path => {
                    let ff = new VirtualFile(path);
                    readInfo.add(ff);
                })
            } else {
                paths.forEach(path => {
                    let ff = this.app.vault.getAbstractFileByPath(path);
                    if (ff != null) {
                        readInfo.add(ff);
                    }
                })
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