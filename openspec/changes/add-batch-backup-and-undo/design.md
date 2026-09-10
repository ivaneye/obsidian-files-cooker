# Design: add-batch-backup-and-undo

## Context

动机见 `proposal.md - Why`。当前所有批量写操作（属性编辑 / 移动 / 重命名 / 删除 / 合并 / 创建）的执行逻辑都位于各 ConfirmModal 的 apply 分支中，Action/Reader 只负责开窗。写入方式可分为三类：

- **内容写**：`processFrontMatter`（属性）、`vault.append`（合并目标）、`vault.trash`（删除）
- **路径写**：`fileManager.renameFile`（移动/重命名，Obsidian 自动维护链接）、`vault.copy`（复制=创建）
- **创建写**：`vault.create`（创建空文件）

一个值得提前排除的写路径：**Canvas** 的写入通过 `canvas.requestSave()` 内部 API 完成（modal 中大量 `any`），不经过常规 vault 写入，快照/还原语义不清晰且风险低（可视化、易手动重加），v1 明确不纳入（见 Non-Goals）。

## Goals / Non-Goals

**Goals:**

- 为 6 类写操作提供统一的前置快照与可回滚历史
- 支持操作内**逐文件勾选回滚**，回滚前做 drift 检测并警告
- 存储于 vault 内隐藏目录，保留最近 N 次，自动清理
- 对现有 Action / Reader 接口零侵入，仅在各 modal 的 apply 分支增加最小包装
- 为未来 AI 批量写操作复用同一条安全通道

**Non-Goals:**

- **不含正文级 diff 预览**（v1 仅展示变更摘要：路径 old→new / 受影响文件；正文 diff 延后 v1.1，需评估 diff 引擎）
- **不含 Canvas 操作备份**（写入走 canvas 内部 API，快照语义不清晰；风险低，可手动重加）
- **不含 flomo 同步备份**（纯网络发送，无 vault 写入）
- **不改变** 现有确认模态框的审核流程（备份是"执行后兜底"，与"执行前审核"正交）

## Decisions

### D1. 数据模型：UndoRecord + FileChange

```ts
// 持久化于 manifest.json（仅元数据，不内联正文）
type ChangeKind = 'content' | 'path' | 'create' | 'delete';

interface FileChange {
    kind: ChangeKind;
    path: string;            // 操作前路径
    newPath?: string;        // path 类变更的目标路径
    beforeBlob?: string;     // 内容快照文件名（content/delete 用）
    afterBlob?: string;      // 操作后内容快照文件名（content/create 用，drift 检测）
}

interface UndoRecord {
    id: string;              // 时间戳+随机后缀
    time: number;
    opType: 'properties' | 'move' | 'rename' | 'delete' | 'merge' | 'create';
    opLabel: string;         // 用户可读描述
    status: 'active' | 'partial' | 'reverted';
    files: FileChange[];
}
```

**为什么存 before + after 两份内容**：drift 检测需要"操作后状态"作参照——回滚时读当前内容，与 `afterBlob` 相等则无外部改动、安全还原；不等则用户中途改过，警告跳过/覆盖。只存 before 无法区分"操作没改它"和"用户手动还原过"。

**替代方案**：仅内存记录 / 存进 `data.json`。否决——内存不持久，`data.json` 会被 Obsidian 每次启动整体加载，300 篇正文塞进去会拖慢启动。vault 内 blob 文件是对的。

### D2. 存储布局与原子写

```
.file-cooker/backups/            # 默认目录，可配置；点号前缀默认在文件浏览中隐藏
  manifest.json                  # UndoRecord[]（元数据）
  <id>/
    f-0.before.md                # 操作前内容
    f-0.after.md                 # 操作后内容（drift 参照）
    ...
```

- **原子提交**：先写 `<id>/` 下 blob，再写 `manifest.json`（临时文件 + `adapter.rename` 覆盖）。中途失败时 manifest 未更新 → 该记录对用户不可见，等同未发生。
- **保留策略**：提交新记录后按 `retention`（默认 20）清理最旧记录，先删 blob 目录再更新 manifest。
- **恢复**：插件加载时读 manifest，损坏则降级为空历史并 `Notice` 提示（不阻塞插件启动）。

### D3. BackupService 接口与集成模式

```ts
class BackupService {
    constructor(app: App, settings: BackupSettings);

    begin(opType, opLabel): OperationRecorder;
    // OperationRecorder（单次操作的记录器）
    //   snapshotContentBefore(file: TFile)         // 读操作前内容
    //   snapshotPath(file: TFile, newPath: string) // 记路径变更
    //   snapshotCreated(path: string, content: string)
    //   finish(): Promise<void>                    // 读 after → 写 blob → 提交 manifest
    //   abort(): void                              // 丢弃本次记录
    async getHistory(): Promise<UndoRecord[]>;
    async revert(recordId: string, paths: string[]): Promise<RevertResult>;
}
```

**实例获取方式：模块级单例**。现有 modal 构造函数只接收 `app`，不持有 `plugin` 引用；若备份服务走 `plugin.backup` 注入，会波及所有 modal/action/command 的构造签名。因此采用模块级单例：

```ts
// src/backup/backup-service.ts
let current: BackupService | null = null;
export function initBackup(app: App, settings: BackupSettings): BackupService; // main.ts onload 调用
// 测试专用：__resetBackupForTest()
export function getBackup(): BackupService; // 各 modal 直接调用
```

**模态框集成模式（所有 apply 分支统一，构造签名不变）**：

```ts
onClick: async () => {
    this.close();
    const recorder = getBackup().begin('properties', 'Edit properties');
    try {
        for (const info of files) {
            await recorder.snapshotContentBefore(info as TFile);
            this.app.fileManager.processFrontMatter(...);   // 原有写入
        }
        await recorder.finish();
        new Notice('Properties updated.');
    } catch (e) {
        recorder.abort();
        new Notice('Operation failed: ' + e.message);
    }
}
```

**各操作类型的 recorder 用法**：

| 操作 | 快照调用 | 还原语义 |
|---|---|---|
| 属性编辑 | `snapshotContentBefore` | 用 before 覆盖写回 |
| 移动/重命名 | `snapshotPath(old, new)` | `renameFile` 反向改名（自动维护链接） |
| 复制 | `snapshotCreated(path, content)` | trash 掉新建文件 |
| 删除 | `snapshotContentBefore` | 用 before 重建文件到原路径 |
| 合并 | 仅对**目标文件** `snapshotContentBefore`（源仅被读） | 还原目标文件内容 |
| 创建 | `snapshotCreated(path, '')` | trash 掉新建文件 |

`finish()` 对 content 类变更统一读 `after`（操作后内容）用于后续 drift 检测。

### D4. 回滚与 drift 检测

```
                          回滚（revert）
┌─────────────┐     当前状态与记录比对      ┌──────────────┐
│ UndoRecord  │ ───────────────────────▶ │  逐文件决策   │
└─────────────┘                          └──────────────┘
   content: current == after?  ── 是 ──▶ 写回 before（安全）
             current != after?  ── 是 ──▶ DRIFT：警告（跳过/强制覆盖）
   path:    current == newPath? ── 是 ──▶ renameFile 改回 path
            current == path?    ── 是 ──▶ 已还原，跳过
            其他位置             ── 是 ──▶ DRIFT：警告
   create:  current == after?   ── 是 ──▶ trash 掉
            current != after?   ── 是 ──▶ DRIFT：警告（用户改过）
   delete:  path 已重新存在      ── 是 ──▶ DRIFT：警告
            path 不存在          ── 是 ──▶ 用 before 重建
```

- **回滚粒度**：`revert(recordId, paths)` 支持操作内逐文件回滚；未回滚文件保留，记录状态 `active → partial → reverted`。
- **UI**：`UndoHistoryModal` 列表展示记录（时间/类型/文件数/状态），展开后逐文件勾选（默认全选），带 drift 的条目标"已修改"并默认禁用（需勾选"强制覆盖"才可回滚）。
- **force 语义**：drift 条目只有在用户显式选择覆盖时才写，与现有 `overrideFlag` 的确认式交互一致。

### D5. 设置与命令

```ts
interface BackupSettings {
    enabled: boolean;      // 默认 true（总开关）
    backupFolder: string;  // 默认 '.file-cooker/backups'
    retention: number;     // 默认 20
}
```

- `loadSettings` 深合并修正（嵌套 `backup` 段，`Object.assign` 浅拷贝会丢子字段——顺带修正现状）。
- 新增命令类 `src/command/undo-command.ts`（撤销是横切所有操作的全局行为，符合"注册到命令类而非 main.ts"约定）：
  - `Undo last batch operation ...` → 打开历史模态框并聚焦最近记录
  - `Open backup & undo history ...` → 打开历史模态框
- 设置分区渲染 `renderBackupSettings(containerEl, plugin)`，由 main.ts 的 SettingTab 调用，避免 main.ts 膨胀（与设计稿中 ai-settings 同模式）。

## 代码组织与注释策略

```
src/backup/undo-record.ts       # 类型 + manifest 序列化/解析（纯函数，可测）
src/backup/backup-service.ts    # BackupService + OperationRecorder + 单例 getBackup/initBackup/__resetBackupForTest
src/backup/backup-settings.ts   # 默认值 + 深合并 + 设置渲染
src/command/undo-command.ts     # 命令注册
src/modal/undo-history-modal.ts # 历史列表 + 逐文件回滚 UI
tests/backup/undo-record.test.ts
tests/backup/backup-service.test.ts
tests/backup/undo-history-modal.test.ts
tests/mocks/vault-mock.ts       # 内存版 vault/fileManager，供 service 测试
```

注释遵循仓库约定：测试文件写"测试目的/内容/预期"，实现文件写模块/类/关键方法职责。

## 测试策略

- **框架**：vitest（仓库已有）+ `tests/mocks/obsidian.ts` 现有 mock。
- **Mock/Stub**：`tests/mocks/vault-mock.ts` 提供内存版 `vault`（read/modify/cachedRead/trash/create/getAbstractFileByPath/adapter）与 `fileManager`（renameFile 更新内存路径映射），替换进 AppMock。测试前 `__resetBackupForTest()` 重置单例。网络/真实 Obsidian 不进单测。
- **用例分层**：
  - `undo-record`：manifest 序列化/解析往返、记录状态流转（active→partial→reverted）、损坏 manifest 的降级解析。
  - `backup-service`（content/path/create/delete 四类）：
    - 快照→commit 后 blob 与 manifest 正确落盘
    - revert 还原正确（内容写回/反向改名/trash 新建/重建删除）
    - drift：当前内容 ≠ after → 返回 drift 结果，force 才覆盖
    - abort 不产生 manifest 记录
    - 保留清理：超过 retention 后最旧记录被删除
    - `getHistory` 排序与过滤
  - `undo-history-modal`：勾选集合 → `revert(recordId, paths)` 调用参数正确（对齐现有 modal-ux.test.ts 风格）。

## Risks / Trade-offs

- **[备份目录出现在同步/搜索]** → 点号前缀目录 Obsidian 默认在文件浏览中隐藏；README 说明可在"排除文件"中显式排除。备份数据随 vault 同步是特性（跨设备可回滚）也是体积成本 → 保留上限兜底。
- **[300 篇大操作 blob 体积]** → 仅备份实际受影响文件；`retention` 兜底；正文 diff（v1.1）会进一步增大，届时评估压缩。
- **[manifest 写入竞态]** → 单次操作为原子提交（先 blob 后 manifest + rename 覆盖）；同一时刻仅一个 modal 处于 apply，天然串行。
- **[用户中途手改文件]** → drift 检测在回滚时兜底，绝不静默覆盖。
- **[备份目录被用户删除]** → 回滚前检查 blob 存在性，缺失则明确提示"备份已丢失，无法还原该文件"，跳过该文件不中断整体。
- **[Canvas 无备份]** → v1 明确 Non-Goal，README 标注；风险低（可视化操作易重做）。

## Migration Plan

- 无既有数据迁移（新功能）。
- 部署：随下一版本（2.2.0 候选）发布；`enabled` 默认开启。
- 回滚方案：设置项关闭即可停用；停用不影响既有历史（可重新开启继续使用）。
- 兼容：不改变现有操作行为；仅在 apply 分支增加快照调用，操作结果与未接入时一致。

## Open Questions

（无。三个决策点（vault 存储 / 逐文件回滚 / diff 延后）已在 proposal 阶段与用户确认；Canvas 排除在本设计内说明。）
