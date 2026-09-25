import { App, TAbstractFile } from 'obsidian';
import { getAPI } from 'obsidian-dataview';
import FileCookerPlugin from 'main';
import { Action, ActionModel } from 'src/action/action';
import { CompiledQuery, QueryTarget } from './query-ir';

/**
 * 查询执行编排：能力检查（单一事实来源）+ 三通道执行 + 命中提取。
 *
 * 职责说明：
 * - getAvailableTargets：可用目标集合的唯一来源（DQL 仅在 Dataview 已装且启用时可用）；
 * - recommendTarget：可用集合内 unsupported 为空且优先级最高者（dql > search > bases）；
 * - CaptureAction：捕获既有 Reader 产出的 ActionModel[] 而不落盘（复用管线的胶水）；
 * - executeQuery：DQL 经 DataviewReader、搜索经面板注入 + SearchResultsReader；Bases 为产物模式抛指引。
 *
 * 风险说明：搜索面板 setQuery / resultDomLookup 为内部 API（与既有 SearchResultsReader 同风格），
 * 存在性探测失败时降级为"填入查询 + 指引用户回车"。
 */

/** 执行选项（测试可注入更短的轮询/超时）。 */
export interface ExecuteOptions {
	/** 结果稳定轮询间隔（毫秒），默认 150。 */
	pollMs?: number;
	/** 执行超时（毫秒），默认 20000。 */
	timeoutMs?: number;
}

/**
 * 可用目标集合：tab 渲染与推荐共用，保证"显示了就能跑、能跑就显示"。
 */
export function getAvailableTargets(): QueryTarget[] {
	const targets: QueryTarget[] = [];
	try {
		if (getAPI() != null) {
			targets.push('dql');
		}
	} catch (e) {
		// Dataview 未安装（依赖缺失或未启用）
	}
	targets.push('search');
	targets.push('bases');
	return targets;
}

/**
 * 推荐执行器：可用集合内 unsupported 为空且优先级最高者（dql > search > bases）。
 * 无完整表达目标时返回 undefined（上层不得自动执行）。
 */
export function recommendTarget(
	compiled: Record<QueryTarget, CompiledQuery>,
	targets: QueryTarget[],
): QueryTarget | undefined {
	const priority: QueryTarget[] = ['dql', 'search', 'bases'];
	for (const target of priority) {
		if (targets.includes(target) && compiled[target].unsupported.length === 0) {
			return target;
		}
	}
	return undefined;
}

/**
 * 捕获 Reader 产出的 ActionModel[] 而不落盘，供选择器编排使用。
 * 与既有管线契约一致：reader.read(action) → action.act(models)。
 */
export class CaptureAction implements Action {
	private resolve!: (models: ActionModel[]) => void;
	readonly promise: Promise<ActionModel[]>;

	constructor() {
		this.promise = new Promise((resolve) => {
			this.resolve = resolve;
		});
	}

	act(models: ActionModel[]): void {
		this.resolve(models);
	}
}

/** 从 ActionModel[] 提取文件并按批量上限截断。 */
function extractFiles(models: ActionModel[], limit: number): TAbstractFile[] {
	return models
		.map((model) => model.file)
		.filter((file): file is TAbstractFile => file != null)
		.slice(0, Number.isFinite(limit) && limit > 0 ? limit : models.length);
}

/**
 * 执行选定目标的查询（只读），返回命中文件（按 limit 截断）。
 * DQL：经既有 DataviewReader（LIST/TABLE/TASK 返回已由其处理）。
 * 搜索：注入搜索面板 → 等待结果稳定 → 经既有 SearchResultsReader。
 * Bases：P3a 为产物模式，不程序化执行。
 */
export async function executeQuery(
	target: QueryTarget,
	queryText: string,
	plugin: FileCookerPlugin,
	opts?: ExecuteOptions,
): Promise<TAbstractFile[]> {
	const limit = Number(plugin.settings.limit) || 0;
	const timeoutMs = opts?.timeoutMs ?? 20000;

	if (target === 'bases') {
		throw new Error('Bases 查询在本阶段仅支持生成：请点击「另存为 .base」后在 Bases 视图中使用。');
	}

	const capture = new CaptureAction();
	if (target === 'dql') {
		// 惰性引入，保持模块图与测试桩一致
		const { DataviewReader } = await import('src/reader/dataview-reader');
		new DataviewReader(plugin, queryText).read(capture);
	} else {
		await injectSearchQuery(plugin.app, queryText);
		await waitForSearchResults(getSearchView(plugin.app), opts);
		const { SearchResultsReader } = await import('src/reader/search-results-reader');
		new SearchResultsReader(plugin).read(capture);
	}

	const models = await withTimeout(capture.promise, timeoutMs, '查询执行超时');
	return extractFiles(models, limit);
}

/** 将查询注入搜索面板；setQuery 不可用时抛出降级指引。 */
async function injectSearchQuery(app: App, query: string): Promise<void> {
	let leaf = app.workspace.getLeavesOfType('search')[0];
	if (leaf == null) {
		leaf = app.workspace.getLeaf(true);
		await leaf.setViewState({ type: 'search' });
	} else if (typeof app.workspace.revealLeaf === 'function') {
		app.workspace.revealLeaf(leaf);
	}
	const view = leaf?.view as unknown as { setQuery?: (q: string) => void };
	if (view == null || typeof view.setQuery !== 'function') {
		throw new Error('当前环境不支持自动填充搜索：请将查询文本粘贴到搜索面板并回车，然后使用「搜索结果」相关命令。');
	}
	view.setQuery(query);
}

/** 读取搜索视图的内部引用（与既有 SearchResultsReader 同风格）。 */
function getSearchView(app: App): unknown {
	return app.workspace.getLeavesOfType('search')[0]?.view;
}

/** 轮询搜索结果稳定：连续两次结果数一致且 >0 视为稳定；超时则按当前结果继续。 */
async function waitForSearchResults(view: unknown, opts?: ExecuteOptions): Promise<void> {
	const pollMs = opts?.pollMs ?? 150;
	const timeoutMs = opts?.timeoutMs ?? 5000;
	const sizeOf = (): number => {
		const lookup = (view as { dom?: { resultDomLookup?: { size?: number } } })?.dom?.resultDomLookup;
		return typeof lookup?.size === 'number' ? lookup.size : 0;
	};
	let last = sizeOf();
	let stable = 0;
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		await sleep(pollMs);
		const current = sizeOf();
		if (current > 0 && current === last) {
			stable++;
			if (stable >= 2) {
				return;
			}
		} else {
			stable = 0;
		}
		last = current;
	}
}

/** Promise 超时包装：超时抛错（调用方 Notice 化）。 */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_resolve, reject) => {
			setTimeout(() => reject(new Error(message)), ms);
		}),
	]);
}

/** 等待指定毫秒。 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
