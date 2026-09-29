import { App, Notice, TFolder } from "obsidian";
import { Action, ActionModel } from "src/action/action";
import { Readable } from "./readable";
import { ReadInfo } from "./read-info";
import FileCookerPlugin from "main";

/**
 * 文件夹读取器：递归收集文件夹下全部 Markdown 文件（issue #15）。
 * 根目录（path = '/'）时收集全库笔记。
 */
export class FolderReader implements Readable {

    plugin: FileCookerPlugin;
    app: App;
    folder: TFolder;

    constructor(plugin: FileCookerPlugin, folder: TFolder) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.folder = folder;
    }

    read(action: Action): void {
        try {
            let readInfo = new ReadInfo(this.plugin.settings.limit);

            const prefix = this.folder.path === "/" ? "" : this.folder.path + "/";
            const files = this.app.vault.getMarkdownFiles()
                .filter((file) => prefix === "" || file.path.startsWith(prefix));
            files.forEach((file) => {
                readInfo.addFile(file);
            });

            const models: ActionModel[] = readInfo.getModels();
            action.act(models);
        } catch (e) {
            new Notice(e.message);
        }
    }
}
