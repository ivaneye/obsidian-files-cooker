import { TAbstractFile } from "obsidian";
import { ActionModel } from "src/action/action";

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
            throw new Error("limit [" + this.limit + "] must be a number!");
        }
        this.actionModels = [];
    }

    addFile(file: TAbstractFile) {
        if (this.actionModels.length >= this.limit) {
            throw new Error("Load more than " + this.limit + " files!");
        }
        let model = new ActionModel(file);
        this.actionModels.push(model);
    }

    addContent(cont: string) {
        if (this.actionModels.length >= this.limit) {
            throw new Error("Load more than " + this.limit + " files!");
        }
        let model = new ActionModel(null, cont);
        this.actionModels.push(model);
    }

    getModels() {
        return this.actionModels;
    }
}