# Proposal: add-batch-backup-and-undo

## Why

File Cooker 的所有批量写操作（属性编辑 / 移动 / 重命名 / 删除 / 合并 / 创建）目前执行后**无备份、无撤销、无变更记录**。竞品 Mass Editor、Bases Toolbox 已把"备份 + undo + diff"做成标配，本插件在此项处于信任劣势；且即将上线的 AI 模块需要批量写 frontmatter，若无回滚能力，AI 写入的风险不可控。备份与回滚是批量写操作（尤其 AI 写操作）的信任前提。

## What Changes

- **新增备份服务（BackupService）**：批量写操作执行前对受影响文件做快照，操作成功后落盘 manifest + 内容备份，形成一次可回滚的历史记录；操作取消或失败时丢弃记录。
- **新增撤销能力**：命令「撤销上次批量操作」+ Undo 历史模态框；历史按操作列出，**操作内可逐文件勾选回滚**；回滚前做 drift 检测（文件在操作后被用户改动过则警告：跳过 / 覆盖）。
- **全量写操作接入**：属性编辑、移动、重命名、删除、合并、创建 6 类写操作统一走备份通道（移动/重命名回滚走反向 `renameFile`，由 Obsidian 自动维护链接更新；删除回滚用快照重建文件）。
- **存储与保留**：备份存放于 **vault 内隐藏目录**（可同步、重装不丢），保留最近 N 次（默认 20，可配置），自动清理过期备份。
- **设置项**：总开关（默认开启）、备份目录、保留次数。
- **本期范围边界**：变更摘要展示（路径 old→new / 受影响文件清单）随本期交付；**正文级 diff 预览延后至 v1.1**（需引入 diff 引擎，另行评估）。

## Capabilities

### New Capabilities

- `batch-backup-undo`: 批量写操作的前置快照、操作历史、逐文件回滚与 drift 检测能力。现有 capability（`bases-query-file-operations`、`context-menu-commands`）均聚焦"选择源与操作入口"，备份/回滚是横切所有写操作的新能力，无法归入既有模块，建议新增本 capability。

### Modified Capabilities

（无。现有 capability 的需求行为不变，仅新增横切的安全层。）

## Impact

- **新增模块** `src/backup/`：`backup-service.ts`（快照/提交/回滚/清理）、`undo-record.ts`（数据模型与 manifest 读写）、`backup-settings.ts`（设置分区渲染）。
- **新增模态框** `src/modal/undo-history-modal.ts`：历史列表、逐文件勾选、drift 警告。
- **修改 6 个 modal 的确认处理逻辑**：`edit-properties-modal` / `move-confirm-modal` / `rename-modal` / `delete-confirm-modal` / `merge-confirm-modal` / `create-confirm-modal`，在 apply 分支包一层备份调用；Action 与 Reader 接口不动。
- **修改** `main.ts`：设置结构增加 `backup` 段（含深合并修正）、注册撤销命令与历史入口。
- **新增测试** `tests/backup/`：快照/还原往返、drift 检测、保留清理、manifest 读写、历史模态框勾选→回滚集合。
- **依赖**：无新增运行时依赖；正文 diff 引擎延后至 v1.1 评估。
- **验收标准**：6 类写操作执行后均可从历史中逐文件回滚；取消/失败零残留记录；drift 场景正确警告；`npm run build` 通过、新增单测全绿。
- **主要风险与缓解**：备份目录被用户误删/同步冲突 → 回滚前检测备份缺失并明确提示；大 vault 快照体积 → 仅备份实际受影响的文件；与既有确认模态框的叠加交互复杂度 → 保持备份服务无 UI 依赖、纯数据层，模态框仅调用其方法。
