import { describe, expect, it, vi } from 'vitest';

const addCommand = vi.fn();
const readMock = vi.hoisted(() => vi.fn());

vi.mock('obsidian', () => ({}));

vi.mock('src/reader/current-file-reader', () => ({
	CurrentFileReader: class {
		read = readMock;
	},
	ReadType: {
		LINKS: 0,
		UN_RESOLVED_LINKS: 1,
		CONTENT: 2,
		SELECTION: 3,
	},
}));

vi.mock('src/action/create-action', () => ({ CreateAction: class {} }));
vi.mock('src/action/delete-action', () => ({ DeleteAction: class {} }));
vi.mock('src/action/edit-properties-action', () => ({ EditPropertiesAction: class {} }));
vi.mock('src/action/move-action', () => ({ MoveAction: class {} }));
vi.mock('src/action/rename-action', () => ({ RenameAction: class {} }));
vi.mock('src/action/sync-flomo-action', () => ({ SyncFlomoAction: class {} }));
vi.mock('src/action/add-to-canvas-action', () => ({ AddToCanvasAction: class {} }));

vi.mock('src/modal/choose-canvas-modal', () => ({
	ChooseCanvasModal: class {
		open() {
			return;
		}
	},
}));

vi.mock('src/modal/choose-file-modal', () => ({
	ChooseFileModal: class {
		open() {
			return;
		}
	},
}));

vi.mock('src/modal/choose-folder-modal', () => ({
	ChooseFolderModal: class {
		open() {
			return;
		}
	},
}));

import { CurrentFileCommand } from 'src/command/current-file-command';

function getRegisteredCommand(id: string) {
	const command = addCommand.mock.calls
		.map((call) => call[0])
		.find((candidate) => candidate.id === id);

	if (!command) {
		throw new Error(`Command not found: ${id}`);
	}

	return command;
}

describe('CurrentFileCommand regression', () => {
	it('4.1 右键菜单接入后命令面板重命名/删除/编辑属性命令行为保持可执行', () => {
		addCommand.mockReset();
		readMock.mockReset();

		const plugin = {
			addCommand,
			app: {},
		};

		new CurrentFileCommand(plugin as never).regist();

		const renameCommand = getRegisteredCommand('rename-in-current-file-links');
		renameCommand.callback();

		const deleteCommand = getRegisteredCommand('delete-links-in-current-file');
		deleteCommand.callback();

		const editPropsCommand = getRegisteredCommand('edit-front-matter-in-current-file-links');
		editPropsCommand.callback();

		expect(readMock).toHaveBeenCalledTimes(3);
	});
});
