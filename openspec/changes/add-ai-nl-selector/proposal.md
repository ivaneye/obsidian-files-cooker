## Why

File Cooker 的独占定位是"批量维护管线"——多来源 Reader + 9 种 Action + 确认回滚。市场调研（见 `docs/ai-module-design.md`）显示：语义搜索 / Copilot 类插件只会"回答"或"跳转"，没有插件能把自然语言编译成查询并送进批量操作管线；且 DQL / 搜索语法 / Bases 三种查询语言表达力互补（正文关键词只有搜索语法能表达、日期/数值比较只有 DQL/Bases 能表达），单一语法必然漏需求。P1 已建立 AI Provider / 设置 / 调度器地基，本变更是该地基上的第二个 AI 能力，也是差异化旗舰。

## What Changes

- 新增**中间表示（IR）**契约：LLM 只产出一版 IR（JSON），三种查询语言由本地确定性编译器生成（不让 LLM 直接写三种语法——幻觉率×3 且不可测试）
- 新增三个纯函数编译器：`IR → DQL`、`IR → 搜索语法`、`IR → Bases YAML`；每个编译器返回查询文本 + 本目标不支持的条件清单
- 新增查询规划器：自然语言 + 库内上下文（标签词表 / 属性键 / 目录 / 今天日期）→ IR + 人类可读解释，复用 P1 的 AiSettings 与 AiProvider；新增 `vaultContext` 开关（默认开）
- 新增能力检查与执行编排：DQL 标签仅在 Dataview 已安装且启用时出现；执行经 CaptureAction 复用三个既有 Reader（零重构）；推荐执行器 = 可用集合内不支持条件为空且优先级最高者（dql > search > bases）
- 新增 `AiSelectorModal`：自然语言输入 → 三语法提案页（tab 预览、可编辑、复制、Bases 另存为 `.base` 文件）→ 命中文件清单 → 分发给既有 Action（编辑属性 / AI 属性 / 移动 / 改名 / 删除 / Canvas / flomo）
- 新增 `AiSelectorCommand` 命令入口；未配置 AI 时 Notice + 跳转设置页
- 会话策略：无持久会话，一次生成为骨架（追问增强按反馈后续迭代，本变更不实现）

**范围边界（P3a）**：Bases 目标为"生成 + 另存为 `.base` 文件 + 打开"，不做程序化执行（P3b 立项）；`task` 条件仅搜索语法支持（DQL 的 TASK 语义与属性过滤混合存在歧义，标注不支持）；无持久会话。

## Capabilities

### New Capabilities

- `ai-natural-language-selector`: 自然语言选择器能力——自然语言编译为三种 Obsidian 查询语言、编译期能力检查与执行器推荐、三通道执行（DQL / 搜索注入 / Bases 产物导出）、命中清单到既有 Action 管线的分发、tab 可见性规则与降级提示

### Modified Capabilities

（无——既有 capability 的需求不发生变化；P1 的 `ai-properties-completion` 仅被本能力复用，其需求不变）

## Impact

- **新增代码**：`src/ai/query-ir.ts`、`compile-dql.ts`、`compile-search.ts`、`compile-bases.ts`、`query-planner.ts`、`query-executor.ts`、`src/command/ai-selector-command.ts`、`src/modal/ai-selector-modal.ts`
- **修改代码**：`main.ts`（注册命令）、`src/ai/ai-settings.ts`（`AiSettings` 新增 `vaultContext` 字段，默认 true）
- **依赖**：无新增（Dataview 检测复用既有 `obsidian-dataview` 依赖）
- **测试**：`tests/ai/` 新增 query-ir / 三编译器 / 推荐链 / planner 校验 / selector modal 交互单测；搜索注入与 Bases 另存为手工验收
- **风险与缓解**：LLM 产出 IR 不准（人类可读解释 + IR 字段/查询文本可编辑 + 三语预览对照）；搜索注入依赖内部 API `setQuery`（失败兜底为填入面板 + Notice 指引用户回车）；三种语法表达力差异（编译期能力检查，不支持的条件明示"已忽略"）；隐私（仅发送自然语言与库内元数据词表，不发送任何笔记正文）
