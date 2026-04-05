import { describe, expect, it, vi } from 'vitest';

const addCommand = vi.fn();
const dataviewRead = vi.hoisted(() => vi.fn());
const searchRead = vi.hoisted(() => vi.fn());
const chooseFileOpen = vi.hoisted(() => vi.fn());
const chooseFolderOpen = vi.hoisted(() => vi.fn());
const chooseCanvasOpen = vi.hoisted(() => vi.fn());

vi.mock('obsidian', () => ({}));

vi.mock('obsidian-dataview', () => ({
	getAPI: vi.fn(() => ({})),
}));

vi.mock('src/reader/dataview-reader', () => ({
	DataviewReader: class {
		read = dataviewRead;
	},
}));

vi.mock('src/reader/search-results-reader', () => ({
	SearchResultsReader: class {
		read = searchRead;
	},
}));

vi.mock('src/modal/choose-file-modal', () => ({
	ChooseFileModal: class {
		open = chooseFileOpen;
	},
}));

vi.mock('src/modal/choose-folder-modal', () => ({
	ChooseFolderModal: class {
		open = chooseFolderOpen;
	},
}));

vi.mock('src/modal/choose-canvas-modal', () => ({
	ChooseCanvasModal: class {
		open = chooseCanvasOpen;
	},
}));

vi.mock('src/action/copy-action', () => ({ CopyAction: class {} }));
vi.mock('src/action/delete-action', () => ({ DeleteAction: class {} }));
vi.mock('src/action/edit-properties-action', () => ({ EditPropertiesAction: class {} }));
vi.mock('src/action/move-action', () => ({ MoveAction: class {} }));
vi.mock('src/action/rename-action', () => ({ RenameAction: class {} }));
vi.mock('src/action/sync-flomo-action', () => ({ SyncFlomoAction: class {} }));

import { DataviewCommand } from 'src/command/dataview-command';
import { SearchCommand } from 'src/command/search-command';

function getRegisteredCommand(id: string) {
	const command = addCommand.mock.calls
		.map((call) => call[0])
		.find((candidate) => candidate.id === id);

	if (!command) {
		throw new Error(`Command not found: ${id}`);
	}

	return command;
}

describe('Dataview/Search regression', () => {
	it('3.3 Dataview 和 Search 命令在接入 Bases 后保持可触发', () => {
		addCommand.mockReset();
		dataviewRead.mockReset();
		searchRead.mockReset();
		chooseFileOpen.mockReset();
		chooseFolderOpen.mockReset();
		chooseCanvasOpen.mockReset();

		const plugin = {
			addCommand,
			app: {},
		};

		new DataviewCommand(plugin as never).regist();
		new SearchCommand(plugin as never).regist();

		const dataviewDelete = getRegisteredCommand('delete-dataview-results');
		dataviewDelete.editorCheckCallback(false, { getSelection: () => 'table file' }, {});

		const searchDelete = getRegisteredCommand('delete-files-in-searchresults');
		searchDelete.callback();

		expect(dataviewRead).toHaveBeenCalledTimes(1);
		expect(searchRead).toHaveBeenCalledTimes(1);
	});
});
