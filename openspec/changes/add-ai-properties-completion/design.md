## Context

详见 `docs/ai-module-design.md` §4（P1 详细设计，本变更的实现蓝本）。当前插件已具备：六类来源命令 + Reader/Action 管线（`src/command` / `src/reader` / `src/action`）、确认弹窗范式（`src/modal/modal-ui.ts` 布局助手）、备份回滚通道（`src/backup/backup-service.ts` 单例，`getBackup().begin/snapshot*/finish/abort`）、node-fetch v2 依赖、vitest 测试环境（`tests/mocks/obsidian.ts` + `vault-mock.ts`）。

约束：`noImplicitAny: true`；设置加载已用深合并（`deepMerge`），新增嵌套 `ai` 段可直接复用该模式；移动端可用（`isDesktopOnly: false`），不得引入 desktop-only API。

## Goals / Non-Goals

**Goals**

- 建立可被 P2（AI 重命名）、P3（自然语言选择器）复用的三块地基：AI Provider 客户端、AI 设置分区、分批并发调度器
- 交付 AI 属性补全的完整用户流程：多来源触发 → 推断 → 提案审核 → 应用（含备份回滚）
- 全程遵循既有架构约定：新批量操作 = 新 Action；不做第二套执行路径

**Non-Goals**

- 不做流式响应（元数据推断响应短，无必要）
- 不做多模态、嵌入向量、本地推理运行时管理（Ollama 走 OpenAI 兼容协议即可）
- 不实现 P2/P3/P4/P5 的任何功能（仅预留地基复用点）
- 不改动既有非 AI 命令的行为

## Decisions

### D1：Provider 选型——OpenAI 兼容协议一套通吃

仅实现 OpenAI 兼容 Chat API（`POST {baseUrl}/chat/completions`，`response_format: json_object`，`temperature: 0.2`）。DeepSeek / Kimi / GLM / OpenRouter / Ollama 均兼容该协议，无需多 Provider 抽象层。

- **备选**：为 Anthropic / Gemini 做原生适配——否决，P1 场景（JSON 元数据推断）收益低、维护面大；竞品中多 Provider 支持的插件（jaspermayone/ai-tagger）也未见采用优势
- 网络错误处理对齐 flomo 同步既有模式：`response.ok` 检查 + `Notice` 上报，失败抛 `Error`（含 HTTP status 与 body 摘要）

### D2：Key 存储——SecretStorage 优先，明文回退

Obsidian 1.12.3 提供 `loadSecret/saveSecret/removeSecret`（minAppVersion 已满足）。设置页保存时优先写 SecretStorage；从旧版/异常场景遗留的 settings.json 明文仅作回退读取，并在设置页标注风险。`ai-settings.ts` 导出 `renderAiSettings(containerEl, plugin)` 供 main.ts 的 SettingTab 调用，避免 main.ts 膨胀。

### D3：分批调度器——纯函数式工具类（`batch.ts`）

`runBatches(items, batchSize, concurrency, worker)` 返回 `{ ok, failed }`：单批失败重试一次（指数退避，覆盖 429/5xx），仍失败则计入 `failed`，不中断整体。默认 `batchSize = 5`、`concurrency = 3`；300 篇上限 × 1500 字截断的成本量级见设计文档 §4.5，用户可通过 `contextChars` 调小。

### D4：Prompt 契约——词表注入 + 严格 JSON Schema

每文件发送 `path` / `title`（文件名或 aliases[0]）/ `content`（前 `contextChars` 字符，默认 1500）/ `existing`（现有 tags/aliases）；标签词表（`metadataCache.getTags()` 去 `#`，上限 200）整批只发一次。响应契约 `{"results":[{"path","props":{"tags":[],"aliases":[]}}]}`，校验与规范化规则见 specs（值规范化、path 回配、相同值跳过）。语言选项（`tagLanguage: auto/zh/en`）注入 system prompt。

### D5：写入语义——复用 EditPropertiesModal 既有规则

列表属性（tags/aliases/cssclasses）追加合入去重；自定义标量属性仅不存在时写入，面板提供 Override 开关（沿用既有 `overrideFlag` 习惯）。写入只走 `processFrontMatter`。备份集成模式照抄既有 Action：弹窗 Apply 分支 `getBackup().begin('ai-properties', label)` → 逐文件 `snapshot` → 成功 `finish()` / 失败 `abort()`。

### D6：模块组织

```
src/ai/ai-provider.ts          # OpenAI 兼容客户端
src/ai/ai-settings.ts          # AiSettings 默认值 + 深合并 + 设置分区渲染
src/ai/prop-infer.ts           # P1 专属：prompt 构建 + 响应解析校验
src/ai/batch.ts                # 通用分批并发调度器
src/action/ai-properties-action.ts   # implements Action
src/modal/ai-properties-modal.ts     # 进度态/提案态双状态弹窗
tests/ai/prop-infer.test.ts
tests/ai/batch.test.ts
tests/mocks/ai-provider.ts     # 固定/异常响应假 provider
```

命令挂接：五个来源 Command 类各加 `registAiCompleteProps()`（模式照抄 `registEditProp()`），右键菜单加文件管理器单文件入口。

### D7：调用链路

```mermaid
flowchart LR
    CMD[来源 Command 类<br/>registAiCompleteProps] --> RD[既有 Reader<br/>产出 ActionModel[]]
    RD --> ACT[AiPropertiesAction]
    ACT --> CHK{AI 配置检查}
    CHK -- 未配置 --> NT[Notice 阻断]
    CHK -- 通过 --> MODAL[AiPropertiesModal]
    MODAL -- 进度态 --> INFER[prop-infer + batch + AiProvider]
    INFER -- 提案 --> MODAL
    MODAL -- 提案态·用户勾选编辑 --> APPLY[逐文件 processFrontMatter<br/>+ 备份快照 begin/snapshot/finish]
    APPLY --> DONE[Notice 汇报 成功/跳过/失败]
```

## 测试策略

- **框架与组织**：vitest，`tests/ai/` 目录；TDD 流程（红→绿→重构）适用于 prop-infer / batch / modal 交互三层
- **Mock/Stub**：`tests/mocks/ai-provider.ts` 提供固定响应与异常响应假 provider；网络与真实 LLM 不进单测，手工验收；Obsidian API 沿用 `tests/mocks/obsidian.ts`
- **层次**：
  - `prop-infer`：合法/非法 JSON 解析、path 回配丢弃、tags 规范化（大小写/`#`/去重）、与现有值相同的跳过
  - `batch`：分批边界（空集/余数批）、并发上限、单批失败不拖垮整体、重试后成功
  - `ai-properties-modal`：勾选状态→Apply 集合、追加合入/Override 语义（对齐 `tests/modal/modal-ux.test.ts` 风格）
  - provider：注入 fake fetch，验证非 200 抛错带 status、鉴权头拼接
- **注释**：测试代码说明测试目的/内容/预期；实现代码说明模块与关键逻辑职责（做什么/为什么），不逐行翻译

## Risks / Trade-offs

- [隐私出域] → enabled 默认 false；确认窗明示发送范围；`contextChars` 可调小；支持 Ollama 本地方言零出域
- [标签生态污染] → 词表注入 + prompt 强制优先复用
- [成本失控] → 既有 `limit` 总护栏 + batchSize/contextChars 粒度控制
- [批量写坏 frontmatter] → 只走 `processFrontMatter`；提案制 + 行级勾选；备份回滚兜底
- [移动端网络不稳] → 单批重试一次即放弃并上报，不静默；离线快速失败
- [内部/半公开 API 演进（SecretStorage、getTags）] → 明文回退路径保证降级可用；调用点集中在 ai-settings 单文件

## Migration Plan

设置结构新增嵌套 `ai` 段，`deepMerge` 保证旧 settings.json 平滑迁移（无 `ai` 段时取默认值，功能默认关闭）。无破坏性变更，回滚等价于停用 AI 总开关或回退插件版本；备份记录与既有格式一致，无独立数据迁移。

## Open Questions

（无——实现细节已在 `docs/ai-module-design.md` §4 固化，遗留项仅为手工验收项：真实 LLM 质量、移动端真机网络行为。）
