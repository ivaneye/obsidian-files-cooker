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

        let qStr = this.queryStr.toUpperCase();

        if (api) {
            api.query(qStr).then(res => {
                console.log(res);
                if (res.successful) {
                    let filePaths = [];
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
                    filePaths.forEach(filePath => {
                        let ff = this.app.vault.getAbstractFileByPath(filePath.toString());
                        if (ff != null) {
                            resultArr.push(ff);
                        }
                    })
                    action.act(resultArr);
                } else {
                    new Notice("Query error![" + this.queryStr + "]");
                }
            })
        } else {
            new Notice("Please install Dataview plugin first!");
        }
    }
}