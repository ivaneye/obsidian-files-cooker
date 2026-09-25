import { CompiledQuery, CompareOp, IrCondition, PropertyPrimitive, QueryIR, walkConditions } from './query-ir';

/**
 * IR → DQL 确定性编译。
 *
 * 语义约定：
 * - 根为 and：直接的 tag/folder 子节点进 FROM（Dataview 的 OR 语义），其余子节点转 WHERE（顶层不再包括号）；
 * - 根为单 tag/folder：仅 FROM；嵌套在 or/not 内的 tag/folder 退化为 WHERE 表达式
 *   （contains(file.tags) / startsWith(file.path)）；
 * - content / task 节点 DQL 无法表达（正文全文检索与 TASK 语义歧义），进入 unsupported。
 */

/** 字符串值转 DQL 字面量（转义内部双引号）。 */
function dq(value: string): string {
	return `"${value.replace(/"/g, '\\"')}"`;
}

/** 属性值转 DQL 字面量（字符串加引号，数字/布尔原样）。 */
function valueLiteral(value: PropertyPrimitive): string {
	return typeof value === 'string' ? dq(value) : String(value);
}

/** 比较操作到 DQL 操作符。 */
function compareSymbol(op: CompareOp): string {
	switch (op) {
		case 'gt': return '>';
		case 'gte': return '>=';
		case 'lt': return '<';
		case 'lte': return '<=';
	}
}

/** 非来源类节点 → WHERE 表达式；不可表达返回 null 并记录 unsupported。 */
function toWhere(node: IrCondition, unsupported: IrCondition[]): string | null {
	if ('tag' in node) {
		return `contains(file.tags, ${dq('#' + node.tag)})`;
	}
	if ('folder' in node) {
		return `startsWith(file.path, ${dq(node.folder + '/')})`;
	}
	if ('filename' in node) {
		return `contains(file.name, ${dq(node.filename)})`;
	}
	if ('property' in node) {
		const { field, op, value } = node.property;
		switch (op) {
			case 'eq': return `${field} = ${valueLiteral(value)}`;
			case 'notEquals': return `${field} != ${valueLiteral(value)}`;
			case 'contains': return `contains(${field}, ${valueLiteral(value)})`;
			case 'isEmpty': return `!${field}`;
			default: return `${field} ${compareSymbol(op)} ${valueLiteral(value)}`;
		}
	}
	if ('fileModified' in node) {
		return `file.mday ${compareSymbol(node.fileModified.op)} date(${node.fileModified.date})`;
	}
	if ('fileCreated' in node) {
		return `file.cday ${compareSymbol(node.fileCreated.op)} date(${node.fileCreated.date})`;
	}
	// content / task：DQL 无法表达
	unsupported.push(node);
	return null;
}

/** 条件子树 → WHERE 表达式片段（组合节点递归）。 */
function conditionToWhere(node: IrCondition, unsupported: IrCondition[]): string | null {
	if ('and' in node) {
		const parts = node.and
			.map((child) => conditionToWhere(child, unsupported))
			.filter((part): part is string => part != null);
		if (parts.length === 0) {
			return null;
		}
		return parts.length === 1 ? parts[0] : `(${parts.join(' AND ')})`;
	}
	if ('or' in node) {
		const parts = node.or
			.map((child) => conditionToWhere(child, unsupported))
			.filter((part): part is string => part != null);
		if (parts.length === 0) {
			return null;
		}
		return `(${parts.join(' OR ')})`;
	}
	if ('not' in node) {
		const inner = conditionToWhere(node.not, unsupported);
		return inner == null ? null : `!(${inner})`;
	}
	return toWhere(node, unsupported);
}

/**
 * 编译 IR → DQL 查询文本。
 * 纯函数：相同 IR 恒定输出。
 */
export function compileDql(ir: QueryIR): CompiledQuery {
	const unsupported: IrCondition[] = [];

	// FROM 划分：根为 and 时，直接的 tag/folder 子节点进 FROM
	const isSource = (child: IrCondition): child is { tag: string } | { folder: string } =>
		'tag' in child || 'folder' in child;
	const fromCandidates: Array<{ tag: string } | { folder: string }> = [];
	if ('and' in ir.conditions) {
		fromCandidates.push(...ir.conditions.and.filter(isSource));
	} else if ('tag' in ir.conditions) {
		fromCandidates.push({ tag: ir.conditions.tag });
	} else if ('folder' in ir.conditions) {
		fromCandidates.push({ folder: ir.conditions.folder });
	}

	const fromParts = fromCandidates.map((node) => ('tag' in node ? `#${node.tag}` : `"${node.folder}"`));

	// WHERE 构建
	let whereExpr: string | null = null;
	if ('and' in ir.conditions) {
		const rest = ir.conditions.and.filter((child) => !isSource(child));
		const parts = rest
			.map((child) => conditionToWhere(child, unsupported))
			.filter((part): part is string => part != null);
		whereExpr = parts.length === 0 ? null : parts.join(' AND ');
	} else if (fromCandidates.length === 0) {
		// 根不是 tag/folder 也不是 and：整树转 WHERE
		whereExpr = conditionToWhere(ir.conditions, unsupported);
	}

	const lines: string[] = ['LIST'];
	lines.push(`FROM ${fromParts.length > 0 ? fromParts.join(' OR ') : '""'}`);
	if (whereExpr != null && whereExpr !== '') {
		lines.push(`WHERE ${whereExpr}`);
	}

	// unsupported 收集：遍历全树，找 content/task（去重引用）
	walkConditions(ir.conditions, (node) => {
		if ('content' in node || 'task' in node) {
			if (!unsupported.some((item) => item === node)) {
				unsupported.push(node);
			}
		}
	});

	return { text: lines.join('\n'), unsupported };
}
