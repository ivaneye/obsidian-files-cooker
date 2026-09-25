# File Cooker AI 模块设计

> 状态：设计稿（待评审）
> 目标版本：v2.1.0 起，分阶段交付
> 关联：本设计遵循 `AGENTS.md` 架构约定，建议通过 openspec change 流程实施（见 §9）
> 修订：§6 已重写为 P3 实施基线（IR + 编译器 / 三语法通译 / 无持久会话 / 复用 P1 配置）

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
| **P3** | AI 自然语言选择器（三语法通译） | "把去年没写完的读书笔记找出来" → 编译成 DQL / 搜索 / Bases 三语法 → 命中文件进入现有管线 | 独占位：查询通译 + 批量执行 + 回滚；只读不写，零风险；实施基线见 §6 |
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

## 6. Phase 3：AI 自然语言选择器（三语法通译）

> 本节为实施基线（评审修订版）。核心决策：LLM 只产 IR，三种查询语言由本地编译器生成；执行复用现有 Reader；无持久会话。

### 6.1 定位与与旧稿差异

把自然语言编译成 **DQL / 搜索语法 / Bases YAML** 三种查询语言，命中文件直接送入现有 Action 管线。定位一句话：

> 唯一能把自然语言编译成全部三种 Obsidian 查询语言、并把结果送进批量操作 + 备份回滚管线的插件。竞品只会"回答"，File Cooker 能"编译 + 执行 + 回滚"。

与旧稿（v1）的差异：

- **不再新增 `AiReader implements Readable`**；改为 `AiSelectorModal` 编排，经 CaptureAction 复用三个现有 Reader（见 6.3）
- **放弃"LLM 直接挑文件 / 全库路径清单注入"路线**：IR → 查询执行更确定、零幻觉、可解释，大库无需分片
- 命令入口不变：独立 `AiSelectorCommand`（选择器本身即来源，不挂在既有五类来源命令下）

### 6.2 架构：IR + 确定性编译器

不让 LLM 直接写三种语法（幻觉率 ×3、不可测试）。LLM 一次调用产出 IR（JSON）+ 一句人类可读解释；本地纯函数编译器产出三份查询文本：

- 编译器是纯函数 → vitest 全覆盖（吃仓库现有测试文化）
- 用户改 IR 字段或查询文本 → 本地重编译，零 token 成本迭代
- 三份产物可复制 / 另存为 `.base` / 填入搜索面板——**即使不执行也有独立价值**（竞品没有的"查询通译器"定位）

IR 草案（带 `irVersion` 留演进位）：

```json
{
  "irVersion": 1,
  "intent": "去年标记 #读书 但没读完的笔记",
  "conditions": {
    "and": [
      { "tag": "读书" },
      { "property": { "field": "status", "op": "notEquals", "value": "done" } },
      { "fileModified": { "op": "gte", "date": "2025-01-01" } }
    ]
  }
}
```

IR 节点类型（MVP 集）：`tag` / `folder` / `filename`（文件名包含）/ `property`（op: eq / notEquals / contains / isEmpty / gt / gte / lt / lte）/ `fileModified` / `fileCreated` / `content`（正文关键词）/ `task`（todo / done）/ 布尔组合 `and` / `or` / `not`。

### 6.3 三通道执行（已对照现有代码核实）

| 通道 | 生成 | 程序化执行 |
|---|---|---|
| DQL | 容易，语料丰富 | **零改造**：`DataviewReader` 构造函数直接吃 `queryStr`，`api.query()` 已处理 LIST / TABLE / TASK 三种返回 |
| 搜索语法 | 语法稳定：`tag:` `path:` `file:` `line:` `content:` `task-todo:`、`[属性:值]`（1.4.4+）、`-` 取反、`OR`/`()` 组合 | 需补注入器：`searchView.setQuery(q)`（内部 API，运行时验证）+ 轮询 `resultDomLookup` 稳定（超时上限 ~5s）；兜底 = 打开搜索面板填入查询，Notice 请用户回车 |
| Bases | 官方函数文档齐全：`file.hasTag()` / `file.inFolder()` / `属性.contains()` 等，YAML 可靠生成 | **P3a**：生成 + 另存为真 `.base` 文件 + 一键打开（产物模式，零执行风险）；**P3b**：写临时 `.file-cooker/tmp/*.base` → setViewState 打开 → 复用现有行探测读取 → 清理 |

**CaptureAction：执行通道 100% 复用现有 Reader，零重构零重复**——

```ts
/** 捕获 Reader 产出的 ActionModel[] 而不落盘，供选择器编排使用 */
class CaptureAction implements Action {
    private resolve!: (models: ActionModel[]) => void;
    readonly promise: Promise<ActionModel[]>;

    constructor() {
        this.promise = new Promise((resolve) => { this.resolve = resolve; });
    }

    act(models: ActionModel[]): void {
        this.resolve(models);
    }
}
```

三通道统一为：`注入/构造查询 → reader.read(capture) → await capture.promise → TFile[]`。
流程终点：用户在命中清单上点操作按钮 → `new MoveAction(plugin).act(models)` 等 → 现有确认窗 + 备份回滚全接管。

### 6.4 表达力互补与执行器推荐

三种语言各有一块别人填不了的地（这是"必须三语法"的技术合理性）：

| IR 条件 | DQL | 搜索语法 | Bases |
|---|---|---|---|
| 标签 | `FROM #t` | `tag:#t` | `file.hasTag("t")` |
| 目录 | `FROM "f"` | `path:"f"` | `file.inFolder("f")` |
| 文件名 | `contains(file.name, x)` | `file:x` | `file.name.contains("x")` |
| 属性比较 | ✅ | ✅（仅精确 `[f:v]`，取反用 `-(...)`） | ✅ |
| 日期/数值比较 | ✅ `file.mday >= date(x)` | ❌ | ✅ 公式比较（需手工验证） |
| 正文关键词 | ❌ | ✅ 唯一强项 | ❌ |
| 任务状态 | ✅ TASK | ✅ `task-todo:()` | ❌ |

- 每个编译器返回 `{ text, unsupported: IRNode[] }`；编译期完成能力检查
- **推荐执行器** = 可用集合内 `unsupported` 为空且优先级最高者（`dql > search > bases`）
- 无任何执行器完整支持 → 不自动执行，展示各目标支持度，用户改 IR / 改查询文本

### 6.5 Tab 可见性（单一事实来源）

`query-executor.ts` 导出唯一能力函数，tab 渲染与推荐共用，避免"显示了不能跑 / 能跑没显示"分裂：

```ts
export function getAvailableTargets(): QueryTarget[] {
    const targets: QueryTarget[] = [];
    if (getAPI() != null) targets.push('dql');  // 已安装且已启用 Dataview（未启用时 getAPI() 返回 null，天然覆盖）
    targets.push('search');                      // 核心功能恒可用（含移动端）
    targets.push('bases');                       // minAppVersion 1.12.3，Bases 必在
    return targets;
}
```

边界处理：

1. **IR 含仅 DQL 可表达的条件（如日期比较）但 Dataview 未装**：按规则隐藏 DQL tab；搜索 tab 预览区标注 `N 个条件此语法不支持（已忽略）`；模态框底部一行静态提示「安装 Dataview 插件可启用更强的条件执行」——tab 不出现，但退化不静默
2. **无执行器完整表达**：见 6.4，不自动执行

### 6.6 用户流程

```
「AI: find files with natural language ...」（AiSelectorCommand）
  ↓
AiSelectorModal：自然语言输入框（+ 可选追问输入）
  ↓ 一次 LLM 调用（复用 P1 provider 地基）
query-planner 产出 IR + 人类可读解释
  ↓ 本地编译（纯函数，零成本）
提案页：解释 + [DQL | 搜索 | Bases] tab（按 getAvailableTargets 渲染）
       + 推荐执行器徽标 + IR 字段可编辑 / 查询文本可编辑
  ↓ 选执行器执行（只读，复用现有 Reader + limit 护栏）
命中文件清单（数量、截断提示）
  ↓ 用户点操作按钮
Move / Rename / Properties / Canvas / flomo / Delete → 现有 Action + 备份回滚
```

全程只读；取消（任意一步）零写入。

### 6.7 配置（复用 P1 地基，不另起炉灶）

| 项 | 决策 |
|---|---|
| `enabled` / `baseUrl` / `model` / `apiKey` | 与 P1 共用一套 AiSettings 与 provider |
| `batchSize` / `concurrency` / `contextChars` | P1 专属（批量推断），P3 不用（规划器单次调用） |
| `vaultContext: boolean` | **P3 唯一新增**，默认 true；MVP 恒开、不进设置 UI，留字段为大库用户预留关闭位 |

`vaultContext` 注入内容（**P3 命中率的命门**，不是模型参数）：

| 内容 | 来源 | 上限 |
|---|---|---|
| 全库标签词表 | `metadataCache.getTags()` | 200 |
| 属性键清单 | `metadataCache.getAllPropertyInfos()`（1.9+） | 100 |
| 顶层/二级目录名 | vault 遍历 | 100 |
| 今天日期 | `new Date()` | ——（"去年 / 最近三个月"的解析基准） |

未配置 AI 时：Notice + `app.setting.openTabById('obsidian-file-cooker')` 直接跳设置页（P1/P2 可沿用同一增强）。

### 6.8 会话策略：无持久会话

- **产品形态决定**：查询对话是手段不是目的，文件处理完对话价值归零；持久会话属于 Copilot 型聊天产品，照搬只带来状态清理、隐私存储、UI 复杂度三个负担
- **IR 天然替代会话状态**：状态浓缩在一个 JSON 里，改需求 = 改字段，本地重编译零成本、确定性、可测试
- **MVP 一次生成**；追问作为可选增强位（按真实反馈决定是否做）：`{previousIR, instruction}` → 新 IR，约 30 行，模态框内存即焚，比喂聊天记录更省 token 更准（模型做 patch 而非重推导）；**不为它加设置项**
- 明确拒绝：持久会话 / 跨模态会话 / 聊天 UI 范式

### 6.9 新增文件

```
src/ai/query-ir.ts                 # IR 类型 + 校验 + 规范化
src/ai/compile-dql.ts              # IR → DQL（纯函数）
src/ai/compile-search.ts           # IR → 搜索语法（纯函数）
src/ai/compile-bases.ts            # IR → .base YAML（纯函数）
src/ai/query-planner.ts            # NL → IR（prompt 构建 + vaultContext 注入 + 响应校验）
src/ai/query-executor.ts           # getAvailableTargets + CaptureAction + 搜索注入器 + 执行编排
src/command/ai-selector-command.ts
src/modal/ai-selector-modal.ts
tests/ai/query-ir.test.ts
tests/ai/compile-dql.test.ts
tests/ai/compile-search.test.ts
tests/ai/compile-bases.test.ts
```

### 6.10 测试与验收（P3a DoD）

| 层 | 用例 |
|---|---|
| 编译器 | 每种 IR 节点 → 三语法 golden 断言；嵌套 and/or/not；unsupported 标注；引号/路径转义 |
| query-ir | 非法 JSON / 未知 irVersion / 未知节点 / 值规范化 |
| 推荐链 | 可用集合过滤（mock getAPI）；优先级；无完整支持时不自动执行 |
| planner | 合法 IR 抽取、解释字段缺失兜底（网络与真实 LLM 不进单测，手工验收） |

DoD：

1. 未配置 AI → Notice + 跳设置页；未装 Dataview → 无 DQL tab，搜索兜底可执行
2. 全程只读，直到用户点操作按钮；取消零写入
3. 三产物可复制；Bases 可另存为 `.base` 并打开
4. 命中超 `limit` 截断并有 Notice
5. 移动端可用；`npm run build` 通过，新增单测全绿

### 6.11 分期

| 期 | 范围 |
|---|---|
| **P3a** | IR + 三编译器 + DQL/搜索执行 + Bases 生成导出（6.2~6.10） |
| **P3b** | Bases 临时 `.base` 注入执行 + 执行前命中数预览（依 P3a 反馈立项） |

## 7. Phase 4/5 概要

- **P4 合并建议**：选择器（§6）选出"同主题簇"→ 直接喂 `ChooseFileModal + MergeAction` 现有链路；插件只新增"发现重复"的入口
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
3. `add-ai-nl-selector`（P3a，实施基线见 §6）
4. `add-ai-bases-executor`（P3b，Bases 程序化执行，依 P3a 反馈立项）
5. P4/P5 待 P3 验证后另行立项

每期独立发版（2.1.0 / 2.2.0 / 2.3.0…），README 中以 "🤖 AI（实验性）" 单独章节说明，设置默认关闭。

---

*设计基于 2.0.1 代码现状：`src/command` 六个 Command 类、`src/reader`/`src/action` 管线、`modal-ui.ts` 布局助手、node-fetch v2 依赖、vitest 测试环境。*
