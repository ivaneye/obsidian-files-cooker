import { AiSettings } from './ai-settings';
import { t } from 'src/i18n/index';
import { ChatMessage } from './ai-provider';

/**
 * AI 属性推断（P1 专属）：prompt 构建、响应解析校验与值规范化。
 *
 * 职责说明：
 * - buildTagVocabulary：将全库标签整理为去 # / 去重 / 截断的词表，引导模型复用既有标签；
 * - buildInferPrompts：按契约构建 system/user 消息（逐文件 path/title/content/existing + 词表）；
 * - parseInferResponse：校验响应 JSON、按 path 回配文件（无法回配的条目丢弃）；
 * - normalizeTags / normalizeAliases：提案值规范化（转小写、去 #、去空白、去重）。
 * 全部为纯函数，网络调用由 AiProvider / batch 调度器承担。
 */

/** 送入推断的单文件上下文。 */
export interface InferFileContext {
	path: string;
	title: string;
	content: string;
	existing: { tags?: string[]; aliases?: string[] };
	/** 全量 frontmatter，仅用于本地无差异过滤，不随 prompt 发送。 */
	frontmatter?: Record<string, unknown>;
}

/** 推断选项（由 AiSettings + 弹窗场景推导）。 */
export interface InferOptions {
	inferTags: boolean;
	inferAliases: boolean;
	customProps: string[];
	tagLanguage: AiSettings['tagLanguage'];
}

/** 单文件属性提案（规范化后）。 */
export interface PropertyProposal {
	path: string;
	props: {
		tags?: string[];
		aliases?: string[];
		[key: string]: unknown;
	};
}

/** 标签词表上限，避免 prompt 过长。 */
const TAG_VOCAB_LIMIT = 200;

/**
 * 构建标签词表：去 #、按去 # 后的名字去重、截断到上限。
 * 输入为 metadataCache.getTags() 的键值对（键可能带 #）。
 */
export function buildTagVocabulary(allTags: Record<string, unknown>, limit: number = TAG_VOCAB_LIMIT): string[] {
	const seen = new Set<string>();
	const vocab: string[] = [];
	Object.keys(allTags).forEach((raw) => {
		const name = raw.replace(/^#+/, '').trim();
		if (name === '' || seen.has(name.toLowerCase())) {
			return;
		}
		seen.add(name.toLowerCase());
		vocab.push(name);
	});
	return vocab.slice(0, limit);
}

/** 按语言偏好生成 system 指令片段。 */
function tagLanguageInstruction(tagLanguage: AiSettings['tagLanguage']): string {
	if (tagLanguage === 'zh') {
		return 'Tags MUST be in Chinese.';
	}
	if (tagLanguage === 'en') {
		return 'Tags MUST be in English.';
	}
	return 'Tags SHOULD follow the language of the note content.';
}

/**
 * 构建推断消息：system 含任务说明与严格 JSON Schema；
 * user 含词表与逐文件上下文（content 按 settings.contextChars 截断）。
 */
export function buildInferPrompts(
	files: InferFileContext[],
	vocabulary: string[],
	settings: AiSettings,
	options: InferOptions,
): { messages: ChatMessage[] } {
	const propRequests: string[] = [];
	if (options.inferTags) {
		propRequests.push('- tags: 2~5 items, lowercase, no "#" prefix; prefer reusing the provided vocabulary');
	}
	if (options.inferAliases) {
		propRequests.push('- aliases: 0~3 alternative titles (only when clearly useful)');
	}
	options.customProps.forEach((key) => {
		propRequests.push(`- ${key}: infer if clearly supported by content, otherwise omit`);
	});

	// schema 示例随开关动态生成，避免引导模型输出未启用的属性
	const schemaProps: string[] = [];
	if (options.inferTags) {
		schemaProps.push('"tags":[]');
	}
	if (options.inferAliases) {
		schemaProps.push('"aliases":[]');
	}
	options.customProps.forEach((key) => {
		schemaProps.push(`"${key}":""`);
	});

	const system = [
		'You are a metadata assistant for an Obsidian vault.',
		'For each note, infer frontmatter properties:',
		...propRequests,
		tagLanguageInstruction(options.tagLanguage),
		'Never invent facts not supported by the content.',
		`Return STRICT JSON only, schema: {"results":[{"path":"...","props":{${schemaProps.join(',')}}}]}.`,
		'props keys must only contain: '
		+ [
			options.inferTags ? '"tags"' : null,
			options.inferAliases ? '"aliases"' : null,
			...options.customProps.map((k) => `"${k}"`),
		].filter(Boolean).join(', ') + '.',
	].join('\n');

	const payload = {
		vocabulary: vocabulary.slice(0, TAG_VOCAB_LIMIT),
		notes: files.map((file) => ({
			path: file.path,
			title: file.title,
			content: file.content.slice(0, Math.max(0, settings.contextChars)),
			existing: file.existing,
		})),
	};

	return {
		messages: [
			{ role: 'system', content: system },
			{ role: 'user', content: JSON.stringify(payload) },
		],
	};
}

/** 响应体中实际使用的结构。 */
interface InferResponseShape {
	results?: Array<{
		path?: unknown;
		props?: Record<string, unknown>;
	}>;
}

/**
 * 解析并校验响应：
 * - 非法 JSON 或结构缺失抛错（由调度器计入该批失败）；
 * - 按 path 回配输入文件，无法回配的条目丢弃；
 * - tags/aliases 规范化，自定义属性透传（仅保留字符串/数字/布尔标量）。
 */
export function parseInferResponse(
	raw: unknown,
	files: InferFileContext[],
): PropertyProposal[] {
	let shape: InferResponseShape;
	if (typeof raw === 'string') {
		try {
			shape = JSON.parse(raw) as InferResponseShape;
		} catch (e) {
			throw new Error(t('AI 响应不是合法 JSON：{snippet}', { snippet: raw.slice(0, 100) }));
		}
	} else if (raw != null && typeof raw === 'object') {
		shape = raw as InferResponseShape;
	} else {
		throw new Error(t('AI 响应结构缺失'));
	}

	if (!Array.isArray(shape.results)) {
		throw new Error(t('AI 响应缺少 results 数组'));
	}

	const byPath = new Map(files.map((file) => [file.path, file]));
	const proposals: PropertyProposal[] = [];

	shape.results.forEach((entry) => {
		if (entry == null || typeof entry !== 'object') {
			return;
		}
		const path = typeof entry.path === 'string' ? entry.path : null;
		if (path == null || !byPath.has(path)) {
			// 无法回配的条目丢弃（模型幻觉或重复路径）
			return;
		}
		const props: PropertyProposal['props'] = {};
		const rawProps = entry.props;
		if (rawProps != null && typeof rawProps === 'object') {
			const tags = rawProps.tags;
			if (Array.isArray(tags)) {
				const normalized = normalizeTags(tags.map((t) => String(t)));
				if (normalized.length > 0) {
					props.tags = normalized;
				}
			}
			const aliases = rawProps.aliases;
			if (Array.isArray(aliases)) {
				const normalized = normalizeAliases(aliases.map((a) => String(a)));
				if (normalized.length > 0) {
					props.aliases = normalized;
				}
			}
			Object.keys(rawProps).forEach((key) => {
				if (key === 'tags' || key === 'aliases') {
					return;
				}
				const value = rawProps[key];
				if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
					props[key] = typeof value === 'string' ? value.trim() : value;
				}
			});
		}
		if (Object.keys(props).length > 0) {
			proposals.push({ path, props });
		}
	});

	return proposals;
}

/**
 * tags 规范化：转小写、去 # 前缀、去首尾空白、去空串、去重。
 * 说明：中文标签不受 toLowerCase 影响，保留原文字符；存储值为规范化形式。
 */
export function normalizeTags(tags: string[]): string[] {
	return normalizeStringList(tags, (value) => value.replace(/^#+/, '').toLowerCase(), true);
}

/** aliases 规范化：去首尾空白、去空串、精确去重（保留原始大小写）。 */
export function normalizeAliases(aliases: string[]): string[] {
	return normalizeStringList(aliases, (value) => value, false);
}

/**
 * 字符串列表通用规范化：trim、映射、去空、按映射键去重。
 * pushMapped=true 时存入映射后的值（如小写化），否则保留首个出现的原始值。
 */
function normalizeStringList(values: string[], mapKey: (value: string) => string, pushMapped: boolean): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	values.forEach((raw) => {
		const value = String(raw ?? '').trim();
		if (value === '') {
			return;
		}
		const key = mapKey(value);
		if (key === '' || seen.has(key)) {
			return;
		}
		seen.add(key);
		result.push(pushMapped ? key : value);
	});
	return result;
}
