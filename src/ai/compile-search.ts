import { CompiledQuery, IrCondition, PropertyPrimitive, QueryIR } from './query-ir';

/**
 * IR → Obsidian 搜索语法确定性编译。
 *
 * 语义约定：
 * - and → 空格连接（隐式 AND）；or → 括号 + OR；not → -(...)；
 * - property 精确 [f:v]、取反 -[f:v]、contains 尽力匹配 [f:v]、isEmpty [f:null]；
 * - task → task-todo:() / task-done:()；content → content:x；
 * - fileModified / fileCreated / 数值比较：搜索语法无对应能力，进入 unsupported。
 */

/** 属性值转搜索字面量（含空格加引号）。 */
function searchValue(value: PropertyPrimitive): string {
	const text = String(value);
	return /\s/.test(text) ? `"${text}"` : text;
}

/** 自由文本转短语字面量：恒加双引号，内部双引号不转义（Obsidian 搜索不支持 \" 转义，应避免此类值）。 */
function dq(text: string): string {
	return `"${text}"`;
}

/** 单个叶子节点 → 搜索片段；不可表达返回 null 并记录 unsupported。 */
function leafToSearch(node: IrCondition, unsupported: IrCondition[]): string | null {
	if ('tag' in node) return `tag:#${node.tag}`;
	if ('folder' in node) return `path:"${node.folder}"`;
	if ('filename' in node) return `file:${searchValue(node.filename)}`;
	if ('content' in node) return `content:${dq(node.content)}`;
	if ('task' in node) return node.task === 'todo' ? 'task-todo:()' : 'task-done:()';
	if ('property' in node) {
		const { field, op, value } = node.property;
		switch (op) {
			case 'eq': return `[${field}:${searchValue(value)}]`;
			case 'notEquals': return `-[${field}:${searchValue(value)}]`;
			case 'contains': return `[${field}:${searchValue(value)}]`;
			case 'isEmpty': return `[${field}:null]`;
			default:
				unsupported.push(node);
				return null;
		}
	}
	// fileModified / fileCreated：搜索语法无日期能力
	unsupported.push(node);
	return null;
}

/** 条件子树 → 搜索表达式片段；nested=true 表示处于组合内（and 需加括号）。 */
function conditionToSearch(node: IrCondition, unsupported: IrCondition[], nested = false): string | null {
	if ('and' in node) {
		const parts = node.and
			.map((child) => conditionToSearch(child, unsupported, true))
			.filter((part): part is string => part != null);
		if (parts.length === 0) return null;
		const text = parts.join(' ');
		return nested ? `(${text})` : text;
	}
	if ('or' in node) {
		const parts = node.or
			.map((child) => conditionToSearch(child, unsupported, true))
			.filter((part): part is string => part != null);
		if (parts.length === 0) return null;
		return `(${parts.join(' OR ')})`;
	}
	if ('not' in node) {
		const inner = conditionToSearch(node.not, unsupported, true);
		if (inner == null) {
			return null;
		}
		// 所有片段直接前缀 -：OR 组合已自带括号，叶子/and 组无空格歧义；
		// not(not(x)) 双重否定按恒等化简，避免生成非法的 --x
		const body = inner.startsWith('-') ? inner.slice(1) : inner;
		return `-${body}`;
	}
	return leafToSearch(node, unsupported);
}

/**
 * 编译 IR → 搜索语法查询文本。
 * 纯函数：相同 IR 恒定输出。
 */
export function compileSearch(ir: QueryIR): CompiledQuery {
	const unsupported: IrCondition[] = [];
	const text = conditionToSearch(ir.conditions, unsupported) ?? '';
	return { text, unsupported };
}
