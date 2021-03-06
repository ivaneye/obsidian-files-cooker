import { App, Notice, TAbstractFile } from "obsidian";
import { Action } from "src/action/action";
import { Readable } from "./readable";
import { getAPI } from "obsidian-dataview";
import { ReadInfo } from "./read-info";

export class DataviewReader implements Readable {

    app: App;
    queryStr: string;

    constructor(app: App, queryStr: string) {
        this.app = app;
        this.queryStr = queryStr;
    }

    read(action: Action): void {
        let readInfo = new ReadInfo();

        let api = getAPI();

        let qStr = formatStr(this.queryStr);

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
                            readInfo.add(ff);
                        }
                    })
                    action.act(readInfo.getFiles());
                } catch (e) {
                    new Notice(e.message);
                }
            } else {
                new Notice("Query string error![" + this.queryStr + "]");
            }
        })
    }
}

/**
 * ????????????
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
