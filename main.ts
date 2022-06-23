import {Plugin, Editor, getLinkpath} from 'obsidian';
import { MoveModal } from 'move-modal';
import { FROM_CLIPBOARD, FROM_CURRENT_FILE } from 'move-info';

export default class FileCookerPlugin extends Plugin {

	async onload() {
		const ribbonIconEl = this.addRibbonIcon('clipboard-list', 'Move files to ...', (evt: MouseEvent) => {
			new MoveModal(this.app, FROM_CLIPBOARD).open();
		});

		ribbonIconEl.addClass('my-plugin-ribbon-class');

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
	}

	onunload() {
	}
}
