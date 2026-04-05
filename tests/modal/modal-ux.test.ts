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

		expect(findElementByText(modal.contentEl, 'Delete files')).toBe(true);
		expect(findElementByText(modal.contentEl, '2 files will be deleted permanently.')).toBe(true);

		const buttons = findButtons(0);
		const confirm = buttons.find((btn: any) => btn.buttonText === 'Delete now');
		const cancel = buttons.find((btn: any) => btn.buttonText === 'Cancel');

		expect(confirm?.isWarning).toBe(true);
		expect(confirm?.isCta).toBe(true);
		expect(cancel?.isCta).toBe(false);

		await confirm?.click();
		expect(app.vault.trash).toHaveBeenCalledTimes(2);
		expect(__getNotices()).toContain('Delete completed.');

		app.vault.trash.mockReset();
		__resetNotices();
		await cancel?.click();
		expect(app.vault.trash).not.toHaveBeenCalled();
		expect(__getNotices()).toContain('Operation canceled.');
	});

	it('2.1 删除弹窗在空态时应安全关闭且不触发删除', async () => {
		const app = createApp();
		const modal = new DeleteConfirmModal(app as never, []);

		await modal.onOpen();

		expect(findElementByText(modal.contentEl, 'No files to delete.')).toBe(true);

		const closeButton = findButtons(0).find((btn: any) => btn.buttonText === 'Close');
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

		expect(findElementByText(modal.contentEl, 'Move or copy files')).toBe(true);
		expect(findElementByText(modal.contentEl, '2 files will be processed.')).toBe(true);
		expect(findElementByText(modal.contentEl, 'Target: folder-a')).toBe(true);
		expect(findElementByText(modal.contentEl, 'Affected files')).toBe(true);
		expect(findElementByText(modal.contentEl, '#1')).toBe(true);
		expect(findElementByText(modal.contentEl, 'Copy instead of moving files')).toBe(true);
		expect(Array.from(modal.contentEl.children).some((child: any) => child.cls === 'file-cooker-modal__list')).toBe(true);

		const buttons = findButtons(1);
		const cancel = buttons.find((btn: any) => btn.buttonText === 'Cancel');
		await cancel?.click();
		expect(__getNotices()).toContain('Operation canceled.');
	});

	it('3.1 创建/合并/同步弹窗应展示统一摘要并保持确认取消语义一致', async () => {
		const app = createApp();
		const infos = [
			{ sourceFile: { path: 'a.md', name: 'a.md' }, targetDir: 'target' },
			{ sourceFile: { path: 'b.md', name: 'b.md' }, targetDir: 'target' },
		];

		const createModal = new CreateConfirmModal(app as never, infos as any);
		createModal.onOpen();
		expect(findElementByText(createModal.contentEl, 'Create files')).toBe(true);
		expect(findElementByText(createModal.contentEl, '2 files will be created.')).toBe(true);

		const mergeModal = new MergeConfirmModal(app as never, [{ path: 'foo/a.md', name: 'a.md' }] as any, 'merged.md');
		mergeModal.onOpen();
		expect(findElementByText(mergeModal.contentEl, 'Merge files')).toBe(true);
		expect(findElementByText(mergeModal.contentEl, 'Target: merged.md')).toBe(true);

		const plugin = {
			app: createApp(),
			settings: { flomoAPI: 'https://flomo.example' },
		};
		const syncModal = new SyncFlomoConfirmModal(plugin as any, [{ file: { path: 'foo/a.md' } }] as any);
		await syncModal.onOpen();
		expect(findElementByText(syncModal.contentEl, 'Sync to flomo')).toBe(true);
		expect(findElementByText(syncModal.contentEl, '1 items will be synced.')).toBe(true);
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

		expect(findElementByText(modal.contentEl, 'Rename files')).toBe(true);
		expect(findElementByText(modal.contentEl, 'Prefix')).toBe(true);
		expect(findElementByText(modal.contentEl, 'Suffix')).toBe(true);
		const confirm = findButtonByText('Continue');
		await confirm?.click();

		expect(__getNotices()).toContain('Prefix or suffix is required.');
	});

	it('4.1 属性编辑弹窗在必填为空时应提示并且取消不产生副作用', async () => {
		const app = createApp();
		const files = [{ path: 'foo/a.md', name: 'a.md', parent: { path: 'foo' } }];
		const modal = new EditPropertiesModal(app as never, files as any);

		modal.onOpen();
		expect(findElementByText(modal.contentEl, 'Edit properties')).toBe(true);
		expect(findElementByText(modal.contentEl, 'Property Key')).toBe(true);
		expect(findElementByText(modal.contentEl, 'Property Value')).toBe(true);

		const confirm = findButtonByText('Apply properties');
		await confirm?.click();
		expect(__getNotices()).toContain('Property key is required.');

		__resetNotices();
		const cancel = findButtonByText('Cancel');
		await cancel?.click();
		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
		expect(__getNotices()).toContain('Operation canceled.');
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

		expect(findElementByText(modal.contentEl, 'Copy file names only')).toBe(true);
	});

	it('add-to-canvas 弹窗应在两种模式下显示 toggle 标签', () => {
		const app = createApp();

		const contentModeModal = new AddToCanvasConfirmModal(
			app as never,
			[{ file: null, content: 'line-1\nline-2' }] as any,
			'board.canvas'
		);
		contentModeModal.onOpen();
		expect(findElementByText(contentModeModal.contentEl, 'Split content by line')).toBe(true);

		const fileModeModal = new AddToCanvasConfirmModal(
			app as never,
			[{ file: { path: 'foo/a.md', name: 'a.md' }, content: '' }] as any,
			'board.canvas'
		);
		fileModeModal.onOpen();
		expect(findElementByText(fileModeModal.contentEl, 'Include resolved links')).toBe(true);
	});
});
