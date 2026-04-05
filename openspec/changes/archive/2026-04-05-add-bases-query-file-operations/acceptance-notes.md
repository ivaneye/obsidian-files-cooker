## 变更说明与验收记录

### 已覆盖场景

- Bases 查询结果可作为文件批处理输入源：新增 `BasesCommand` 与 `BasesReader`，并接入 `main.ts`。
- 仅文件操作边界：`BasesReader` 仅将可映射到 vault 文件的项转换为 `ActionModel.file`，不写入 row 字段。
- 不可映射结果处理：统计并提示 `ignoredCount`，在全不可映射时提示 `No Files Found!` 并阻断动作。
- 危险操作确认链路：删除命令通过现有 `DeleteAction -> DeleteConfirmModal` 流程，测试覆盖“触发确认而非直接删除”。
- 回归保障：新增 Dataview/Search 回归测试，现有 CurrentFile 与 modal 测试保持通过。

### 自动化验证结果

- 测试命令：`npm test`
- 结果：`6 passed (6)`, `24 passed (24)`

### 未覆盖风险

- Bases 插件在不同版本中的 API 命名和返回结构可能继续演化，目前通过多入口（plugin api + view context）兼容但仍有未知变体风险。
- 当前 `task` 模式为文件映射后生成 checklist；若 Bases 任务语义与 Dataview TASK 存在差异，可能需要后续细化。

### 后续演进建议

- 与 Bases 官方 API 对齐后，可收敛当前多候选入口逻辑，减少分支复杂度。
- 为 `resolveBasesRows` 增补更多结构 fixture 测试（例如嵌套对象、分页结果）。
- 如用户需要，可在命令说明中补充“忽略数量 + 示例路径”以增强可解释性（仍不改写 row）。
