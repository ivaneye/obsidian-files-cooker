# Tasks: add-batch-backup-and-undo

## 1. 测试基础设施

- [x] 1.1 新建 `tests/mocks/vault-mock.ts`：实现内存版 VaultMock（read / cachedRead / modify / create / trash / getAbstractFileByPath / adapter{read,write,mkdir,rename,exists,remove}）与 FileManagerMock（renameFile 更新内存路径映射），并组装 AppMock。说明：测试基础设施，非业务行为，不套用 TDD，由后续 BackupService 用例驱动验证；测试代码需注释说明用途。
- [x] 1.2 扩展 `tests/mocks/obsidian.ts`（如需要）：补齐 BackupService 用到的类型桩（如 `App` 接口占位、`processFrontMatter` 行为桩）。说明：桩扩展，验证方式同 1.1。

## 2. 数据模型与 manifest 持久化（src/backup/undo-record.ts）

- [x] 2.1 [TDD-红] 编写 `tests/backup/undo-record.test.ts`：覆盖 manifest 序列化/解析往返一致性、非法/损坏 JSON 降级解析、记录状态流转（active→partial→reverted）、FileChange 各 kind 的字段校验，测试代码含目的说明注释。
- [x] 2.2 [TDD-绿] 实现 `src/backup/undo-record.ts`：定义 `UndoRecord` / `FileChange` / `ChangeKind` 类型与 `serializeRecords` / `parseRecords` 纯函数（损坏时返回空列表），关键函数补功能描述注释。
- [x] 2.3 [TDD-重构] 抽取并统一 manifest 读写的位置与错误处理（加载时损坏降级为空历史），确保解析逻辑可独立复用。

## 3. BackupService 核心（src/backup/backup-service.ts）

- [x] 3.1 [TDD-红] 编写 `tests/backup/backup-service.test.ts` 第一组用例：content / path / create / delete 四类 `begin→快照→finish` 后 blob 与 manifest 正确落盘（含 after 快照）；`abort` 不产生 manifest 记录。
- [x] 3.2 [TDD-绿] 实现 `OperationRecorder`（snapshotContentBefore / snapshotPath / snapshotCreated）与 `finish`（读 after → 写 blob → 原子提交 manifest）、`abort`；blob 与 manifest 经 `vault.adapter` 读写，避免触发 vault 事件；原子提交 = 先 blob 后 manifest（临时文件 + rename 覆盖）。类与方法补职责注释。
- [x] 3.3 [TDD-红] 第二组用例：`revert(recordId, paths)` 四类还原正确（内容写回 / 反向 renameFile / trash 新建 / 重建删除）与部分回滚状态流转（active→partial→reverted）。
- [x] 3.4 [TDD-绿] 实现 `revert` 与记录状态更新：路径类回滚走 `fileManager.renameFile` 反向改名；删除类用 before 快照重建文件；创建类 trash 掉新建文件。
- [x] 3.5 [TDD-红] 第三组用例（drift）：content 当前=after 安全还原 / ≠after 默认不覆盖 / force 才覆盖；delete 原路径已存在文件不覆盖；path 已被再次移动不执行；path 已处于旧路径跳过不报错。
- [x] 3.6 [TDD-绿] 实现 drift 检测：revert 前逐文件比对当前状态与记录（content 比对 afterBlob、path 比对当前路径、delete 检查原路径是否已存在），drift 条目返回状态供 UI 层展示，绝不静默覆盖。
- [x] 3.7 [TDD-红] 第四组用例：超过 retention 自动清理最旧记录（含 blob 目录）；单文件备份缺失时跳过并继续处理其余文件。
- [x] 3.8 [TDD-绿] 实现保留清理（提交后按 retention 删最旧记录，先删 blob 再更新 manifest）与备份缺失降级（回滚前检查 blob 存在性，缺失提示并跳过）。
- [x] 3.9 [TDD-重构] 实现并暴露单例 `initBackup(app, settings)` / `getBackup()` / `__resetBackupForTest()`，将 blob 路径计算与 manifest 原子写抽为私有 helper，保持四类变更走同一代码路径。

## 4. 设置与插件接线

- [x] 4.1 [TDD-红/绿] 实现 `BackupSettings`（enabled 默认 true / backupFolder 默认 '.file-cooker/backups' / retention 默认 20）与深合并函数（`Object.assign` 浅拷贝会丢嵌套子字段）；`main.ts` 的 `loadSettings` 改用深合并。深合并逻辑以纯函数单测覆盖；`loadSettings` 接线改动经构建验证。
- [x] 4.2 实现 `src/backup/backup-settings.ts` 的 `renderBackupSettings(containerEl, plugin)`：总开关、备份目录、保留次数三个设置项，onChange 即存。说明：设置分区渲染为 UI 行为，不套用 TDD，经构建 + 手工验证。
- [x] 4.3 `main.ts` 接线：onload 中 `initBackup(this.app, this.settings.backup)`、注册 `UndoCommand`、SettingTab 调用 `renderBackupSettings`。说明：接线改动，验证方式为构建 + 手工验收。

## 5. 六个写操作模态框接入备份

（各任务验证方式：`npm run build` + 手工验收"操作执行后历史出现记录、取消无记录"；集成模式以 5.1 的自动化测试为样板。）

- [x] 5.1 属性编辑接入：`edit-properties-modal.ts` apply 分支用 `getBackup().begin('properties', ...)` 包装，逐文件 `snapshotContentBefore`，成功后 `finish`、异常 `abort`；并编写代表性子集成测试（构造 modal → 模拟内存 vault 点击 Apply → 断言历史出现记录且文件已变更），测试代码含目的注释。
- [x] 5.2 移动接入：`move-confirm-modal.ts` 移动分支用 `snapshotPath(file, newPath)`；复制分支用 `snapshotCreated(path, content)`（复制=新建，undo 为 trash）。
- [x] 5.3 重命名接入：`rename-confirm-modal.ts` apply 分支用 `snapshotPath(file, newPath)`。
- [x] 5.4 删除接入：`delete-confirm-modal.ts` apply 分支用 `snapshotContentBefore`（undo 用快照重建文件）。
- [x] 5.5 合并接入：`merge-confirm-modal.ts` 仅对目标文件 `snapshotContentBefore`（源文件只读不记录）。
- [x] 5.6 创建接入：`create-confirm-modal.ts` apply 分支用 `snapshotCreated(path, '')`。

## 6. 历史模态框与命令入口

- [x] 6.1 [TDD-红] 编写 `tests/backup/undo-history-modal.test.ts`：构造历史模态框 → 勾选集合 → 断言以 `revert(recordId, paths)` 正确参数触发；drift 条目默认禁用、勾选"强制覆盖"后可用（对齐现有 modal-ux.test.ts 风格），测试代码含目的注释。
- [x] 6.2 [TDD-绿] 实现 `src/modal/undo-history-modal.ts`：记录列表（时间/类型/文件数/状态徽标）、展开逐文件（old→new 摘要）、逐文件勾选、drift 条目标记"已修改"并默认禁用、强制覆盖开关、回滚结果 Notice 汇总（成功/跳过/失败）。类与关键方法补职责注释。
- [x] 6.3 实现 `src/command/undo-command.ts` 注册两个命令：「撤销上次批量操作」（打开历史并聚焦最近记录）、「打开备份与撤销历史」；main.ts 挂接 `new UndoCommand(this.plugin).regist()`。说明：命令注册为接线行为，验证方式为构建 + 手工验收。

## 7. 收尾验证

- [x] 7.1 全量验证：`npm run build` 通过、`npm test` 全绿（新增 backup 用例 + 既有 31 例）。
- [x] 7.2 修正 `AGENTS.md` 中已过时的测试描述（现仓库已有 vitest + `npm test` + `tests/mocks/obsidian.ts`），并补充备份模块与测试命令说明。
- [x] 7.3 README 更新：备份与撤销功能说明、备份目录提示（点号前缀默认隐藏，可在排除文件里显式排除）、Canvas/flomo 不在备份范围。
