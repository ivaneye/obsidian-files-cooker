## ADDED Requirements

### Requirement: 编辑器右键菜单集成
插件 MUST 在编辑器右键菜单中提供 File Cooker 分组入口，并仅在上下文满足条件时显示或允许执行对应操作。

#### Scenario: 选区存在时展示选区操作
- **WHEN** 用户打开编辑器右键菜单且当前存在非空选区
- **THEN** 菜单 MUST 展示选区相关的 File Cooker 操作（例如同步选区到 flomo、将选区添加到 Canvas）

#### Scenario: 无选区时不允许选区操作
- **WHEN** 用户打开编辑器右键菜单且当前无选区
- **THEN** 选区相关 File Cooker 操作 MUST 被隐藏或禁用，防止无效执行

### Requirement: 编辑器中的当前文件链接操作
插件 MUST 在编辑器右键菜单中提供“当前文件链接”分组操作，且其目标解析与命令面板中现有当前文件链接命令保持一致。

#### Scenario: 从编辑器菜单触发链接操作
- **WHEN** 用户在编辑器右键菜单中执行当前文件链接类操作
- **THEN** 插件 MUST 按现有 CurrentFileReader 规则解析活动文件中的链接目标并执行动作

#### Scenario: 无活动文件时安全阻断
- **WHEN** 当前编辑器不存在可用活动文件上下文
- **THEN** 插件 MUST 阻断当前文件链接类操作并给出安全提示

### Requirement: 文件右键菜单单文件操作
插件 MUST 在文件右键菜单中提供 File Cooker 单文件操作入口，并基于右键目标文件执行，而非依赖活动编辑器文件。

#### Scenario: 在文件右键菜单执行单文件动作
- **WHEN** 用户在文件右键菜单中触发 File Cooker 单文件操作
- **THEN** 插件 MUST 以被右键的目标文件作为唯一输入执行动作流程

#### Scenario: 非文件目标时阻断文件动作
- **WHEN** 用户在文件夹或不支持对象上触发仅适用于文件的 File Cooker 动作
- **THEN** 插件 MUST 阻断执行并给出可理解反馈

### Requirement: 菜单分组与安全性
插件 MUST 将 File Cooker 右键能力组织为分组子菜单，并对高风险操作保留确认机制。

#### Scenario: 用户查看右键菜单结构
- **WHEN** 用户打开编辑器或文件右键菜单
- **THEN** File Cooker 条目 MUST 以分组子菜单呈现，而非大量平铺在根菜单

#### Scenario: 用户触发高风险操作
- **WHEN** 用户从右键菜单触发删除等高风险 File Cooker 操作
- **THEN** 插件 MUST 复用现有确认弹窗，确认后才执行实际变更

### Requirement: 现有命令面板兼容性
插件 MUST 保留并维持现有 File Cooker 命令面板命令行为，不因右键菜单接入产生回归。

#### Scenario: 继续使用命令面板执行既有命令
- **WHEN** 用户通过命令面板执行任一现有 File Cooker 命令
- **THEN** 命令行为 MUST 与右键菜单接入前保持一致
