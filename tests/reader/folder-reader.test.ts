import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
	return await import('../mocks/obsidian');
});

import type { TFolder } from 'obsidian';
import { __getNotices, __resetNotices } from '../mocks/obsidian';
import { t } from 'src/i18n/index';
import { createAppMock } from '../mocks/vault-mock';
import { FolderReader } from 'src/reader/folder-reader';

/**
 * 测试目的：FolderReader 递归收集文件夹下全部 Markdown 文件并转为 ActionModel 传给动作。
 * 测试内容：子文件夹递归、目录前缀过滤（不误收同级/其他目录）、根目录收集全库、空文件夹零模型。
 * 预期结果：模型文件路径与文件夹匹配；超限抛错走 Notice 兜底。
 */

function pluginStub(limit = 100) {
	const app = createAppMock({
		'notes/a.md': 'a',
		'notes/sub/b.md': 'b',
		'notes/attatch.png': 'png',
		'other/c.md': 'c',
	});
	return {
		app,
		settings: { limit },
	};
}

function folder(path: string): TFolder {
	return { path, children: [] } as unknown as TFolder;
}

describe('FolderReader 文件夹读取', () => {
	beforeEach(() => {
		__resetNotices();
	});

	it('递归收集文件夹下全部 Markdown 文件（不含子资源文件）', () => {
		const { app, settings } = pluginStub();
		const act = vi.fn();
		new FolderReader({ app, settings } as never, folder('notes')).read({ act });

		const paths = act.mock.calls[0][0].map((model: { file: { path: string } }) => model.file.path);
		expect(paths.sort()).toEqual(['notes/a.md', 'notes/sub/b.md']);
	});

	it('目录前缀完整匹配，不误收同级前缀目录', () => {
		const app = createAppMock({
			'demo/a.md': 'a',
			'demo-2/b.md': 'b',
		});
		const act = vi.fn();
		new FolderReader({ app, settings: { limit: 100 } } as never, folder('demo')).read({ act });

		const paths = act.mock.calls[0][0].map((model: { file: { path: string } }) => model.file.path);
		expect(paths).toEqual(['demo/a.md']);
	});

	it('根目录收集全库笔记', () => {
		const { app, settings } = pluginStub();
		const act = vi.fn();
		new FolderReader({ app, settings } as never, folder('/')).read({ act });

		const paths = act.mock.calls[0][0].map((model: { file: { path: string } }) => model.file.path);
		expect(paths.sort()).toEqual(['notes/a.md', 'notes/sub/b.md', 'other/c.md']);
	});

	it('空文件夹传入空模型，由动作层提示 No Files Found', () => {
		const { app, settings } = pluginStub();
		const act = vi.fn();
		new FolderReader({ app, settings } as never, folder('empty')).read({ act });

		expect(act.mock.calls[0][0]).toEqual([]);
	});

	it('超过 limit 抛错时 Notice 兜底，不进入动作', () => {
		const { app, settings } = pluginStub(1);
		const act = vi.fn();
		new FolderReader({ app, settings } as never, folder('notes')).read({ act });

		expect(act).not.toHaveBeenCalled();
		expect(__getNotices().join(' ')).toContain(t('加载的文件超过上限 {limit} 个！', { limit: 1 }));
	});
});
