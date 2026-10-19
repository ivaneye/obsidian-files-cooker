import FileCookerPlugin from 'main';
import { t } from 'src/i18n/index';
import { Action } from 'src/action/action';
import { CopyAction } from 'src/action/copy-action';
import { DeleteAction } from 'src/action/delete-action';
import { EditPropertiesAction } from 'src/action/edit-properties-action';
import { AiPropertiesAction } from 'src/action/ai-properties-action';
import { MoveAction } from 'src/action/move-action';
import { RenameAction } from 'src/action/rename-action';
import { SyncFlomoAction } from 'src/action/sync-flomo-action';
import { ChooseCanvasModal } from 'src/modal/choose-canvas-modal';
import { ChooseFileModal } from 'src/modal/choose-file-modal';
import { ChooseFolderModal } from 'src/modal/choose-folder-modal';
import { BasesReader } from 'src/reader/bases-reader';
import { Command } from './command';

export class BasesCommand implements Command {

    plugin: FileCookerPlugin;

    constructor(plugin: FileCookerPlugin) {
        this.plugin = plugin;
    }

    regist(): void {
        this.registMoveFile();
        this.registSyncFlomo();
        this.registMergeFile();
        this.registDeleteFile();
        this.registCopyLinks();
        this.registEditProp();
        this.registAiCompleteProps();
        this.registRenameFile();
        this.registAddFile2Canvas();
        this.registAddTask2Canvas();
    }

    private registRenameFile() {
        this.plugin.addCommand({
            id: 'rename-in-bases-results',
            name: t('重命名 Bases 查询结果中的文件 ...'),
            callback: () => {
                new BasesReader(this.plugin).read(new RenameAction(this.plugin.app));
            }
        });
    }

    private registEditProp() {
        this.plugin.addCommand({
            id: 'edit-front-matter-in-bases-results',
            name: t('编辑 Bases 查询结果中的属性 ...'),
            callback: () => {
                new BasesReader(this.plugin).read(new EditPropertiesAction(this.plugin.app));
            }
        });
    }

    /**
     * AI 属性补全：推断提案 → 人工审核 → 应用
     */
    private registAiCompleteProps() {
        this.plugin.addCommand({
            id: 'ai-complete-properties-in-bases-results',
            name: t('AI 补全 Bases 查询结果中的属性 ...'),
            callback: () => {
                new BasesReader(this.plugin).read(new AiPropertiesAction(this.plugin));
            }
        });
    }

    private registCopyLinks() {
        this.plugin.addCommand({
            id: 'copy-bases-result-links',
            name: t('复制 Bases 查询结果链接!'),
            callback: () => {
                new BasesReader(this.plugin).read(new CopyAction(this.plugin.app));
            }
        });
    }

    private registDeleteFile() {
        this.plugin.addCommand({
            id: 'delete-bases-results',
            name: t('删除 Bases 查询结果中的文件!'),
            callback: () => {
                new BasesReader(this.plugin).read(new DeleteAction(this.plugin.app));
            }
        });
    }

    private registMergeFile() {
        this.plugin.addCommand({
            id: 'merge-bases-results-to',
            name: t('合并 Bases 查询结果到 ...'),
            callback: () => {
                new ChooseFileModal(this.plugin.app, new BasesReader(this.plugin)).open();
            }
        });
    }

    private registSyncFlomo() {
        this.plugin.addCommand({
            id: 'sync-bases-results-to',
            name: t('同步 Bases 查询结果到 flomo ...'),
            callback: () => {
                new BasesReader(this.plugin).read(new SyncFlomoAction(this.plugin));
            }
        });
    }

    private registMoveFile() {
        this.plugin.addCommand({
            id: 'move-bases-results-to',
            name: t('移动 Bases 查询结果到 ...'),
            callback: () => {
                let actionFunc = (path: string): Action => { return new MoveAction(this.plugin.app, path); };
                new ChooseFolderModal(this.plugin.app, new BasesReader(this.plugin), actionFunc).open();
            }
        });
    }

    private registAddFile2Canvas() {
        this.plugin.addCommand({
            id: 'add-bases-results-to-canvas',
            name: t('将 Bases 查询结果添加到画布 ...'),
            callback: () => {
                new ChooseCanvasModal(this.plugin.app, new BasesReader(this.plugin)).open();
            }
        });
    }

    private registAddTask2Canvas() {
        this.plugin.addCommand({
            id: 'add-bases-task-to-canvas',
            name: t('将 Bases 任务添加到画布 ...'),
            callback: () => {
                new ChooseCanvasModal(this.plugin.app, new BasesReader(this.plugin, true)).open();
            }
        });
    }
}
