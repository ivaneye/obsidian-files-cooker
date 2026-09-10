import { Setting } from 'obsidian';

/**
 * 备份设置：默认值、深合并与设置分区渲染。
 *
 * 职责说明：
 * - 定义 BackupSettings 结构与默认值；
 * - deepMerge 提供递归深合并（嵌套 backup 段不会因浅拷贝丢失子字段）；
 * - renderBackupSettings 渲染总开关 / 备份目录 / 保留次数三个设置项，onChange 即存。
 */

/** 备份设置项。 */
export interface BackupSettings {
	/** 总开关：关闭时批量写操作照常执行但不产生备份记录。 */
	enabled: boolean;
	/** 备份目录（vault 内路径，点号前缀默认被文件浏览隐藏）。 */
	backupFolder: string;
	/** 保留最近记录数，超出自动清理最旧记录。 */
	retention: number;
}

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
	enabled: true,
	backupFolder: '.file-cooker/backups',
	retention: 20,
};

/** 判断是否为普通对象（非数组、非 null）。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 递归深合并多个来源对象（后者覆盖前者）。
 * 嵌套普通对象逐层合并，数组/原始值直接覆盖。
 */
export function deepMerge<T extends object>(...sources: Array<object | null | undefined>): T {
	const target: Record<string, unknown> = {};
	for (const source of sources) {
		if (!source || typeof source !== 'object') {
			continue;
		}
		for (const key of Object.keys(source)) {
			const value = (source as Record<string, unknown>)[key];
			const existing = target[key];
			if (isPlainObject(value) && isPlainObject(existing)) {
				target[key] = deepMerge(existing, value);
			} else {
				target[key] = value;
			}
		}
	}
	return target as T;
}

/** 设置分区渲染所需的最小插件接口（避免与 main.ts 循环依赖）。 */
export interface BackupSettingsHost {
	settings: { backup: BackupSettings };
	saveSettings(): Promise<void>;
}

/**
 * 渲染备份设置分区：总开关、备份目录、保留次数。
 * 说明：设置分区渲染为 UI 行为，不套用 TDD，经构建 + 手工验证。
 */
export function renderBackupSettings(containerEl: HTMLElement, plugin: BackupSettingsHost): void {
	containerEl.createEl('h2', { text: '备份与撤销' });

	new Setting(containerEl)
		.setName('启用备份')
		.setDesc('每次批量写操作前创建快照，以便之后回滚。')
		.addToggle((toggle) => {
			toggle.setValue(plugin.settings.backup.enabled).onChange(async (value) => {
				plugin.settings.backup.enabled = value;
				await plugin.saveSettings();
			});
		});

	new Setting(containerEl)
		.setName('备份目录')
		.setDesc('Vault 内相对路径；点号前缀默认在文件浏览中隐藏。')
		.addText((text) => {
			text.setPlaceholder(DEFAULT_BACKUP_SETTINGS.backupFolder)
				.setValue(plugin.settings.backup.backupFolder)
				.onChange(async (value) => {
					plugin.settings.backup.backupFolder = value;
					await plugin.saveSettings();
				});
		});

	new Setting(containerEl)
		.setName('保留次数')
		.setDesc('保留最近的记录数，超出后自动清理最旧的。')
		.addText((text) => {
			text.setPlaceholder(String(DEFAULT_BACKUP_SETTINGS.retention))
				.setValue(String(plugin.settings.backup.retention))
				.onChange(async (value) => {
					const parsed = parseInt(value, 10);
					plugin.settings.backup.retention = Number.isNaN(parsed)
						? DEFAULT_BACKUP_SETTINGS.retention
						: parsed;
					await plugin.saveSettings();
				});
		});
}
