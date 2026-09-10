import FileCookerPlugin from 'main';
import { Command } from './command';
import { UndoHistoryModal } from 'src/modal/undo-history-modal';

/**
 * 撤销相关命令：撤销是横切所有写操作的全局行为，按仓库约定注册到命令类。
 */
export class UndoCommand implements Command {
	plugin: FileCookerPlugin;

	constructor(plugin: FileCookerPlugin) {
		this.plugin = plugin;
	}

	regist(): void {
		this.plugin.addCommand({
			id: 'undo-last-batch-operation',
			name: 'Undo last batch operation ...',
			callback: () => {
				new UndoHistoryModal(this.plugin.app, { focusLast: true }).open();
			},
		});

		this.plugin.addCommand({
			id: 'open-backup-undo-history',
			name: 'Open backup & undo history ...',
			callback: () => {
				new UndoHistoryModal(this.plugin.app).open();
			},
		});
	}
}
