import { TAbstractFile } from 'obsidian';

export interface MoveInfo {
    sourceFile: TAbstractFile;
    targetDir: string;
}

export const FROM_CLIPBOARD = "FROM_CLIPBOARD";
export const FROM_CURRENT_FILE = "FROM_CURRENT_FILE";