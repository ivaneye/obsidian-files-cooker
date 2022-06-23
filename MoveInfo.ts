import { TAbstractFile } from 'obsidian';

export default interface MoveInfo {
	sourceFile: TAbstractFile;
	targetDir: string;
}