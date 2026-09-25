import { CompiledQuery, IrCondition, PropertyPrimitive, QueryIR } from './query-ir';

/**
 * IR → Bases YAML 确定性编译（P3a 为产物模式：生成 + 另存 .base，不程序化执行）。
 *
 * 语义约定：
 * - 仅支持顶层布尔键（根 and/or）；嵌套布尔子树标注 unsupported（避免生成非法 YAML）；
 * - 属性比较映射为 Bases 表达式：== / != / contains() / isEmpty() / > >= < <=；
 * - content / task / fileModified / fileCreated：Bases 无对应能力，进入 unsupported；
 * - 产物附最小 table 视图，保证 .base 文件打开即可见。
 */

/** Bases 字符串字面量（双引号 + 内部双引号转义）。 */
function basesString(value: string): string {
	return `"${value.replace(/"/g, '\\"')}"`;
}

/** 属性值转 Bases 字面量（字符串加引号，数字/布尔原样）。 */
function basesValue(value: PropertyPrimitive): string {
	return typeof value === 'string' ? basesString(value) : String(value);
}

/** 叶子节点 → Bases 表达式；不可表达返回 null 并记录 unsupported。 */
function leafToBases(node: IrCondition, unsupported: IrCondition[]): string | null {
	if ('tag' in node) return `file.hasTag(${basesString(node.tag)})`;
	if ('folder' in node) return `file.inFolder(${basesString(node.folder)})`;
	if ('filename' in node) return `file.name.contains(${basesString(node.filename)})`;
	if ('property' in node) {
		const { field, op, value } = node.property;
		switch (op) {
			case 'eq': return `${field} == ${basesValue(value)}`;
			case 'notEquals': return `${field} != ${basesValue(value)}`;
			case 'contains': return `${field}.contains(${basesValue(value)})`;
			case 'isEmpty': return `${field}.isEmpty()`;
			case 'gt': return `${field} > ${basesValue(value)}`;
			case 'gte': return `${field} >= ${basesValue(value)}`;
			case 'lt': return `${field} < ${basesValue(value)}`;
			case 'lte': return `${field} <= ${basesValue(value)}`;
		}
	}
	// content / task / fileModified / fileCreated：Bases 无对应能力
	unsupported.push(node);
	return null;
}

/** 条件子树 → Bases 表达式；嵌套布尔子树标注 unsupported（扁平 MVP）。 */
function conditionToBases(node: IrCondition, unsupported: IrCondition[]): string | null {
	if ('and' in node || 'or' in node) {
		const children = 'and' in node ? node.and : node.or;
		const parts: string[] = [];
		children.forEach((child) => {
			// 嵌套布尔子树不支持（Bases YAML 需内联对象，MVP 扁平化）
			if ('and' in child || 'or' in child || 'not' in child) {
				unsupported.push(child);
				return;
			}
			const expr = conditionToBases(child, unsupported);
			if (expr != null) {
				parts.push(expr);
			}
		});
		return parts.length === 0 ? null : parts.join('@@');
	}
	if ('not' in node) {
		unsupported.push(node);
		return null;
	}
	return leafToBases(node, unsupported);
}

/**
 * 编译 IR → Bases YAML。
 * 根布尔键决定 filters.and / filters.or；根为单条件时按 and 承载。
 * 纯函数：相同 IR 恒定输出。
 */
export function compileBases(ir: QueryIR): CompiledQuery {
	const unsupported: IrCondition[] = [];
	let rootKey: 'and' | 'or' = 'and';
	let conditions: IrCondition[];

	if ('or' in ir.conditions) {
		rootKey = 'or';
		conditions = ir.conditions.or;
	} else if ('and' in ir.conditions) {
		rootKey = 'and';
		conditions = ir.conditions.and;
	} else {
		conditions = [ir.conditions];
	}

	const exprs = conditions
		.map((child) => {
			if ('and' in child || 'or' in child || 'not' in child) {
				unsupported.push(child);
				return null;
			}
			return conditionToBases(child, unsupported);
		})
		.filter((expr): expr is string => expr != null);

	const lines: string[] = ['filters:'];
	if (exprs.length === 0) {
		// 无可表达条件：空 and 列表（合法但无过滤），附提示由 unsupported 承载
		lines.push(`  ${rootKey}: []`);
	} else {
		lines.push(`  ${rootKey}:`);
		exprs.forEach((expr) => lines.push(`    - '${expr.replace(/'/g, "''")}'`));
	}
	lines.push('views:');
	lines.push('  - type: table');
	lines.push('    name: 全部');

	return { text: lines.join('\n'), unsupported };
}
