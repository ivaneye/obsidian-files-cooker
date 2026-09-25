## Why

当前插件有数十个命令（5 来源 × 9 操作 + AI 命令），用户必须"先知道命令存在"才能用，入口割裂、学习成本高。用户明确提出整合方向：保持"查询 → 确认 → 执行"框架不变，把流程收敛为**单一入口**：查询（AI 生成三种脚本或手写 + 语法检查）→ 确认（执行脚本、核对结果）→ 执行（结果正确则挑选操作执行）。

## What Changes

- 新增**工作台模态框**（三步向导）：查询 / 确认 / 执行，带步骤指示与往返导航
- 查询步骤支持七种来源：**AI 生成**（复用 NL 选择器的规划+三编译）、**手写 DQL / 搜索语法 / Bases**（带语法检查）、以及既有三来源（搜索面板结果 / 剪贴板 / 当前文件链接）
- 新增语法检查模块：DQL 用 Dataview `tryQuery`（只读试跑，语法错误即报错）；搜索语法做结构 lint（括号/引号配平、操作符白名单）；Bases 做结构 lint（filters 键、引号配平）
- 确认步骤：命中清单 + 数量 + 上限截断提示
- 执行步骤：操作目录按"修改属性 / 整理文件 / 收集与同步"分组，分发给既有 Action（沿用确认窗 + 备份回滚）
- 新增入口：命令 `Open File Cooker workbench ...` + 侧边栏 ribbon 图标
- 既有命令全部保留（作为快捷方式），工作台是编排层不是替代层

**范围边界**：Bases 手写脚本与 AI 生成的 Bases 一致为"产物模式"（另存 .base）；不做多文件勾选（沿用各 Action 确认窗的确认语义）；不做会话持久化。

## Capabilities

### New Capabilities

- `unified-workbench`: 统一工作台能力——三步向导（查询/确认/执行）、七种查询来源的统一执行（含手写脚本语法检查）、操作目录分发

### Modified Capabilities

（无——既有能力需求不变，工作台为编排层）

## Impact

- **新增**：`src/validation/query-lint.ts`（三语法 lint）、`src/modal/workbench-modal.ts`（三步向导）、`src/command/workbench-command.ts`
- **修改**：`main.ts`（命令 + ribbon）、styles.css（步骤指示与分组样式）
- **复用**：planner / compilers / executor / CaptureAction / 全部 Action 与 Choose*Modal
- **风险**：手写脚本质量参差（lint 前置 + 执行失败可回上一步）；DQL lint 依赖 Dataview（未装时降级为"无法检查，直接执行"提示）；来源间的状态混淆（步骤间状态显式保存与重置）
