import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
	return await import('./mocks/obsidian');
});

const deleteModalOpenSpy = vi.hoisted(() => vi.fn());

vi.mock('src/modal/delete-confirm-modal', () => ({
	DeleteConfirmModal: class {
		app: any;
		files: any[];
		constructor(app: any, files: any[]) {
			this.app = app;
			this.files = files;
		}
		open() {
			deleteModalOpenSpy(this.files);
		}
	},
}));

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

import { __getNotices, __resetNotices } from './mocks/obsidian';
import { BasesCommand } from 'src/command/bases-command';

function createPlugin(rows: unknown[] | null) {
	const addCommand = vi.fn();
	const trash = vi.fn();
	const app = {
		workspace: {
			getLeavesOfType: vi.fn((type: string) => {
				if (type !== 'bases') {
					return [];
				}
				if (rows == null) {
					return [];
				}
				return [{ view: { currentQueryResult: rows } }];
			}),
		},
		vault: {
			trash,
			getAbstractFileByPath: vi.fn((path: string) => {
				if (path !== 'valid.md') {
					return null;
				}
				return { path, name: 'valid.md', parent: { path: '' } };
			}),
		},
		plugins: {
			plugins: {},
		},
	};

	return {
		plugin: {
			addCommand,
			app,
			settings: {
				limit: '30',
				flomoAPI: 'https://flomo.test',
			},
		},
		addCommand,
		trash,
	};
}

function getRegisteredCommand(addCommand: ReturnType<typeof vi.fn>, id: string) {
	const command = addCommand.mock.calls
		.map((call) => call[0])
		.find((candidate) => candidate.id === id);

	if (!command) {
		throw new Error(`Command not found: ${id}`);
	}

	return command;
}

describe('BasesCommand', () => {
	beforeEach(() => {
		deleteModalOpenSpy.mockReset();
		__resetNotices();
	});

	it('1.2 应注册与 Dataview 对齐的完整 Bases 命令集', () => {
		const { plugin, addCommand } = createPlugin([{ path: 'valid.md' }]);

		new BasesCommand(plugin as never).regist();

		const ids = addCommand.mock.calls.map((call) => call[0].id);
		expect(ids).toEqual([
			'move-bases-results-to',
			'sync-bases-results-to',
			'merge-bases-results-to',
			'delete-bases-results',
			'copy-bases-result-links',
			'edit-front-matter-in-bases-results',
			'rename-in-bases-results',
			'add-bases-results-to-canvas',
			'add-bases-task-to-canvas',
		]);
	});

	it('3.1 数据源不可用时执行应被 Reader 阻断并提示', () => {
		const { plugin, addCommand } = createPlugin(null);

		new BasesCommand(plugin as never).regist();

		const deleteCommand = getRegisteredCommand(addCommand, 'delete-bases-results');
		deleteCommand.callback();

		expect(deleteModalOpenSpy).not.toHaveBeenCalled();
		expect(__getNotices()).toContain('Bases results unavailable! Please open a Bases query view and run a query first!');
	});

	it('3.1 删除命令应走确认链路并可观察 ignoredCount 提示', () => {
		const { plugin, addCommand, trash } = createPlugin([{ path: 'valid.md' }, { random: true }]);

		new BasesCommand(plugin as never).regist();

		const deleteCommand = getRegisteredCommand(addCommand, 'delete-bases-results');
		deleteCommand.callback();

		expect(deleteModalOpenSpy).toHaveBeenCalledTimes(1);
		expect(deleteModalOpenSpy.mock.calls[0][0]).toHaveLength(1);
		expect(deleteModalOpenSpy.mock.calls[0][0][0].path).toBe('valid.md');
		expect(__getNotices()).toContain('Ignored 1 non-file bases results.');
		// 在确认弹窗阶段之前，不应直接触发删除副作用。
		expect(trash).not.toHaveBeenCalled();
	});
});
