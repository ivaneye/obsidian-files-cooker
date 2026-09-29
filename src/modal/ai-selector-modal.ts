import { App, Modal, Notice, Platform, TAbstractFile, TFile } from 'obsidian';
import { t } from 'src/i18n/index';
import { CompiledQuery, IrCondition, QueryIR, QueryTarget } from 'src/ai/query-ir';
import { compileDql } from 'src/ai/compile-dql';
import { compileSearch } from 'src/ai/compile-search';
import { compileBases } from 'src/ai/compile-bases';
import { getAvailableTargets, recommendTarget } from 'src/ai/query-executor';
import { ActionModel } from 'src/action/action';
import { EditPropertiesAction } from 'src/action/edit-properties-action';
import { DeleteAction } from 'src/action/delete-action';
import { RenameAction } from 'src/action/rename-action';
import { MoveAction } from 'src/action/move-action';
import { ChooseFolderModal } from 'src/modal/choose-folder-modal';
import { ChooseFileModal } from 'src/modal/choose-file-modal';
import { ChooseCanvasModal } from 'src/modal/choose-canvas-modal';
import { AiPropertiesAction } from 'src/action/ai-properties-action';
import { addModalActions, renderModalLayout } from './modal-ui';

/**
 * 自然语言选择器弹窗：三态流转（输入 → 查询提案 → 命中结果）。
 *
 * 职责说明：
 * - input：自然语言输入 → 规划器产出 IR（失败停留输入态并提示）；
 * - query：人类可读解释 + 可用目标的查询文本（可编辑/复制/Bases 另存 .base）
 *   + 不支持条件警示 + 推荐执行器标识 + 执行（只读）；
 * - results：命中清单（数量/路径）+ 分发到既有 Action（编辑属性/AI 属性/移动/合并/Canvas/改名/删除/flomo），
 *   分发后由既有确认窗 + 备份回滚接管；
 * - 全程只读，任何写入发生在用户于既有确认窗确认之后。
 */

/** 目标的中文展示名。 */
const TARGET_LABELS: Record<QueryTarget, string> = {
	dql: 'DQL（Dataview）',
	search: '搜索语法',
	bases: 'Bases',
};

/** 规划器最小接口（便于测试注入）。 */
export interface SelectorPlannerLike {
	generate(input: string): Promise<QueryIR>;
}

/** 执行器最小接口（便于测试注入）。 */
export interface SelectorExecutorLike {
	execute(target: QueryTarget, text: string): Promise<TAbstractFile[]>;
}

/** 弹窗依赖。 */
export interface AiSelectorDeps {
	planner: SelectorPlannerLike;
	executor: SelectorExecutorLike;
}

/** 分发动作类别。 */
export type DispatchKind = 'properties' | 'aiProperties' | 'move' | 'merge' | 'canvas' | 'rename' | 'delete' | 'flomo';

type ModalPhase = 'input' | 'query' | 'results' | 'error';

export class AiSelectorModal extends Modal {
	phase: ModalPhase = 'input';
	ir: QueryIR | null = null;
	compiled: Partial<Record<QueryTarget, CompiledQuery>> = {};
	results: TAbstractFile[] = [];
	availableTargets: QueryTarget[] = [];
	recommendedTarget: QueryTarget | undefined = undefined;
	selectedTarget: QueryTarget = 'search';

	private readonly deps: AiSelectorDeps;
	/** 插件宿主（可选）：供 AiPropertiesAction 等需要 settings 的分发使用。 */
	private readonly host: unknown;
	private readonly queryTexts = new Map<QueryTarget, string>();
	private lastInput = '';

	constructor(app: App, deps: AiSelectorDeps, host?: unknown) {
		super(app);
		this.deps = deps;
		this.host = host;
	}

	onOpen(): void {
		this.renderInput();
	}

	close(): void {
		super.close();
	}

	/**
	 * 提交自然语言：规划 → 三编译 → 进入提案页。
	 * 规划失败停留输入态并提示（零请求副作用）。
	 */
	async submitInput(text: string): Promise<void> {
		const input = text.trim();
		if (input === '') {
			new Notice(t('请输入要查找的内容描述。'));
			return;
		}
		this.lastInput = input;
		try {
			this.ir = await this.deps.planner.generate(input);
		} catch (e) {
			new Notice(t('规划失败：{msg}', { msg: (e as Error).message }));
			return;
		}
		this.compiled = {
			dql: compileDql(this.ir),
			search: compileSearch(this.ir),
			bases: compileBases(this.ir),
		};
		this.availableTargets = getAvailableTargets();
		// availableTargets 由本次编译集合推导，类型上收窄为完整 Record
		this.recommendedTarget = recommendTarget(this.compiled as Record<QueryTarget, CompiledQuery>, this.availableTargets);
		this.selectedTarget = this.recommendedTarget ?? this.availableTargets[0];
		this.phase = 'query';
		this.renderQuery();
	}

	/** 切换当前目标（查询文本按目标缓存，切换不丢失编辑）。 */
	selectTarget(target: QueryTarget): void {
		this.selectedTarget = target;
		this.renderQuery();
	}

	/** 编辑当前目标的查询文本。 */
	setQueryText(text: string): void {
		this.queryTexts.set(this.selectedTarget, text);
	}

	/** 当前生效的查询文本（编辑优先，否则编译原文）。 */
	effectiveQueryText(): string {
		return this.queryTexts.get(this.selectedTarget)
			?? this.compiled[this.selectedTarget]?.text
			?? '';
	}

	/**
	 * 执行当前目标查询（只读）。
	 * 编辑后的文本优先于编译原文；失败进入错误态（可返回输入重试）。
	 */
	async runQuery(): Promise<void> {
		const text = this.effectiveQueryText();
		if (text.trim() === '') {
			new Notice(t('查询文本为空，无法执行。'));
			return;
		}
		let files: TAbstractFile[];
		try {
			files = await this.deps.executor.execute(this.selectedTarget, text);
		} catch (e) {
			this.phase = 'error';
			this.renderError([(e as Error).message]);
			return;
		}
		this.results = files;
		this.phase = 'results';
		this.renderResults();
	}

	/**
	 * 将命中清单分发给既有 Action / 选择弹窗。
	 * 通过 readerAdapter 伪装成 Reader，Choose*Modal 的分发改写零改动。
	 */
	dispatch(kind: DispatchKind): void {
		const models = this.results.map((file) => new ActionModel(file));
		if (models.length === 0) {
			new Notice(t('没有命中文件可分发。'));
			return;
		}
		// 叠层弹窗（方案 A）：不关闭选择器；移动端回退为"先关再开"。
		if (Platform.isMobile) {
			this.close();
		}
		const app = this.app;
		// readerAdapter：将命中清单伪装成 Reader，复用既有 Choose*Modal 分发改写
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
				// AiPropertiesAction 需要 plugin 宿主（settings.ai）；未注入时提示走命令入口
				if (this.host != null) {
					new AiPropertiesAction(this.host as never).act(models);
				} else {
					new Notice(t('请通过命令面板的「AI complete properties」使用该操作。'));
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
			case 'flomo':
				new Notice(t('flomo 同步请使用对应来源命令（本阶段分发复用既有确认窗）。'));
				break;
		}
	}

	/** 输入态渲染。 */
	private renderInput(): void {
		this.contentEl.empty();
		renderModalLayout(this.contentEl, {
			title: t('AI 找文件'),
			description: t('用一句自然语言描述要找的笔记，AI 会编译成 DQL / 搜索 / Bases 查询供你审核执行。'),
			variant: 'confirm',
		});

		const inputEl = this.contentEl.createEl('textarea');
		(inputEl as HTMLTextAreaElement).rows = 3;
		inputEl.classList.add('fc-ai-input');

		addModalActions(this.contentEl, [
			{
				text: t('生成查询'),
				cta: true,
				onClick: () => {
					void this.submitInput((inputEl as HTMLTextAreaElement).value);
				},
			},
			{
				text: t('取消'),
				onClick: () => this.close(),
			},
		]);
	}

	/** 提案态渲染：解释 + 目标切换 + 可编辑查询文本 + 能力警示 + 执行/复制/另存。 */
	private renderQuery(): void {
		this.contentEl.empty();
		const unsupportedCount = this.compiled[this.selectedTarget]?.unsupported.length ?? 0;
		renderModalLayout(this.contentEl, {
			title: t('AI 找文件'),
			description: this.ir?.intent ?? '',
			summaryLines: [
				t('可用目标：{targets}', { targets: this.availableTargets.map((target) => t(TARGET_LABELS[target])).join(' / ') }),
				...(this.recommendedTarget != null
					? [t('推荐执行器：{target}', { target: t(TARGET_LABELS[this.recommendedTarget]) })]
					: [t('⚠ 没有目标能完整表达该查询，请编辑查询文本或切换目标')]),
			],
			variant: 'confirm',
		});

		// 目标切换按钮组
		const targetsEl = this.contentEl.createDiv({ cls: 'fc-ai-targets' });
		this.availableTargets.forEach((target) => {
			const compiledTarget = this.compiled[target];
			const count = compiledTarget?.unsupported.length ?? 0;
			const btn = targetsEl.createEl('span', {
				text: `${this.selectedTarget === target ? '▶ ' : ''}${t(TARGET_LABELS[target])}${count > 0 ? t('（{n} 条不支持）', { n: count }) : ''}${this.recommendedTarget === target ? t(' ✓推荐') : ''}`,
				cls: `fc-ai-targets__btn${this.selectedTarget === target ? ' fc-ai-targets__btn--active' : ''}`,
			});
			btn.addEventListener('click', () => {
				this.selectTarget(target);
			});
		});

		// 查询文本（可编辑）
		const textEl = this.contentEl.createEl('textarea');
		(textEl as HTMLTextAreaElement).rows = 6;
		textEl.classList.add('fc-ai-input');
		(textEl as HTMLTextAreaElement).value = this.effectiveQueryText();
		textEl.addEventListener('input', () => {
			this.setQueryText((textEl as HTMLTextAreaElement).value);
		});

		// 不支持条件警示（退化不静默）
		const unsupportedList = this.compiled[this.selectedTarget]?.unsupported ?? [];
		if (unsupportedList.length > 0) {
			this.contentEl.createDiv({
				text: t('⚠ {n} 个条件此语法不支持（已忽略）：{nodes}', { n: unsupportedList.length, nodes: describeNodes(unsupportedList).slice(0, 3).join(t('、')) }),
				cls: 'fc-ai-warn',
			});
			if (!this.availableTargets.includes('dql')) {
				this.contentEl.createDiv({
					text: t('提示：安装并启用 Dataview 插件可启用 DQL 目标（支持日期等更强条件）。'),
					cls: 'fc-ai-warn',
				});
			}
		}

		const actions: Array<{ text: string; cta?: boolean; onClick: () => void }> = [
			{
				text: t('执行查询'),
				cta: true,
				onClick: () => {
					void this.runQuery();
				},
			},
			{
				text: t('复制查询'),
				onClick: () => {
					void navigator.clipboard?.writeText(this.effectiveQueryText());
					new Notice(t('查询文本已复制。'));
				},
			},
		];
		if (this.selectedTarget === 'bases') {
			actions.push({
				text: t('另存为 .base'),
				onClick: () => {
					void this.saveBasesArtifact();
				},
			});
		}
		actions.push({ text: t('重新输入'), onClick: () => this.backToInput() });
		addModalActions(this.contentEl, actions);
	}

	/** 结果态渲染：命中统计 + 清单 + 分发按钮组。 */
	private renderResults(): void {
		this.contentEl.empty();
		renderModalLayout(this.contentEl, {
			title: t('命中 {n} 个文件', { n: this.results.length }),
			description: t('选择要执行的批量操作（将进入对应确认窗，写入前仍需确认）。'),
			variant: 'confirm',
		});

		const listEl = this.contentEl.createDiv({ cls: 'file-cooker-modal__list' });
		this.results.forEach((file, idx) => {
			const row = listEl.createDiv({ cls: 'file-cooker-modal__list-item' });
			row.createDiv({ text: `#${idx + 1}`, cls: 'file-cooker-modal__list-index' });
			row.createDiv({ text: file.path, cls: 'file-cooker-modal__list-text' });
		});

		// 分组展示：同类操作聚在一起，避免一排按钮混杂难辨识
		this.contentEl.createDiv({ text: t('修改属性'), cls: 'file-cooker-modal__section-label' });
		addModalActions(this.contentEl, [
			{ text: t('编辑属性'), onClick: () => this.dispatch('properties') },
			{ text: t('AI 属性补全'), onClick: () => this.dispatch('aiProperties') },
		]);

		this.contentEl.createDiv({ text: t('整理文件'), cls: 'file-cooker-modal__section-label' });
		addModalActions(this.contentEl, [
			{ text: t('移动到 ...'), onClick: () => this.dispatch('move') },
			{ text: t('合并到 ...'), onClick: () => this.dispatch('merge') },
			{ text: t('加入 Canvas ...'), onClick: () => this.dispatch('canvas') },
			{ text: t('重命名 ...'), onClick: () => this.dispatch('rename') },
			{ text: t('删除 !'), warning: true, onClick: () => this.dispatch('delete') },
		]);

		this.contentEl.createDiv({ text: t('其他'), cls: 'file-cooker-modal__section-label' });
		addModalActions(this.contentEl, [
			{ text: t('返回查询'), onClick: () => this.backToQuery() },
			{ text: t('重新输入'), onClick: () => this.backToInput() },
			{ text: t('关闭'), onClick: () => this.close() },
		]);
	}

	/** 返回查询提案视图（保留编辑过的查询文本与目标选择）。 */
	private backToQuery(): void {
		if (this.ir == null) {
			return;
		}
		this.phase = 'query';
		this.renderQuery();
	}

	/** 错误态渲染：可返回输入重试。 */
	private renderError(lines: string[]): void {
		this.contentEl.empty();
		renderModalLayout(this.contentEl, {
			title: t('执行失败'),
			description: t('未写入任何文件。'),
			summaryLines: lines.map((line) => `· ${line}`),
			variant: 'danger',
		});
		addModalActions(this.contentEl, [
			{ text: t('重新输入'), onClick: () => this.backToInput() },
			{ text: t('关闭'), onClick: () => this.close() },
		]);
	}

	/** 返回输入态（保留上次输入便于修改）。 */
	private backToInput(): void {
		this.phase = 'input';
		this.renderInput();
	}

	/**
	 * 将 Bases YAML 另存为 vault 根目录下的 .base 文件并打开。
	 * 同名冲突自动追加序号。
	 */
	async saveBasesArtifact(): Promise<void> {
		const text = this.effectiveQueryText();
		const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
		let name = `AI-query-${stamp}.base`;
		let suffix = 1;
		while (await this.app.vault.adapter.exists(name)) {
			name = `AI-query-${stamp}-${suffix++}.base`;
		}
		try {
			const file = await this.app.vault.create(name, text);
			const leaf = this.app.workspace.getLeaf(true);
			await leaf.openFile(file as TFile);
			new Notice(t('已保存并打开：{name}', { name }));
		} catch (e) {
			new Notice(t('另存失败：{msg}', { msg: (e as Error).message }));
		}
	}
}

/** 把不支持条件翻译为人类可读短语。 */
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

