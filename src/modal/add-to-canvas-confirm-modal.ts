import { App, ItemView, Modal, Notice, requireApiVersion, Setting, TAbstractFile, TFile } from 'obsidian';

const width = 400;
const height = 400;
const between = 40;

/**
 *  弹窗确认要添加到Canvas的文件
 */
export class AddToCanvasConfirmModal extends Modal {
    targetFilePath: string;
    resultArr: TAbstractFile[];
    includeReslovedLinksFlag: boolean;

    constructor(app: App, resultArr: TAbstractFile[], targetFilePath: string) {
        super(app);
        this.targetFilePath = targetFilePath;
        this.resultArr = resultArr;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Confirm Add to Canvas?" });

        contentEl.createEl("div", { text: "Add all files below to Canvas -> " + this.targetFilePath + " !" });
        this.resultArr.forEach(info => {
            contentEl.createEl("div", { text: info.path });
        })

        new Setting(contentEl)
            .addToggle((toggle) => {
                toggle.setTooltip("Include resolved links!");
                toggle.onChange((val) => {
                    this.includeReslovedLinksFlag = val;
                })
            })

        new Setting(contentEl)
            .addButton((btn) =>
                btn.setButtonText("Confirm")
                    .setCta()
                    .onClick(async () => {
                        this.close();

                        let pathNodeMap = new Map();

                        let activeFile = this.app.workspace.getActiveFile();

                        // 如果当前活动文档与目标文档不同，则尝试打开目标文档
                        if (activeFile == null || this.targetFilePath != activeFile.path) {
                            let targetFile = this.app.vault.getAbstractFileByPath(this.targetFilePath);
                            if (targetFile == null) {
                                console.log("can not find " + this.targetFilePath)
                                targetFile = await this.app.vault.create(this.targetFilePath, "");
                            }
                            // 如果打开的不是目标文件，则尝试在新窗口打开；如果没有打开任何文件，则在当前窗口打开
                            await this.app.workspace.getLeaf(activeFile != null).openFile(targetFile as TFile);
                        }

                        // Conditions to check
                        const canvasView = app.workspace.getActiveViewOfType(ItemView);

                        if (canvasView?.getViewType() === "canvas") {
                            const canvas = canvasView?.canvas;

                            let idx = 0;
                            for (const key in this.resultArr) {
                                let file = this.resultArr[key] as TFile;
                                let tempChildNode = this.createFileNode(canvas, file, idx);
                                idx++;

                                if (this.includeReslovedLinksFlag) {
                                    // 同时添加内页
                                    pathNodeMap.set(file.path, tempChildNode);

                                    let linkObj = this.app.metadataCache.resolvedLinks[file.path];
                                    for (let innerFilePath in linkObj) {
                                        let existFileNode = pathNodeMap.get(innerFilePath);
                                        if (existFileNode) {
                                            this.createEdge(tempChildNode, existFileNode, canvas);
                                        } else {
                                            console.log(innerFilePath);
                                            let resolvedFile = this.app.vault.getAbstractFileByPath(innerFilePath) as TFile;
                                            console.log(resolvedFile);
                                            let innerChildNode = this.createFileNode(canvas, resolvedFile, idx);
                                            idx++;
                                            pathNodeMap.set(innerFilePath, innerChildNode);
                                            this.createEdge(tempChildNode, innerChildNode, canvas);
                                        }
                                    }
                                }
                            }
                            canvas.requestSave();

                            new Notice("Add to Canvas Success!");
                        } else {
                            new Notice(this.targetFilePath + " is not a Canvas!");
                        }
                    }))
            .addButton((btn) =>
                btn
                    .setButtonText("Cancel")
                    .setCta()
                    .onClick(() => {
                        this.close();
                        new Notice("Add to Canvas Canceled!");
                    }));
    }

    private createFileNode(canvas: any, file: TFile, idx: number) {
        let tempChildNode;
        if (!requireApiVersion("1.1.10")) {
            tempChildNode = canvas.createFileNode(file, "", { x: between + ((width + between) * idx), y: between, height: height, width: width }, true);
        } else {
            tempChildNode = canvas.createFileNode({
                file: file,
                pos: {
                    x: between + ((width + between) * idx),
                    y: between,
                    width: width,
                    height: height
                },
                size: {
                    x: between,
                    y: between,
                    width: width,
                    height: height
                },
                save: true,
                focus: false,
            });
        }
        canvas.deselectAll();
        canvas.addNode(tempChildNode);
        return tempChildNode;
    }

    random(e: number) {
        let t = [];
        for (let n = 0; n < e; n++) {
            t.push((16 * Math.random() | 0).toString(16));
        }
        return t.join("")
    }

    createEdge(node1: any, node2: any, canvas: any) {

        const edge = canvas.edges.get(canvas.getData().edges.first()?.id);

        if (edge) {
            const tempEdge = new edge.constructor(canvas, this.random(16), { side: "right", node: node1 }, { side: "left", node: node2 })
            canvas.addEdge(tempEdge);
            tempEdge.attach();
            tempEdge.render();
        } else {
            console.log("You should have at least one edge in the canvas to use this feature!");
        }
    }
}
