import FileCookerPlugin from "main";
import { Notice, TAbstractFile } from "obsidian";
import { SyncFlomoConfirmModal } from "src/modal/sync-flomo-confirm-modal";
import { Action } from "./action";

export class SyncFlomoAction implements Action {

    plugin: FileCookerPlugin;

    constructor(plugin: FileCookerPlugin) {
        this.plugin = plugin;
    }

    act(resultArr: TAbstractFile[]) {
        let flomoAPI = this.plugin.settings.flomoAPI;
        if (!flomoAPI || flomoAPI.trim() == "") {
            new Notice("Please config flomoAPI first!");
            return;
        }
        if (resultArr.length > 0) {
            new SyncFlomoConfirmModal(this.plugin, resultArr).open();
        } else {
            new Notice("No Files Found!");
        }
    }
}