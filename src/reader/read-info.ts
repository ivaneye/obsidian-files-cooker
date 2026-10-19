import { TAbstractFile } from "obsidian";
import { ActionModel } from "src/action/action";
import { t } from 'src/i18n/index';

/**
 * 读取的信息
 */
export class ReadInfo {

    limit: number;
    actionModels: ActionModel[];

    constructor(limit: string) {
        try {
            this.limit = limit as unknown as number;
        } catch (e) {
            throw new Error(t('limit [{limit}] 必须是数字！', { limit: this.limit }));
        }
        this.actionModels = [];
    }

    addFile(file: TAbstractFile) {
        if (this.actionModels.length >= this.limit) {
            throw new Error(t('加载的文件超过上限 {limit} 个！', { limit: this.limit }));
        }
        let model = new ActionModel(file);
        this.actionModels.push(model);
    }

    addContent(cont: string) {
        if (this.actionModels.length >= this.limit) {
            throw new Error(t('加载的文件超过上限 {limit} 个！', { limit: this.limit }));
        }
        let model = new ActionModel(null, cont);
        this.actionModels.push(model);
    }

    getModels() {
        return this.actionModels;
    }
}