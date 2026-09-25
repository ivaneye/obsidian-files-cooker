## 1. IR 契约

- [x] 1.1 [TDD-红] 新增 `tests/ai/query-ir.test.ts`：合法 IR 通过校验；缺 irVersion/irVersion 非 1/缺 conditions/未知节点/布尔节点子项缺失抛错；字符串字段 trim 规范化；tag 去前导 `#`；测试含目的/内容/预期注释
- [x] 1.2 [TDD-绿] 新增 `src/ai/query-ir.ts`：`QueryIR`/`IrCondition` 类型、节点白名单、`validateQueryIR(raw)` 校验与规范化、`walkConditions(cond, visitor)` 遍历助手；含契约注释

## 2. 三编译器（纯函数）

- [x] 2.1 [TDD-红] 新增 `tests/ai/compile-dql.test.ts`：tag/folder 进 FROM（多值 OR）、无来源 FROM ""、property 四则与 contains/isEmpty、fileModified→file.mday、filename、and/or/not 表达式、content/task 标注 unsupported、字符串值转义引号
- [x] 2.2 [TDD-绿] 新增 `src/ai/compile-dql.ts`：`compileDql(ir): CompiledQuery`；含 FROM/WHERE 划分语义注释
- [x] 2.3 [TDD-红] 新增 `tests/ai/compile-search.test.ts`：tag/folder/file/content/task-todo/task-done/property 精确与取反/isEmpty null、and 空格组合、or 括号、not `-(...)`、fileModified 标注 unsupported
- [x] 2.4 [TDD-绿] 新增 `src/ai/compile-search.ts`
- [x] 2.5 [TDD-红] 新增 `tests/ai/compile-bases.test.ts`：filters and/or 顶层键、file.hasTag/inFolder、属性 ==/!=/contains/isEmpty/数值比较、fileModified/content/task 标注 unsupported、嵌套布尔标注 unsupported、产物含最小 views
- [x] 2.6 [TDD-绿] 新增 `src/ai/compile-bases.ts`
- [x] 2.7 [TDD-重构] 三编译器共享的树遍历/值格式化逻辑收敛到 query-ir 或独立小助手，消除重复

## 3. 能力检查与执行编排

- [x] 3.1 [TDD-红] 新增 `tests/ai/query-executor.test.ts`（vi.mock obsidian-dataview 控制 getAPI）：Dataview 可用 → targets 含 dql 且优先级最高；不可用 → 无 dql；recommendTarget：完整表达按 dql>search>bases，无完整表达返回 undefined；CaptureAction 捕获 ActionModel[]；DQL 执行经 mock 的 DataviewReader 触发 capture 并提取文件；limit 截断生效
- [x] 3.2 [TDD-绿] 新增 `src/ai/query-executor.ts`：`getAvailableTargets`/`recommendTarget`/`CaptureAction`/`executeQuery`（DQL/搜索注入/Bases 抛指引）/`waitForSearchResults` 轮询；含内部 API 风险与降级注释
- [ ] 3.3 搜索面板注入手工验证：setQuery 可用性、结果稳定轮询、降级路径文案

## 4. 查询规划器

- [x] 4.1 [TDD-红] 新增 `tests/ai/query-planner.test.ts`：collectVaultContext 注入标签/属性键/目录/今天日期且遵守上限；planner prompt 不含任何笔记正文；响应经 extractJsonObject+validateQueryIR 双重校验；非法响应抛可识别错误；AiSettings 新增 vaultContext 默认 true 且合并兼容
- [x] 4.2 [TDD-绿] 新增 `src/ai/query-planner.ts`：`collectVaultContext`/`buildPlannerMessages`/`QueryPlanner.generate`；`src/ai/ai-settings.ts` 增加 vaultContext 字段
- [x] 4.3 [TDD-重构] prompt 文案集中为常量，便于后续调优

## 5. AiSelectorModal 与命令

- [x] 5.1 [TDD-红] 新增 `tests/ai/ai-selector-modal.test.ts`（注入 fake planner/executor）：input→query 态流转；Dataview 不可用时目标下拉无 dql；编辑查询文本后执行按新文本；执行结果进 results 态且超 limit 截断提示；分发按钮以命中清单调用对应 Action（mock action 模块）；规划失败停留 input 态并提示
- [x] 5.2 [TDD-绿] 新增 `src/modal/ai-selector-modal.ts`：三态渲染（input/query/results），tab（下拉）+ 不支持警示 + 复制 + 另存 .base（vault 根目录 + 打开）+ 分发按钮组（编辑属性/AI 属性/移动 ChooseFolderModal/合并 ChooseFileModal/Canvas ChooseCanvasModal/改名/删除/flomo，readerAdapter 复用模式）；样式类遵循 `fc-ai-*` 既有约定并补充 styles.css
- [x] 5.3 [TDD-重构] 分发按钮工厂收敛为数据表驱动，减少重复

## 6. 命令入口与接线

- [x] 6.1 新增 `src/command/ai-selector-command.ts`：命令 `Find files with natural language ...`；未配置 AI → Notice + `setting.openTabById('obsidian-file-cooker')`；main.ts 注册
- [ ] 6.2 手工验收：Dataview 装/卸两种环境的目标过滤、DQL 与搜索真实执行、Bases 另存打开、失败/超时提示、移动端冒烟；记录结果

## 7. 验收与收尾

- [x] 7.1 对照 specs 全量自查：每个 Scenario 映射到自动化测试或手工验收记录
- [x] 7.2 `npm test` 全绿；`npm run build` 通过
- [x] 7.3 README（中英）AI 章节补充自然语言选择器说明（实验性）
- [x] 7.4 评估 AGENTS.md 是否需要更新（新增 src/ai 文件职责说明）
