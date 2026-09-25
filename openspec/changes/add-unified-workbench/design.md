## Context

P1/P3a 已交付的组件即本变更的全部引擎：`QueryPlanner`（NL→IR）、三编译器、`getAvailableTargets`/`recommendTarget`、`executeQuery`（DQL/搜索注入）、`CaptureAction`、`SearchResultsReader`/`ClipboardReader`/`CurrentFileReader`、全部 Action 与 `Choose*Modal`。工作台 = 把这些引擎装进一个三步向导壳，无新管线。

约束：工作台是编排层——不复制任何执行逻辑，只做来源选择、lint 前置、状态保持与步骤导航；既有命令保持不变。

## Goals / Non-Goals

**Goals**

- 单一入口（命令 + ribbon）三步向导；查询步骤七来源统一；手写脚本 lint 前置
- 确认/执行步骤复用 P3a 的清单渲染与分组分发（分组已按用户反馈落地）
- 步骤间状态显式保存（来源、各来源草稿、AI 提案、命中清单）

**Non-Goals**

- 不做多文件勾选（沿用 Action 确认窗语义）
- 不做会话持久化、不做 Bases 程序化执行（P3b）
- 不移除/合并既有命令（保留为快捷方式；是否收敛由后续版本依使用数据决定）

## Decisions

### D1：来源模型（七种，统一到"得到 TAbstractFile[]"）

```ts
type SourceKind = 'ai' | 'dql' | 'search' | 'bases' | 'searchPanel' | 'clipboard' | 'currentFile';
```

- `ai`：planner + 三编译 + 目标选择（复用 P3a 交互）→ `executor.execute(target, text)`
- `dql`/`search`：手写文本（可编辑）→ `executor.execute`
- `bases`：lint → 另存 `.base` + 打开（产物模式，与 P3a 一致）
- `searchPanel`/`clipboard`/`currentFile`：readerAdapter（`{ read(action) }`）直接喂既有 Reader → CaptureAction

统一出口：`runSource(): Promise<TAbstractFile[]>`，命中后统一 `gotoConfirm(files)`。

### D2：语法检查分层（`src/validation/query-lint.ts`）

```ts
interface LintIssue { level: 'error' | 'warning'; message: string }
lintDql(text, api?): Promise<LintIssue[]>   // api 缺失 → warning"无法检查"；tryQuery 抛错 → error
lintSearch(text): LintIssue[]               // 括号/引号配平(error)；操作符白名单(警告：tag: path: file: line: block: section: content: task: task-todo: task-done:)
lintBases(text): LintIssue[]                // 必须含 filters:(error)；引号配平(error)；非 filters/views 顶层键(警告)
```

阻断规则：存在 error → 执行按钮阻断并展示；仅 warning → 允许执行且明示。DQL lint 是真实试跑（只读），检查与执行等价，因此"检查通过"后执行仍可能因数据状态变化失败——错误态可返回。

### D3：三步向导状态机

```mermaid
flowchart LR
    Q[查询步骤<br/>来源选择 + 草稿/lint] -- runSource 成功 --> C[确认步骤<br/>命中清单 + 截断提示]
    C -- 返回查询 --> Q
    C -- 下一步:选择操作 --> E[执行步骤<br/>分组操作目录]
    E -- 返回确认 --> C
    E -- 返回查询 --> Q
```

`WorkbenchModal(app, deps{planner, executor, plugin})`；各来源草稿存 `Map<SourceKind, string>`；AI 子状态（ir/compiled/targets/selected）独立字段，切来源不清空。

### D4：执行步骤操作目录（沿用用户已认可的分组）

- 修改属性：编辑属性 / AI 属性补全
- 整理文件：移动到… / 合并到… / 加入 Canvas… / 重命名… / 删除！
- 收集与同步：复制链接（记入后续）/ flomo（提示走来源命令）——MVP 与 P3a 分发面一致

分发实现直接复用 P3a 的 `dispatch(kind)` 语义（readerAdapter + 既有 Choose*Modal）。

### D5：入口

命令 `open-file-cooker-workbench`（"Open File Cooker workbench ..."）+ ribbon 图标 `cooking-pot`。未配置 AI 不阻断工作台（AI 来源选择时才检查），其余来源零 AI 依赖——工作台对未配置 AI 的用户也是完整文件工具。

## 测试策略

- `query-lint`：TDD 全覆盖（配平、操作符白名单、filters 键、DQL api 缺失/抛错/通过三态）
- `workbench-modal`：状态机 TDD（来源切换状态保留、七来源 runSource 分发、lint 错误阻断、确认截断、执行分组调用 dispatch、往返导航）
- 手工验收：真实 Dataview tryQuery、搜索面板注入、ribbon、移动端冒烟

## Risks / Trade-offs

- [工作台与 P3a 选择器功能重叠] → 选择器保留为"AI 快捷入口"，工作台为完整入口；共享同一 executor/planner，无双份逻辑
- [DQL lint 即执行（只读）] → 语义上等价于确认步骤的预览，成本可接受；大数据库慢查询由 Dataview 自身超时约束
- [搜索 lint 白名单误报] → 未知操作符仅警告不阻断；白名单集中常量便于补充

## Migration Plan

纯新增（编排层），无数据/设置迁移。回滚 = 不打开工作台。

## Open Questions

（无——lint 规则的误报细节在手工验收中迭代。）
