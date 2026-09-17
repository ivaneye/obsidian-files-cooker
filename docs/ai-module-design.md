# File Cooker AI 模块设计

> 状态：设计稿（待评审）
> 目标版本：v2.1.0 起，分阶段交付
> 关联：本设计遵循 `AGENTS.md` 架构约定，建议通过 openspec change 流程实施（见 §9）

---

## 1. 背景与定位

File Cooker 是"查询驱动的批量维护"工具：Reader（剪贴板 / 当前文件 / 搜索 / Dataview / Bases / 右键）选出文件 → Action（移动 / 重命名 / 属性 / 合并 / 删除…）批量处理 → ConfirmModal 人工确认后执行。

当前所有 Action 有一个共同前提：**用户必须预先知道要写什么值**。比如 Edit Properties 要求手填 key/value；Move 要求指定目标目录。这把"判断成本"留给了用户。

AI 模块的定位一句话：

> **让 AI 承担"逐文件判断"的成本，让用户只做"批量审核"。**

- 过去：查出 50 篇笔记 → 逐篇打开 → 手动想标签、想标题、想归属 → 手动写
- 之后：查出 50 篇笔记 → AI 逐篇推断提案 → 用户在确认窗里审核/修改 → 一键应用

这不改变插件的维护工具身份，只是把 Action 的参数来源从"用户输入"扩展为"AI 提案 + 用户确认"。

## 2. 总体原则

| 原则 | 含义 |
|---|---|
| **复用管线** | AI 能力 = 新的 Action / 新的 Reader，不改现有架构，不引入第二套执行路径 |
| **提案-确认** | AI 输出永远是"提案"，必须经过 ConfirmModal 人工审核才落盘。复用现有交互范式，天然满足 AI 写操作的安全要求 |
| **隐私 opt-in** | 发送内容前，确认窗明示"将发送哪些笔记的哪些部分"；上下文长度可配可截断 |
| **成本护栏** | 现有 `limit`（默认 300）就是总量护栏；AI 请求按批分片、按文件截断、并发受限 |
| **渐进交付** | 每个 Phase 独立可用、独立发版，不搞大爆炸 |

## 3. 阶段规划

| Phase | 能力 | 一句话 | 价值/风险 |
|---|---|---|---|
| **P1** | AI 属性补全 | 按内容批量推断 tags / aliases / 自定义属性 | 价值最高（社区公认痛点）、风险最低（frontmatter 可逆、易审核） |
| **P2** | AI 重命名 | 按内容批量生成新文件名，确认窗并排展示旧→新 | 高价值；改名影响链接，需走 Obsidian `fileManager.renameFile` 自动更新链接 |
| **P3** | AI 自然语言选择器 | "把去年没写完的读书笔记找出来" → 文件清单进入现有管线 | 插件变成 agent 入口；只读不写，零风险；是大入口级功能 |
| **P4** | AI 合并建议 | 识别同主题重复笔记 → 喂给现有 MergeAction | 依赖 P3 的选择能力，顺理成章 |
| **P5** | 智能归档路由 | 按内容判断每个文件的目标目录，逐文件给出去向提案 | "查询+判断"的完全体；para/中转用户刚需 |

P1 先行验证 provider、设置、提案 UI 这三块地基，P2~P5 复用。

---

## 4. Phase 1 详细设计：AI 属性补全

### 4.1 用户流程

```
1. 用户从任一来源选出文件（如 Bases 查询结果）
2. 执行命令「File Cooker: AI complete properties in bases results ...」
3. Reader 产出 ActionModel[]（现有逻辑，零改动）
4. AiPropertiesAction：
   a. 检查 AI 设置（未配置 → Notice 提示，模式同 flomoAPI 检查）
   b. 打开 AiPropertiesModal（进度态）：分批调用 LLM 推断
   c. 推断完成 → 提案态：逐文件展示 属性 key / 提案值 / 现有值，行级勾选+可编辑
5. 用户审核（改值/取消勾选/全不选），点 Apply
6. 逐文件 processFrontMatter 写入（规则与 EditPropertiesModal 对齐），完成 Notice 汇报
```

取消 = 零写入。任何一步失败不影响已选文件本身。

### 4.2 新增文件与职责

遵循 `AGENTS.md`：新批量操作 = 新 Action；文件 kebab-case + 角色后缀。

```
src/ai/ai-provider.ts          # OpenAI 兼容 Chat API 客户端（node-fetch，模式对齐 flomo 同步）
src/ai/ai-settings.ts          # AiSettings 默认值 + 深合并迁移 + 设置分区渲染
src/ai/prop-infer.ts           # P1 专属：prompt 构建 + 响应解析 + 校验
src/ai/batch.ts                # 通用分批/并发调度器（P2+ 复用）
src/action/ai-properties-action.ts   # implements Action
src/modal/ai-properties-modal.ts     # 提案审核模态框
tests/ai/prop-infer.test.ts    # prompt/解析/校验单测
tests/ai/batch.test.ts         # 调度器单测
tests/mocks/ai-provider.ts     # 假 provider（固定/异常响应）
```

命令挂接：在各 Command 类（`CurrentFileCommand` / `ClipboardCommand` / `DataviewCommand` / `BasesCommand` / `SearchCommand`）各加一个 `registAiCompleteProps()`，模式照抄 `registEditProp()`：

```ts
private registAiCompleteProps() {
    this.plugin.addCommand({
        id: 'ai-complete-properties-in-bases-results',
        name: 'AI complete properties in bases results ...',
        callback: () => {
            new BasesReader(this.plugin).read(new AiPropertiesAction(this.plugin));
        }
    });
}
```

右键菜单（`ContextMenuCommand`）加文件管理器入口：`File Cooker > AI complete properties`（单文件快速路径）。

### 4.3 AiProvider 设计

OpenAI 兼容协议一套通吃（DeepSeek / Kimi / Ollama / 中转站 / OpenAI 本尊）：

```ts
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }

export class AiProvider {
    constructor(private settings: AiSettings) {}

    /** JSON 模式对话。失败抛 Error（含 HTTP status 与 body 摘要），由调用方 Notice 化 */
    async chatJson(messages: ChatMessage[]): Promise<any> {
        const res = await fetch(this.settings.baseUrl.replace(/\/$/, '') + '/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + await this.resolveApiKey(),
            },
            body: JSON.stringify({
                model: this.settings.model,
                messages,
                temperature: 0.2,           // 元数据推断要稳定
                response_format: { type: 'json_object' },
            }),
        });
        if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data = await res.json();
        return JSON.parse(data.choices[0].message.content);
    }
}
```

要点：
- 网络错误处理对齐 flomo 同步的现有模式：`response.ok` 检查 + `Notice` 上报
- 429/5xx 由 batch 层统一重试一次（指数退避），再失败则该批标为失败，不中断整体
- 不做流式（元数据推断响应短，无必要，保持移动端兼容 `isDesktopOnly: false`）

### 4.4 Prompt 与响应契约

**发给模型的上下文（每个文件）：**

| 字段 | 来源 | 截断 |
|---|---|---|
| `path` | `TFile.path` | - |
| `title` | 文件名（去扩展名）或 `aliases[0]` | - |
| `content` | `vault.cachedRead` | 前 `contextChars` 字（默认 1500） |
| `existing` | 现有 frontmatter 中 tags/aliases | - |
| `vocab` | `Object.keys(app.metadataCache.getTags())` | 全库标签词表（去 `#`），上限 200 个，**整批只发一次** |

词表是质量关键：引导模型优先复用已有标签体系，避免每批造新词把 tag 生态越推越乱。

**System prompt（要点）：**

```
You are a metadata assistant for an Obsidian vault.
For each note, infer frontmatter properties:
- tags: 2~5 items, prefer reusing vocabulary from the provided vocab list; 
  language: {tagLanguage}; lowercase; no '#'
- aliases: 0~3 alternative titles (only when clearly useful)
- {customProps}: 按 key 定义推断（可空）
Never invent facts not supported by content. 
Return STRICT JSON only, schema:
{"results":[{"path":"...","props":{"tags":[],"aliases":[]}}]}
```

**响应校验（`prop-infer.ts`）：**
1. JSON 解析失败 → 该批重试一次，仍失败标记失败
2. 按 `path` 回配文件；找不到的条目丢弃并计数
3. 值规范化：tags 转小写、去 `#`、去空白、去重；aliases 去空串
4. 提案值与现有值完全相同的条目自动跳过（不产生无意义写入）

### 4.5 分批与并发（`batch.ts`）

```ts
runBatches<T, R>(items: T[], batchSize: number, concurrency: number,
                 worker: (batch: T[]) => Promise<R[]>): Promise<{ ok: R[]; failed: T[] }>
```

- 默认 `batchSize = 5`（每请求 5 篇），`concurrency = 3`
- 300 篇上限场景：60 批、20 轮，配合 1500 字截断，单次全量约 30~50 万 token 输入——DeepSeek 级价格可忽略，OpenAI 旗舰模型约 ¥2~5，用户可先小批量试用
- 成本可进一步通过 `contextChars` 调小来压
- 该调度器为纯函数式工具类，vitest 直接可测

### 4.6 提案审核模态框（AiPropertiesModal）

两种状态：

**进度态**：`Analyzing files ... 12/50`（复用 `renderModalLayout` 的 summary 行），期间可 Cancel 中止（未完成的批不再发出，已完成的进入提案态）。

**提案态**：

```
┌ AI complete properties ──────────────────────────────┐
│ 50 files selected. 42 proposals after inference.     │
│ 将发送给 AI：每篇笔记的文件名 + 前 1500 字符            │
│                                                      │
│ [✓] 3-Resources/控制论.md                             │
│     tags:  + [系统论, 反馈回路, 维纳]                  │
│     aliases: + [Cybernetics]                          │
│ [✓] 4-Inbox/读书笔记-2025.md                          │
│     tags:  + [读书笔记, 未完成]                        │
│ [ ] 1-Projects/x.md   （提案值可点击编辑）              │
│     tags:  + [项目]                                   │
│ ...                                                  │
│         [Apply 41 files]   [Cancel]                   │
└──────────────────────────────────────────────────────┘
```

- 行级勾选默认全选；提案值 `contenteditable` 或点击变输入框，可直接改
- 列表类属性（tags/aliases）**追加合入**现有值，不覆盖（与 EditPropertiesModal 的多值逻辑对齐）；`customProps` 标量属性仅在不存在时写入，面板提供 Override 开关（沿用现有 overrideFlag 习惯）
- Apply 只处理勾选行；完成后 Notice：`Properties updated: 41 files, 2 skipped, 3 failed:`（失败列路径）

### 4.7 设置项

现有 `FileCookerPluginSettings` 为扁平结构，新增嵌套 `ai` 段。`loadSettings` 需深合并（`Object.assign` 浅拷贝会丢子字段，需一并修正）：

```ts
interface AiSettings {
    enabled: boolean;        // 默认 false，总开关（opt-in）
    baseUrl: string;         // 如 https://api.deepseek.com/v1
    model: string;           // 如 deepseek-chat
    apiKey: string;          // 回退存储；优先 SecretStorage
    batchSize: number;       // 默认 5
    concurrency: number;     // 默认 3
    contextChars: number;    // 默认 1500
    inferTags: boolean;      // 默认 true
    inferAliases: boolean;   // 默认 true
    customProps: string;     // 逗号分隔，如 "status,domain"；空=不推断
    tagLanguage: 'auto' | 'zh' | 'en';  // 默认 auto
}
```

**Key 存储**：优先 Obsidian SecretStorage（`app.loadSecret/saveSecret/removeSecret('fc-ai-apiKey')`，minAppVersion 1.12.3 满足条件）；settings.json 中的明文仅作旧版/异常回退，设置页标注风险。未配置 `enabled/baseUrl/apiKey` 时命令直接 Notice 提示，模式同 `Please config flomoAPI first!`。

设置分区渲染放 `src/ai/ai-settings.ts` 导出 `renderAiSettings(containerEl, plugin)`，由 main.ts 的 SettingTab 调用，避免 main.ts 膨胀。

### 4.8 测试策略

repo 已有 vitest + `tests/mocks/obsidian.ts`（AGENTS.md 中"无测试框架"的描述已过时，顺带更新该文件）：

| 层 | 用例 |
|---|---|
| `prop-infer` | 合法/非法 JSON 解析、path 回配丢弃、tags 规范化（大小写/`#`/去重）、与现有值相同的跳过逻辑 |
| `batch` | 分批边界（空集/余数批）、并发上限、单批失败不拖垮整体、429 重试后成功 |
| `ai-properties-modal` | 勾选状态→Apply 集合、追加合入/Override 语义（对齐 modal-ux.test.ts 现有风格） |
| provider | 注入 fake fetch：非 200 抛错带 status、鉴权头拼接 |

网络与真实 LLM 不进单测，手工验收。

### 4.9 验收标准（P1 Definition of Done）

1. 任一 Reader 来源（含右键单文件）可触发 AI 属性补全，全程 提案→确认→应用 三段式
2. 未配置 / 网络失败 / 部分批次失败：均有 Notice，已成功部分可正常应用，失败文件路径可见
3. 取消（含推断中途取消）零写入
4. tags/aliases 追加不合并不覆盖（Override 开关除外），与现有 EditPropertiesModal 语义一致
5. API Key 不默认落 settings.json 明文
6. `npm run build` 通过，新增单测全绿
7. 移动端可用（无 desktop-only API）

---

## 5. Phase 2 概要：AI 重命名

- 复用地基：provider / batch / 提案 UI（复用同一 Modal 骨架，行内容换成 `old → new`，new 可编辑）
- Prompt 输入同 P1（title + 截断 content），输出 `{"path","newName"}`
- 应用走 `app.fileManager.renameFile(file, newPath)`——Obsidian 自动更新全库链接，风险可控
- 约束：仅改文件名部分，不移动目录；非法字符过滤（`\ / : * ? " < > |`）；重名冲突追加序号
- 命令名：`AI rename in xxx ...`，挂接方式同 P1

## 6. Phase 3 概要：AI 自然语言选择器

新增 `AiSelectorCommand` + `AiQueryModal`（输入自然语言描述）→ **新 Reader**：`AiReader implements Readable`，产出 `ReadInfo` 后接任意现有 Action——用户可以用一句话选文件，然后直接跑移动/属性/删除全流程。

两段式生成（控制 token 与幻觉）：
1. 先让 LLM 输出**筛选计划**：Dataview DQL 或结构化过滤条件（folder/タグ/日期/关键词）
2. 本地执行得到候选清单（或 DQL 借道 Dataview 插件执行）；候选过多时再让 LLM 精筛
- 全库文件路径清单按需注入（仅路径，无正文，5000 篇约 15 万字符，可分片）
- 纯只读，输出进 ConfirmModal 的既有"确认预览"再执行，与现有安全模型一致

## 7. Phase 4/5 概要

- **P4 合并建议**：`AiReader` 选出"同主题簇"→ 直接喂 `ChooseFileModal + MergeAction` 现有链路；插件只新增"发现重复"的入口
- **P5 智能归档路由**：目标目录清单（vault 顶层文件夹+每个目录的样本文件名）注入 prompt，LLM 为每篇文件给出 `{path, targetFolder, reason}`；提案 UI 展示去向+理由，应用复用 `MoveAction`。目录清单用少量样本即可，不送正文以外的数据

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| 隐私顾虑（笔记内容出域） | enabled 默认 false；确认窗明示发送范围；contextChars 可调小；本地 Ollama 即可零出域 |
| 标签生态污染（每次新造词） | 注入全库标签词表 + prompt 强制优先复用 |
| 成本失控 | limit 总量护栏 + batchSize/contextChars 粒度控制；面板展示预估发送量 |
| 批量写坏 frontmatter | 只走 `processFrontMatter`（结构化读写，Obsidian 保证格式）；提案制+行级勾选，最坏情况也只是用户自己勾错的值 |
| 网络在移动端的不稳定 | 单批失败重试一次即放弃并上报，不静默；离线时 Notice 快速失败 |
| 与 Obsidian 原生 AI 功能演进冲突 | 本模块锚定"批量+管线"位置——原生 AI 是单点交互，不做单点功能与之竞争 |

## 9. 实施方式

按 repo 既有 openspec 流程拆分：

1. `add-ai-properties-completion`（P1，含 provider/settings/batch 地基）
2. `add-ai-rename`（P2）
3. `add-ai-nl-selector`（P3）
4. P4/P5 待 P3 验证后另行立项

每期独立发版（2.1.0 / 2.2.0 / 2.3.0…），README 中以 "🤖 AI（实验性）" 单独章节说明，设置默认关闭。

---

*设计基于 2.0.1 代码现状：`src/command` 六个 Command 类、`src/reader`/`src/action` 管线、`modal-ui.ts` 布局助手、node-fetch v2 依赖、vitest 测试环境。*
