import FileCookerPlugin from "main";
import { App, Notice, TAbstractFile, TFile, TFolder, Vault } from "obsidian";
import { Action } from "src/action/action";
import { ReadInfo } from "./read-info";
import { Readable } from "./readable";

export enum ReadType {
    LINKS, UN_RESOLVED_LINKS, CONTENT, SELECTION
}

export class CurrentFileReader implements Readable {

    plugin: FileCookerPlugin;
    app: App;
    readType: ReadType = ReadType.LINKS;
    selection: string;

    constructor(plugin: FileCookerPlugin, readType?: ReadType, selection?: string) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.readType = readType;
        this.selection = selection;
    }

    read(action: Action): void {
        let readInfo = new ReadInfo(this.plugin.settings.limit);

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
                    readInfo.addFile(ff);
                })
            } else if (this.readType == ReadType.SELECTION) {
                // 同步内容
                readInfo.addContent(this.selection);
            } else {
                paths.forEach(path => {
                    let ff = this.app.vault.getAbstractFileByPath(path);
                    if (ff != null) {
                        readInfo.addFile(ff);
                    }
                })
            }
            action.act(readInfo.getModels());
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