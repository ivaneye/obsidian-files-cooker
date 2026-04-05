import FileCookerPlugin from 'main';
import { ActionModel } from 'src/action/action';
import { DeleteAction } from 'src/action/delete-action';
import { EditPropertiesAction } from 'src/action/edit-properties-action';
import { RenameAction } from 'src/action/rename-action';
import { ChooseCanvasModal } from 'src/modal/choose-canvas-modal';
import { CurrentFileReader, ReadType } from 'src/reader/current-file-reader';
import { SyncFlomoAction } from 'src/action/sync-flomo-action';
import { Command } from './command';
import { Editor, Menu, Notice, TAbstractFile } from 'obsidian';

export function hasEditorSelection(editor: Editor): boolean {
	return editor.getSelection().trim() !== '';
}

export function toSingleFileActionModel(target: TAbstractFile): ActionModel | null {
	const maybeFile = target as { extension?: string };
	if (typeof maybeFile?.extension === 'string') {
		return new ActionModel(target);
	}

	return null;
}

export class ContextMenuCommand implements Command {
	plugin: FileCookerPlugin;

	constructor(plugin: FileCookerPlugin) {
		this.plugin = plugin;
	}

	regist(): void {
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('editor-menu', (menu: Menu, editor: Editor) => {
				this.registEditorMenu(menu, editor);
			})
		);

		this.plugin.registerEvent(
			this.plugin.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile) => {
				this.registFileMenu(menu, file);
			})
		);
	}

	private registEditorMenu(menu: Menu, editor: Editor): void {
		const hasSelectionGroup = this.registSelectionOperations(menu, editor);
		const hasCurrentFileGroup = this.registCurrentFileLinkOperations(menu);

		if (hasSelectionGroup && hasCurrentFileGroup) {
			menu.addSeparator();
		}
	}

	private registFileMenu(menu: Menu, target: TAbstractFile): void {
		const targetActionModel = toSingleFileActionModel(target);
		if (!targetActionModel) {
			return;
		}

		this.addGroupTitle(menu, 'File Cooker -> Target file');

		menu.addItem((item) => {
			item
				.setTitle('Rename target file ...')
				.onClick(() => {
					this.runTargetFileAction(targetActionModel, () => new RenameAction(this.plugin.app));
				});
		});

		menu.addItem((item) => {
			item
				.setTitle('Edit target file properties ...')
				.onClick(() => {
					this.runTargetFileAction(targetActionModel, () => new EditPropertiesAction(this.plugin.app));
				});
		});

		menu.addItem((item) => {
			item
				.setTitle('Delete target file ...')
				.onClick(() => {
					this.runTargetFileAction(targetActionModel, () => new DeleteAction(this.plugin.app));
				});
			this.trySetWarning(item, true);
		});
	}

	private registSelectionOperations(menu: Menu, editor: Editor): boolean {
		const canRunSelectionActions = hasEditorSelection(editor);
		if (!canRunSelectionActions) {
			return false;
		}

		this.addGroupTitle(menu, 'File Cooker -> Selection');

		menu.addItem((item) => {
			item
				.setTitle('Sync selection to flomo ...')
				.onClick(() => {
					new CurrentFileReader(this.plugin, ReadType.SELECTION, editor.getSelection())
						.read(new SyncFlomoAction(this.plugin));
				});
		});

		menu.addItem((item) => {
			item
				.setTitle('Add selection in current file to canvas ...')
				.onClick(() => {
					new ChooseCanvasModal(
						this.plugin.app,
						new CurrentFileReader(this.plugin, ReadType.SELECTION, editor.getSelection())
					).open();
				});
		});

		return true;
	}

	private registCurrentFileLinkOperations(menu: Menu): boolean {
		if (!this.hasActiveFileContext()) {
			return false;
		}

		this.addGroupTitle(menu, 'File Cooker -> Current file links');

		menu.addItem((item) => {
			item
				.setTitle('Rename in current file links ...')
				.onClick(() => {
					this.runCurrentFileLinkAction(() => new RenameAction(this.plugin.app));
				});
		});

		menu.addItem((item) => {
			item
				.setTitle('Edit Properties in current file links ...')
				.onClick(() => {
					this.runCurrentFileLinkAction(() => new EditPropertiesAction(this.plugin.app));
				});
		});

		menu.addItem((item) => {
			item
				.setTitle('Delete link-files in current file!')
				.onClick(() => {
					this.runCurrentFileLinkAction(() => new DeleteAction(this.plugin.app));
				});
			this.trySetWarning(item, true);
		});

		menu.addItem((item) => {
			item
				.setTitle('Add links in current file to target canvas ...')
				.onClick(() => {
					new ChooseCanvasModal(this.plugin.app, new CurrentFileReader(this.plugin)).open();
				});
		});

		return true;
	}

	private addGroupTitle(menu: Menu, title: string): void {
		menu.addItem((item) => {
			item.setTitle(title).setDisabled(true);
			this.trySetIsLabel(item, true);
		});
	}

	private trySetIsLabel(item: { setIsLabel?: (isLabel: boolean) => unknown }, isLabel: boolean): void {
		if (typeof item.setIsLabel === 'function') {
			item.setIsLabel(isLabel);
		}
	}

	private trySetWarning(item: { setWarning?: (isWarning: boolean) => unknown }, isWarning: boolean): void {
		if (typeof item.setWarning === 'function') {
			item.setWarning(isWarning);
		}
	}

	/**
	 * 上下文判断职责：
	 * 1) 仅负责判断当前是否存在“活动文件”上下文；
	 * 2) 不负责决定具体操作细节（由 reader/action 处理）；
	 * 3) 作为所有“当前文件链接”菜单执行前的统一守卫，避免出现空上下文误执行。
	 */
	private hasActiveFileContext(): boolean {
		return this.plugin.app.workspace.getActiveFile() != null;
	}

	/**
	 * 执行边界：
	 * - 有活动文件：转入既有 CurrentFileReader 语义，保持与命令面板一致；
	 * - 无活动文件：立即阻断并给出 Notice，不进入 reader/action。
	 */
	private runCurrentFileLinkAction(actionFactory: () => { act: (models: ActionModel[]) => void }): void {
		if (!this.hasActiveFileContext()) {
			new Notice('No active file!');
			return;
		}

		new CurrentFileReader(this.plugin).read(actionFactory());
	}

	/**
	 * 文件右键适配职责：
	 * 1) 将右键目标转换为 ActionModel（目标绑定）；
	 * 2) 非文件目标（如文件夹）统一阻断并反馈；
	 * 3) 不读取活动文件，确保动作只作用于右键目标。
	 */
	private runTargetFileAction(actionModel: ActionModel, actionFactory: () => { act: (models: ActionModel[]) => void }): void {
		actionFactory().act([actionModel]);
	}
}
