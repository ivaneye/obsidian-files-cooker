## ADDED Requirements

### Requirement: Bases 查询结果可作为文件批处理输入源
系统 MUST 支持在 Bases 查询结果上下文中触发 File Cooker 批处理流程，并将可映射到 Vault 文件的结果作为输入。

#### Scenario: 在 Bases 结果上下文触发命令
- **GIVEN** 用户当前处于 Bases 查询结果可访问的上下文
- **WHEN** 用户执行任一 File Cooker Bases 命令
- **THEN** 系统 MUST 从 Bases 查询结果中收集目标并进入统一批处理流程

#### Scenario: Bases 无可用结果时阻断执行
- **GIVEN** 用户触发 Bases 命令但当前无可用查询结果
- **WHEN** 系统尝试读取 Bases 数据源
- **THEN** 系统 MUST 阻断后续动作执行并给出可理解提示

### Requirement: 仅处理可映射文件，不处理 row 字段写入
系统 MUST 仅对可映射到 Vault 文件路径的结果执行操作，MUST NOT 对 Bases row 本体字段进行新增、修改或删除。

#### Scenario: 结果项可映射到文件
- **GIVEN** Bases 结果项包含可解析且存在于 Vault 的文件路径
- **WHEN** 系统构建批处理目标
- **THEN** 系统 MUST 将该文件纳入 Action 输入集合

#### Scenario: 用户期望 row 字段被修改
- **GIVEN** 用户触发 Bases 文件批处理命令
- **WHEN** 命令执行完成
- **THEN** 系统 MUST 仅变更对应文件，不对 Bases row 字段执行写入

### Requirement: 不可映射项忽略并提示数量
当 Bases 查询结果包含不可映射为文件的项时，系统 MUST 忽略这些项并向用户提示被忽略数量，同时继续处理其余可映射文件。

#### Scenario: 混合结果集（可映射 + 不可映射）
- **GIVEN** Bases 查询结果同时包含可映射文件项与不可映射项
- **WHEN** 用户执行批处理命令
- **THEN** 系统 MUST 仅处理可映射文件并提示忽略数量

#### Scenario: 全部结果不可映射
- **GIVEN** Bases 查询结果全部不可映射为文件
- **WHEN** 用户执行批处理命令
- **THEN** 系统 MUST 不执行文件动作并提示忽略数量与无可处理文件

### Requirement: Bases 命令集与 Dataview 文件命令范围一致
系统 MUST 为 Bases 结果提供完整命令集，覆盖移动、同步 flomo、合并、删除、复制链接、属性编辑、重命名、添加到 Canvas、任务添加到 Canvas，并保持一致命名风格。

#### Scenario: 用户查看 Bases 可用命令
- **GIVEN** Bases 数据源可用
- **WHEN** 用户打开命令面板并检索 File Cooker Bases 命令
- **THEN** 系统 MUST 提供与 Dataview 文件处理范围一致的命令集合

#### Scenario: 数据源不可用时命令可用性受控
- **GIVEN** Bases 数据源不可用
- **WHEN** 用户尝试执行 Bases 相关命令
- **THEN** 系统 MUST 以与现有来源一致的方式阻断执行或不可用

### Requirement: 复用既有批处理确认与安全机制
系统 MUST 在 Bases 场景复用现有确认弹窗、摘要信息与危险操作安全机制，确保批量变更前有明确确认步骤。

#### Scenario: 触发删除等高风险操作
- **GIVEN** 用户在 Bases 场景触发删除等高风险命令
- **WHEN** 命令进入执行前阶段
- **THEN** 系统 MUST 展示既有确认弹窗并在确认后才执行实际变更

#### Scenario: 用户取消确认
- **GIVEN** 用户已打开确认弹窗
- **WHEN** 用户选择取消
- **THEN** 系统 MUST 终止执行且不产生文件变更

### Requirement: 既有来源能力无回归
引入 Bases 查询结果支持后，系统 MUST 保持 Dataview、搜索结果、当前文件等既有来源的命令行为一致且可用。

#### Scenario: 用户继续执行 Dataview 命令
- **GIVEN** 插件已包含 Bases 能力
- **WHEN** 用户执行现有 Dataview 文件处理命令
- **THEN** 系统 MUST 保持与变更前一致的行为与结果

#### Scenario: 用户继续执行搜索结果命令
- **GIVEN** 插件已包含 Bases 能力
- **WHEN** 用户执行现有搜索结果文件处理命令
- **THEN** 系统 MUST 保持与变更前一致的行为与结果
