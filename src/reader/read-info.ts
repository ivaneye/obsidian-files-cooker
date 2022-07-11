import { TAbstractFile } from "obsidian";
import * as internal from "stream";


/**
 * 读取的信息
 */
export class ReadInfo {

    limit: number;
    resultArr: TAbstractFile[];

    constructor(limit: number = 300) {
        this.limit = limit;
        this.resultArr = [];
    }

    add(file: TAbstractFile) {
        if (this.resultArr.length >= this.limit) {
            throw new Error("Load more than " + this.limit + " files!");
        }
        this.resultArr.push(file);
    }

    getFiles() {
        return this.resultArr;
    }
}