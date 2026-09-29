import { App, Notice, SuggestModal, TFile } from 'obsidian';
import { t } from 'src/i18n/index';

/**
 * 脚本导入弹窗：从 vault 文件中提取查询脚本填入工作台。
 *
 * 职责说明：
 * - 候选文件由调用方给定（DQL/搜索 → .md；Bases → .base），支持路径模糊过滤；
 * - onChoose 读取文件内容 → 提取器产出脚本列表 → 取第一个导入；
 *   多个时由调用方提示总数（其余可手动复制）。
 */

export interface ScriptImportOptions {
	/** 候选文件集合。 */
	files: TFile[];
	/** 提取器：文件内容 → 脚本列表。 */
	extract: (content: string) => string[];
	/** 未提取到脚本时的提示文案。 */
	emptyNotice: string;
	/** 导入回调：script 为第一个脚本，total 为提取到的脚本总数。 */
	onImport: (script: string, total: number) => void;
}

export class ScriptImportModal extends SuggestModal<TFile> {
	private readonly options: ScriptImportOptions;

	constructor(app: App, options: ScriptImportOptions) {
		super(app);
		this.options = options;
	}

	/** 按路径模糊过滤候选文件。 */
	getSuggestions(query: string): TFile[] {
		const q = query.trim().toLowerCase();
		return this.options.files.filter((file) => q === '' || file.path.toLowerCase().includes(q));
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}

	/** 选中文件：读取 → 提取 → 导入第一个脚本（多个时提示总数）。 */
	async onChooseSuggestion(file: TFile): Promise<void> {
		let content = '';
		try {
			content = await this.app.vault.cachedRead(file);
		} catch (e) {
			new Notice(t('读取文件失败：{msg}', { msg: (e as Error).message }));
			return;
		}
		const scripts = this.options.extract(content);
		if (scripts.length === 0) {
			new Notice(this.options.emptyNotice);
			return;
		}
		this.options.onImport(scripts[0], scripts.length);
	}
}
