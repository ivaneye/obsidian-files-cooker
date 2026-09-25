## Why

File Cooker 当前所有批量 Action 的参数都依赖用户预先手工填写（如 Edit Properties 要求手填 key/value），"逐文件判断写什么"的成本全部落在用户身上。社区已有多个 AI 打标插件验证了该痛点真实存在，但它们普遍只支持单文件或文件夹遍历，且**没有任何一个提供 AI 写入后的回滚能力**。File Cooker 拥有多来源 Reader + 确认弹窗 + 备份回滚三大独有资产，将其与 AI 推断结合可以形成差异化："AI 提案、人工审核、批量执行、随时回滚"。

本变更同时为后续 AI 能力（P2 重命名、P3 自然语言选择器，见 `docs/ai-module-design.md`）建立共享地基：AI Provider 客户端、AI 设置分区、分批并发调度器、提案审核 UI 骨架。

## What Changes

- 新增 AI 设置分区（`AiSettings`）：总开关（默认关闭，opt-in）、OpenAI 兼容 baseUrl / model / apiKey（优先 SecretStorage，明文仅作回退）、分批与截断参数、推断项开关、自定义属性、标签语言
- 新增 AI Provider 客户端（OpenAI 兼容 Chat API，JSON 模式，node-fetch，错误处理对齐既有 flomo 同步模式）
- 新增通用分批并发调度器（`batchSize` / `concurrency` / 单批失败不拖垮整体 / 429 重试）
- 新增 AI 属性补全命令组：挂接到既有五类来源命令（剪贴板 / 当前文件 / 搜索结果 / Dataview / Bases）及右键单文件入口
- 新增 `AiPropertiesAction` + `AiPropertiesModal`：推断进度态 → 提案审核态（行级勾选、提案值可编辑）→ 应用（走 `processFrontMatter` + 备份回滚通道）
- Prompt 质量约束：注入全库标签词表引导复用、tags/aliases 追加合入不覆盖、与现有值相同的提案自动跳过
- 新增设置分区渲染函数，避免 main.ts 膨胀

不改变既有非 AI 命令的任何行为；AI 功能默认关闭，未配置时命令以 Notice 阻断（模式同 flomoAPI 检查）。

## Capabilities

### New Capabilities

- `ai-properties-completion`: AI 属性补全能力——AI 服务配置与可用性检查、按笔记内容批量推断 frontmatter 属性（tags / aliases / 自定义属性）、提案-确认-应用三段式交互、多来源入口挂接、失败与部分成功处理、备份回滚集成

### Modified Capabilities

（无——既有 capability 的需求不发生变化）

## Impact

- **新增代码**：`src/ai/`（provider / settings / prop-infer / batch）、`src/action/ai-properties-action.ts`、`src/modal/ai-properties-modal.ts`
- **修改代码**：`src/command/` 五个来源命令类各新增一个命令注册、`src/command/context-menu-command.ts` 新增入口、`main.ts`（设置分区调用）、`src/backup/backup-settings.ts` 同款深合并模式复用
- **设置结构**：`FileCookerPluginSettings` 新增嵌套 `ai` 段，`loadSettings` 深合并已具备能力，需为 `ai` 段提供默认值
- **依赖**：无新增外部依赖（沿用 node-fetch v2）；SecretStorage 为 Obsidian 1.12.3 内置 API
- **测试**：`tests/ai/` 新增 prop-infer / batch / modal 交互单测，`tests/mocks/` 新增假 provider
- **风险与缓解**：隐私出域（默认关闭 + 确认窗明示发送范围 + 支持 Ollama 本地方言）；标签生态污染（词表注入）；成本失控（limit 护栏 + 批次/截断参数）；批量写坏 frontmatter（只走 `processFrontMatter` + 提案制 + 备份回滚）
