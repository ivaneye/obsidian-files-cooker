import { App } from 'obsidian';
import { AiSettings } from './ai-settings';
import { ChatMessage } from './ai-provider';
import { validateQueryIR, QueryIR } from './query-ir';

/**
 * 查询规划器：自然语言 + 库内上下文 → IR。
 *
 * 职责说明：
 * - collectVaultContext：采集标签词表 / 属性键 / 顶层与二级目录 / 今天日期（均有上限，缺失优雅降级）；
 * - buildPlannerMessages：构建规划 prompt（IR v1 Schema + 词表约束 + 日期锚点），
 *   只发送自然语言与元数据词表，不发送任何笔记正文；
 * - QueryPlanner.generate：调用 AI 后经 extractJsonObject + validateQueryIR 双重校验。
 */

/** 库内上下文（数量均有上限，防止 prompt 过长）。 */
export interface VaultContext {
	tags: string[];
	properties: string[];
	folders: string[];
	today: string;
}

/** 上下文数量上限。 */
const CONTEXT_LIMITS = { tags: 200, properties: 100, folders: 100 } as const;

/**
 * 采集库内上下文。
 * 全部 API 均做存在性探测，缺失时优雅降级为空表（今天日期恒可用）。
 */
export function collectVaultContext(
	app: App,
	limits: { tags: number; properties: number; folders: number } = CONTEXT_LIMITS,
): VaultContext {
	// 标签词表（复用 P1 的词表构建：去 #、去重、截断）
	let tags: string[] = [];
	try {
		const rawTags = (app.metadataCache as unknown as { getTags?: () => Record<string, unknown> }).getTags?.();
		tags = Object.keys(rawTags ?? {})
			.map((key) => key.replace(/^#+/, '').trim())
			.filter((key) => key !== '');
		tags = [...new Set(tags)].slice(0, limits.tags);
	} catch (e) {
		tags = [];
	}

	// 属性键清单（Obsidian 1.9+ API；缺失时为空表）
	let properties: string[] = [];
	try {
		const infos = (app.metadataCache as unknown as {
			getAllPropertyInfos?: () => Record<string, unknown>;
		}).getAllPropertyInfos?.();
		properties = Object.keys(infos ?? {}).slice(0, limits.properties);
	} catch (e) {
		properties = [];
	}

	// 顶层/二级目录：遍历 vault 根的孩子与二级 folder（鸭子类型判断，避免依赖 TFolder 类型）
	const folders: string[] = [];
	try {
		const root = (app.vault as unknown as {
			getRoot?: () => { children?: Array<{ path?: string; children?: unknown[] }> };
		}).getRoot?.();
		const level1 = root?.children ?? [];
		for (const child of level1) {
			if (!Array.isArray(child.children)) {
				continue; // 文件节点
			}
			if (typeof child.path === 'string' && child.path !== '') {
				folders.push(child.path);
			}
			for (const grandChild of child.children as Array<{ path?: string; children?: unknown[] }>) {
				if (Array.isArray(grandChild.children) && typeof grandChild.path === 'string') {
					folders.push(grandChild.path);
				}
			}
		}
	} catch (e) {
		// 遍历失败降级为空表
	}

	return {
		tags: tags.slice(0, limits.tags),
		properties: properties.slice(0, limits.properties),
		folders: [...new Set(folders)].slice(0, limits.folders),
		today: new Date().toISOString().slice(0, 10),
	};
}

/** 系统 prompt：IR v1 Schema 与约束（集中为常量，便于后续调优）。 */
const PLANNER_SYSTEM = [
	'You are a query planner for an Obsidian vault.',
	'Translate the user request into a filter IR (intermediate representation) that will be compiled locally into Obsidian queries.',
	'Rules:',
	'- Use ONLY tags from the provided vocabulary (without "#").',
	'- Use ONLY property keys from the provided property list.',
	'- Resolve relative dates ("last year", "recent 3 months") into concrete YYYY-MM-DD dates using the provided today.',
	'- conditions is a boolean tree. Allowed nodes (exactly one key each):',
	'  {"tag":"name"} | {"folder":"path"} | {"filename":"text"} | {"content":"text"} | {"task":"todo"|"done"},',
	'  {"property":{"field":"key","op":"eq"|"notEquals"|"contains"|"isEmpty"|"gt"|"gte"|"lt"|"lte","value":string|number|boolean}},',
	'  {"fileCreated":{"op":"gt"|"gte"|"lt"|"lte","date":"YYYY-MM-DD"}},',
	'  {"fileModified":{"op":...,"date":"YYYY-MM-DD"}},',
	'  {"and":[...]} | {"or":[...]} | {"not":{...}}',
	'- Prefer simple conditions; do not invent tags/properties that are not in the lists.',
	'- Negation requests ("没有/不含/未包含 X") MUST use the not wrapper, e.g. notes without wikilinks -> {"not":{"content":"[["}}.',
	'- IR values are RAW literal text: never add quotes in values (quoting/escaping is handled by the compiler).',
	'- "有链接/包含链接" usually means the note content contains "[[": {"content":"[["} .',
	'Return STRICT JSON only: {"irVersion":1,"intent":"<short Chinese summary>","conditions":{...}}',
	'The vocabulary is under key "vocabulary"; property keys under "properties"; folders under "folders"; today under "today".',
].join('\n');

/** 构建规划消息：system 约束 + user（输入与上下文 JSON）。 */
export function buildPlannerMessages(input: string, context: VaultContext): { messages: ChatMessage[] } {
	const payload = {
		input,
		context: {
			vocabulary: context.tags,
			properties: context.properties,
			folders: context.folders,
			today: context.today,
		},
	};
	return {
		messages: [
			{ role: 'system', content: PLANNER_SYSTEM },
			{ role: 'user', content: JSON.stringify(payload) },
		],
	};
}

/** AI 客户端最小接口（便于测试注入）。 */
export interface PlannerProviderLike {
	chatJson(messages: ChatMessage[]): Promise<unknown>;
}

/**
 * 查询规划器：generate(input) → 校验后的 IR。
 * 响应经 extractJsonObject（AiProvider 内）与 validateQueryIR 双重校验，
 * 非法响应抛出带原因的 Error（由上层 Notice 化）。
 */
export class QueryPlanner {
	private readonly settings: AiSettings;
	private readonly provider: PlannerProviderLike;
	private readonly context: VaultContext;

	constructor(settings: AiSettings, provider: PlannerProviderLike, context: VaultContext) {
		this.settings = settings;
		this.provider = provider;
		this.context = context;
	}

	/** 规划一次查询：自然语言 → IR。 */
	async generate(input: string): Promise<QueryIR> {
		const { messages } = buildPlannerMessages(input, this.context);
		const raw = await this.provider.chatJson(messages);
		return validateQueryIR(raw);
	}
}
