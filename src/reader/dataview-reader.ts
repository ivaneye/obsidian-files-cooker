import { App, Notice } from "obsidian";
import { Action, ActionModel } from "src/action/action";
import { Readable } from "./readable";
import { getAPI } from "obsidian-dataview";
import { ReadInfo } from "./read-info";
import FileCookerPlugin from "main";
import { getLinebreak } from "src/utils/line-break-util";

export class DataviewReader implements Readable {

    plugin: FileCookerPlugin;
    app: App;
    queryStr: string;

    // 是否读取task内容
    taskFlag: boolean;

    constructor(plugin: FileCookerPlugin, queryStr: string, taskFlag?: boolean) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.queryStr = queryStr;
        this.taskFlag = taskFlag;
    }

    read(action: Action): void {
        let readInfo = new ReadInfo(this.plugin.settings.limit);

        let api = getAPI();

        let qStr = formatStr(this.queryStr);

        let idx = this.queryStr.indexOf(".pages(");
        if (idx > 0) {
            // DataviewJS
            let tmpStr = this.queryStr.substring(idx + 7);
            let tmpIdx = tmpStr.indexOf(")");
            tmpStr = tmpStr.substring(0, tmpIdx);
            if (tmpStr.indexOf("'") >= 0 || tmpStr.indexOf("\"") >= 0) {
                // pages()方法中的参数是字符串，直接处理    
                tmpStr = tmpStr.substring(1, tmpStr.length - 1);
            } else {
                // pages()方法中的参数是变量，根据变量查找字符串  
                let nTmpStr = this.queryStr.substring(0, idx);
                idx = nTmpStr.indexOf(tmpStr);
                tmpStr = nTmpStr.substring(idx + tmpStr.length);
                idx = tmpStr.indexOf("'");
                tmpStr = tmpStr.substring(idx + 1);
                idx = tmpStr.indexOf("'");
                tmpStr = tmpStr.substring(0, idx);
            }

            try {
                let resArr = api.pages(tmpStr);
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
                        if (this.taskFlag) {
                            let strArr: string[] = [];
                            res.value.values.forEach(it => {
                                strArr.push("- [ ] [[" + it.link.path + "|" + it.text + "]]");
                            });

                            let actionModels = [];
                            let model = new ActionModel(null, strArr.join(getLinebreak()));
                            actionModels.push(model);
                            action.act(actionModels);
                        } else {
                            filePaths.forEach((filePath: { toString: () => string; }) => {
                                let ff = this.app.vault.getAbstractFileByPath(filePath.toString());
                                if (ff != null) {
                                    readInfo.addFile(ff);
                                }
                            })
                            action.act(readInfo.getModels());
                        }
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
