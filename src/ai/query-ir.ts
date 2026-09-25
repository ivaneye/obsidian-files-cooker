/**
 * 查询中间表示（IR v1）：自然语言选择器的核心契约。
 *
 * 职责说明：
 * - 定义 QueryIR / IrCondition 类型（节点白名单见 IR_NODE_KEYS）；
 * - validateQueryIR：对 LLM 响应做结构与取值校验 + 规范化（trim、tag 去 #）；
 * - walkConditions：深度优先遍历助手，供三编译器共享。
 * IR 是纯数据，语言编译由 compile-dql / compile-search / compile-bases 承担。
 */

/** 比较类操作（用于日期/数值比较）。 */
export type CompareOp = 'gt' | 'gte' | 'lt' | 'lte';

/** 属性条件操作集合。 */
export type PropertyOp = 'eq' | 'notEquals' | 'contains' | 'isEmpty' | CompareOp;

/** 属性比较值：字符串 / 数字 / 布尔。 */
export type PropertyPrimitive = string | number | boolean;

/** IR 条件节点（联合类型，键名即节点类型）。 */
export type IrCondition =
	| { tag: string }
	| { folder: string }
	| { filename: string }
	| { property: { field: string; op: PropertyOp; value: PropertyPrimitive } }
	| { fileModified: { op: CompareOp; date: string } }
	| { fileCreated: { op: CompareOp; date: string } }
	| { content: string }
	| { task: 'todo' | 'done' }
	| { and: IrCondition[] }
	| { or: IrCondition[] }
	| { not: IrCondition };

/** 查询 IR：v1 版本 + 人类可读解释 + 条件树。 */
export interface QueryIR {
	irVersion: 1;
	intent: string;
	conditions: IrCondition;
}

/** 布尔组合节点键。 */
const BOOLEAN_KEYS = ['and', 'or', 'not'] as const;

/** 合法节点键全集（白名单）。 */
const IR_NODE_KEYS = [
	'tag', 'folder', 'filename', 'property', 'fileModified', 'fileCreated', 'content', 'task',
	...BOOLEAN_KEYS,
] as const;

const COMPARE_OPS: ReadonlySet<string> = new Set(['gt', 'gte', 'lt', 'lte']);
const PROPERTY_OPS: ReadonlySet<string> = new Set(['eq', 'notEquals', 'contains', 'isEmpty', 'gt', 'gte', 'lt', 'lte']);

/** 判断是否普通对象。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 取对象的首个键（IR 节点为单键对象）。 */
function nodeKey(node: Record<string, unknown>): string | undefined {
	const keys = Object.keys(node);
	return keys.length === 1 ? keys[0] : undefined;
}

/** 规范化字符串：trim。 */
function norm(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

/** 校验并规范化单个条件节点（递归布尔子树）。 */
function validateCondition(node: unknown): IrCondition {
	if (!isPlainObject(node)) {
		throw new Error('IR 条件必须是对象');
	}
	const key = nodeKey(node);
	if (key == null) {
		throw new Error('IR 条件节点必须恰好包含一个键');
	}
	if (!(IR_NODE_KEYS as readonly string[]).includes(key)) {
		throw new Error(`IR 未知条件节点：${key}`);
	}
	const value = node[key];

	switch (key) {
		case 'tag': {
			const tag = norm(value).replace(/^#+/, '');
			if (tag === '') throw new Error('tag 节点值不能为空');
			return { tag };
		}
		case 'folder': {
			const folder = norm(value).replace(/^\/+|\/+$/g, '');
			if (folder === '') throw new Error('folder 节点值不能为空');
			return { folder };
		}
		case 'filename': {
			const filename = norm(value);
			if (filename === '') throw new Error('filename 节点值不能为空');
			return { filename };
		}
		case 'content': {
			const content = norm(value);
			if (content === '') throw new Error('content 节点值不能为空');
			return { content };
		}
		case 'task': {
			const task = norm(value);
			if (task !== 'todo' && task !== 'done') {
				throw new Error('task 节点值必须是 todo 或 done');
			}
			return { task };
		}
		case 'property': {
			if (!isPlainObject(value)) {
				throw new Error('property 节点值必须是对象');
			}
			const field = norm(value['field']);
			const op = norm(value['op']);
			if (field === '') throw new Error('property 缺少 field');
			if (!PROPERTY_OPS.has(op)) throw new Error(`property op 非法：${op}`);
			if (op === 'isEmpty') {
				return { property: { field, op: 'isEmpty', value: '' } };
			}
			const raw = value['value'];
			if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') {
				throw new Error('property 缺少合法 value');
			}
			return { property: { field, op: op as PropertyOp, value: raw } };
		}
		case 'fileModified':
		case 'fileCreated': {
			if (!isPlainObject(value)) {
				throw new Error(`${key} 节点值必须是对象`);
			}
			const op = norm(value['op']);
			const date = norm(value['date']);
			if (!COMPARE_OPS.has(op)) throw new Error(`${key} op 非法：${op}`);
			if (!/^\d{4}-\d{2}-\d{2}/.test(date)) throw new Error(`${key} date 必须是 YYYY-MM-DD`);
			return { [key]: { op: op as CompareOp, date } } as IrCondition;
		}
		case 'and':
		case 'or': {
			if (!Array.isArray(value) || value.length < 1) {
				throw new Error(`${key} 子项必须是非空数组`);
			}
			return { [key]: value.map(validateCondition) } as IrCondition;
		}
		case 'not': {
			return { not: validateCondition(value) };
		}
		default:
			throw new Error(`IR 未知条件节点：${key}`);
	}
}

/**
 * 校验并规范化 LLM 产出的 IR：要求 irVersion===1、intent 非空、conditions 合法。
 * 非法输入抛出带原因的 Error（由调用方 Notice 化）。
 */
export function validateQueryIR(raw: unknown): QueryIR {
	if (!isPlainObject(raw)) {
		throw new Error('IR 必须是 JSON 对象');
	}
	if (raw['irVersion'] !== 1) {
		throw new Error('IR 缺少 irVersion 或版本不受支持');
	}
	const intent = norm(raw['intent']);
	if (intent === '') {
		throw new Error('IR 缺少 intent（人类可读解释）');
	}
	if (!('conditions' in raw)) {
		throw new Error('IR 缺少 conditions');
	}
	return {
		irVersion: 1,
		intent,
		conditions: validateCondition(raw['conditions']),
	};
}

/** 遍历回调：收到规范化后的节点。 */
export type ConditionVisitor = (node: IrCondition) => void;
/** 查询目标（三种 Obsidian 查询语言）。 */
export type QueryTarget = 'dql' | 'search' | 'bases';

/** 编译产物：目标语言查询文本 + 该目标不支持的条件清单（不参与该目标语义）。 */
export interface CompiledQuery {
	text: string;
	unsupported: IrCondition[];
}

/** 深度优先遍历条件树（先访问节点本身，再访问子节点）。 */
export function walkConditions(condition: IrCondition, visitor: ConditionVisitor): void {
	visitor(condition);
	if ('and' in condition) {
		condition.and.forEach((child) => walkConditions(child, visitor));
	} else if ('or' in condition) {
		condition.or.forEach((child) => walkConditions(child, visitor));
	} else if ('not' in condition) {
		walkConditions(condition.not, visitor);
	}
}
