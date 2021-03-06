import { Plugin, Editor, MarkdownView } from 'obsidian';
import { MoveModal } from 'src/modal/move-modal';
import { ClipboardReader } from 'src/reader/clipboard-reader';
import { DeleteAction } from 'src/action/delete-action';
import { CurrentFileReader } from 'src/reader/current-file-reader';
import { DataviewReader } from 'src/reader/dataview-reader';
import { CopyAction } from 'src/action/copy-action';
import { getAPI } from "obsidian-dataview";


export default class FileCookerPlugin extends Plugin {

	async onload() {
		// const ribbonIconEl = this.addRibbonIcon('clipboard-list', 'Move files to ...', (evt: MouseEvent) => {
		// 	new MoveModal(this.app, FROM_CLIPBOARD).open();
		// });
		// ribbonIconEl.addClass('my-plugin-ribbon-class');

		let dataviewApi = getAPI();

		// Move Files
		this.addCommand({
			id: 'move-files-to',
			name: 'Move files to ...',
			callback: () => {
				new MoveModal(this.app, new ClipboardReader(this.app)).open();
			}
		});

		this.addCommand({
			id: "move-links-to",
			name: "Move links in current file to ...",
			callback: () => {
				new MoveModal(this.app, new CurrentFileReader(this.app)).open();
			}
		});

		this.addCommand({
			id: 'move-dataview-results-to',
			name: 'Move dataview query results to ...',
			editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
				console.log("checking = " + checking);
				if (!checking) {
					new MoveModal(this.app, new DataviewReader(this.app, editor.getSelection())).open();
				}
				return dataviewApi != null;
			}
		});

		// Delete Files
		this.addCommand({
			id: 'delete-files-in-clipboard',
			name: 'Delete files in clipboard!',
			callback: () => {
				new ClipboardReader(this.app).read(new DeleteAction(this.app));
			}
		});

		this.addCommand({
			id: "delete-links-in-current-file",
			name: "Delete link-files in current file!",
			callback: () => {
				new CurrentFileReader(this.app).read(new DeleteAction(this.app));
			}
		});

		this.addCommand({
			id: 'delete-dataview-results',
			name: 'Delete dataview query results!',
			editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
				if (!checking) {
					new DataviewReader(this.app, editor.getSelection()).read(new DeleteAction(this.app));
				}
				return dataviewApi != null;
			}
		});

		// copy file links
		this.addCommand({
			id: 'copy-dataview-result-links',
			name: 'Copy dataview result links!',
			editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
				if (!checking) {
					new DataviewReader(this.app, editor.getSelection()).read(new CopyAction(this.app));
				}
				return dataviewApi != null;
			}
		});


		// let result = prepareFuzzySearch("test");

		// console.log(result("test"));

		// Edit yaml prop 
		// https://github.com/lijyze/obsidian-state-switcher/blob/d0a80081b0fcc1b899eed2e3d7e834c2d5703875/src/util.ts#L42
		// let metaedit = this.app.plugins.plugins["metaedit"];

		// this.addCommand({
		// 	id: "add-prop-to-files",
		// 	name: "Add prop to files in clipboard ...",
		// 	callback: () => {
		// 		if (metaedit == null) {
		// 			new Notice("Please install metaEdit first!");
		// 		}
		// 	}
		// });

		// todo merge multi file
		// todo deal tags
		// todo deal yaml
		// console.log(this.app.plugins.plugins["metaedit"].api);

		// 

	}

	onunload() {
	}
}
