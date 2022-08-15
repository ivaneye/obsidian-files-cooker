import { App, SuggestModal, TAbstractFile, TFolder } from 'obsidian';
import { MoveAction } from 'src/action/move-action';
import { Readable } from 'src/reader/readable';

/**
 * 选择目录弹窗
 */
export class ChooseFolderModal extends SuggestModal<TAbstractFile> {

	type: string;
	readable: Readable;

	constructor(app: App, readable: Readable) {
		super(app);
		this.readable = readable;
	}

	// Returns all available suggestions.
	getSuggestions(query: string): TAbstractFile[] {
		const abstractFiles = this.app.vault.getAllLoadedFiles();
		const folders: TAbstractFile[] = [];
		const lowerCaseInputStr = query.toLowerCase();
		abstractFiles.forEach((folder) => {
			if (folder instanceof TFolder && folder.path.toLowerCase().contains(lowerCaseInputStr)) {
				folders.push(folder);
			}
		});
		return folders;
	}

	// Renders each suggestion item.
	renderSuggestion(folder: TAbstractFile, el: HTMLElement) {
		el.createEl("div", { text: folder.path });
		// el.createEl("small", { text: folder.path });
	}

	// Perform action on the selected suggestion.
	onChooseSuggestion(folder: TAbstractFile, evt: MouseEvent | KeyboardEvent) {
		let action = new MoveAction(this.app, folder.path);
		this.readable.read(action);
	}
}