import { App, Modal, Notice, TAbstractFile, TFile } from 'obsidian';
import { t } from 'src/i18n/index';
import { getBackup } from 'src/backup/backup-service';
import { AiSettings } from 'src/ai/ai-settings';
import { ChatMessage } from 'src/ai/ai-provider';
import {
	buildInferPrompts,
	InferFileContext,
	InferOptions,
	parseInferResponse,
	PropertyProposal,
} from 'src/ai/prop-infer';
import { runBatches } from 'src/ai/batch';
import { addModalActions, parseScalarInput, renderModalLayout } from './modal-ui';

/** 进度元素兼容类型：真实 Obsidian 元素有 setText，测试环境元素仅写 text 属性。 */
type ProgressElement = { setText?(text: string): void; text?: string };

/** 兼容写入元素文本（真实环境 setText，测试环境写 text 属性）。 */
function setElText(el: ProgressElement, text: string): void {
	if (typeof el.setText === 'function') {
		el.setText(text);
	} else {
		el.text = text;
	}
}

/**
 * AI 属性提案弹窗：推断进度态 → 提案审核态 → 应用。
 *
 * 职责说明：
 * - 进度态：按批次调用 AI 推断（runBatches 调度，可取消，取消后剩余批次不再发出）；
 * - 提案态：逐文件展示提案，行级勾选（默认全选）与提案值编辑；
 * - 应用：仅写勾选行，多值属性追加合入、标量属性默认不覆盖（Override 开关），
 *   写入走 processFrontMatter 并接入备份通道（begin/snapshot/finish/abort）；
 * - 取消（任意阶段）零写入。
 */

/** 提案条目：文件 + 可编辑的属性提案值。 */
export interface AiProposalEntry {
	file: TAbstractFile;
	props: Record<string, unknown>;
}

/** AI 客户端最小接口（便于测试注入假 provider）。 */
export interface AiProviderLike {
	chatJson(messages: ChatMessage[]): Promise<unknown>;
}

/** 弹窗依赖（设置、客户端、词表、推断选项）。 */
export interface AiModalDeps {
	settings: AiSettings;
	provider: AiProviderLike;
	vocabulary: string[];
	inferOptions: InferOptions;
}

/** 应用结果汇总。 */
export interface AiApplySummary {
	applied: number;
	skipped: number;
	failed: string[];
}

type ModalPhase = 'analyzing' | 'proposing' | 'error';

/**
 * 多值属性追加合入：保留现有值，追加新值并去重（按小写形式去重，保留首个原始值）。
 * 现有值为字符串时先按逗号拆分（对齐 EditPropertiesModal 行为）。
 */
export function mergeListValue(existing: unknown, additions: string[]): string[] {
	let base: string[] = [];
	if (typeof existing === 'string') {
		base = existing.split(',');
	} else if (Array.isArray(existing)) {
		base = existing.map((item) => String(item));
	}
	const merged: string[] = [];
	const seen = new Set<string>();
	const push = (raw: string) => {
		const value = String(raw ?? '').trim();
		if (value === '') {
			return;
		}
		const key = value.toLowerCase();
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		merged.push(value);
	};
	base.forEach(push);
	additions.forEach(push);
	return merged;
}

/**
 * 标量属性写入判定：属性不存在时写入；已存在时仅 Override 开启才覆盖，否则跳过。
 */
export function resolveScalarWrite(existing: unknown, _proposed: unknown, override: boolean): 'write' | 'skip' {
	if (existing === undefined || existing === null) {
		return 'write';
	}
	return override ? 'write' : 'skip';
}

export class AiPropertiesModal extends Modal {
	phase: ModalPhase = 'analyzing';
	proposals: AiProposalEntry[] = [];

	private readonly files: TAbstractFile[];
	private readonly deps: AiModalDeps;
	private readonly selected = new Map<string, boolean>();
	private readonly edited = new Map<string, Record<string, unknown>>();
	private cancelRequested = false;
	private progressEl: ProgressElement | null = null;

	constructor(app: App, files: TAbstractFile[], deps: AiModalDeps) {
		super(app);
		this.files = files;
		this.deps = deps;
	}

	onOpen(): void {
		this.renderAnalyzing();
		// 异步推断不阻塞弹窗打开；完成后切换提案态
		void this.runInference();
	}

	close(): void {
		// 关闭弹窗即取消：未完成的批次不再发出
		this.cancelRequested = true;
		super.close();
	}

	/** 取消推断：剩余批次不再发出，已完成批次的结果保留但可零写入退出。 */
	cancelInference(): void {
		this.cancelRequested = true;
	}

	/** 勾选/取消勾选某文件提案（默认全选）。 */
	setSelected(path: string, value: boolean): void {
		this.selected.set(path, value);
	}

	/** 当前勾选的文件路径集合。 */
	getSelectedPaths(): string[] {
		return this.proposals
			.filter((entry) => this.selected.get(entry.file.path) === true)
			.map((entry) => entry.file.path);
	}

	/** 编辑提案值：tags/aliases 以逗号分隔，标量覆盖时 true/false 解析为布尔值。 */
	setPropValue(path: string, key: string, value: string): void {
		const entry = this.proposals.find((item) => item.file.path === path);
		if (entry == null) {
			return;
		}
		const edited = this.edited.get(path) ?? { ...entry.props };
		if (key === 'tags' || key === 'aliases') {
			edited[key] = value.split(',').map((item) => item.trim()).filter((item) => item !== '');
		} else {
			edited[key] = parseScalarInput(value);
		}
		this.edited.set(path, edited);
	}

	/**
	 * 应用勾选提案：备份快照 → 逐文件 processFrontMatter → 汇总通知。
	 * 全不选时零写入直接返回。
	 */
	async applySelected(): Promise<AiApplySummary> {
		const targets = this.proposals.filter((entry) => this.selected.get(entry.file.path) === true);
		const summary: AiApplySummary = { applied: 0, skipped: 0, failed: [] };
		if (targets.length === 0) {
			this.close();
			return summary;
		}

		this.close();
		const override = this.readOverrideFlag();
		const recorder = getBackup().begin('ai-properties', t('AI 属性补全'));
		try {
			for (const entry of targets) {
				const props = this.edited.get(entry.file.path) ?? entry.props;
				try {
					const file = entry.file as TFile;
					await recorder.snapshotContentBefore(file);
					await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
						Object.keys(props).forEach((key) => {
							const proposed = props[key];
							if (key === 'tags' || key === 'aliases' || key === 'cssclasses') {
								const additions = Array.isArray(proposed) ? proposed.map(String) : String(proposed).split(',');
								frontmatter[key] = mergeListValue(frontmatter[key], additions);
							} else if (resolveScalarWrite(frontmatter[key], proposed, override) === 'write') {
								frontmatter[key] = proposed;
							} else {
								summary.skipped++;
							}
						});
					});
					summary.applied++;
				} catch (e) {
					// 单文件失败不拖垮整批，路径在完成通知中可见
					summary.failed.push(entry.file.path);
					new Notice(t('写入失败 {path}：{msg}', { path: entry.file.path, msg: (e as Error).message }));
				}
			}
			await recorder.finish();
		} catch (e) {
			recorder.abort();
			new Notice(t('AI 属性应用失败：{msg}', { msg: (e as Error).message }));
			return summary;
		}

		const parts = [t('成功 {n}', { n: summary.applied })];
		if (summary.skipped > 0) {
			parts.push(t('跳过 {n}', { n: summary.skipped }));
		}
		if (summary.failed.length > 0) {
			parts.push(t('失败 {n}（{detail}）', { n: summary.failed.length, detail: summary.failed.join(', ') }));
		}
		new Notice(t('AI 属性已更新：{detail}。可在备份历史中回滚。', { detail: parts.join(', ') }));
		return summary;
	}

	/** 进度态渲染：说明 + 进度文本 + 取消按钮。 */
	private renderAnalyzing(): void {
		renderModalLayout(this.contentEl, {
			title: t('AI 补全属性'),
			description: t('正在按内容推断属性，完成后进入审核。'),
			summaryLines: [
				t('将发送给 AI：每篇笔记的文件名 + 前 {n} 字符。', { n: this.deps.settings.contextChars }),
			],
			variant: 'confirm',
		});
		this.progressEl = this.contentEl.createDiv({ text: t('正在分析文件 ... {done}/{total}', { done: 0, total: this.files.length }), cls: 'file-cooker-modal__summary-line' });

		addModalActions(this.contentEl, [
			{
				text: t('取消'),
				onClick: () => {
					this.cancelRequested = true;
					this.close();
					new Notice(t('已取消，未写入任何文件。'));
				},
			},
		]);
	}

	/** 推断入口：意外异常兑底渲染错误态（onOpen 为 fire-and-forget，外部无法捕获拒绝）。 */
	private async runInference(): Promise<void> {
		try {
			await this.runInferenceFlow();
		} catch (e) {
			this.renderErrorState([e instanceof Error ? e.message : String(e)], [], t('推断失败'));
		}
	}

	/** 执行推断：构建上下文 → 分批调用 → 解析回配 → 过滤无效提案。 */
	private async runInferenceFlow(): Promise<void> {
		const contexts = await this.buildContexts();
		const { settings, provider, vocabulary, inferOptions } = this.deps;
		let done = 0;
		const total = contexts.length;

		const result = await runBatches<InferFileContext, PropertyProposal>(
			contexts,
			settings.batchSize,
			settings.concurrency,
			async (batch) => {
				const { messages } = buildInferPrompts(batch, vocabulary, settings, inferOptions);
				const raw = await provider.chatJson(messages);
				done += batch.length;
				const progress = this.progressEl;
				if (progress != null) {
					setElText(progress, t('正在分析文件 ... {done}/{total}', { done, total }));
				}
				return parseInferResponse(raw, batch);
			},
			() => this.cancelRequested,
		);

		// 取消（按钮或程序化）：丢弃全部结果，零写入
		if (this.cancelRequested) {
			this.close();
			new Notice(t('已取消，未写入任何文件。'));
			return;
		}

		// 全部批次失败：保留弹窗展示真实错误，不自动关闭
		if (result.ok.length === 0) {
			this.renderErrorState(result.errors, result.failed.map((context) => context.path));
			return;
		}

		// 推断结果回配文件并过滤"与现有值相同"的无差异提案
		const byPath = new Map(contexts.map((context) => [context.path, context]));
		this.proposals = [];
		let noOpCount = 0;
		// ok 已按项扁平：每个元素是一篇笔记的提案
		result.ok.forEach((proposal) => {
			const file = this.files.find((f) => f.path === proposal.path);
			const context = byPath.get(proposal.path);
			if (file == null || context == null) {
				return;
			}
			const filtered = this.dropNoOpProps(proposal.props, context);
			if (Object.keys(filtered).length === 0) {
				noOpCount++;
				return;
			}
			this.proposals.push({ file, props: filtered });
			this.selected.set(file.path, true);
		});

		const failedPaths = result.failed.map((context) => context.path);
		if (this.proposals.length === 0) {
			this.renderErrorState(
				result.errors.length > 0
					? result.errors
					: [
						noOpCount > 0
							? t('没有产生有效提案：{n} 篇笔记的提案与现有属性完全相同，已跳过（这些笔记可能已经应用过提案，重复运行不会重复写入）。', { n: noOpCount })
							: t('没有产生有效提案：模型未给出任何建议。可尝试更换模型或调整笔记内容后重试。'),
					],
				failedPaths,
				t('无可应用的提案'),
			);
			return;
		}
		if (failedPaths.length > 0) {
			new Notice(t('部分批次推断失败：{n} 个文件未参与提案', { n: failedPaths.length }));
		}
		if (noOpCount > 0) {
			new Notice(t('{n} 篇笔记的提案与现有属性相同，已跳过', { n: noOpCount }));
		}

		this.phase = 'proposing';
		this.renderProposing();
	}

	/** 构建逐文件推断上下文：标题取文件名，正文 cachedRead，existing 取 frontmatter。 */
	private async buildContexts(): Promise<InferFileContext[]> {
		const contexts: InferFileContext[] = [];
		for (const file of this.files) {
			let content = '';
			try {
				content = await this.app.vault.cachedRead(file as TFile);
			} catch (e) {
				content = '';
			}
			const cache = (this.app.metadataCache as unknown as {
				getFileCache?: (f: TFile) => { frontmatter?: Record<string, unknown> } | null;
			}).getFileCache?.(file as TFile);
			const frontmatter = cache?.frontmatter ?? {};
			contexts.push({
				path: file.path,
				title: file.name.replace(/\.[^.]+$/, ''),
				content,
				existing: {
					tags: Array.isArray(frontmatter['tags']) ? frontmatter['tags'].map(String) : undefined,
					aliases: Array.isArray(frontmatter['aliases']) ? frontmatter['aliases'].map(String) : undefined,
				},
				// 全量 frontmatter 仅用于本地无差异过滤，不随 prompt 发送
				frontmatter,
			});
		}
		return contexts;
	}

	/** 过滤与现有值完全相同的提案（无差异不写入）。 */
	private dropNoOpProps(props: Record<string, unknown>, context: InferFileContext): Record<string, unknown> {
		const existingFm = context.frontmatter ?? {};
		const result: Record<string, unknown> = {};
		Object.keys(props).forEach((key) => {
			const proposed = props[key];
			if (key === 'tags' && Array.isArray(proposed)) {
				const current = context.existing.tags ?? [];
				const isSubset = proposed.every((tag) => current.some((item) => item.toLowerCase() === String(tag).toLowerCase()));
				if (!isSubset) {
					result[key] = proposed;
				}
				return;
			}
			if (key === 'aliases' && Array.isArray(proposed)) {
				const current = context.existing.aliases ?? [];
				const isSubset = proposed.every((alias) => current.includes(String(alias)));
				if (!isSubset) {
					result[key] = proposed;
				}
				return;
			}
			// 标量/其他属性：与现有 frontmatter 完全相同则跳过
			if (existingFm[key] !== proposed) {
				result[key] = proposed;
			}
		});
		return result;
	}

	/** 失败/空结果态：停在弹窗内展示真实错误，不自动关闭，用户可阅读后手动关闭。 */
	private renderErrorState(errors: string[], failedPaths: string[], title = t('AI 推断失败')): void {
		this.phase = 'error';
		this.contentEl.empty();

		const uniqueErrors = [...new Set(errors)];
		const errorLines = uniqueErrors.slice(0, 3).map((message) => `· ${message}`);
		if (uniqueErrors.length > 3) {
			errorLines.push(t('· ...等 {n} 种错误', { n: uniqueErrors.length }));
		}
		if (failedPaths.length > 0) {
			errorLines.push(t('受影响文件 {n} 个：{paths}', { n: failedPaths.length, paths: failedPaths.slice(0, 3).join(', ') }) + (failedPaths.length > 3 ? ' ...' : ''));
		}

		renderModalLayout(this.contentEl, {
			title,
			description: t('未写入任何文件。以下为具体原因，可据此检查后重试。'),
			summaryLines: errorLines,
			variant: 'danger',
		});

		addModalActions(this.contentEl, [
			{
				text: t('关闭'),
				onClick: () => this.close(),
			},
		]);
	}

	/** 提案态渲染：卡片式列表（勾选 + 文件名 + 可编辑属性值） + 应用/取消。 */
	private renderProposing(): void {
		this.contentEl.empty();
		renderModalLayout(this.contentEl, {
			title: t('AI 补全属性'),
			description: t('点击卡片头部勾选/取消；属性值可直接编辑，多值属性用逗号分隔。'),
			summaryLines: [
				t('已选中 {files} 个文件，推断后生成 {proposals} 条提案。', { files: this.files.length, proposals: this.proposals.length }),
				t('已发送给 AI：每篇笔记的文件名 + 前 {n} 字符。', { n: this.deps.settings.contextChars }),
			],
			variant: 'confirm',
		});

		// 工具栏：已选统计 + 全选/清空快捷操作
		const toolbar = this.contentEl.createDiv({ cls: 'fc-ai-toolbar' });
		const statsEl = toolbar.createSpan({ cls: 'fc-ai-toolbar__stats' });
		const syncStats = () => {
			setElText(statsEl, t('已选 {n} / {total}', { n: this.getSelectedPaths().length, total: this.proposals.length }));
		};
		const selectAllBtn = toolbar.createSpan({ text: t('全选'), cls: 'fc-ai-toolbar__btn' });
		selectAllBtn.addEventListener('click', () => {
			this.selectAll(true);
			syncStats();
			this.refreshCardStates();
		});
		const clearBtn = toolbar.createSpan({ text: t('清空'), cls: 'fc-ai-toolbar__btn' });
		clearBtn.addEventListener('click', () => {
			this.selectAll(false);
			syncStats();
			this.refreshCardStates();
		});

		// 卡片列表（复用滚动容器样式）
		const listEl = this.contentEl.createDiv({ cls: 'file-cooker-modal__list fc-ai-list' });
		this.proposals.forEach((entry) => {
			this.renderProposalCard(listEl, entry, syncStats);
		});
		syncStats();

		addModalActions(this.contentEl, [
			{
				text: t('应用选中的提案'),
				cta: true,
				onClick: () => {
					void this.applySelected();
				},
			},
			{
				text: t('取消'),
				onClick: () => {
					this.close();
					new Notice(t('已取消，未写入任何文件。'));
				},
			},
		]);
	}

	/** 渲染单个提案卡片：头部（勾选 + 文件名 + 目录）+ 属性编辑行。 */
	private renderProposalCard(listEl: HTMLElement, entry: AiProposalEntry, syncStats: () => void): void {
		const path = entry.file.path;
		const segments = path.split('/');
		const name = segments.pop() ?? path;
		const folder = segments.join('/');

		const card = listEl.createDiv({ cls: 'fc-ai-card' });
		const head = card.createDiv({ cls: 'fc-ai-card__head' });
		const check = head.createEl('input');
		(check as HTMLInputElement).type = 'checkbox';
		(check as HTMLInputElement).checked = this.selected.get(path) === true;
		(check as HTMLInputElement).addClass?.('fc-ai-card__check');

		const meta = head.createDiv({ cls: 'fc-ai-card__meta' });
		meta.createDiv({ text: name, cls: 'fc-ai-card__name' });
		if (folder !== '') {
			meta.createDiv({ text: folder, cls: 'fc-ai-card__folder' });
		}

		const syncCard = () => {
			const off = this.selected.get(path) !== true;
			(check as HTMLInputElement).checked = !off;
			(card as unknown as { toggleClass?: (cls: string, on: boolean) => void }).toggleClass?.('fc-ai-card--off', off);
		};
		syncCard();

		const toggle = () => {
			this.setSelected(path, this.selected.get(path) !== true);
			syncCard();
			syncStats();
		};
		check.addEventListener('click', (evt) => {
			// 点击复选框本身时不重复触发头部的翻转
			evt?.stopPropagation?.();
		});
		head.addEventListener('click', toggle);

		// 属性编辑行：标签 + 输入框（多值逗号分隔；标量直接编辑）
		const propsEl = card.createDiv({ cls: 'fc-ai-card__props' });
		const effective = this.edited.get(path) ?? entry.props;
		Object.keys(effective).forEach((key) => {
			propsEl.createDiv({ text: key, cls: 'fc-ai-card__key' });
			const value = effective[key];
			const display = Array.isArray(value) ? value.join(', ') : String(value);
			const input = propsEl.createEl('input');
			(input as HTMLInputElement).type = 'text';
			(input as HTMLInputElement).value = display;
			(input as HTMLInputElement).addClass?.('fc-ai-card__input');
			input.addEventListener('input', () => {
				this.setPropValue(path, key, (input as HTMLInputElement).value);
			});
		});
	}

	/** 工具栏全选/清空后刷新卡片与统计的勾选态（编辑值已存于 edited，重渲染不丢失）。 */
	private refreshCardStates(): void {
		if (this.phase === 'proposing') {
			this.renderProposing();
		}
	}

	/** 全选/清空所有提案。 */
	selectAll(selected: boolean): void {
		this.proposals.forEach((entry) => this.setSelected(entry.file.path, selected));
	}

	/** 读取 Override 开关（与 EditPropertiesModal 一致，存于 localStorage）。 */
	private readOverrideFlag(): boolean {
		try {
			return localStorage.getItem('overrideFlag') === 'true';
		} catch (e) {
			return false;
		}
	}
}
