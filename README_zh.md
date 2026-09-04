> 像做菜一样批量处理笔记：一次选择食材，一键下锅烹饪，确认后出锅 ✅
>
> [English README](README.md)

# File Cooker

File Cooker 是一款 Obsidian **批量文件处理插件**：把一批文件（来自搜索结果、剪贴板、当前文件链接、Dataview / Bases 查询……）当作「食材」，一条命令完成**移动、重命名、改属性、删除、合并、同步 flomo、加入 Canvas** 等「烹饪」操作。

- 🧺 **来源不限**：剪贴板 · 当前文件 · 搜索结果面板 · Dataview 查询 · Bases 查询 · 右键菜单
- 🍳 **操作丰富**：移动 / 重命名 / 编辑属性 / 删除 / 合并 / 创建 / 同步 flomo / 复制链接 / 加入 Canvas
- 🛡️ **安全确认**：所有操作执行前都会弹出确认窗口，删除等危险操作单独标红提醒
- 📱 **移动端可用**：非桌面独占（`isDesktopOnly: false`）

---

## ✨ 特性

- **批量编辑属性**：新增 / 修改 / 删除 frontmatter 属性；`tags` / `alias` / `cssclasses` 支持逗号分隔的多值编辑、`-` 前缀删除单个值；**无需再安装 MetaEdit 插件**（v1.8.0 起内置）
- **批量移动 / 重命名**：选中的文件一键整理到目标文件夹，或批量重命名
- **批量合并**：把多个文件合并到一个目标文件（合并时忽略 YAML）
- **批量创建**：把当前文件中的**未解析链接**一键补齐为真实文件
- **同步 flomo**：支持同步文件链接、文件内容、当前选区（需配置 flomoAPI）
- **复制链接**：把 Dataview / Bases 查询结果链接复制到剪贴板
- **加入 Canvas**：批量把文件、文本 / 选区、Dataview 任务添加进目标画布
- ⭐ **Bases 集成**（v2.0.0 新增）：直接对 Bases 查询结果执行文件操作
- ⭐ **右键菜单**（v2.0.0 新增）：编辑器 / 文件管理器右键直达
- **演示模式**（v1.9.0 新增）：一键放大字号、加宽编辑区，方便投屏阅读

## 📸 截图

> 演示：搜索结果 + 剪贴板 + Dataview 查询，三种来源统一走「选择 → 处理 → 确认」。

![](demo.png)

## 🍳 核心用法：选择 → 处理 → 确认

1. **选择（Select）**：通过任一来源选出一批文件
2. **处理（Cook）**：执行对应的操作命令
3. **确认（Confirm）**：在确认窗口中核对目标，确认后才会真正执行

### 支持的输入来源

| 来源 | 怎么用 | 说明 |
| :--- | :--- | :--- |
| 📋 剪贴板 | 先复制文件链接（如搜索结果），再执行「剪贴板」命令 | 纯文本内容也可加入 Canvas |
| 📄 当前文件 | 打开文件，执行「当前文件链接」命令 | 支持链接 / 未解析链接 / 内容 / 选区四种读取方式 |
| 🔍 搜索结果 | 打开 Obsidian 搜索结果面板，执行「搜索结果」命令 | 直接处理面板中的结果文件 |
| 📊 Dataview 查询 | 在编辑器中选中 DQL 或 DataviewJS 查询语句，执行「Dataview」命令 | 需要安装 [Dataview](https://github.com/blacksmithgu/obsidian-dataview) 插件；v1.7.1 起支持 DataviewJS |
| 🗄️ Bases 查询 | 打开 Bases 视图，执行「Bases」命令 | v2.0.0 新增，只处理可映射到真实文件的 row |
| 🖱️ 右键菜单 | 编辑器 / 文件管理器右键 | v2.0.0 新增 |

### 支持的操作

| 操作 | 命令示例 | 说明 |
| :--- | :--- | :--- |
| 📁 移动 | Move ... to folder | 批量移到目标文件夹 |
| ✏️ 重命名 | Rename ... | 批量重命名 |
| 🏷️ 编辑属性 | Edit Properties ... | 新增 / 修改 / 删除 frontmatter，支持多值 |
| 🗑️ 删除 | Delete ... ! | 危险操作，执行前标红确认 |
| 🔗 合并 | Merge ... to ... | 合并到目标文件 |
| 🆕 创建 | Create links ... | 从未解析链接创建文件 |
| 📤 同步 flomo | Sync ... to flomo | 文件链接 / 内容 / 选区 |
| 📋 复制链接 | Copy ... links! | 复制到剪贴板 |
| 🖼️ 加入 Canvas | Add ... to canvas | 文件 / 文本 / 任务 |

### Bases 集成（v2.0.0 新增）

当 Bases 数据源可用时，File Cooker 提供与 Dataview 对齐的 Bases 命令组（移动 / 重命名 / 编辑属性 / 删除 / 合并 / 同步 flomo / 复制链接 / 加入 Canvas / 添加任务）。

边界说明：

- **仅文件映射**：只处理可映射到 vault 文件的 row
- **忽略非文件 row**：不可映射项会跳过，并在右下角提示忽略数量
- **不写入 row 字段**：本流程不会对 Bases row 字段做任何新增 / 修改 / 删除

### 右键菜单（v2.0.0 新增）

- **编辑器右键**：
  - `File Cooker > Selection`：同步选区到 flomo / 添加选区到 Canvas（仅在有选区时出现）
  - `File Cooker > Current file links`：对当前文件中的链接执行批量操作
- **文件管理器右键**：
  - `File Cooker > Target file`：对「被右键的文件」执行重命名 / 编辑属性 / 删除

> 说明：删除等危险操作仍会弹出确认窗口；不存在活动文件时，当前文件链接相关操作会被安全阻断并提示。

## ⚙️ 设置

| 设置项 | 作用 | 默认值 |
| :--- | :--- | :--- |
| Limit | 单次批量处理的文件数量上限 | `300` |
| flomoAPI | flomo API 地址，用于同步笔记到 flomo | 空 |

> flomo 同步类命令在未配置 API 时会提示「Please config flomoAPI first!」。

## 📦 安装

### 方式一：官方插件市场（推荐）

1. 设置 → 第三方插件 → **关闭安全模式**
2. 点击 **浏览**，搜索 **File Cooker**
3. 点击 **安装**，安装完成后**启用**即可

### 方式二：手动安装

1. 下载[最新版本](https://github.com/ivaneye/obsidian-files-cooker/releases/latest)
2. 解压 `obsidian-file-cooker` 文件夹到 `<vault>/.obsidian/plugins/` 目录下
   > 提示：某些机器上 `.obsidian` 目录是隐藏的，macOS 可按 `Command+Shift+Dot` 显示
3. 重启 Obsidian 并在设置中启用插件

### 依赖说明

- Obsidian ≥ **1.12.3**（v2.0.0 起）
- **Dataview** 插件：仅使用「Dataview 查询」来源时需要
- **flomoAPI**：仅使用「同步 flomo」命令时需要
- 其余功能开箱即用，无额外依赖

## 🛡️ 安全与限制

- **全程确认**：所有命令执行前都会弹出确认窗口，避免误操作
- **删除标红**：删除类命令在确认窗口中标红提示
- **数量上限**：单次批量处理默认不超过 300 个文件，可在设置中调整
- **失败可见**：无文件、无活动文件、配置缺失等情况均以 Notice 提示，不会静默失败

## 💬 反馈与支持

使用中遇到任何问题或建议，欢迎**加微信讨论：`IvyOdds`**，或在 [GitHub Issues](https://github.com/ivaneye/obsidian-files-cooker/issues) 反馈。

如果 File Cooker 对你有帮助，欢迎分享给身边用 Obsidian 的朋友 🙏

## 📜 开源规范

- 遵循 MIT 协议，详见 [LICENSE](./LICENSE)
- 欢迎提 issue、PR 参与共建

## 📝 更新日志

### 2.0.0

- 新增 **Bases 查询**作为文件批处理来源（仅处理可映射文件的 row，不修改 Bases 字段）
- 新增 **右键菜单**入口（编辑器：选区 / 当前文件链接；文件管理器：目标文件）
- 升级 Obsidian 依赖至 1.12.3

### 1.9.0

- 新增 **演示模式**：一键放大字号、加宽编辑区，方便投屏阅读

### 1.8.1

- 属性编辑支持**多值属性**：`tags` / `alias` / `cssclasses` 逗号分隔批量增删

### 1.8.0

- 内置**批量属性编辑**，无需再安装 MetaEdit 插件

### 1.7.8

- 新增**搜索结果**命令，可直接处理搜索结果面板

### 1.7.7

- 支持添加 **Dataview Task** 到 Canvas

### 1.7.6

- 支持添加**文本**到 Canvas

### 1.7.1

- 支持 **DataviewJS** 页面查询语句

### 1.7.0

- 支持批量添加**文件**到 Canvas

### 1.0 ~ 1.6

- 基础能力：移动、重命名、合并、删除、从未解析链接创建、同步 flomo、复制链接

---

## ☕ Buy me a coffee

<div display="flex">
  <img src="./wx_pay.png" width="300px"/>
  <span style="margin:0 3px"></span>
  <img src="./alipay.png" width="300px"/>
</div>
