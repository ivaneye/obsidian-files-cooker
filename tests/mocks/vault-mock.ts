import { TAbstractFile, TFile } from './obsidian';

/**
 * 测试基础设施：内存版 Vault / FileManager / App 替身
 * ------------------------------------------------------------------
 * 用途：为 BackupService 与模态框集成测试提供无真实文件系统的运行环境。
 * 说明：非业务行为，不套用 TDD；由 BackupService 用例驱动验证。
 * 实现要点：
 * - 底层为 path -> content 的 Map，vault 与 adapter 共享同一份内存文件表；
 * - renameFile 同步更新路径映射（模拟 Obsidian 的链接维护语义）；
 * - processFrontMatter 提供最小化 frontmatter 编辑行为，供属性编辑集成测试使用。
 */

/** 内存版 DataAdapter：操作底层 path -> content 映射，避免触发 vault 事件。 */
export class AdapterMock {
	files: Map<string, string>;

	constructor(files: Map<string, string>) {
		this.files = files;
	}

	/** 检查文件是否存在（目录不作为文件记录）。 */
	async exists(path: string): Promise<boolean> {
		return this.files.has(path);
	}

	/** 读取文件内容，不存在则抛错。 */
	async read(path: string): Promise<string> {
		const value = this.files.get(path);
		if (value === undefined) {
			throw new Error(`No such file: ${path}`);
		}
		return value;
	}

	/** 写入文件（内存中无真实目录，写即落表）。 */
	async write(path: string, data: string): Promise<void> {
		this.files.set(path, data);
	}

	/** 创建目录：内存模型不区分目录，仅保证调用不抛错。 */
	async mkdir(path: string): Promise<void> {
		// 目录存在性由文件路径前缀隐式体现，无需显式记录。
		return;
	}

	/** 重命名文件并更新路径映射。 */
	async rename(oldPath: string, newPath: string): Promise<void> {
		const value = this.files.get(oldPath);
		if (value === undefined) {
			throw new Error(`No such file: ${oldPath}`);
		}
		this.files.delete(oldPath);
		this.files.set(newPath, value);
	}

	/** 删除单个文件。 */
	async remove(path: string): Promise<void> {
		this.files.delete(path);
	}

	/** 递归删除目录下所有文件（模拟 adapter.rmdir(path, true)）。 */
	async rmdir(path: string, recursive: boolean): Promise<void> {
		if (recursive) {
			for (const key of [...this.files.keys()]) {
				if (key.startsWith(path + '/')) {
					this.files.delete(key);
				}
			}
		}
	}
}

/** 内存版 VaultMock：覆盖 BackupService 与各模态框用到的 vault 接口。 */
export class VaultMock {
	files: Map<string, string>;
	adapter: AdapterMock;
	fileManager: FileManagerMock;
	/** 记录被 trash 的文件路径，便于断言。 */
	trashed: string[] = [];

	constructor(initial?: Record<string, string>) {
		this.files = new Map(Object.entries(initial ?? {}));
		this.adapter = new AdapterMock(this.files);
		this.fileManager = new FileManagerMock(this.files);
	}

	/** 按路径取抽象文件；仅文件会命中（目录返回 null）。 */
	getAbstractFileByPath(path: string): TFile | null {
		return this.files.has(path) ? new TFile(path) : null;
	}

	/** 读取文件内容（同 read，用于缓存场景占位）。 */
	async read(file: TFile): Promise<string> {
		const value = this.files.get(file.path);
		if (value === undefined) {
			throw new Error(`No such file: ${file.path}`);
		}
		return value;
	}

	/** 缓存读取：内存版与 read 等价。 */
	async cachedRead(file: TFile): Promise<string> {
		return this.read(file);
	}

	/** 覆盖写入文件内容。 */
	async modify(file: TFile, data: string): Promise<void> {
		this.files.set(file.path, data);
	}

	/** 创建文件并返回其 TFile。 */
	async create(path: string, data: string): Promise<TFile> {
		this.files.set(path, data);
		return new TFile(path);
	}

	/** 将文件移入回收站（内存版：从文件表移除并记录）。 */
	async trash(file: TAbstractFile, _system?: boolean): Promise<void> {
		this.files.delete(file.path);
		this.trashed.push(file.path);
	}

	/** 复制文件到新路径（复制=新建）。 */
	async copy(file: TFile, newPath: string): Promise<TFile> {
		const value = this.files.get(file.path);
		if (value === undefined) {
			throw new Error(`No such file: ${file.path}`);
		}
		this.files.set(newPath, value);
		return new TFile(newPath);
	}

	/** 追加内容到文件末尾。 */
	async append(file: TFile, data: string): Promise<void> {
		const value = this.files.get(file.path) ?? '';
		this.files.set(file.path, value + data);
	}
}

/** 内存版 FileManagerMock：renameFile 更新路径映射，processFrontMatter 提供最小行为。 */
export class FileManagerMock {
	files: Map<string, string>;
	renameLog: Array<{ oldPath: string; newPath: string }> = [];

	constructor(files: Map<string, string>) {
		this.files = files;
	}

	/** 重命名文件并同步更新内存路径映射。 */
	async renameFile(file: TAbstractFile, newPath: string): Promise<void> {
		const value = this.files.get(file.path);
		if (value === undefined) {
			throw new Error(`No such file: ${file.path}`);
		}
		this.files.delete(file.path);
		this.files.set(newPath, value);
		this.renameLog.push({ oldPath: file.path, newPath });
	}

	/**
	 * 最小化 frontmatter 编辑桩：解析 --- 段为对象，调用回调后序列化写回。
	 * 仅支持 `key: value` 标量，足够覆盖属性编辑集成测试。
	 */
	async processFrontMatter(file: TFile, fn: (props: Record<string, unknown>) => void): Promise<void> {
		const content = this.files.get(file.path) ?? '';
		const { props, body } = parseFrontMatter(content);
		fn(props);
		this.files.set(file.path, serializeFrontMatter(props, body));
	}
}

/** 解析 frontmatter：返回 { props, body }；无 frontmatter 时 props 为空对象。 */
function parseFrontMatter(content: string): {
	props: Record<string, unknown>;
	body: string;
} {
	if (!content.startsWith('---')) {
		return { props: {}, body: content };
	}
	const lines = content.split('\n');
	const props: Record<string, unknown> = {};
	let i = 1;
	for (; i < lines.length; i++) {
		if (lines[i] === '---') {
			break;
		}
		const idx = lines[i].indexOf(':');
		if (idx > 0) {
			const key = lines[i].slice(0, idx).trim();
			const value = lines[i].slice(idx + 1).trim().replace(/^"|"$/g, '');
			props[key] = value;
		}
	}
	return { props, body: lines.slice(i + 1).join('\n') };
}

/** 序列化 frontmatter；无键时仅保留正文。 */
function serializeFrontMatter(props: Record<string, unknown>, body: string): string {
	const keys = Object.keys(props);
	if (keys.length === 0) {
		return body;
	}
	const head = keys.map((key) => `${key}: ${String(props[key])}`).join('\n');
	return `---\n${head}\n---\n${body}`;
}

/** 组装 AppMock：vault 与 fileManager 共享同一内存文件表。 */
export function createAppMock(initial?: Record<string, string>): {
	vault: VaultMock;
	fileManager: FileManagerMock;
	metadataCache: { resolvedLinks: Record<string, unknown> };
	workspace: { getActiveFile: () => null };
} {
	const vault = new VaultMock(initial);
	return {
		vault,
		fileManager: vault.fileManager,
		metadataCache: { resolvedLinks: {} },
		workspace: { getActiveFile: () => null },
	};
}
