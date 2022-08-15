import { App, SuggestModal, TAbstractFile, TFile, TFolder } from 'obsidian';
import { MergeAction } from 'src/action/merge-action';
import { Readable } from 'src/reader/readable';

/**
 * 选择文档弹窗
 */
export class ChooseFileModal extends SuggestModal<string> {

	type: string;
	readable: Readable;

	constructor(app: App, readable: Readable) {
		super(app);
		this.readable = readable;
	}

	// Returns all available suggestions.
	getSuggestions(query: string): string[] {
		const abstractFiles = this.app.vault.getAllLoadedFiles();
		const files: string[] = [];
		const lowerCaseInputStr = query.toLowerCase();
		abstractFiles.forEach((file) => {
			if (file instanceof TFile && file.path.toLowerCase().contains(lowerCaseInputStr)) {
				files.push(file.path);
			}
		});
		if (files.length == 0) {
			if (query.endsWith(".md")) {
				files.push(query);
			} else {
				files.push(query + ".md");
			}
		}
		return files;
	}

	// Renders each suggestion item.
	renderSuggestion(filePath: string, el: HTMLElement) {
		el.createEl("div", { text: filePath });
	}

	// Perform action on the selected suggestion.
	onChooseSuggestion(file: string, evt: MouseEvent | KeyboardEvent) {
		let action = new MergeAction(this.app, file);
		this.readable.read(action);
	}
}