## Purpose

定义自然语言选择器能力：用户输入一句自然语言，系统将其编译为 DQL / 搜索语法 / Bases 三种查询语言（本地确定性编译），在提案页审核、编辑后选择执行器执行（只读），命中文件直接分发给既有批量 Action 管线。该能力复用 AI 服务配置（`ai-properties-completion` 建立的设置），全程只读，任何写入仍需用户在既有 Action 确认窗中确认。

## ADDED Requirements

### Requirement: 自然语言到 IR 的规划

系统 MUST 将用户输入的自然语言与库内上下文（标签词表、属性键、目录名、今天日期，均有上限）一并发送给 AI 服务，由模型返回结构化中间表示（IR）与一句人类可读解释。系统 MUST 校验响应：JSON 结构、IR 版本、节点类型白名单；非法响应 MUST 计为本次规划失败并给出可理解提示。发送内容 MUST 不包含任何笔记正文。

#### Scenario: 规划成功产出 IR

- **GIVEN** AI 配置完整且用户输入自然语言
- **WHEN** 规划完成
- **THEN** 系统 MUST 得到通过校验的 IR，并向用户展示人类可读解释

#### Scenario: 规划响应非法

- **GIVEN** AI 返回内容不合法（非法 JSON、未知节点、缺少版本）
- **WHEN** 系统校验响应
- **THEN** 系统 MUST 提示规划失败并停留在输入态，MUST NOT 执行任何查询

#### Scenario: 未配置 AI 时阻断

- **GIVEN** AI 配置不完整
- **WHEN** 用户触发自然语言选择器命令
- **THEN** 系统 MUST 给出提示并跳转到设置页，MUST NOT 发起网络请求

### Requirement: 三语法编译与能力检查

系统 MUST 在本地将 IR 确定性编译为 DQL、搜索语法、Bases YAML 三份查询文本（编译器为纯函数）。每个目标 MUST 输出不支持条件清单；DQL 目标在 Dataview 插件未安装或未启用时 MUST 不可用；搜索目标与 Bases 目标 MUST 恒可用。推荐执行器 MUST 是可用集合内不支持条件为空且优先级最高者（dql > search > bases）；无目标能完整表达时系统 MUST NOT 自动执行。

#### Scenario: 三份查询文本生成

- **GIVEN** 一份通过校验的 IR
- **WHEN** 系统执行编译
- **THEN** 三份查询文本 MUST 确定性生成，且相同 IR 输入产生相同输出

#### Scenario: 能力差异被标注

- **GIVEN** IR 包含某目标不支持的条件（如搜索语法不支持的日期比较）
- **WHEN** 该目标编译完成
- **THEN** 该目标 MUST 列出不支持的条件，且不支持条件 MUST 不参与该目标的执行语义

#### Scenario: Dataview 未安装时 DQL 不可用

- **GIVEN** Dataview 插件未安装或未启用
- **WHEN** 系统计算可用目标集合
- **THEN** 目标集合 MUST 不包含 DQL，界面 MUST 不显示 DQL 选项

#### Scenario: 无目标完整表达时不自动执行

- **GIVEN** IR 的所有可用目标均存在不支持条件
- **WHEN** 系统给出推荐
- **THEN** 系统 MUST NOT 自动执行，MUST 展示各目标支持度供用户编辑查询或切换目标

### Requirement: 提案页审核与编辑

提案页 MUST 展示：人类可读解释、可用目标的查询文本预览（tab 或等价切换）、推荐执行器标识、每个目标的不支持条件提示。用户 MUST 能直接编辑查询文本（以编辑后的文本执行）、复制任一查询文本、将 Bases 查询另存为 `.base` 文件并打开。Bases 目标在本阶段 MUST NOT 支持程序化执行，MUST 以文案说明用法。

#### Scenario: 编辑查询文本后执行

- **GIVEN** 提案页展示某目标的查询文本
- **WHEN** 用户修改文本后选择该目标执行
- **THEN** 系统 MUST 以编辑后的文本执行

#### Scenario: Bases 产物另存

- **GIVEN** Bases 目标的查询文本已生成
- **WHEN** 用户点击另存
- **THEN** 系统 MUST 在 vault 中创建合法的 `.base` 文件并打开它，文件内容 MUST 为 YAML 格式的筛选配置

#### Scenario: 复制查询文本

- **GIVEN** 任一目标的查询文本已生成
- **WHEN** 用户点击复制
- **THEN** 查询文本 MUST 被写入剪贴板并给出提示

### Requirement: 三通道执行与命中分发

执行 MUST 为只读操作：DQL 目标经既有 Dataview 查询读取路径执行；搜索目标 MUST 将查询注入搜索面板并等待结果稳定后读取；Bases 目标本阶段不执行。命中文件 MUST 以清单展示数量与路径，并提供分发到既有批量操作（至少包括编辑属性、移动、改名、删除）的入口；分发后 MUST 走既有确认窗与备份回滚通道。执行超时或查询出错 MUST 有可理解提示且不影响后续重试。

#### Scenario: DQL 执行命中文件

- **GIVEN** 用户选择 DQL 目标执行且 Dataview 可用
- **WHEN** 查询执行完成
- **THEN** 命中文件 MUST 以清单展示，且系统 MUST 提供至少一种批量操作分发入口

#### Scenario: 搜索注入与结果读取

- **GIVEN** 用户选择搜索目标执行
- **WHEN** 查询被注入搜索面板
- **THEN** 系统 MUST 等待结果稳定后读取命中文件；注入能力不可用时 MUST 降级为填入查询并指引用户手动回车

#### Scenario: 执行为只读

- **GIVEN** 用户在提案页执行任一查询
- **WHEN** 执行完成或失败
- **THEN** 系统 MUST NOT 修改任何笔记内容；所有写入仅发生在用户在结果清单上选择分发操作并在既有确认窗确认之后

#### Scenario: 全局上限护栏生效

- **GIVEN** 某目标命中的文件数超过设置中的批量上限
- **WHEN** 系统展示命中清单
- **THEN** 系统 MUST 按上限截断并明确提示截断行为
