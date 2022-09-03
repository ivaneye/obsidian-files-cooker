import { TAbstractFile } from "obsidian";


export interface Action {

    act(actionModels: ActionModel[]): void;
}

export class ActionModel {
    file: TAbstractFile;
    content: string;

    constructor(file?: TAbstractFile, content?: string) {
        this.file = file;
        this.content = content;
    }
}