import { App, Notice, TAbstractFile } from "obsidian";
import { t } from 'src/i18n/index';
import { DeleteConfirmModal } from "src/modal/delete-confirm-modal";
import { Action, ActionModel } from "./action";

export class DeleteAction implements Action {

    app: App;

    constructor(app: App) {
        this.app = app;
    }

    act(actionModels: ActionModel[]) {
        if (actionModels.length > 0) {
            let files = actionModels.map(model => model.file);
            new DeleteConfirmModal(this.app, files).open();
        } else {
            new Notice(t('未找到文件。'));
        }
    }

}