import { beforeEach, describe, expect, it, vi } from 'vitest';

const notices: string[] = [];
const currentFileReaderRead = vi.fn();
const renameAct = vi.fn();
const deleteAct = vi.fn();
const editPropertiesAct = vi.fn();
const syncFlomoAct = vi.fn();
const chooseCanvasOpen = vi.fn();

vi.mock('obsidian', () => {
	class Notice {
		message: string;
		constructor(message: string) {
			this.message = message;
			notices.push(message);
		}
	}

	return {
		Notice,
	};
});

vi.mock('src/reader/current-file-reader', () => {
	return {
		ReadType: {
			LINKS: 0,
			UN_RESOLVED_LINKS: 1,
			CONTENT: 2,
			SELECTION: 3,
		},
		CurrentFileReader: class {
			read = currentFileReaderRead;
		},
	};
});

vi.mock('src/action/rename-action', () => ({
	RenameAction: class {
		act = renameAct;
	},
}));

vi.mock('src/action/delete-action', () => ({
	DeleteAction: class {
		act = deleteAct;
	},
}));

vi.mock('src/action/edit-properties-action', () => ({
	EditPropertiesAction: class {
		act = editPropertiesAct;
	},
}));

vi.mock('src/action/sync-flomo-action', () => ({
	SyncFlomoAction: class {
		act = syncFlomoAct;
	},
}));

vi.mock('src/modal/choose-canvas-modal', () => ({
	ChooseCanvasModal: class {
		open = chooseCanvasOpen;
	},
}));

import { ContextMenuCommand } from 'src/command/context-menu-command';

type FakeMenuItem = {
	title?: string;
	section?: string;
	disabled?: boolean;
	warning?: boolean;
	onClickHandler?: () => void;
	setTitle: (title: string) => FakeMenuItem;
	setSection: (section: string) => FakeMenuItem;
	setDisabled: (disabled: boolean) => FakeMenuItem;
	setWarning: (warning: boolean) => FakeMenuItem;
	setIsLabel: (_isLabel: boolean) => FakeMenuItem;
	onClick: (handler: () => void) => FakeMenuItem;
};

function createFakeMenu() {
	const items: FakeMenuItem[] = [];
	const menu = {
		items,
		addItem(cb: (item: FakeMenuItem) => void) {
			const item: FakeMenuItem = {
				setTitle(title: string) {
					this.title = title;
					return this;
				},
				setSection(section: string) {
					this.section = section;
					return this;
				},
				setDisabled(disabled: boolean) {
					this.disabled = disabled;
					return this;
				},
				setWarning(warning: boolean) {
					this.warning = warning;
					return this;
				},
				setIsLabel() {
					return this;
				},
				onClick(handler: () => void) {
					this.onClickHandler = handler;
					return this;
				},
			};
			cb(item);
			items.push(item);
			return menu;
		},
		addSeparator() {
			return menu;
		},
	};

	return menu;
}

function createPlugin(activeFile: unknown) {
	return {
		app: {
			workspace: {
				getActiveFile: () => activeFile,
			},
		},
		registerEvent: vi.fn(),
	};
}

function registEditorMenu(
	command: ContextMenuCommand,
	menu: ReturnType<typeof createFakeMenu>,
	editor: { getSelection: () => string }
) {
	(
		command as unknown as {
			registEditorMenu: (
				menuArg: ReturnType<typeof createFakeMenu>,
				editorArg: { getSelection: () => string }
			) => void;
		}
	).registEditorMenu(menu, editor);
}

function registFileMenu(
	command: ContextMenuCommand,
	menu: ReturnType<typeof createFakeMenu>,
	target: { path: string; extension?: string; children?: unknown[] }
) {
	(
		command as unknown as {
			registFileMenu: (
				menuArg: ReturnType<typeof createFakeMenu>,
				targetArg: { path: string; extension?: string; children?: unknown[] }
			) => void;
		}
	).registFileMenu(menu, target);
}

function findItem(menu: ReturnType<typeof createFakeMenu>, title: string): FakeMenuItem {
	const found = menu.items.find((item) => item.title === title);
	if (!found) {
		throw new Error(`Menu item not found: ${title}`);
	}

	return found;
}

function findItemOrUndefined(menu: ReturnType<typeof createFakeMenu>, title: string): FakeMenuItem | undefined {
	return menu.items.find((item) => item.title === title);
}

describe('ContextMenuCommand', () => {
	beforeEach(() => {
		notices.length = 0;
		currentFileReaderRead.mockReset();
		renameAct.mockReset();
		deleteAct.mockReset();
		editPropertiesAct.mockReset();
		syncFlomoAct.mockReset();
		chooseCanvasOpen.mockReset();
	});

	it('2.1 无选区时不展示 Selection 一级标题和子菜单', () => {
		const plugin = createPlugin({ path: 'active.md' });
		const command = new ContextMenuCommand(plugin as never);
		const menu = createFakeMenu();

		registEditorMenu(command, menu, {
			getSelection: () => '',
		});

		const selectionGroup = findItemOrUndefined(menu, 'File Cooker -> Selection');
		const syncSelection = findItemOrUndefined(menu, 'Sync selection to flomo ...');
		expect(selectionGroup).toBeUndefined();
		expect(syncSelection).toBeUndefined();
		expect(currentFileReaderRead).not.toHaveBeenCalled();
	});

	it('2.1 有选区时允许执行选区相关操作', () => {
		const plugin = createPlugin({ path: 'active.md' });
		const command = new ContextMenuCommand(plugin as never);
		const menu = createFakeMenu();

		registEditorMenu(command, menu, {
			getSelection: () => 'selected text',
		});

		const selectionGroup = findItem(menu, 'File Cooker -> Selection');
		expect(selectionGroup.disabled).toBe(true);

		const syncSelection = findItem(menu, 'Sync selection to flomo ...');

		syncSelection.onClickHandler?.();

		expect(currentFileReaderRead).toHaveBeenCalledTimes(1);
	});

	it('2.3 无活动文件时不展示 Current file links 一级标题和子菜单', () => {
		const plugin = createPlugin(null);
		const command = new ContextMenuCommand(plugin as never);
		const menu = createFakeMenu();

		registEditorMenu(command, menu, {
			getSelection: () => 'selected text',
		});

		const currentFileGroup = findItemOrUndefined(menu, 'File Cooker -> Current file links');
		const renameCurrentLinks = findItemOrUndefined(menu, 'Rename in current file links ...');
		expect(currentFileGroup).toBeUndefined();
		expect(renameCurrentLinks).toBeUndefined();
		expect(currentFileReaderRead).not.toHaveBeenCalled();
	});

	it('2.3 有活动文件时执行当前文件链接操作', () => {
		const plugin = createPlugin({ path: 'active.md' });
		const command = new ContextMenuCommand(plugin as never);
		const menu = createFakeMenu();

		registEditorMenu(command, menu, {
			getSelection: () => 'selected text',
		});

		const currentFileGroup = findItem(menu, 'File Cooker -> Current file links');
		expect(currentFileGroup.disabled).toBe(true);

		const renameCurrentLinks = findItem(menu, 'Rename in current file links ...');
		renameCurrentLinks.onClickHandler?.();

		expect(currentFileReaderRead).toHaveBeenCalledTimes(1);
	});

	it('3.1 文件右键动作绑定到被右键文件', () => {
		const plugin = createPlugin({ path: 'another-active.md', extension: 'md' });
		const command = new ContextMenuCommand(plugin as never);
		const menu = createFakeMenu();
		const targetFile = { path: 'target.md', extension: 'md' };

		registFileMenu(command, menu, targetFile);

		const targetGroup = findItem(menu, 'File Cooker -> Target file');
		expect(targetGroup.disabled).toBe(true);

		const renameTarget = findItem(menu, 'Rename target file ...');
		renameTarget.onClickHandler?.();

		expect(renameAct).toHaveBeenCalledTimes(1);
		expect(renameAct.mock.calls[0][0]).toHaveLength(1);
		expect(renameAct.mock.calls[0][0][0].file).toBe(targetFile);
	});

	it('3.3 非文件目标时不展示 Target file 一级标题和子菜单', () => {
		const plugin = createPlugin({ path: 'active.md', extension: 'md' });
		const command = new ContextMenuCommand(plugin as never);
		const menu = createFakeMenu();
		const folderTarget = { path: 'folder', children: [] as unknown[] };

		registFileMenu(command, menu, folderTarget);

		const targetGroup = findItemOrUndefined(menu, 'File Cooker -> Target file');
		const renameTarget = findItemOrUndefined(menu, 'Rename target file ...');
		expect(targetGroup).toBeUndefined();
		expect(renameTarget).toBeUndefined();
		expect(renameAct).not.toHaveBeenCalled();
	});
});
