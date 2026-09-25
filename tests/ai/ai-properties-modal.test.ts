import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
	return await import('../mocks/obsidian');
});

import { Setting } from 'obsidian';
import type { TFile } from 'obsidian';
import { __getNotices, __resetNotices } from '../mocks/obsidian';
import { createAppMock } from '../mocks/vault-mock';
import { DEFAULT_BACKUP_SETTINGS } from 'src/backup/backup-settings';
import { __resetBackupForTest, initBackup } from 'src/backup/backup-service';
import { DEFAULT_AI_SETTINGS } from 'src/ai/ai-settings';
import { AiPropertiesModal, mergeListValue, resolveScalarWrite } from 'src/modal/ai-properties-modal';

/**
 * 测试目的：验证 AI 属性提案弹窗的勾选/编辑/应用语义与推断进度-取消行为。
 * 测试内容：默认全选、部分勾选应用集合、提案值编辑、全不选零写入、
 *          多值追加去重、标量 Override 语义、无效提案过滤、推断中取消。
 * 预期结果：应用仅覆盖勾选行且按编辑值写入；取消/全不选零写入；备份记录生成。
 */

const inferOptions = {
	inferTags: true,
	inferAliases: true,
	customProps: ['status'],
	tagLanguage: 'auto' as const,
};

function makeDeps(provider: { chatJson: ReturnType<typeof vi.fn> }) {
	return {
		settings: { ...DEFAULT_AI_SETTINGS, batchSize: 1, concurrency: 1 },
		provider,
		vocabulary: ['读书'],
		inferOptions,
	};
}

function createAppWithFrontmatter(frontmatters: Record<string, Record<string, unknown>>) {
	const app = createAppMock({
		'a.md': '---\nstatus: done\n---\nbody a',
		'b.md': 'body b',
	});
	(app.metadataCache as any).getFileCache = (file: TFile) => {
		const fm = frontmatters[file.path];
		return fm ? { frontmatter: fm } : null;
	};
	return app;
}

/**
 * 构造仅含路径信息的文件桩：运行时为普通对象（满足 Modal 对 path/name 的读取），
 * 编译期断言为 TFile（真实 Obsidian 类型不允许外部构造）。
 */
function mdFile(path: string): TFile {
	return { path, name: path.split('/').pop() ?? path, parent: null } as unknown as TFile;
}

/** 等待弹窗进入提案态（推断为异步流程）。 */
async function waitForProposing(modal: AiPropertiesModal) {
	await vi.waitFor(() => {
		if (modal.phase !== 'proposing') {
			throw new Error('still analyzing');
		}
	});
}

beforeEach(() => {
	(Setting as unknown as { reset(): void }).reset();
	__resetNotices();
	__resetBackupForTest();
	(globalThis as any).localStorage = {
		getItem: vi.fn(() => null),
		setItem: vi.fn(),
	};
});

describe('AiPropertiesModal 提案审核', () => {

	it('推断完成后进入提案态，且默认全选', async () => {
		const app = createAppWithFrontmatter({ 'a.md': { status: 'done' } });
		initBackup(app as never, DEFAULT_BACKUP_SETTINGS);
		const provider = {
			chatJson: vi.fn(async () => ({
				results: [
					{ path: 'a.md', props: { tags: ['读书'] } },
					{ path: 'b.md', props: { tags: ['work'] } },
				],
			})),
		};
		const modal = new AiPropertiesModal(app as never, [mdFile('a.md'), mdFile('b.md')], makeDeps(provider));
		modal.open();

		await waitForProposing(modal);
		expect(modal.getSelectedPaths().sort()).toEqual(['a.md', 'b.md']);
	});

	it('取消部分勾选后应用，仅勾选行被写入', async () => {
		const app = createAppWithFrontmatter({});
		initBackup(app as never, DEFAULT_BACKUP_SETTINGS);
		const processFrontMatter = vi.fn(async (_f: unknown, fn: (p: Record<string, unknown>) => void) => fn({}));
		(app.fileManager as any).processFrontMatter = processFrontMatter;
		const provider = {
			chatJson: vi.fn(async () => ({
				results: [
					{ path: 'a.md', props: { tags: ['读书'] } },
					{ path: 'b.md', props: { tags: ['work'] } },
				],
			})),
		};
		const modal = new AiPropertiesModal(app as never, [mdFile('a.md'), mdFile('b.md')], makeDeps(provider));
		modal.open();
		await waitForProposing(modal);

		modal.setSelected('b.md', false);
		const summary = await modal.applySelected();

		expect(summary.applied).toBe(1);
		// 仅 a.md 被写入
		expect(processFrontMatter).toHaveBeenCalledTimes(1);
		expect((processFrontMatter.mock.calls[0][0] as { path: string }).path).toBe('a.md');
	});

	it('编辑提案值后按编辑值写入', async () => {
		const app = createAppWithFrontmatter({});
		initBackup(app as never, DEFAULT_BACKUP_SETTINGS);
		let captured: Record<string, unknown> = {};
		const processFrontMatter = vi.fn(async (_f: unknown, fn: (p: Record<string, unknown>) => void) => {
			const props: Record<string, unknown> = {};
			fn(props);
			captured = props;
		});
		(app.fileManager as any).processFrontMatter = processFrontMatter;
		const provider = {
			chatJson: vi.fn(async () => ({ results: [{ path: 'a.md', props: { tags: ['原始'] } }] })),
		};
		const modal = new AiPropertiesModal(app as never, [mdFile('a.md')], makeDeps(provider));
		modal.open();
		await waitForProposing(modal);

		modal.setPropValue('a.md', 'tags', 'x,y');
		await modal.applySelected();

		expect(captured['tags']).toEqual(['x', 'y']);
	});

	it('全部取消勾选时应用零写入', async () => {
		const app = createAppWithFrontmatter({});
		initBackup(app as never, DEFAULT_BACKUP_SETTINGS);
		const processFrontMatter = vi.fn();
		(app.fileManager as any).processFrontMatter = processFrontMatter;
		const provider = {
			chatJson: vi.fn(async () => ({ results: [{ path: 'a.md', props: { tags: ['读书'] } }] })),
		};
		const modal = new AiPropertiesModal(app as never, [mdFile('a.md')], makeDeps(provider));
		modal.open();
		await waitForProposing(modal);

		modal.setSelected('a.md', false);
		const summary = await modal.applySelected();

		expect(summary.applied).toBe(0);
		expect(processFrontMatter).not.toHaveBeenCalled();
	});

	it('推断中取消：未完成批次不再执行，零写入', async () => {
		const app = createAppWithFrontmatter({});
		initBackup(app as never, DEFAULT_BACKUP_SETTINGS);
		const processFrontMatter = vi.fn();
		(app.fileManager as any).processFrontMatter = processFrontMatter;
		// 两个文件两个批次（batchSize=1），首批挂起等待放行
		let releaseFirst!: () => void;
		const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
		let calls = 0;
		const provider = {
			chatJson: vi.fn(async () => {
				calls++;
				if (calls === 1) {
					await gate;
					return { results: [{ path: 'a.md', props: { tags: ['slow'] } }] };
				}
				return { results: [{ path: 'b.md', props: { tags: ['fast'] } }] };
			}),
		};
		const modal = new AiPropertiesModal(app as never, [mdFile('a.md'), mdFile('b.md')], makeDeps(provider));
		modal.open();
		// 等首批发出后取消（并发 1，第二批尚未领取）
		await vi.waitFor(() => expect(provider.chatJson).toHaveBeenCalledTimes(1));
		modal.cancelInference();
		releaseFirst();

		// 取消语义：丢弃全部结果并关闭弹窗（零写入）
		await vi.waitFor(() => expect((modal as unknown as { closed: boolean }).closed).toBe(true));
		expect(modal.proposals).toHaveLength(0);
		expect(modal.getSelectedPaths()).toEqual([]);

		const summary = await modal.applySelected();
		expect(summary.applied).toBe(0);
		expect(processFrontMatter).not.toHaveBeenCalled();
	});

	it('全部批次失败时保留弹窗展示错误，不自动关闭，零写入', async () => {
		const app = createAppWithFrontmatter({});
		initBackup(app as never, DEFAULT_BACKUP_SETTINGS);
		const processFrontMatter = vi.fn();
		(app.fileManager as any).processFrontMatter = processFrontMatter;
		const provider = {
			chatJson: vi.fn(async () => {
				throw new Error('AI 401: invalid api key');
			}),
		};
		const modal = new AiPropertiesModal(app as never, [mdFile('a.md')], makeDeps(provider));
		modal.open();

		await vi.waitFor(() => expect(modal.phase).toBe('error'));
		// 弹窗保持打开（不闪退），错误详情可见
		expect((modal as unknown as { closed: boolean }).closed).toBe(false);
		expect(modal.proposals).toHaveLength(0);
		// 错误详情写入弹窗内容（含真实原因 401）
		const text = JSON.stringify((modal as unknown as { contentEl: { text: string } }).contentEl);
		expect(text).toContain('401');
		// 失败态下应用零写入
		await modal.applySelected();
		expect(processFrontMatter).not.toHaveBeenCalled();
	});

	it('全选/清空快捷操作切换所有勾选', async () => {
		const app = createAppWithFrontmatter({});
		initBackup(app as never, DEFAULT_BACKUP_SETTINGS);
		const provider = {
			chatJson: vi.fn(async () => ({
				results: [
					{ path: 'a.md', props: { tags: ['x'] } },
					{ path: 'b.md', props: { tags: ['y'] } },
				],
			})),
		};
		const modal = new AiPropertiesModal(app as never, [mdFile('a.md'), mdFile('b.md')], makeDeps(provider));
		modal.open();
		await waitForProposing(modal);

		modal.selectAll(false);
		expect(modal.getSelectedPaths()).toEqual([]);
		modal.selectAll(true);
		expect(modal.getSelectedPaths().sort()).toEqual(['a.md', 'b.md']);
	});
});

describe('提案写入语义（纯函数）', () => {

	it('多值属性追加合入并去重（大小写不敏感）', () => {
		expect(mergeListValue(['a', 'Old'], ['b', 'old', 'A'])).toEqual(['a', 'Old', 'b']);
		expect(mergeListValue(undefined, ['x'])).toEqual(['x']);
	});

	it('标量属性存在且 Override 关闭时跳过，开启时覆盖', () => {
		expect(resolveScalarWrite('done', 'doing', false)).toBe('skip');
		expect(resolveScalarWrite('done', 'doing', true)).toBe('write');
		expect(resolveScalarWrite(undefined, 'doing', false)).toBe('write');
	});

	it('与现有值完全相同的提案被过滤，不产生无意义写入', async () => {
		const app = createAppWithFrontmatter({ 'a.md': { status: 'done' } });
		initBackup(app as never, DEFAULT_BACKUP_SETTINGS);
		const processFrontMatter = vi.fn();
		(app.fileManager as any).processFrontMatter = processFrontMatter;
		const provider = {
			chatJson: vi.fn(async () => ({
				results: [
					{ path: 'a.md', props: { status: 'done', tags: ['new'] } },
				],
			})),
		};
		const modal = new AiPropertiesModal(app as never, [mdFile('a.md')], makeDeps(provider));
		modal.open();
		await waitForProposing(modal);

		// status 与现有值相同 → 不出现在提案中；tags 是新值 → 保留
		expect(modal.proposals[0].props['status']).toBeUndefined();
		expect(modal.proposals[0].props['tags']).toEqual(['new']);
	});
});
