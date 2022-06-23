import { App, Modal, Notice, Setting, SuggestModal, TAbstractFile, TFolder } from 'obsidian';

export interface MoveInfo {
	sourceFile: TAbstractFile;
	targetDir: string;
}

/**
 * 选择目录弹窗
 */
export class MoveModal extends SuggestModal<TAbstractFile> {
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
	let path = folder.path;
	
	let clip = navigator.clipboard.readText();

	clip.then(str => {
		let sp = str.split("\n");
		const moveInfos: MoveInfo[] = [];
		sp.forEach(f => {
			let ff = this.app.vault.getAbstractFileByPath(f);
			if(ff != null) {
				moveInfos.push({
					sourceFile: ff,
					targetDir: path
				})
			}
		})
		if(moveInfos.length > 0) {
			new ConfirmModal(this.app, moveInfos).open();
		} else {
			new Notice("No Effective Files in Clipboard!");
		}
	}).catch(e => {
		new Notice("Clipboard Content Error!" + e);
	})
  }
}

export class ConfirmModal extends Modal {
	moveInfos: MoveInfo[];
  
	constructor(app: App, moveInfos: MoveInfo[]) {
	  super(app);
	  this.moveInfos = moveInfos;
	}
  
	onOpen() {
	  const { contentEl } = this;
  
	  contentEl.createEl("h1", { text: "Confirm Move?" });

	  this.moveInfos.forEach(info => {
		contentEl.createEl("div", { text:  info.sourceFile.path + " -> " + info.targetDir + "/" + info.sourceFile.name});
	  })
  
	  new Setting(contentEl)
		.addButton((btn) =>
		  btn
			.setButtonText("Confirm")
			.setCta()
			.onClick(() => {
			  this.close();
			  this.moveInfos.forEach(info => {
				this.app.vault.rename(info.sourceFile, info.targetDir + "/" + info.sourceFile.name);
			  })
			  new Notice("Move Success!");
			}))
		.addButton((btn) =>
		  btn
			.setButtonText("Cancel")
			.setCta()
			.onClick(() => {
			  this.close();
			  new Notice("Move Canceled!");
			}));
	}
  
	onClose() {
	  let { contentEl } = this;
	  contentEl.empty();
	}
  }