import { App, Notice, TAbstractFile } from "obsidian";
import { Action } from "src/action/action";
import { Readable } from "./readable";
import { getAPI, Link } from "obsidian-dataview";

export class DataviewReader implements Readable {

    app: App;
    queryStr: string;

    constructor(app: App, queryStr: string) {
        this.app = app;
        this.queryStr = queryStr;
    }

    read(action: Action): void {
        let resultArr: TAbstractFile[] = [];

        let api = getAPI();

        let qStr = formatStr(this.queryStr);

        if (api) {
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
                    filePaths.forEach((filePath: { toString: () => string; }) => {
                        let ff = this.app.vault.getAbstractFileByPath(filePath.toString());
                        if (ff != null) {
                            resultArr.push(ff);
                        }
                    })
                    action.act(resultArr);
                } else {
                    new Notice("Query string error![" + this.queryStr + "]");
                }
            })
        } else {
            new Notice("Please install Dataview plugin first!");
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
