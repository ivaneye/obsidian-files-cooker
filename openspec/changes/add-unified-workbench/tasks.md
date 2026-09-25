## 1. 语法检查模块

- [x] 1.1 [TDD-红] 新增 `tests/ai/query-lint.test.ts`：lintSearch 括号/引号配平错误、未知操作符警告、白名单操作符通过；lintBases 缺 filters 错误、引号配平、未知顶层键警告；lintDql api 缺失警告 / tryQuery 抛错转 error / 通过返回空
- [x] 1.2 [TDD-绿] 新增 `src/validation/query-lint.ts`：`LintIssue`/`lintSearch`/`lintBases`/`lintDql`；含白名单常量与阻断规则注释

## 2. 工作台向导

- [x] 2.1 [TDD-红] 新增 `tests/ai/workbench-modal.test.ts`（注入 fake planner/executor/mock Reader 模块）：来源切换保留各来源草稿；dql 来源 lint 错误阻断执行；仅警告允许执行并提示；searchPanel/clipboard/currentFile 经既有 Reader 读取；确认步骤展示清单与截断；执行步骤分组分发（mock action）；往返导航状态保留
- [x] 2.2 [TDD-绿] 新增 `src/modal/workbench-modal.ts`：三步状态机 + 七来源 runSource + lint 前置 + 确认/执行渲染（复用 P3a 分组分发语义）；styles.css 补步骤指示样式
- [x] 2.3 [TDD-重构] P3a 选择器与工作台共享的渲染片段（目标按钮/查询编辑器/清单）评估提取为共享助手，仅在无行为风险时执行

## 3. 入口与收尾

- [x] 3.1 新增 `src/command/workbench-command.ts`：`Open File Cooker workbench ...` + ribbon（`cooking-pot`）；main.ts 注册；AI 未配置不阻断（AI 来源选择时才检查）
- [ ] 3.2 手工验收：七来源逐一走通三步流程；手写脚本 lint 的错误/警告阻断行为；真实 Dataview tryQuery；ribbon；移动端冒烟
- [x] 3.3 对照 specs 自查 Scenario 映射；`npm test` 全绿；`npm run build` 通过
- [x] 3.4 README（中英）新增工作台章节；AGENTS.md 补 `src/validation/` 说明

## 4. 从笔记导入脚本（验收反馈增量）

- [x] 4.1 [TDD-红] `tests/ai/script-extract.test.ts`：dataview 块提取（单/多/排除 dataviewjs/跳过其他围栏）、query/search 块、未闭合容忍、通用围栏扫描
- [x] 4.2 [TDD-绿] `src/utils/script-extract.ts`：`extractFencedBlocks`/`extractDataviewBlocks`/`extractQueryBlocks`
- [x] 4.3 `ScriptImportModal`（SuggestModal 模糊选文件）+ 工作台集成：三种手写脚本面板「从笔记导入…」→ 提取 → 填草稿 → 自动语法检查；`applyImportedScript` 公开语义 + 测试
- [ ] 4.4 手工验收：从含 ```dataview 块的笔记导入 DQL、从 .base 文件导入、从含 ```query 块的笔记导入搜索；dataviewjs 不出现在候选
