import { getAPI } from 'obsidian-dataview';

/**
 * 查询脚本语法检查：DQL / 搜索语法 / Bases 三种脚本的 lint。
 *
 * 职责说明：
 * - lintSearch / lintBases：纯函数结构检查（配平、键白名单）；
 * - lintDql：借道 Dataview `tryQuery` 只读试跑（检查即执行，均为只读语义）；
 *   Dataview 缺失时降级为警告（允许直接尝试执行）。
 * 阻断规则：存在 error → 阻断执行；仅 warning → 允许执行并明示。
 */

export interface LintIssue {
	level: 'error' | 'warning';
	message: string;
}

/** 搜索语法操作符白名单（属性方括号形式 [f:v] 单独识别，不进此表）。 */
const SEARCH_OPERATORS: ReadonlySet<string> = new Set([
	'tag', 'path', 'file', 'line', 'block', 'section', 'content', 'task', 'task-todo', 'task-done',
]);

/** 去掉引号内内容，保留结构字符（供配平/操作符扫描）。 */
function stripQuoted(text: string, quote: string): string {
	let out = '';
	let inQuote = false;
	for (const ch of text) {
		if (ch === quote) {
			inQuote = !inQuote;
			out += ' ';
			continue;
		}
		out += inQuote ? ' ' : ch;
	}
	return out;
}

/** 统计引号数量是否为偶数（未配平返回 true）。 */
function hasUnbalancedQuotes(text: string, quote: string): boolean {
	let count = 0;
	for (const ch of text) {
		if (ch === quote) count++;
	}
	return count % 2 !== 0;
}

/**
 * 搜索语法结构检查：
 * - 引号 / 圆括号 / 方括号配平（error）；
 * - `操作符:` 前缀白名单（未知 → warning，不阻断——可能为属性名或新版本操作符）。
 */
export function lintSearch(text: string): LintIssue[] {
	const issues: LintIssue[] = [];
	if (hasUnbalancedQuotes(text, '"')) {
		issues.push({ level: 'error', message: '引号不配平：存在未闭合的 " 。' });
	}

	const structural = stripQuoted(text, '"');
	let paren = 0;
	let bracket = 0;
	let negative = false;
	for (const ch of structural) {
		if (ch === '(') paren++;
		else if (ch === ')') paren--;
		else if (ch === '[') bracket++;
		else if (ch === ']') bracket--;
		if (paren < 0 || bracket < 0) {
			negative = true;
		}
	}
	if (negative || paren !== 0) {
		issues.push({ level: 'error', message: '括号不配平：请检查 ( ) [ ] 是否成对。' });
	}

	// 操作符白名单：在无引号、方括号段整体移除后扫描 `词:` 前缀
	const noBrackets = structural.replace(/\[[^\]]*\]/g, ' ');
	const operatorPattern = /([A-Za-z][A-Za-z-]*)\s*:/g;
	let match: RegExpExecArray | null;
	while ((match = operatorPattern.exec(noBrackets)) !== null) {
		if (!SEARCH_OPERATORS.has(match[1])) {
			issues.push({ level: 'warning', message: `未知操作符「${match[1]}:」，将按普通文本匹配（若为属性搜索请使用 [属性:值] 形式）。` });
		}
	}

	return issues;
}

/** Bases 顶层键白名单。 */
const BASES_TOP_KEYS: ReadonlySet<string> = new Set(['filters', 'views']);

/**
 * Bases YAML 结构检查（轻量，非完整 YAML 解析）：
 * - 必须包含顶层 filters:（error）；
 * - 单引号配平（error）；
 * - 未知顶层键（warning）。
 */
export function lintBases(text: string): LintIssue[] {
	const issues: LintIssue[] = [];
	if (!/^filters:/m.test(text)) {
		issues.push({ level: 'error', message: '缺少顶层 filters: 配置，Bases 无法筛选。' });
	}
	if (hasUnbalancedQuotes(text, "'")) {
		issues.push({ level: 'error', message: "引号不配平：存在未闭合的 '（注意 YAML 单引号转义写作两个连续单引号）。" });
	}
	const lines = text.split('\n');
	for (const line of lines) {
		const keyMatch = /^([A-Za-z_-]+):/.exec(line);
		if (keyMatch != null && !BASES_TOP_KEYS.has(keyMatch[1])) {
			issues.push({ level: 'warning', message: `未知顶层键「${keyMatch[1]}:」（白名单：filters / views）。` });
		}
	}
	return issues;
}

/**
 * DQL 检查：借道 Dataview `tryQuery` 只读试跑。
 * Dataview 缺失 → 仅警告（允许直接尝试执行）；试跑抛错 → error（带 Dataview 原始信息）。
 */
export async function lintDql(text: string): Promise<LintIssue[]> {
	let api: { tryQuery?: (source: string) => Promise<unknown> } | null = null;
	try {
		api = getAPI() as unknown as { tryQuery?: (source: string) => Promise<unknown> };
	} catch (e) {
		api = null;
	}
	if (api == null || typeof api.tryQuery !== 'function') {
		return [{ level: 'warning', message: 'Dataview 未启用，无法检查 DQL 语法；将直接尝试执行。' }];
	}
	try {
		await api.tryQuery(text);
		return [];
	} catch (e) {
		return [{ level: 'error', message: e instanceof Error ? e.message : String(e) }];
	}
}
