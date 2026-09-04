import { App, Modal, Notice, Setting, TAbstractFile } from 'obsidian';
import hasMarkdownSuffix from 'src/utils/file-type-util';
import { getLinebreak } from 'src/utils/line-break-util';
import { addLabeledToggleField } from './modal-ui';

/**
 *  弹窗确认拷贝到剪贴板的文件
 */
export class CopyToClipboardConfirmModal extends Modal {
    resultArr: TAbstractFile[];
    nameOnlyFlag: boolean;
    lineBreak: string;
    previewEl: HTMLElement;

    constructor(app: App, resultArr: TAbstractFile[]) {
        super(app);
        this.resultArr = resultArr;
        this.lineBreak = getLinebreak();
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Confirm copy to clipboard?" });

        this.previewEl = contentEl.createEl("div");
        this.renderPreview();

        addLabeledToggleField(contentEl, 'Copy file names only', 'Copy wiki links using names only', Boolean(this.nameOnlyFlag), (val) => {
            this.nameOnlyFlag = val;
            this.renderPreview();
        });

        new Setting(contentEl)
            .addButton((btn) =>
                btn.setButtonText("Copy links")
                    .setCta()
                    .onClick(async () => {
                        this.close();
                        let str = this.prepareStr();
                        navigator.clipboard.writeText(str);
                        new Notice("Links copied.")
                    }))
            .addButton((btn) =>
                btn
                    .setButtonText("Cancel")
                    .setCta()
                    .onClick(() => {
                        this.close();
                        new Notice("Operation canceled.");
                    }));
    }

    prepareStr(): string {
        let str = "";
        if (this.nameOnlyFlag) {
            this.resultArr.forEach(ff => {
                let name = ff.name;
                if (hasMarkdownSuffix(name)) {
                    name = name.substring(0, name.lastIndexOf("."));
                }
                str += "[[" + name + "]]" + this.lineBreak;
            })
        } else {
            this.resultArr.forEach(ff => {
                let name = ff.name;
                if (hasMarkdownSuffix(name)) {
                    name = name.substring(0, name.lastIndexOf("."));
                }
                str += "[[" + ff.path + "|" + name + "]]" + this.lineBreak;
            })
        }
        return str;
    }

    /**
     * 渲染预览列表：不使用 innerHTML，改用 DOM 方式逐行创建，避免不安全赋值。
     */
    renderPreview(): void {
        this.previewEl.empty();
        this.resultArr.forEach(ff => {
            let name = ff.name;
            if (hasMarkdownSuffix(name)) {
                name = name.substring(0, name.lastIndexOf("."));
            }
            let line = this.nameOnlyFlag ? "[[" + name + "]]" : "[[" + ff.path + "|" + name + "]]";
            this.previewEl.createDiv({ text: line });
        });
    }
}
