import { App, ItemView, SuggestModal, TFile } from 'obsidian';
import { AddToCanvasAction } from 'src/action/add-to-canvas-action';
import { Readable } from 'src/reader/readable';

/**
 * 选择Canvas弹窗,
 */
export class ChooseCanvasModal extends SuggestModal<string> {

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
			if (file instanceof TFile && file.path.toLowerCase().contains(lowerCaseInputStr) && file.path.toLowerCase().endsWith(".canvas")) {
				files.push(file.path);
			}
		});
		if (files.length == 0) {
			if (query.endsWith(".canvas")) {
				files.push(query);
			} else {
				files.push(query + ".canvas");
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
		let action = new AddToCanvasAction(this.app, file);
		this.readable.read(action);
	}
}