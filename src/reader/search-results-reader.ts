import FileCookerPlugin from "main";
import { App, Notice, TAbstractFile } from "obsidian";
import { Action } from "src/action/action";
import hasMarkdownSuffix, { hasCanvasSuffix } from "src/utils/file-type-util";
import { ReadInfo } from "./read-info";
import { Readable } from "./readable";


export class SearchResultsReader implements Readable {

    plugin: FileCookerPlugin;
    app: App;

    constructor(plugin: FileCookerPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
    }

    read(action: Action): void {
        let readInfo = new ReadInfo(this.plugin.settings.limit);

        let results = this.app.workspace.getLeavesOfType('search')[0].view.dom.resultDomLookup;

        if (results.size == 0) {
            new Notice("Has no search results!Please search first!");
        } else {
            let arr = [...results.keys()];
            arr.forEach(k => {
                let ff = this.app.vault.getAbstractFileByPath(k.path);
                if (ff != null) {
                    readInfo.addFile(ff);
                } else {
                    console.log("can not find file :" + k.path);
                }
            });
            action.act(readInfo.getModels());
        }
    }

}