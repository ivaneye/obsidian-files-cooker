import {Plugin, Editor, getLinkpath} from 'obsidian';
import { MoveModal } from 'src/move/move-modal';
import { FROM_CLIPBOARD, FROM_CURRENT_FILE } from 'src/move/move-info';
import { DeleteModal } from 'src/remove/delete-modal';

export default class FileCookerPlugin extends Plugin {

	async onload() {
		// const ribbonIconEl = this.addRibbonIcon('clipboard-list', 'Move files to ...', (evt: MouseEvent) => {
		// 	new MoveModal(this.app, FROM_CLIPBOARD).open();
		// });
		// ribbonIconEl.addClass('my-plugin-ribbon-class');

		// Move Files
		this.addCommand({
			id: 'move-files-to',
			name: 'Move files to ...',
			callback: () => {
				new MoveModal(this.app, FROM_CLIPBOARD).open();
			}
		});

		this.addCommand({
			id: "move-links-to",
			name: "Move links in current file to ...",
			callback: () => {
				new MoveModal(this.app, FROM_CURRENT_FILE).open();
			}
		});

		// Delete Files
		this.addCommand({
			id: 'delete-files-in-clipboard',
			name: 'Delete files in clipboard ...',
			callback: () => {
				new DeleteModal(this.app, FROM_CLIPBOARD).open();
			}
		});

		this.addCommand({
			id: "delete-links-in-current-file",
			name: "Delete link-files in current file ...",
			callback: () => {
				new DeleteModal(this.app, FROM_CURRENT_FILE).open();
			}
		});

	}

	onunload() {
	}
}
