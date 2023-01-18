import { App, Notice, TAbstractFile } from "obsidian";
import { Action } from "src/action/action";
import { Readable } from "./readable";
import { getAPI } from "obsidian-dataview";
import { ReadInfo } from "./read-info";
import FileCookerPlugin from "main";

export class DataviewReader implements Readable {

    plugin: FileCookerPlugin;
    app: App;
    queryStr: string;

    constructor(plugin: FileCookerPlugin, queryStr: string) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.queryStr = queryStr;
    }

    read(action: Action): void {
        let readInfo = new ReadInfo(this.plugin.settings.limit);

        let api = getAPI();

        let qStr = formatStr(this.queryStr);

        let idx = this.queryStr.indexOf(".pages(");
        if (idx > 0) {
            let tmpStr = this.queryStr.substring(idx + 8);
            let tmpIdx = tmpStr.indexOf(")");
            tmpStr = tmpStr.substring(0, tmpIdx - 1);
            let resArr = api.pages(tmpStr);
            try {
                resArr.values.forEach((it: { file: { path: string; }; }) => {
                    let ff = this.app.vault.getAbstractFileByPath(it.file.path);
                    if (ff != null) {
                        readInfo.addFile(ff);
                    }
                })
                action.act(readInfo.getModels());
            } catch (e) {
                new Notice(e.message);
            }
        } else {
            // DQL
            api.query(qStr).then(res => {
                if (res.successful) {
                    let filePaths: any = [];
                    if (res.value.type == "list") {
                        // LIST
                        res.value.values.forEach(it => {
                            filePaths.push(it.path);
                        });
                    } else if (res.value.type == "table") {
                        // TABLE
                        filePaths = res.value.values;
                        res.value.values.forEach(it => {
                            it.forEach(innerIt => {
                                if (innerIt && innerIt.path) {
                                    filePaths.push(innerIt.path);
                                    return;
                                }
                            })
                        });
                    } else {
                        // TASK
                        res.value.values.forEach(it => {
                            filePaths.push(it.link.path);
                        });
                    }
                    try {
                        filePaths.forEach((filePath: { toString: () => string; }) => {
                            let ff = this.app.vault.getAbstractFileByPath(filePath.toString());
                            if (ff != null) {
                                readInfo.addFile(ff);
                            }
                        })
                        action.act(readInfo.getModels());
                    } catch (e) {
                        new Notice(e.message);
                    }
                } else {
                    new Notice("Query string error![" + this.queryStr + "]");
                }
            })
        }
    }
}

/**
 * 大写命令
 */
function formatStr(queryStr: string): string {
    let str = queryStr.trimStart();

    let commandStr = str.substring(0, 4);

    if (commandStr.toUpperCase() == "LIST") {
        return "LIST" + str.substring(4, str.length);
    }

    if (commandStr.toUpperCase() == "TABL") {
        return "TABLE" + str.substring(5, str.length);
    }

    if (commandStr.toUpperCase() == "TASK") {
        return "TASK" + str.substring(4, str.length);
    }

    return queryStr;
}
