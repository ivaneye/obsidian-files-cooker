import FileCookerPlugin from "main";
import { App, Notice } from "obsidian";
import { t } from 'src/i18n/index';
import { Action, ActionModel } from "src/action/action";
import { Readable } from "./readable";


export class ClipboardContentReader implements Readable {

    plugin: FileCookerPlugin;
    app: App;

    constructor(plugin: FileCookerPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
    }

    read(action: Action): void {

        let promiseStr = navigator.clipboard.readText();

        promiseStr.then(str => {
            try {
                let actionModels = [];
                let model = new ActionModel(null, str);
                actionModels.push(model);
                action.act(actionModels);
            } catch (e) {
                new Notice(e.message);
            }
        }).catch(e => {
            new Notice(t('读取剪贴板内容失败：{msg}', { msg: String(e) }));
        });
    }

}