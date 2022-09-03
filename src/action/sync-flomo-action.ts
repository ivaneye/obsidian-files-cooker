import FileCookerPlugin from "main";
import { Notice } from "obsidian";
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
            new Notice("Please config flomoAPI first!");
            return;
        }
        if (actionModels.length > 0) {
            new SyncFlomoConfirmModal(this.plugin, actionModels).open();
        } else {
            new Notice("No Files Found!");
        }
    }
}