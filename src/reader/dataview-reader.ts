import { App, Notice, TAbstractFile } from "obsidian";
import { Action } from "src/action/action";
import { Readable } from "./readable";
import { getAPI } from "obsidian-dataview";

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

        if (api) {
            api.query(this.queryStr).then(res => {
                if (res.successful) {
                    let files = res.value.values;
                    files.forEach(it => {
                        let ff = this.app.vault.getAbstractFileByPath(it.path);
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