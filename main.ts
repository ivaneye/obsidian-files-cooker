import {App, Plugin} from 'obsidian';
import { MoveModal } from 'modal';

export default class FileCookerPlugin extends Plugin {

	async onload() {
		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('clipboard-list', 'Move files to ...', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new MoveModal(this.app).open();
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'move-files-to',
			name: 'Move files to ...',
			callback: () => {
				new MoveModal(this.app).open();
			}
		});
	}

	onunload() {
	}
}
