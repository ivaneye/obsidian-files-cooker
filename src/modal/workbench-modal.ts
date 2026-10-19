import { App, Modal, Notice, Platform, TAbstractFile, TFile } from 'obsidian';
import { t } from 'src/i18n/index';
import { CompiledQuery, IrCondition, QueryIR, QueryTarget } from 'src/ai/query-ir';
import { compileDql } from 'src/ai/compile-dql';
import { compileSearch } from 'src/ai/compile-search';
import { compileBases } from 'src/ai/compile-bases';
import { getAvailableTargets, recommendTarget, CaptureAction } from 'src/ai/query-executor';
import { ScriptImportModal } from 'src/modal/script-import-modal';
import { extractDataviewBlocks, extractQueryBlocks } from 'src/utils/script-extract';
import { lintBases, lintDql, lintSearch, LintIssue } from 'src/validation/query-lint';
import { ActionModel } from 'src/action/action';
import { EditPropertiesAction } from 'src/action/edit-properties-action';
import { DeleteAction } from 'src/action/delete-action';
import { RenameAction } from 'src/action/rename-action';
import { MoveAction } from 'src/action/move-action';
import { ChooseFolderModal } from 'src/modal/choose-folder-modal';
import { ChooseFileModal } from 'src/modal/choose-file-modal';
import { ChooseCanvasModal } from 'src/modal/choose-canvas-modal';
import { AiPropertiesAction } from 'src/action/ai-properties-action';
import { SearchResultsReader } from 'src/reader/search-results-reader';
import { ClipboardReader } from 'src/reader/clipboard-reader';
import { CurrentFileReader } from 'src/reader/current-file-reader';
import { addModalActions, renderModalLayout } from './modal-ui';

/**
 * 统一工作台：查询 → 确认 → 执行 三步向导（单一入口编排层）。
 *
 * 设计原则（《简约至上》四策略）：
 * - 删除：无常驻关闭按钮（Esc/标题栏 X 足矣）、无手动"检查语法"按钮（输入防抖自动检查）、无冗长说明；
 * - 组织：来源按"生成与编写 / 已有集合"分组；每步一个主 CTA 靠右，次级操作为左侧文字链；
 * - 隐藏：lint 问题仅存在时内联显示；Bases 专属动作仅在 Bases 来源出现；
 * - 转移：Ctrl/Cmd+Enter 触发主操作；步骤条可点击直达（受步骤可达性约束）。
 *
 * 职责：查询步骤七来源统一（AI/手写×3 经执行器，既有三来源经 Reader）；确认/执行步骤
 * 分发给既有 Action 管线（确认窗 + 备份回滚）。步骤往返保留全部状态。
 */

/** 查询来源。 */
export type WorkbenchSource =
	| 'ai' | 'dql' | 'search' | 'bases'
	| 'searchPanel' | 'clipboard' | 'currentFile';

type WorkbenchStep = 'query' | 'confirm' | 'execute';

/** 来源标签（经 t() 按当前语言渲染）。 */
const SOURCE_LABELS: Record<WorkbenchSource, string> = {
	ai: 'AI 生成',
	dql: 'DQL',
	search: '搜索',
	bases: 'Bases',
	searchPanel: '搜索面板',
	clipboard: '剪贴板',
	currentFile: '当前文件链接',
};

/** 来源分组（组织策略：AI 是三种脚本的前置，独立成组）。 */
const SOURCE_GROUPS: Array<{ label: string; items: WorkbenchSource[] }> = [
	{ label: 'AI 生成（自动产出下列三种脚本）', items: ['ai'] },
	{ label: '手写脚本', items: ['dql', 'search', 'bases'] },
	{ label: '已有集合', items: ['searchPanel', 'clipboard', 'currentFile'] },
];

/** 目标标签（经 t() 按当前语言渲染）。 */
const TARGET_LABELS: Record<QueryTarget, string> = {
	dql: 'DQL（Dataview）',
	search: '搜索语法',
	bases: 'Bases',
};

interface ReadableLike {
	read(action: { act: (models: ActionModel[]) => void }): void;
}

export interface WorkbenchPlannerLike {
	generate(input: string): Promise<QueryIR>;
}

export interface WorkbenchExecutorLike {
	execute(target: QueryTarget, text: string): Promise<TAbstractFile[]>;
}

export interface WorkbenchDeps {
	planner: WorkbenchPlannerLike;
	executor: WorkbenchExecutorLike;
	readers?: Partial<Record<'searchPanel' | 'clipboard' | 'currentFile', () => ReadableLike>>;
}

export type DispatchKind = 'properties' | 'aiProperties' | 'move' | 'merge' | 'canvas' | 'rename' | 'delete';

/** 页脚主操作定义。 */
interface FooterPrimary {
	text: string;
	onClick: () => void;
}

export class WorkbenchModal extends Modal {
	phase: WorkbenchStep = 'query';
	source: WorkbenchSource = 'ai';
	lintIssues: LintIssue[] = [];
	files: TAbstractFile[] = [];
	truncatedCount = 0;
	private rawCount = 0;

	ir: QueryIR | null = null;
	aiCompiled: Partial<Record<QueryTarget, CompiledQuery>> = {};
	availableTargets: QueryTarget[] = [];
	recommendedTarget: QueryTarget | undefined = undefined;
	aiSelectedTarget: QueryTarget = 'search';

	private readonly deps: WorkbenchDeps;
	private readonly host: unknown;
	private readonly drafts = new Map<WorkbenchSource, string>();
	private readonly aiQueryTexts = new Map<QueryTarget, string>();
	private lintTimer: ReturnType<typeof setTimeout> | null = null;
	private issuesEl: HTMLElement | null = null;

	constructor(app: App, deps: WorkbenchDeps, host?: unknown) {
		super(app);
		this.deps = deps;
		this.host = host;
	}

	onOpen(): void {
		this.setBodyWorkbenchOpen(true);
		this.renderQuery();
	}

	close(): void {
		this.setBodyWorkbenchOpen(false);
		super.close();
	}

	/**
	 * 工作台打开期间给 body 挂标记类：抬高 hover 预览浮窗层级
	 * （Obsidian 默认 modal 层级高于 popover，预览会被弹窗遮挡）。
	 * document 在测试环境不存在，全部做守卫。
	 */
	private setBodyWorkbenchOpen(open: boolean): void {
		try {
			if (typeof document === 'undefined') {
				return;
			}
			const body = (document as unknown as { body?: { classList?: { add?: (c: string) => void; remove?: (c: string) => void } } }).body;
			if (open) {
				body?.classList?.add?.('fc-wb-open');
			} else {
				body?.classList?.remove?.('fc-wb-open');
			}
		} catch (e) {
			// 无 document 环境（单测）忽略
		}
	}

	// ---------------------------------------------------------------
	// 查询步骤逻辑
	// ---------------------------------------------------------------

	setSource(source: WorkbenchSource): void {
		this.source = source;
		this.lintIssues = [];
		this.renderQuery();
	}

	setDraft(text: string): void {
		this.drafts.set(this.source, text);
	}

	getDraft(source: WorkbenchSource): string {
		return this.drafts.get(source) ?? '';
	}

	async submitAiInput(text: string): Promise<void> {
		if (this.deps.planner == null) {
			new Notice(t('请先在设置中启用并配置 AI（服务地址 / 模型 / API Key）后再使用 AI 生成。'));
			return;
		}
		const input = text.trim();
		if (input === '') {
			new Notice(t('请输入要查找的内容描述。'));
			return;
		}
		try {
			this.ir = await this.deps.planner.generate(input);
		} catch (e) {
			new Notice(t('规划失败：{msg}', { msg: (e as Error).message }));
			return;
		}
		this.aiCompiled = {
			dql: compileDql(this.ir),
			search: compileSearch(this.ir),
			bases: compileBases(this.ir),
		};
		this.availableTargets = getAvailableTargets();
		this.recommendedTarget = recommendTarget(this.aiCompiled as Record<QueryTarget, CompiledQuery>, this.availableTargets);
		this.aiSelectedTarget = this.recommendedTarget ?? this.availableTargets[0];
		this.renderQuery();
	}

	selectAiTarget(target: QueryTarget): void {
		this.aiSelectedTarget = target;
		this.renderQuery();
	}

	private aiEffectiveText(): string {
		return this.aiQueryTexts.get(this.aiSelectedTarget)
			?? this.aiCompiled[this.aiSelectedTarget]?.text
			?? '';
	}

	async runAiQuery(): Promise<void> {
		const text = this.aiEffectiveText();
		if (text.trim() === '') {
			new Notice(t('查询文本为空，无法执行。'));
			return;
		}
		// Bases 走临时 .base 文件通道（与手写 Bases 来源一致，统一执行器不支持程序化 Bases）
		if (this.aiSelectedTarget === 'bases') {
			try {
				const files = await this.executeBasesScript(text);
				this.gotoConfirm(files);
			} catch (e) {
				new Notice(t('Bases 执行失败：{msg}（可改用「另存为 .base」手动打开）', { msg: (e as Error).message }));
			}
			return;
		}
		try {
			const files = await this.deps.executor.execute(this.aiSelectedTarget, text);
			this.gotoConfirm(files);
		} catch (e) {
			new Notice(t('执行失败：{msg}', { msg: (e as Error).message }));
		}
	}

	/** 当前来源语法检查（结果内联更新，不整页重渲染以免打断输入）。 */
	async lintCurrent(): Promise<LintIssue[]> {
		const draft = this.getDraft(this.source);
		if (this.source === 'dql') {
			this.lintIssues = await lintDql(draft);
		} else if (this.source === 'search') {
			this.lintIssues = lintSearch(draft);
		} else if (this.source === 'bases') {
			this.lintIssues = lintBases(draft);
		} else {
			this.lintIssues = [];
		}
		this.renderIssuesInline();
		return this.lintIssues;
	}

	/** 输入防抖自动检查（删除策略：替代手动"检查语法"按钮）。 */
	private scheduleLint(): void {
		if (this.lintTimer != null) {
			clearTimeout(this.lintTimer);
		}
		this.lintTimer = setTimeout(() => {
			void this.lintCurrent();
		}, 400);
	}

	async runSource(): Promise<void> {
		if (this.source === 'ai') {
			await this.runAiQuery();
			return;
		}

		if (this.source === 'bases') {
			const draft = this.getDraft('bases');
			const issues = lintBases(draft);
			this.lintIssues = issues;
			if (issues.some((issue) => issue.level === 'error')) {
				this.renderIssuesInline();
				return;
			}
			try {
				const files = await this.executeBasesScript(draft);
				this.gotoConfirm(files);
			} catch (e) {
				new Notice(t('Bases 执行失败：{msg}（可改用「另存为 .base」手动打开）', { msg: (e as Error).message }));
				this.renderIssuesInline();
			}
			return;
		}

		if (this.source === 'dql' || this.source === 'search') {
			const draft = this.getDraft(this.source);
			if (draft.trim() === '') {
				new Notice(t('请先输入查询脚本。'));
				return;
			}
			const issues = this.source === 'dql' ? await lintDql(draft) : lintSearch(draft);
			this.lintIssues = issues;
			if (issues.some((issue) => issue.level === 'error')) {
				this.renderIssuesInline();
				return;
			}
			const warnings = issues.filter((issue) => issue.level === 'warning');
			if (warnings.length > 0) {
				new Notice(t('语法检查警告：{msg}', { msg: warnings[0].message + (warnings.length > 1 ? t('（等 {n} 条）', { n: warnings.length }) : '') }));
			}
			try {
				const files = await this.deps.executor.execute(this.source, draft);
				this.gotoConfirm(files);
			} catch (e) {
				new Notice(t('执行失败：{msg}', { msg: (e as Error).message }));
			}
			return;
		}

		// 既有三来源
		const factory = this.deps.readers?.[this.source] ?? this.defaultReaderFactory(this.source);
		if (factory == null) {
			new Notice(t('当前环境不支持该来源。'));
			return;
		}
		const capture = new CaptureAction();
		try {
			factory().read(capture);
			const models = await capture.promise;
			this.gotoConfirm(models.map((model) => model.file).filter((file): file is TAbstractFile => file != null));
		} catch (e) {
			// 既有 reader 可能抛出（如 limit 非法/超限），保持 UI 触发流程的优雅失败约定
			new Notice(t('读取失败：{msg}', { msg: (e as Error).message }));
		}
	}

	private defaultReaderFactory(source: 'searchPanel' | 'clipboard' | 'currentFile'): (() => ReadableLike) | null {
		const plugin = this.host;
		if (plugin == null) {
			return null;
		}
		switch (source) {
			case 'searchPanel':
				return () => new SearchResultsReader(plugin as never) as unknown as ReadableLike;
			case 'clipboard':
				return () => new ClipboardReader(plugin as never) as unknown as ReadableLike;
			case 'currentFile':
				return () => new CurrentFileReader(plugin as never) as unknown as ReadableLike;
		}
	}

	private gotoConfirm(files: TAbstractFile[]): void {
		const limit = Number((this.host as { settings?: { limit?: string | number } })?.settings?.limit ?? 0) || 0;
		const capped = limit > 0 ? files.slice(0, limit) : files;
		this.rawCount = files.length;
		this.truncatedCount = Math.max(0, files.length - capped.length);
		this.files = capped;
		this.phase = 'confirm';
		this.renderConfirm();
	}

	gotoExecute(): void {
		this.phase = 'execute';
		this.renderExecute();
	}

	backToQuery(): void {
		this.phase = 'query';
		this.renderQuery();
	}

	backToConfirm(): void {
		if (this.files.length === 0) {
			return;
		}
		this.phase = 'confirm';
		this.renderConfirm();
	}

	/** 步骤条点击直达（受可达性约束：确认/执行仅在命中存在时可达）。 */
	stepTo(key: WorkbenchStep): void {
		if (key === 'query') {
			this.backToQuery();
		} else if (key === 'confirm') {
			this.backToConfirm();
		} else {
			this.gotoExecute();
		}
	}

	dispatch(kind: DispatchKind): void {
		const models = this.files.map((file) => new ActionModel(file));
		if (models.length === 0) {
			new Notice(t('没有命中文件可分发。'));
			return;
		}
		// 叠层弹窗（方案 A）：不关闭工作台，操作确认窗叠开；子窗关闭后工作台原样保留，
		// 命中清单可继续用于下一个操作。移动端全屏弹窗不支持叠层时回退为"先关再开"。
		if (Platform.isMobile) {
			this.close();
		}
		const app = this.app;
		const readerAdapter = {
			read: (action: { act: (models: ActionModel[]) => void }): void => {
				action.act(models);
			},
		};

		switch (kind) {
			case 'properties':
				new EditPropertiesAction(app).act(models);
				break;
			case 'aiProperties':
				if (this.host != null) {
					new AiPropertiesAction(this.host as never).act(models);
				} else {
					new Notice(t('请通过命令面板中的 AI 属性补全命令使用该操作。'));
				}
				break;
			case 'move':
				new ChooseFolderModal(app, readerAdapter as never, (path: string) => new MoveAction(app, path)).open();
				break;
			case 'merge':
				new ChooseFileModal(app, readerAdapter as never).open();
				break;
			case 'canvas':
				new ChooseCanvasModal(app, readerAdapter as never).open();
				break;
			case 'rename':
				new RenameAction(app).act(models);
				break;
			case 'delete':
				new DeleteAction(app).act(models);
				break;
		}
	}

	/**
	 * 打开脚本导入弹窗：从笔记（```dataview / ```query 块）或 .base 文件提取脚本。
	 * 导入后立即填入草稿并自动执行一次语法检查。
	 */
	openScriptImport(): void {
		let files: TFile[];
		let extract: (content: string) => string[];
		let emptyNotice: string;
		if (this.source === 'bases') {
			files = this.app.vault.getFiles().filter((file) => file.extension === 'base');
			extract = (content) => [content];
			emptyNotice = t('该文件不含可导入的脚本。');
		} else if (this.source === 'dql') {
			files = this.app.vault.getMarkdownFiles();
			extract = extractDataviewBlocks;
			emptyNotice = t('未在该笔记中找到 ```dataview 代码块。');
		} else {
			files = this.app.vault.getMarkdownFiles();
			extract = extractQueryBlocks;
			emptyNotice = t('未在该笔记中找到 ```query / ```search 代码块。');
		}
		if (files.length === 0) {
			new Notice(t('库中没有可选文件。'));
			return;
		}

		new ScriptImportModal(this.app, {
			files,
			extract,
			emptyNotice,
			onImport: (script, total) => {
				this.applyImportedScript(script, total);
			},
		}).open();
	}

	/**
	 * 应用导入的脚本：填入当前来源草稿 → 自动语法检查。
	 * 独立公开方法便于测试与外部导入复用。
	 */
	applyImportedScript(script: string, total = 1): void {
		this.setDraft(script);
		if (total > 1) {
			new Notice(t('已导入第 1 个脚本（该文件共 {n} 个，可再次导入或手动复制其余）。', { n: total }));
		} else {
			new Notice(t('已导入脚本。'));
		}
		void this.lintCurrent();
	}

	/**
	 * 执行 Bases 脚本：写入临时 .base → 打开 Bases 视图 → 轮询读取渲染行 → 清理。
	 * 读取失败抛错（上层提示回退「另存为 .base」手动打开）。
	 */
	private async executeBasesScript(draft: string): Promise<TAbstractFile[]> {
		const dir = '.file-cooker/tmp';
		try {
			await this.app.vault.adapter.mkdir(dir);
		} catch (e) {
			// 目录已存在时忽略
		}
		const path = `${dir}/wb-${Date.now().toString(36)}.base`;
		await this.app.vault.adapter.write(path, draft);

		const leaf = this.app.workspace.getLeaf(true);
		try {
			await (leaf as unknown as {
				setViewState?: (state: { type: string; state: Record<string, unknown> }) => Promise<void>;
			}).setViewState?.({ type: 'bases', state: { file: path } });
		} catch (e) {
			try {
				await this.app.vault.adapter.remove(path);
			} catch (cleanupError) {
				// 清理失败忽略
			}
			throw new Error(t('无法打开 Bases 视图（当前 Obsidian 版本可能不支持）'));
		}

		try {
			const files = await this.pollBasesFiles(leaf);
			if (files.length === 0) {
				throw new Error(t('未读取到结果（视图可能尚未渲染完成）'));
			}
			return files;
		} finally {
			try {
				(leaf as unknown as { detach?: () => void }).detach?.();
			} catch (e) {
				// 关闭失败忽略
			}
			try {
				await this.app.vault.adapter.remove(path);
			} catch (e) {
				// 清理失败忽略
			}
		}
	}

	/** 轮询 Bases 视图渲染的文件链接，连续两次一致视为稳定。 */
	private async pollBasesFiles(
		leaf: unknown,
		opts?: { pollMs?: number; timeoutMs?: number },
	): Promise<TAbstractFile[]> {
		const pollMs = opts?.pollMs ?? 120;
		const timeoutMs = opts?.timeoutMs ?? 4000;
		const collect = (): TAbstractFile[] => {
			const container = (leaf as { view?: { containerEl?: { querySelectorAll?: (sel: string) => Array<Record<string, unknown>> } } })
				?.view?.containerEl;
			const nodes = container?.querySelectorAll?.('a.internal-link, [data-href]') ?? [];
			const seen = new Set<string>();
			const files: TAbstractFile[] = [];
			nodes.forEach((node) => {
				const href = (node['dataset'] as Record<string, string> | undefined)?.href
					?? (node['href'] as string | undefined)
					?? '';
				const file = resolveHrefToFile(this.app, href);
				if (file != null && !seen.has(file.path)) {
					seen.add(file.path);
					files.push(file);
				}
			});
			return files;
		};

		const signature = (files: TAbstractFile[]): string => files.map((f) => f.path).join('|');
		let last = '';
		let stable = 0;
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, pollMs));
			const current = collect();
			const sig = signature(current);
			if (current.length > 0 && sig === last) {
				stable++;
				if (stable >= 2) {
					return current;
				}
			} else {
				stable = 0;
			}
			last = sig;
		}
		return collect();
	}

	async saveBasesArtifact(text?: string): Promise<void> {
		const draft = (text ?? this.getDraft('bases')).trim();
		if (draft === '') {
			new Notice(t('Bases 草稿为空。'));
			return;
		}
		const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
		let name = `AI-query-${stamp}.base`;
		let suffix = 1;
		while (await this.app.vault.adapter.exists(name)) {
			name = `AI-query-${stamp}-${suffix++}.base`;
		}
		try {
			const file = await this.app.vault.create(name, draft);
			const leaf = this.app.workspace.getLeaf(true);
			await leaf.openFile(file as TFile);
			new Notice(t('已保存并打开：{name}', { name }));
		} catch (e) {
			new Notice(t('另存失败：{msg}', { msg: (e as Error).message }));
		}
	}

	// ---------------------------------------------------------------
	// 渲染（简约四策略的落地层）
	// ---------------------------------------------------------------

	/** 工作台画布：桌面级宽度 + 纵向滚动。 */
	private applyShell(): void {
		(this as unknown as { modalEl?: { addClass?: (cls: string) => void } }).modalEl?.addClass?.('fc-wb-shell');
	}

	/** 紧凑步骤条：可点击直达（隐藏策略——导航融入步骤指示本身）。 */
	private renderStepBar(): void {
		const bar = this.contentEl.createDiv({ cls: 'fc-wb-steps' });
		const items: Array<{ key: WorkbenchStep; text: string; reachable: boolean }> = [
			{ key: 'query', text: t('① 查询'), reachable: true },
			{ key: 'confirm', text: t('② 确认'), reachable: this.files.length > 0 },
			{ key: 'execute', text: t('③ 执行'), reachable: this.files.length > 0 },
		];
		items.forEach((item) => {
			const active = this.phase === item.key;
			const el = bar.createEl('span', {
				text: item.text,
				cls: `fc-wb-steps__item${active ? ' fc-wb-steps__item--active' : item.reachable ? ' fc-wb-steps__item--link' : ''}`,
			});
			if (item.reachable && !active) {
				el.addEventListener('click', () => this.stepTo(item.key));
			} else if (active) {
				el.classList.add('fc-wb-steps__item--active');
			}
		});
	}

	/** 页脚：左次级文字链 + 右唯一主 CTA（组织策略）。 */
	private renderFooter(primary: FooterPrimary | null, secondary: Array<{ text: string; onClick: () => void }>): void {
		const bar = this.contentEl.createDiv({ cls: 'fc-wb-footer' });
		const links = bar.createDiv({ cls: 'fc-wb-footer__links' });
		secondary.forEach((item) => {
			const link = links.createEl('span', { text: item.text, cls: 'fc-wb-footer__link' });
			link.addEventListener('click', item.onClick);
		});
		if (primary != null) {
			const btn = bar.createEl('button', { text: primary.text, cls: 'mod-cta' });
			btn.addEventListener('click', primary.onClick);
		}
	}

	/** 编辑器 + 防抖自动 lint + Ctrl/Cmd+Enter 主操作（转移策略）。 */
	private renderScriptEditor(primary: FooterPrimary, secondary: Array<{ text: string; onClick: () => void }>, placeholder: string): void {
		const textEl = this.contentEl.createEl('textarea');
		(textEl as HTMLTextAreaElement).rows = 10;
		textEl.classList.add('fc-ai-input');
		(textEl as HTMLTextAreaElement).placeholder = placeholder;
		(textEl as HTMLTextAreaElement).value = this.getDraft(this.source);
		textEl.addEventListener('input', () => {
			this.setDraft((textEl as HTMLTextAreaElement).value);
			this.scheduleLint();
		});
		textEl.addEventListener('keydown', (evt) => {
			const ke = evt as KeyboardEvent;
			if (ke?.key === 'Enter' && (ke.ctrlKey || ke.metaKey)) {
				ke.preventDefault?.();
				primary.onClick();
			}
		});

		this.issuesEl = this.contentEl.createDiv({ cls: 'fc-wb-issues' });
		this.renderIssuesInline();

		this.renderFooter(primary, secondary);
	}

	/** lint 结果内联更新（隐藏策略：无问题时不占空间）。 */
	private renderIssuesInline(): void {
		if (this.issuesEl == null) {
			return;
		}
		this.issuesEl.empty();
		this.lintIssues.forEach((issue) => {
			this.issuesEl?.createDiv({
				text: `${issue.level === 'error' ? '✖' : '⚠'} ${issue.message}`,
				cls: issue.level === 'error' ? 'fc-ai-warn fc-ai-warn--error' : 'fc-ai-warn',
			});
		});
	}

	private renderQuery(): void {
		this.contentEl.empty();
		this.applyShell();
		this.renderStepBar();
		renderModalLayout(this.contentEl, {
			title: t('File Cooker 工作台'),
			variant: 'confirm',
		});

		// 来源分组（组织策略）
		const sourcesEl = this.contentEl.createDiv({ cls: 'fc-ai-targets' });
		SOURCE_GROUPS.forEach((group, groupIndex) => {
			if (groupIndex > 0) {
				sourcesEl.createEl('span', { cls: 'fc-ai-targets__sep' });
			}
			group.items.forEach((source) => {
				const gen = source === 'ai' ? ' fc-ai-targets__btn--gen' : '';
				const btn = sourcesEl.createEl('span', {
					text: t(SOURCE_LABELS[source]),
					cls: `fc-ai-targets__btn${gen}${this.source === source ? ' fc-ai-targets__btn--active' : ''}`,
				});
				(btn as unknown as { title: string }).title = t(group.label);
				btn.addEventListener('click', () => this.setSource(source));
			});
		});

		if (this.source === 'ai') {
			this.renderAiPanel();
			return;
		}

		if (this.source === 'searchPanel' || this.source === 'clipboard' || this.source === 'currentFile') {
			const hints: Record<string, string> = {
				searchPanel: t('将读取当前搜索面板中的结果文件。'),
				clipboard: t('将读取剪贴板中的文件链接。'),
				currentFile: t('将读取当前文件中的链接。'),
			};
			this.contentEl.createDiv({ text: hints[this.source], cls: 'file-cooker-modal__description' });
			this.renderFooter({ text: t('读取文件'), onClick: () => void this.runSource() }, []);
			return;
		}

		// 手写脚本三来源
		const placeholders: Record<string, string> = {
			dql: t('例：\nLIST\nFROM #读书\nWHERE status != "done"'),
			search: t('例：tag:#读书 path:"Books" -[status:done]'),
			bases: t('例：\nfilters:\n  and:\n    - \'file.hasTag("读书")\''),
		};
		const secondary: Array<{ text: string; onClick: () => void }> = [
			{ text: t('从笔记导入…'), onClick: () => this.openScriptImport() },
		];
		if (this.source === 'bases') {
			secondary.push({ text: t('另存为 .base'), onClick: () => void this.saveBasesArtifact() });
		}
		const primary: FooterPrimary = { text: t('执行查询'), onClick: () => void this.runSource() };
		this.renderScriptEditor(primary, secondary, placeholders[this.source] ?? '');
	}

	/** AI 来源面板：输入 + 生成 → 目标按钮 + 可编辑文本（同一编辑器形态）。 */
	private renderAiPanel(): void {
		const hasIr = this.ir != null;

		const inputEl = this.contentEl.createEl('textarea');
		(inputEl as HTMLTextAreaElement).rows = 2;
		inputEl.classList.add('fc-ai-input');
		(inputEl as HTMLTextAreaElement).placeholder = t('例：去年标记了读书但没读完的笔记');
		(inputEl as HTMLTextAreaElement).value = this.getDraft('ai');
		inputEl.addEventListener('input', () => this.setDraft((inputEl as HTMLTextAreaElement).value));

		addModalActions(this.contentEl, [
			{
				text: t('生成查询'),
				cta: true,
				onClick: () => void this.submitAiInput((inputEl as HTMLTextAreaElement).value),
			},
		]);

		if (!hasIr) {
			return;
		}

		const targetsEl = this.contentEl.createDiv({ cls: 'fc-ai-targets' });
		this.availableTargets.forEach((target) => {
			const count = this.aiCompiled[target]?.unsupported.length ?? 0;
			const btn = targetsEl.createEl('span', {
				text: `${t(TARGET_LABELS[target])}${count > 0 ? t('（{n} 条不支持）', { n: count }) : ''}${this.recommendedTarget === target ? t(' ✓推荐') : ''}`,
				cls: `fc-ai-targets__btn${this.aiSelectedTarget === target ? ' fc-ai-targets__btn--active' : ''}`,
			});
			btn.addEventListener('click', () => this.selectAiTarget(target));
		});

		const textEl = this.contentEl.createEl('textarea');
		(textEl as HTMLTextAreaElement).rows = 8;
		textEl.classList.add('fc-ai-input');
		(textEl as HTMLTextAreaElement).value = this.aiEffectiveText();
		textEl.addEventListener('input', () => {
			this.aiQueryTexts.set(this.aiSelectedTarget, (textEl as HTMLTextAreaElement).value);
		});
		textEl.addEventListener('keydown', (evt) => {
			const ke = evt as KeyboardEvent;
			if (ke?.key === 'Enter' && (ke.ctrlKey || ke.metaKey)) {
				ke.preventDefault?.();
				void this.runAiQuery();
			}
		});

		const unsupportedList = this.aiCompiled[this.aiSelectedTarget]?.unsupported ?? [];
		if (unsupportedList.length > 0) {
			this.contentEl.createDiv({
				text: t('⚠ {n} 个条件此语法不支持（已忽略）：{nodes}', { n: unsupportedList.length, nodes: describeNodes(unsupportedList).slice(0, 3).join(t('、')) }),
				cls: 'fc-ai-warn',
			});
		}

		addModalActions(this.contentEl, [
			{
				text: t('执行查询（进入确认）'),
				cta: true,
				onClick: () => void this.runAiQuery(),
			},
		]);
	}

	private renderConfirm(): void {
		this.contentEl.empty();
		this.applyShell();
		this.renderStepBar();
		renderModalLayout(this.contentEl, {
			title: t('命中 {n} 个文件', { n: this.files.length }),
			description: this.truncatedCount > 0 ? t('已达批量上限，已截断 {n} 个。', { n: this.truncatedCount }) : undefined,
			variant: 'confirm',
		});

		const listEl = this.contentEl.createDiv({ cls: 'file-cooker-modal__list fc-wb-list' });
		this.files.forEach((file, idx) => {
			const row = listEl.createDiv({ cls: 'file-cooker-modal__list-item' });
			row.createDiv({ text: `#${idx + 1}`, cls: 'file-cooker-modal__list-index' });
			const cell = row.createDiv({ cls: 'file-cooker-modal__list-text' });
			// internal-link 形式：复用 Obsidian 的 Ctrl/Cmd+悬停预览与点击打开
			const link = cell.createEl('a', { text: file.name, cls: 'internal-link fc-wb-filelink' });
			const linkApi = link as unknown as {
				setAttr?: (key: string, value: string) => void;
				href: string;
				dataset?: Record<string, string>;
			};
			if (typeof linkApi.setAttr === 'function') {
				linkApi.setAttr('data-href', file.path);
				linkApi.setAttr('href', file.path);
			} else {
				linkApi.href = file.path;
			}
			if (linkApi.dataset != null) {
				linkApi.dataset['href'] = file.path;
			}
			const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
			if (folder !== '') {
				cell.createDiv({ text: folder, cls: 'fc-ai-card__folder' });
			}
			// 原生悬停预览：模态框内无 markdown 上下文，需主动触发 Page Preview 监听的 hover-link 事件
			link.addEventListener('mouseover', (evt) => {
				(this.app.workspace as unknown as { trigger?: (name: string, data: unknown) => void })?.trigger?.('hover-link', {
					event: evt,
					source: 'file-cooker-workbench',
					hoverParent: this,
					targetEl: link,
					linktext: file.path,
					sourcePath: file.path,
				});
			});
			// 点击打开文件（openLinkText 相对自身路径解析，保证子目录文件可定位）
			link.addEventListener('click', (evt) => {
				evt?.preventDefault?.();
				(this.app.workspace as unknown as {
					openLinkText?: (link: string, source: string, newLeaf?: boolean) => Promise<unknown>;
				})?.openLinkText?.(file.path, file.path);
			});
		});

		addModalActions(this.contentEl, [
			{ text: t('选择操作 →'), cta: true, onClick: () => this.gotoExecute() },
			{ text: t('← 返回查询'), onClick: () => this.backToQuery() },
		]);
	}

	private renderExecute(): void {
		this.contentEl.empty();
		this.applyShell();
		this.renderStepBar();
		renderModalLayout(this.contentEl, {
			title: t('选择操作'),
			description: t('对命中的 {n} 个文件执行操作（写入前仍需在确认窗中确认）。', { n: this.files.length }),
			variant: 'confirm',
		});

		// 操作目录：卡片网格（组织策略），删除按钮用主色调（不用刺眼红色）
		this.contentEl.createDiv({ text: t('修改属性'), cls: 'file-cooker-modal__section-label' });
		const propGrid = this.contentEl.createDiv({ cls: 'fc-wb-catalog' });
		this.addCatalogButton(propGrid, t('编辑属性'), t('批量增删改 frontmatter'), () => this.dispatch('properties'));
		this.addCatalogButton(propGrid, t('AI 属性补全'), t('AI 推断提案 · 人工审核'), () => this.dispatch('aiProperties'));

		this.contentEl.createDiv({ text: t('整理文件'), cls: 'file-cooker-modal__section-label' });
		const fileGrid = this.contentEl.createDiv({ cls: 'fc-wb-catalog' });
		this.addCatalogButton(fileGrid, t('移动到 ...'), t('整理到目标文件夹'), () => this.dispatch('move'));
		this.addCatalogButton(fileGrid, t('合并到 ...'), t('并入一个目标文件'), () => this.dispatch('merge'));
		this.addCatalogButton(fileGrid, t('加入 Canvas ...'), t('作为卡片加入画布'), () => this.dispatch('canvas'));
		this.addCatalogButton(fileGrid, t('重命名 ...'), t('批量规范命名'), () => this.dispatch('rename'));
		this.addCatalogButton(fileGrid, t('删除'), t('移入回收站（可从备份恢复）'), () => this.dispatch('delete'), 'warning');

		// 导航收敛:只保留「返回上一步」(执行的上一步即确认),右对齐
		this.renderFooter({ text: t('← 返回上一步'), onClick: () => this.backToConfirm() }, []);
	}

	/**
	 * 操作目录卡片按钮（标签 + 描述）。
	 * variant：normal=中性卡片；accent=主色调描边（如 AI 补全）；warning=红色左边线告警（如删除，不做整块红底）。
	 */
	private addCatalogButton(
		container: HTMLElement,
		label: string,
		desc: string,
		onClick: () => void,
		variant: 'normal' | 'accent' | 'warning' = 'normal',
	): void {
		const variantCls = variant === 'accent' ? ' fc-wb-catalog__btn--accent' : variant === 'warning' ? ' fc-wb-catalog__btn--warning' : '';
		const btn = container.createEl('button', { cls: `fc-wb-catalog__btn${variantCls}` });
		btn.createDiv({ text: label, cls: 'fc-wb-catalog__label' });
		btn.createDiv({ text: desc, cls: 'fc-wb-catalog__desc' });
		btn.addEventListener('click', onClick);
	}
}

/** 将 Bases 视图链接（data-href / href）解析为 vault 文件。 */
function resolveHrefToFile(app: App, href: string): TAbstractFile | null {
	if (typeof href !== 'string' || href.trim() === '') {
		return null;
	}
	let candidate = href.trim();
	const linkMatch = candidate.match(/^\[\[([^\]|#]+)/);
	if (linkMatch != null) {
		candidate = linkMatch[1].trim();
	}
	if (candidate.startsWith('file://')) {
		try {
			candidate = decodeURIComponent(candidate.replace('file://', ''));
		} catch (e) {
			// 保持原样
		}
	}
	const byPath = app.vault.getAbstractFileByPath(candidate);
	if (byPath != null) {
		return byPath;
	}
	const cache = app.metadataCache as unknown as {
		getFirstLinkpathDest?: (path: string, source: string) => TAbstractFile | null;
	};
	return cache.getFirstLinkpathDest?.(candidate, '') ?? null;
}

/** 把不支持条件翻译为人类可读短语（与选择器一致）。 */
function describeNodes(nodes: IrCondition[]): string[] {
	return nodes.map((node) => {
		if ('content' in node) return t('正文"{content}"', { content: node.content });
		if ('task' in node) return t('任务{status}', { status: node.task === 'todo' ? t('未完成') : t('已完成') });
		if ('fileModified' in node) return t('修改时间');
		if ('fileCreated' in node) return t('创建时间');
		if ('property' in node) return t('属性 {field}', { field: node.property.field });
		if ('tag' in node) return t('标签 #{tag}', { tag: node.tag });
		if ('folder' in node) return t('目录 {dir}', { dir: node.folder });
		if ('filename' in node) return t('文件名 {name}', { name: node.filename });
		return t('条件');
	});
}
