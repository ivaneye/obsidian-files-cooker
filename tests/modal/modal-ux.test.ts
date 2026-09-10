import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
	return await import('../mocks/obsidian');
});

import { Setting } from 'obsidian';
import { __getNotices, __resetNotices } from '../mocks/obsidian';
import { DeleteConfirmModal } from 'src/modal/delete-confirm-modal';
import { MoveConfirmModal } from 'src/modal/move-confirm-modal';
import { CreateConfirmModal } from 'src/modal/create-confirm-modal';
import { MergeConfirmModal } from 'src/modal/merge-confirm-modal';
import { SyncFlomoConfirmModal } from 'src/modal/sync-flomo-confirm-modal';
import { RenameModal } from 'src/modal/rename-modal';
import { RenameConfirmModal } from 'src/modal/rename-confirm-modal';
import { EditPropertiesModal } from 'src/modal/edit-properties-modal';
import { CopyToClipboardConfirmModal } from 'src/modal/copy-to-clipboard-confirm-modal';
import { AddToCanvasConfirmModal } from 'src/modal/add-to-canvas-confirm-modal';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('node-fetch', () => ({
	default: fetchMock,
}));

type VaultStub = {
	trash: ReturnType<typeof vi.fn>;
};

function createApp() {
	const vault: VaultStub = {
		trash: vi.fn(),
	};

	return {
		vault,
		metadataCache: {
			resolvedLinks: {},
		},
		workspace: {
			getActiveFile: vi.fn(),
			getLeaf: vi.fn(() => ({ openFile: vi.fn() })),
			getActiveViewOfType: vi.fn(),
		},
		fileManager: {
			renameFile: vi.fn(),
			processFrontMatter: vi.fn(),
		},
	};
}

type SettingStatics = {
	instances: Array<{ buttons: Array<any> }>;
	reset: () => void;
};

function findButtons(settingIndex = 0) {
	const settingClass = Setting as unknown as SettingStatics;
	const setting = settingClass.instances[settingIndex];
	if (!setting) {
		throw new Error(`Setting instance not found at index ${settingIndex}`);
	}

	return setting.buttons;
}

function findButtonByText(text: string) {
	const settingClass = Setting as unknown as SettingStatics;
	for (const setting of settingClass.instances) {
		const found = setting.buttons.find((button: any) => button.buttonText === text);
		if (found) {
			return found;
		}
	}
	return undefined;
}

function findElementByText(root: any, text: string): boolean {
	if (root.text === text) {
		return true;
	}

	return root.children.some((child: any) => findElementByText(child, text));
}

describe('Modal UX / 危险确认类', () => {
	beforeEach(() => {
		(Setting as unknown as SettingStatics).reset();
		__resetNotices();
		fetchMock.mockReset();
	});

	it('2.1 删除弹窗应提供危险语义、主次按钮与确认/取消分支行为', async () => {
		const app = createApp();
		const files = [
			{ path: 'foo/a.md', name: 'a.md', parent: { path: 'foo' } },
			{ path: 'foo/b.md', name: 'b.md', parent: { path: 'foo' } },
		];
		const modal = new DeleteConfirmModal(app as never, files as any);

		await modal.onOpen();

		expect(findElementByText(modal.contentEl, '删除文件')).toBe(true);
		expect(findElementByText(modal.contentEl, '2 个文件将被永久删除。')).toBe(true);

		const buttons = findButtons(0);
		const confirm = buttons.find((btn: any) => btn.buttonText === '立即删除');
		const cancel = buttons.find((btn: any) => btn.buttonText === '取消');

		expect(confirm?.isWarning).toBe(true);
		expect(confirm?.isCta).toBe(true);
		expect(cancel?.isCta).toBe(false);

		await confirm?.click();
		expect(app.vault.trash).toHaveBeenCalledTimes(2);
		expect(__getNotices()).toContain('删除完成。');

		app.vault.trash.mockReset();
		__resetNotices();
		await cancel?.click();
		expect(app.vault.trash).not.toHaveBeenCalled();
		expect(__getNotices()).toContain('操作已取消。');
	});

	it('2.1 删除弹窗在空态时应安全关闭且不触发删除', async () => {
		const app = createApp();
		const modal = new DeleteConfirmModal(app as never, []);

		await modal.onOpen();

		expect(findElementByText(modal.contentEl, '没有可删除的文件。')).toBe(true);

		const closeButton = findButtons(0).find((btn: any) => btn.buttonText === '关闭');
		await closeButton?.click();

		expect((modal as any).closed).toBe(true);
		expect(app.vault.trash).not.toHaveBeenCalled();
	});
});

describe('Modal UX / 普通确认类', () => {
	beforeEach(() => {
		(Setting as unknown as SettingStatics).reset();
		__resetNotices();
		fetchMock.mockReset();
	});

	it('3.1 移动弹窗应展示统一摘要、可滚动列表与一致取消反馈', async () => {
		const app = createApp();
		const moveInfos = [
			{ sourceFile: { path: 'a.md', name: 'a.md' }, targetDir: 'folder-a' },
			{ sourceFile: { path: 'b.md', name: 'b.md' }, targetDir: 'folder-a' },
		];
		const modal = new MoveConfirmModal(app as never, moveInfos as any);

		modal.onOpen();

		expect(findElementByText(modal.contentEl, '移动或复制文件')).toBe(true);
		expect(findElementByText(modal.contentEl, '2 个文件将被处理。')).toBe(true);
		expect(findElementByText(modal.contentEl, '目标：folder-a')).toBe(true);
		expect(findElementByText(modal.contentEl, '受影响的文件')).toBe(true);
		expect(findElementByText(modal.contentEl, '#1')).toBe(true);
		expect(findElementByText(modal.contentEl, '复制而不是移动')).toBe(true);
		expect(Array.from(modal.contentEl.children).some((child: any) => child.cls === 'file-cooker-modal__list')).toBe(true);

		const buttons = findButtons(1);
		const cancel = buttons.find((btn: any) => btn.buttonText === '取消');
		await cancel?.click();
		expect(__getNotices()).toContain('操作已取消。');
	});

	it('3.1 创建/合并/同步弹窗应展示统一摘要并保持确认取消语义一致', async () => {
		const app = createApp();
		const infos = [
			{ sourceFile: { path: 'a.md', name: 'a.md' }, targetDir: 'target' },
			{ sourceFile: { path: 'b.md', name: 'b.md' }, targetDir: 'target' },
		];

		const createModal = new CreateConfirmModal(app as never, infos as any);
		createModal.onOpen();
		expect(findElementByText(createModal.contentEl, '创建文件')).toBe(true);
		expect(findElementByText(createModal.contentEl, '2 个文件将被创建。')).toBe(true);

		const mergeModal = new MergeConfirmModal(app as never, [{ path: 'foo/a.md', name: 'a.md' }] as any, 'merged.md');
		mergeModal.onOpen();
		expect(findElementByText(mergeModal.contentEl, '合并文件')).toBe(true);
		expect(findElementByText(mergeModal.contentEl, '目标：merged.md')).toBe(true);

		const plugin = {
			app: createApp(),
			settings: { flomoAPI: 'https://flomo.example' },
		};
		const syncModal = new SyncFlomoConfirmModal(plugin as any, [{ file: { path: 'foo/a.md' } }] as any);
		await syncModal.onOpen();
		expect(findElementByText(syncModal.contentEl, '同步到 flomo')).toBe(true);
		expect(findElementByText(syncModal.contentEl, '1 条内容将被同步。')).toBe(true);
	});
});

describe('Modal UX / 输入类', () => {
	beforeEach(() => {
		(Setting as unknown as SettingStatics).reset();
		__resetNotices();
		fetchMock.mockReset();
		(globalThis as any).localStorage = {
			getItem: vi.fn(() => null),
			setItem: vi.fn(),
		};
	});

	it('4.1 重命名输入弹窗在必填为空时应阻断执行并提示错误', async () => {
		const app = createApp();
		const files = [{ path: 'foo/a.md', name: 'a.md', parent: { path: 'foo' } }];
		const modal = new RenameModal(app as never, files as any);

		modal.onOpen();

		expect(findElementByText(modal.contentEl, '重命名文件')).toBe(true);
		expect(findElementByText(modal.contentEl, '前缀')).toBe(true);
		expect(findElementByText(modal.contentEl, '后缀')).toBe(true);
		const confirm = findButtonByText('继续');
		await confirm?.click();

		expect(__getNotices()).toContain('前缀或后缀不能同时为空。');
	});

	it('4.1 重命名二次确认弹窗应使用统一布局并可确认执行', async () => {
		const app = createApp();
		const files = [{ path: 'foo/a.md', name: 'a.md', parent: { path: 'foo' } }];
		const modal = new RenameConfirmModal(app as never, files as any, 'new-', '');

		modal.onOpen();

		expect(findElementByText(modal.contentEl, '重命名预览')).toBe(true);
		expect(findElementByText(modal.contentEl, '计划变更')).toBe(true);
		expect(findElementByText(modal.contentEl, 'a.md -> new-a.md')).toBe(true);

		const confirm = findButtonByText('应用重命名');
		await confirm?.click();
		expect(app.fileManager.renameFile).toHaveBeenCalledTimes(1);
	});

	it('4.1 属性编辑弹窗在必填为空时应提示并且取消不产生副作用', async () => {
		const app = createApp();
		const files = [{ path: 'foo/a.md', name: 'a.md', parent: { path: 'foo' } }];
		const modal = new EditPropertiesModal(app as never, files as any);

		modal.onOpen();
		expect(findElementByText(modal.contentEl, '编辑属性')).toBe(true);
		expect(findElementByText(modal.contentEl, '属性键')).toBe(true);
		expect(findElementByText(modal.contentEl, '属性值')).toBe(true);

		const confirm = findButtonByText('应用属性');
		await confirm?.click();
		expect(__getNotices()).toContain('属性键不能为空。');

		__resetNotices();
		const cancel = findButtonByText('取消');
		await cancel?.click();
		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
		expect(__getNotices()).toContain('操作已取消。');
	});
});

describe('Modal UX / Toggle 可见标签', () => {
	beforeEach(() => {
		(Setting as unknown as SettingStatics).reset();
		__resetNotices();
	});

	it('copy-to-clipboard 弹窗应显示 toggle 标签而非仅 tooltip', () => {
		const app = createApp();
		const files = [{ path: 'foo/a.md', name: 'a.md', parent: { path: 'foo' } }];
		const modal = new CopyToClipboardConfirmModal(app as never, files as any);

		modal.onOpen();

		expect(findElementByText(modal.contentEl, '仅复制文件名')).toBe(true);
	});

	it('add-to-canvas 弹窗应在两种模式下显示 toggle 标签', () => {
		const app = createApp();

		const contentModeModal = new AddToCanvasConfirmModal(
			app as never,
			[{ file: null, content: 'line-1\nline-2' }] as any,
			'board.canvas'
		);
		contentModeModal.onOpen();
		expect(findElementByText(contentModeModal.contentEl, '按行拆分内容')).toBe(true);

		const fileModeModal = new AddToCanvasConfirmModal(
			app as never,
			[{ file: { path: 'foo/a.md', name: 'a.md' }, content: '' }] as any,
			'board.canvas'
		);
		fileModeModal.onOpen();
		expect(findElementByText(fileModeModal.contentEl, '包含解析的链接')).toBe(true);
	});
});
