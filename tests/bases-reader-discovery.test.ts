import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
	return await import('./mocks/obsidian');
});

import { __resetNotices } from './mocks/obsidian';
import { BasesReader } from 'src/reader/bases-reader';

function createPluginWithNestedRows() {
	const app = {
		workspace: {
			getLeavesOfType: vi.fn((_type: string) => []),
			activeLeaf: {
				view: {
					state: {
						queryContext: {
							store: {
								items: [
									{ file: { path: 'nested/a.md' } },
								],
							},
						},
					},
				},
			},
		},
		vault: {
			getAbstractFileByPath: vi.fn((path: string) => ({
				path,
				name: path.split('/').pop() ?? path,
				parent: { path: '' },
			})),
		},
	};

	return {
		app,
		settings: { limit: '20' },
	};
}

describe('BasesReader deep discovery', () => {
	beforeEach(() => {
		__resetNotices();
	});

	it('应能从内置 Bases 视图的深层结构中发现 rows', () => {
		const plugin = createPluginWithNestedRows();
		const action = { act: vi.fn() };

		new BasesReader(plugin as never).read(action as never);

		expect(action.act).toHaveBeenCalledTimes(1);
		const models = action.act.mock.calls[0][0];
		expect(models).toHaveLength(1);
		expect(models[0].file.path).toBe('nested/a.md');
	});
});
