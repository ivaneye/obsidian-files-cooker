import { App, Notice, SuggestModal, TAbstractFile, TFolder } from 'obsidian';
import { ClipboardMover } from 'src/move/clipboard-mover';
import { CurrentFileMover } from 'src/move/current-file-mover';
import { FROM_CLIPBOARD, FROM_CURRENT_FILE } from 'src/move/move-info';

/**
 * 选择目录弹窗
 */
export class MoveModal extends SuggestModal<TAbstractFile> {

	type: string;

	constructor(app: App, type: string) {
		super(app);
		this.type = type;
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
		if (this.type == FROM_CLIPBOARD) {
			new ClipboardMover(this.app).move(folder);
		} else if (this.type == FROM_CURRENT_FILE) {
			new CurrentFileMover(this.app).move(folder);
		}
	}
}