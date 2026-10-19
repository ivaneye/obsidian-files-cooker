import FileCookerPlugin from "main";
import { Notice } from "obsidian";
import { t } from 'src/i18n/index';
import { SyncFlomoConfirmModal } from "src/modal/sync-flomo-confirm-modal";
import { Action, ActionModel } from "./action";

export class SyncFlomoAction implements Action {

    plugin: FileCookerPlugin;

    constructor(plugin: FileCookerPlugin) {
        this.plugin = plugin;
    }

    act(actionModels: ActionModel[]) {
        let flomoAPI = this.plugin.settings.flomoAPI;
        if (!flomoAPI || flomoAPI.trim() == "") {
            new Notice(t('请先配置 flomo API。'));
            return;
        }
        if (actionModels.length > 0) {
            new SyncFlomoConfirmModal(this.plugin, actionModels).open();
        } else {
            new Notice(t('未找到文件。'));
        }
    }
}