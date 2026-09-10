/**
 * 备份/撤销的数据模型与 manifest 序列化（纯函数，可独立复用与测试）。
 *
 * 职责说明：
 * - 定义 ChangeKind / FileChange / UndoRecord / 状态类型；
 * - 提供 serializeRecords / parseRecords 纯函数，manifest 读写统一经由这里；
 * - parseRecords 对损坏或非法数据做降级处理（返回空列表 / 过滤非法记录），
 *   保证插件加载时损坏 manifest 不会阻塞启动。
 */

/** 变更类型：content=内容写回；path=路径变更（反向重命名）；create=新建（trash）；delete=删除（重建）。 */
export type ChangeKind = 'content' | 'path' | 'create' | 'delete';

/** 单文件变更记录（manifest 中仅元数据，正文存于 blob 文件）。 */
export interface FileChange {
	kind: ChangeKind;
	/** 操作前路径。 */
	path: string;
	/** path 类变更的目标路径。 */
	newPath?: string;
	/** 内容快照文件名（content/delete 用，相对记录目录）。 */
	beforeBlob?: string;
	/** 操作后内容快照文件名（content/create 用，供 drift 检测）。 */
	afterBlob?: string;
	/** 是否已回滚（回滚成功后置 true，用于记录状态流转）。 */
	reverted?: boolean;
}

/** 一次批量操作对应一条记录的状态。 */
export type UndoStatus = 'active' | 'partial' | 'reverted';

/** 批量写操作的类型（与各确认模态框一一对应）。 */
export type OpType = 'properties' | 'move' | 'rename' | 'delete' | 'merge' | 'create';

/** 一条可回滚的历史记录。 */
export interface UndoRecord {
	/** 唯一标识：时间戳 + 随机后缀。 */
	id: string;
	/** 操作发生时间（毫秒时间戳）。 */
	time: number;
	/** 操作类型。 */
	opType: OpType;
	/** 用户可读描述。 */
	opLabel: string;
	/** 回滚状态：active=未回滚；partial=部分回滚；reverted=全部回滚。 */
	status: UndoStatus;
	/** 本次操作受影响的文件列表。 */
	files: FileChange[];
}

const OP_TYPES: OpType[] = ['properties', 'move', 'rename', 'delete', 'merge', 'create'];
const STATUSES: UndoStatus[] = ['active', 'partial', 'reverted'];

/** 序列化记录列表为 manifest 文本。 */
export function serializeRecords(records: UndoRecord[]): string {
	return JSON.stringify(records, null, 2);
}

/** 按 kind 校验 FileChange 必需字段；不合法返回 false。 */
function isValidFileChange(value: unknown): value is FileChange {
	if (!isPlainObject(value)) {
		return false;
	}
	const fc = value as Record<string, unknown>;
	if (typeof fc.path !== 'string') {
		return false;
	}
	const kind = fc.kind;
	switch (kind) {
		case 'content':
			return typeof fc.beforeBlob === 'string' && typeof fc.afterBlob === 'string';
		case 'path':
			return typeof fc.newPath === 'string';
		case 'create':
			return typeof fc.afterBlob === 'string';
		case 'delete':
			return typeof fc.beforeBlob === 'string';
		default:
			return false;
	}
}

/** 校验单条记录；不合法返回 false。 */
function isValidRecord(value: unknown): value is UndoRecord {
	if (!isPlainObject(value)) {
		return false;
	}
	const rec = value as Record<string, unknown>;
	return (
		typeof rec.id === 'string' &&
		typeof rec.time === 'number' &&
		typeof rec.opType === 'string' &&
		OP_TYPES.includes(rec.opType as OpType) &&
		typeof rec.opLabel === 'string' &&
		typeof rec.status === 'string' &&
		STATUSES.includes(rec.status as UndoStatus) &&
		Array.isArray(rec.files) &&
		rec.files.every(isValidFileChange)
	);
}

/** 解析 manifest 文本；损坏或非法输入降级为空列表，非法记录被过滤。 */
export function parseRecords(raw: string): UndoRecord[] {
	if (!raw || raw.trim() === '') {
		return [];
	}
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(data)) {
		return [];
	}
	return data.filter(isValidRecord);
}

/** 判断是否为普通对象（非数组、非 null）。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
