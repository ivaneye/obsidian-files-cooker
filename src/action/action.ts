import { TAbstractFile } from "obsidian";


export interface Action {

    act(resultArr: TAbstractFile[]): void;
}