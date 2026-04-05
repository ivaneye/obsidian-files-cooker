import FileCookerPlugin from "main";
import { App, Notice } from "obsidian";
import { Action, ActionModel } from "src/action/action";
import { getLinebreak } from "src/utils/line-break-util";
import { ReadInfo } from "./read-info";
import { Readable } from "./readable";

const BASES_UNAVAILABLE_NOTICE = "Bases results unavailable! Please open a Bases query view and run a query first!";
const BASES_EMPTY_NOTICE = "Has no bases results! Please run a query first!";
const BASES_NO_FILES_NOTICE = "No Files Found!";

export class BasesReader implements Readable {

    plugin: FileCookerPlugin;
    app: App;
    taskFlag: boolean;

    /**
     * 仅负责将 Bases 查询结果映射到文件，不对 row 本体进行任何写入。
     */
    constructor(plugin: FileCookerPlugin, taskFlag?: boolean) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.taskFlag = taskFlag === true;
    }

    read(action: Action): void {
        const rows = resolveBasesRows(this.app);

        if (rows == null) {
            new Notice(BASES_UNAVAILABLE_NOTICE);
            return;
        }

        if (rows.length === 0) {
            new Notice(BASES_EMPTY_NOTICE);
            return;
        }

        const readInfo = new ReadInfo(this.plugin.settings.limit);
        const acceptedPaths = new Set<string>();
        let ignoredCount = 0;

        rows.forEach((row) => {
            const file = resolveFileFromRow(this.app, row);
            if (file == null) {
                ignoredCount++;
                return;
            }

            const normalizedPath = file.path;
            if (acceptedPaths.has(normalizedPath)) {
                return;
            }

            acceptedPaths.add(normalizedPath);
            readInfo.addFile(file);
        });

        if (ignoredCount > 0) {
            new Notice(`Ignored ${ignoredCount} non-file bases results.`);
        }

        let models = readInfo.getModels();
        const domFiles = resolveFilesFromBasesDom(this.app);
        const domPathSet = new Set(domFiles.map((file) => file.path));

        // 优先对齐 Bases 当前视图中“可见结果”，避免读取到底层未过滤的行。
        if (models.length > 0 && domPathSet.size > 0) {
            const visibleModels = models.filter((model) => model.file != null && domPathSet.has(model.file.path));
            if (visibleModels.length > 0) {
                models = visibleModels;
            }
        }

        if (models.length === 0) {
            domFiles.forEach((file) => {
                if (!acceptedPaths.has(file.path)) {
                    acceptedPaths.add(file.path);
                    readInfo.addFile(file);
                }
            });
            models = readInfo.getModels();
        }

        if (models.length === 0) {
            const firstRow = rows[0] as any;
            const keys = firstRow && typeof firstRow === "object" ? Object.keys(firstRow).slice(0, 8).join(", ") : "(no object keys)";
            console.log("[File Cooker][BasesReader] No file mapped from bases rows.", {
                rowsCount: rows.length,
                firstRow,
                firstRowType: typeof firstRow,
                firstRowFunctionKeys: typeof firstRow === "function" ? Object.keys(firstRow) : undefined,
            });
            new Notice(`Bases rows detected but none mapped. First row keys: ${keys}`);
            new Notice(BASES_NO_FILES_NOTICE);
            return;
        }

        if (this.taskFlag) {
            const contentModels: ActionModel[] = [];
            const lines = models
                .filter((model) => model.file != null)
                .map((model) => `- [ ] [[${model.file.path}]]`);
            contentModels.push(new ActionModel(null, lines.join(getLinebreak())));
            action.act(contentModels);
            return;
        }

        action.act(models);
    }
}

/**
 * 优先尝试插件 API；若不可用则回退到 Bases 视图上下文对象。
 */
function resolveBasesRows(app: App): unknown[] | null {
    const pluginCandidates = [
        (app as any)?.plugins?.plugins?.bases,
        (app as any)?.plugins?.plugins?.["obsidian-bases"],
        (app as any)?.plugins?.plugins?.["bases-plugin"],
        (app as any)?.internalPlugins?.plugins?.bases?.instance,
    ];

    for (const pluginInstance of pluginCandidates) {
        const api = pluginInstance?.api;
        const apiResults = callIfFunction(api?.getActiveQueryResults)
            ?? callIfFunction(api?.getQueryResults)
            ?? callIfFunction(pluginInstance?.getActiveQueryResults)
            ?? callIfFunction(pluginInstance?.getQueryResults);
        const normalized = normalizeRows(apiResults);
        if (normalized != null) {
            return normalized;
        }

        const deepRows = discoverRowsDeep(pluginInstance);
        if (deepRows != null) {
            return deepRows;
        }

        const deepApiRows = discoverRowsDeep(api);
        if (deepApiRows != null) {
            return deepApiRows;
        }
    }

    const leafTypeCandidates = ["bases", "base", "bases-view"];

    for (const leafType of leafTypeCandidates) {
        const leaves = app.workspace.getLeavesOfType(leafType) ?? [];
        for (const leaf of leaves) {
            const normalized = normalizeRowsFromView((leaf as any)?.view);
            if (normalized != null) {
                return normalized;
            }
        }
    }

    const activeLeafView = ((app.workspace as any)?.activeLeaf?.view as any);
    const activeNormalized = normalizeRowsFromView(activeLeafView);
    if (activeNormalized != null) {
        return activeNormalized;
    }

    const activeDeepRows = discoverRowsDeep(activeLeafView);
    if (activeDeepRows != null) {
        return activeDeepRows;
    }

    const workspaceAsAny = app.workspace as any;
    if (typeof workspaceAsAny.iterateAllLeaves === "function") {
        let fallbackRows: unknown[] | null = null;
        workspaceAsAny.iterateAllLeaves((leaf: any) => {
            if (fallbackRows != null) {
                return;
            }
            const normalized = normalizeRowsFromView(leaf?.view);
            if (normalized != null) {
                fallbackRows = normalized;
                return;
            }
            const deepRows = discoverRowsDeep(leaf?.view);
            if (deepRows != null) {
                fallbackRows = deepRows;
            }
        });
        if (fallbackRows != null) {
            return fallbackRows;
        }
    }

    return null;
}

function callIfFunction(fn: unknown): unknown {
    if (typeof fn === "function") {
        return fn();
    }
    return null;
}

function normalizeRows(raw: unknown): unknown[] | null {
    if (Array.isArray(raw)) {
        return raw;
    }

    if (raw != null && typeof raw === "object") {
        const rows = (raw as any).rows ?? (raw as any).items ?? (raw as any).results;
        if (Array.isArray(rows)) {
            return rows;
        }
    }

    return null;
}

function normalizeRowsFromView(view: any): unknown[] | null {
    if (view == null) {
        return null;
    }

    const viewResult = view.currentQueryResult
        ?? view.queryResult
        ?? view.results
        ?? view.data
        ?? view.table?.rows
        ?? view.model?.rows
        ?? view.store?.rows;

    return normalizeRows(viewResult);
}

function extractPath(row: any): string | null {
    row = unwrapRowValue(row);
    if (row == null) {
        return null;
    }

    const candidatePaths = [
        row.path,
        row.filePath,
        row.filepath,
        row.linkpath,
        row.file,
        row.file?.path,
        row.file?.filePath,
        row.file?.filepath,
        row.file?.linkpath,
        row.link,
        row.link?.path,
        row.link?.linkpath,
        row.value?.path,
        row.value?.filePath,
        row.value?.linkpath,
        row.record?.path,
        row.record?.file,
        row.record?.file?.path,
    ];

    for (const candidate of candidatePaths) {
        if (typeof candidate === "string" && candidate.trim() !== "") {
            return candidate;
        }
    }

    return null;
}

function resolveFileFromRow(app: App, row: any): any | null {
    if (typeof row === "function") {
        const functionCandidates = collectFunctionRowCandidates(row);
        for (const candidate of functionCandidates) {
            const resolved = resolveFileByPath(app, candidate);
            if (resolved != null) {
                return resolved;
            }
        }
    }

    row = unwrapRowValue(row);

    const directPath = extractPath(row);
    const directResolved = resolveFileByPath(app, directPath);
    if (directResolved != null) {
        return directResolved;
    }

    const deepPath = extractPathDeep(row);
    const deepResolved = resolveFileByPath(app, deepPath);
    if (deepResolved != null) {
        return deepResolved;
    }

    const candidateStrings = collectStringCandidates(row);
    for (const candidate of candidateStrings) {
        const resolved = resolveFileByPath(app, candidate);
        if (resolved != null) {
            return resolved;
        }
    }

    return null;
}

function resolveFileByPath(app: App, candidatePath: string | null): any | null {
    if (candidatePath == null) {
        return null;
    }

    const normalized = normalizePathLike(candidatePath);
    if (normalized == null) {
        return null;
    }

    const byPath = app.vault.getAbstractFileByPath(normalized);
    if (byPath != null) {
        return byPath;
    }

    const metadataCache = (app as any).metadataCache;
    if (metadataCache && typeof metadataCache.getFirstLinkpathDest === "function") {
        const linkDest = metadataCache.getFirstLinkpathDest(normalized, "");
        if (linkDest != null) {
            return linkDest;
        }
    }

    return null;
}

function normalizePathLike(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) {
        return null;
    }

    // [[path|alias]] -> path
    const wikiLinkMatch = trimmed.match(/^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/);
    if (wikiLinkMatch != null) {
        return wikiLinkMatch[1].trim();
    }

    // file:///x/y.md -> /x/y.md
    if (trimmed.startsWith("file://")) {
        return decodeURI(trimmed.replace("file://", ""));
    }

    return trimmed;
}

function extractPathDeep(root: any): string | null {
    root = unwrapRowValue(root);
    if (root == null || typeof root !== "object") {
        return null;
    }

    const visited = new WeakSet<object>();
    const queue: Array<{ value: any; depth: number }> = [{ value: root, depth: 0 }];
    const MAX_DEPTH = 5;
    const MAX_NODES = 200;
    let processed = 0;

    while (queue.length > 0) {
        const current = queue.shift();
        if (current == null) {
            continue;
        }
        const { value, depth } = current;
        if (value == null) {
            continue;
        }

        if (typeof value === "string") {
            const normalized = normalizePathLike(value);
            if (normalized != null && looksLikeFilePath(normalized)) {
                return normalized;
            }
            continue;
        }

        if (typeof value !== "object") {
            continue;
        }

        if (visited.has(value)) {
            continue;
        }
        visited.add(value);

        processed++;
        if (processed > MAX_NODES || depth >= MAX_DEPTH) {
            continue;
        }

        const direct = extractPath(value);
        if (direct != null) {
            return direct;
        }

        Object.keys(value).forEach((key) => {
            if (key === "app" || key === "parent") {
                return;
            }
            const child = value[key];
            if (child == null || typeof child === "function") {
                return;
            }
            queue.push({ value: child, depth: depth + 1 });
        });
    }

    return null;
}

function looksLikeFilePath(candidate: string): boolean {
    return candidate.includes("/") || candidate.endsWith(".md") || candidate.endsWith(".canvas");
}

function collectStringCandidates(root: any): string[] {
    root = unwrapRowValue(root);
    if (root == null || typeof root !== "object") {
        return [];
    }

    const preferredKeyRegex = /(path|file|link|url|target|source|name)$/i;
    const visited = new WeakSet<object>();
    const queue: Array<{ value: any; depth: number; key: string }> = [{ value: root, depth: 0, key: "root" }];
    const MAX_DEPTH = 4;
    const MAX_NODES = 120;
    const preferred: string[] = [];
    const others: string[] = [];
    let processed = 0;

    while (queue.length > 0) {
        const current = queue.shift();
        if (current == null) {
            continue;
        }
        const { value, depth, key } = current;

        if (typeof value === "string") {
            if (value.trim() === "") {
                continue;
            }
            if (preferredKeyRegex.test(key)) {
                preferred.push(value);
            } else {
                others.push(value);
            }
            continue;
        }

        if (value == null || typeof value !== "object") {
            continue;
        }

        if (visited.has(value)) {
            continue;
        }
        visited.add(value);

        processed++;
        if (processed > MAX_NODES || depth >= MAX_DEPTH) {
            continue;
        }

        Object.keys(value).forEach((childKey) => {
            if (childKey === "app" || childKey === "parent") {
                return;
            }
            const child = value[childKey];
            if (child == null || typeof child === "function") {
                return;
            }
            queue.push({ value: child, depth: depth + 1, key: childKey });
        });
    }

    return [...new Set([...preferred, ...others])];
}

function collectFunctionRowCandidates(rowFn: (...args: any[]) => any): string[] {
    const candidates: string[] = [];
    const keyCandidates = [
        "path",
        "file",
        "filePath",
        "filepath",
        "link",
        "linkpath",
        "source",
        "target",
        "url",
        "name",
    ];

    keyCandidates.forEach((key) => {
        try {
            const value = rowFn(key);
            const extracted = extractPath(value);
            if (extracted != null) {
                candidates.push(extracted);
            }
            if (typeof value === "string") {
                candidates.push(value);
            }
        } catch (e) {
            // ignore invocation failures for unsupported key access
        }
    });

    try {
        const direct = rowFn();
        const extracted = extractPath(direct);
        if (extracted != null) {
            candidates.push(extracted);
        }
    } catch (e) {
        // ignore
    }

    // 有些实现会把值挂在函数对象属性上
    try {
        const fnObjCandidates = collectStringCandidates(rowFn as any);
        candidates.push(...fnObjCandidates);
    } catch (e) {
        // ignore
    }

    return [...new Set(candidates)];
}

function resolveFilesFromBasesDom(app: App): any[] {
    const dedup = new Set<string>();
    const files: any[] = [];

    const candidateLeaves = pickPreferredLeavesForDom(app);
    candidateLeaves.forEach((leaf) => {
        const containerEl = leaf?.view?.containerEl;
        if (containerEl == null || typeof containerEl.querySelectorAll !== "function") {
            return;
        }

        collectFilesFromContainer(app, containerEl, dedup, files);
    });

    return files;
}

function collectFilesFromContainer(app: App, containerEl: any, dedup: Set<string>, files: any[]): void {
    const preferredBasesSelectors = [
        "[class*='bases'] a.internal-link",
        "[class*='bases'] [data-href]",
        "[class*='base'] a.internal-link",
        "[data-type*='bases'] a.internal-link",
        "[data-type*='base'] a.internal-link",
        ".table-view-table a.internal-link",
        ".table-view-table [data-href]",
    ];

    let nodeList: any[] = [];
    preferredBasesSelectors.forEach((selector) => {
        try {
            nodeList.push(...Array.from(containerEl.querySelectorAll(selector) ?? []));
        } catch (e) {
            // ignore selector errors
        }
    });

    // 兜底：当前 markdown 视图里可能没有稳定 class，仅能通过行容器抓取。
    if (nodeList.length === 0) {
        const fallbackSelectors = [
            "tr a.internal-link",
            "tr [data-href]",
            "[role='row'] a.internal-link",
            "[role='row'] [data-href]",
            "a.internal-link, [data-href]",
        ];
        fallbackSelectors.forEach((selector) => {
            try {
                nodeList.push(...Array.from(containerEl.querySelectorAll(selector) ?? []));
            } catch (e) {
                // ignore
            }
        });
    }

    const uniqueNodes = [...new Set(nodeList)];

    uniqueNodes.forEach((element: any) => {
        if (!isElementVisible(element)) {
            return;
        }

        const raw = element?.getAttribute?.("data-href")
            ?? element?.dataset?.href
            ?? element?.getAttribute?.("href")
            ?? "";
        const candidatePath = normalizeHrefToPath(raw);
        const resolved = resolveFileByPath(app, candidatePath);
        if (resolved == null) {
            return;
        }
        if (dedup.has(resolved.path)) {
            return;
        }
        dedup.add(resolved.path);
        files.push(resolved);
    });
}

function pickPreferredLeavesForDom(app: App): any[] {
    const leaves: any[] = [];

    const activeLeaf = (app.workspace as any)?.activeLeaf;
    if (activeLeaf != null) {
        leaves.push(activeLeaf);
    }

    const leafTypes = ["bases", "base", "bases-view"];
    for (const type of leafTypes) {
        const sameTypeLeaves = (app.workspace as any)?.getLeavesOfType?.(type) ?? [];
        sameTypeLeaves.forEach((leaf: any) => leaves.push(leaf));
    }

    const dedup = new Set<any>();
    const ordered: any[] = [];
    leaves.forEach((leaf) => {
        if (!dedup.has(leaf)) {
            dedup.add(leaf);
            ordered.push(leaf);
        }
    });

    return ordered;
}

function isElementVisible(element: any): boolean {
    if (element == null) {
        return false;
    }

    const style = element?.style;
    if (style?.display === "none" || style?.visibility === "hidden") {
        return false;
    }

    const row = typeof element.closest === "function" ? element.closest("tr") : null;
    if (row?.style?.display === "none" || row?.style?.visibility === "hidden") {
        return false;
    }

    if (typeof element.getClientRects === "function") {
        const rects = element.getClientRects();
        if (rects != null && rects.length === 0 && element?.offsetParent == null) {
            return false;
        }
    }

    return true;
}

function normalizeHrefToPath(raw: string): string | null {
    if (typeof raw !== "string" || raw.trim() === "") {
        return null;
    }
    const trimmed = raw.trim();

    if (trimmed.startsWith("obsidian://open?")) {
        try {
            const url = new URL(trimmed);
            const file = url.searchParams.get("file");
            return file ? decodeURIComponent(file) : null;
        } catch (e) {
            return null;
        }
    }

    return normalizePathLike(trimmed);
}

function unwrapRowValue(value: any): any {
    if (typeof value !== "function") {
        return value;
    }

    try {
        const evaluated = value();
        if (evaluated != null) {
            return evaluated;
        }
    } catch (e) {
        // ignore and fallback to original function value
    }

    try {
        const source = value.toString?.() ?? "";
        // 某些环境函数 toString 直接返回路径字符串
        if (typeof source === "string" && source.trim() !== "" && source.indexOf("function") !== 0) {
            return source;
        }
    } catch (e) {
        // ignore
    }

    return value;
}

function discoverRowsDeep(root: any): unknown[] | null {
    if (root == null || typeof root !== "object") {
        return null;
    }

    const visited = new WeakSet<object>();
    const queue: Array<{ value: any; depth: number }> = [{ value: root, depth: 0 }];
    const MAX_DEPTH = 6;
    const MAX_NODES = 300;
    let processed = 0;

    while (queue.length > 0) {
        const current = queue.shift();
        if (current == null) {
            continue;
        }
        const { value, depth } = current;
        if (value == null) {
            continue;
        }

        if (Array.isArray(value) && isRowLikeArray(value)) {
            return value;
        }

        if (typeof value !== "object") {
            continue;
        }

        if (visited.has(value)) {
            continue;
        }
        visited.add(value);

        processed++;
        if (processed > MAX_NODES || depth >= MAX_DEPTH) {
            continue;
        }

        const directNormalized = normalizeRows(value);
        if (directNormalized != null) {
            return directNormalized;
        }

        const keys = Object.keys(value);
        for (const key of keys) {
            if (key === "parent" || key === "app") {
                continue;
            }
            const child = value[key];
            if (child == null) {
                continue;
            }
            if (typeof child === "function") {
                continue;
            }
            queue.push({ value: child, depth: depth + 1 });
        }
    }

    return null;
}

function isRowLikeArray(arr: unknown[]): boolean {
    if (arr.length === 0) {
        return false;
    }
    const sampleSize = Math.min(arr.length, 8);
    for (let i = 0; i < sampleSize; i++) {
        const candidate = arr[i] as any;
        if (extractPath(candidate) != null) {
            return true;
        }
    }
    return false;
}
