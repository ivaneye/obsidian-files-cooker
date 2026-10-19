import FileCookerPlugin from 'main';
import { ActionModel } from 'src/action/action';
import { DeleteAction } from 'src/action/delete-action';
import { EditPropertiesAction } from 'src/action/edit-properties-action';
import { AiPropertiesAction } from 'src/action/ai-properties-action';
import { RenameAction } from 'src/action/rename-action';
import { RenamePropertyAction } from 'src/action/rename-property-action';
import { ChooseCanvasModal } from 'src/modal/choose-canvas-modal';
import { CurrentFileReader, ReadType } from 'src/reader/current-file-reader';
import { FolderReader } from 'src/reader/folder-reader';
import { SyncFlomoAction } from 'src/action/sync-flomo-action';
import { Command } from './command';
import { Editor, Menu, Notice, TAbstractFile, TFolder } from 'obsidian';
import { t } from 'src/i18n/index';

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
		if (targetActionModel) {
			this.addFileMenu(menu, targetActionModel);
			return;
		}

		this.registFolderMenu(menu, target);
	}

	private addFileMenu(menu: Menu, targetActionModel: ActionModel): void {
		this.addGroupTitle(menu, t('File Cooker -> 目标文件'));

		menu.addItem((item) => {
			item
				.setTitle(t('重命名目标文件 ...'))
				.onClick(() => {
					this.runTargetFileAction(targetActionModel, () => new RenameAction(this.plugin.app));
				});
		});

		menu.addItem((item) => {
			item
				.setTitle(t('编辑目标文件属性 ...'))
				.onClick(() => {
					this.runTargetFileAction(targetActionModel, () => new EditPropertiesAction(this.plugin.app));
				});
		});

		// AI 属性补全（单文件快速路径）：推断提案 → 人工审核 → 应用
		menu.addItem((item) => {
			item
				.setTitle(t('AI 补全属性 ...'))
				.onClick(() => {
					this.runTargetFileAction(targetActionModel, () => new AiPropertiesAction(this.plugin));
				});
		});

		menu.addItem((item) => {
			item
				.setTitle(t('删除目标文件 ...'))
				.onClick(() => {
					this.runTargetFileAction(targetActionModel, () => new DeleteAction(this.plugin.app));
				});
			this.trySetWarning(item, true);
		});
	}

	private registFolderMenu(menu: Menu, target: TAbstractFile): void {
		const folder = target as { children?: unknown };
		if (!Array.isArray(folder.children)) {
			// 既非文件也非文件夹，忽略
			return;
		}

		this.addGroupTitle(menu, t('File Cooker -> 目标文件夹'));

		menu.addItem((item) => {
			item
				.setTitle(t('编辑文件夹中的属性 ...'))
				.onClick(() => {
					new FolderReader(this.plugin, target as TFolder).read(new EditPropertiesAction(this.plugin.app));
				});
		});

		menu.addItem((item) => {
			item
				.setTitle(t('重命名文件夹中的属性 ...'))
				.onClick(() => {
					new FolderReader(this.plugin, target as TFolder).read(new RenamePropertyAction(this.plugin.app));
				});
		});
	}

	private registSelectionOperations(menu: Menu, editor: Editor): boolean {
		const canRunSelectionActions = hasEditorSelection(editor);
		if (!canRunSelectionActions) {
			return false;
		}

		this.addGroupTitle(menu, t('File Cooker -> 选区'));

		menu.addItem((item) => {
			item
				.setTitle(t('同步选区到 flomo ...'))
				.onClick(() => {
					new CurrentFileReader(this.plugin, ReadType.SELECTION, editor.getSelection())
						.read(new SyncFlomoAction(this.plugin));
				});
		});

		menu.addItem((item) => {
			item
				.setTitle(t('将当前文件中的选区添加到画布 ...'))
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

		this.addGroupTitle(menu, t('File Cooker -> 当前文件链接'));

		menu.addItem((item) => {
			item
				.setTitle(t('重命名当前文件链接中的文件 ...'))
				.onClick(() => {
					this.runCurrentFileLinkAction(() => new RenameAction(this.plugin.app));
				});
		});

		menu.addItem((item) => {
			item
				.setTitle(t('编辑当前文件链接中的属性 ...'))
				.onClick(() => {
					this.runCurrentFileLinkAction(() => new EditPropertiesAction(this.plugin.app));
				});
		});

		menu.addItem((item) => {
			item
				.setTitle(t('删除当前文件中的链接文件!'))
				.onClick(() => {
					this.runCurrentFileLinkAction(() => new DeleteAction(this.plugin.app));
				});
			this.trySetWarning(item, true);
		});

		menu.addItem((item) => {
			item
				.setTitle(t('将当前文件中的链接添加到目标画布 ...'))
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
			new Notice(t('当前没有活动文件！'));
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
