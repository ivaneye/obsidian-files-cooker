## 1. AI 设置分区（地基一）

- [x] 1.1 新增 `src/ai/ai-settings.ts`：`AiSettings` 接口与 `DEFAULT_AI_SETTINGS`（enabled 默认 false、baseUrl/model/apiKey 空串、batchSize 5、concurrency 3、contextChars 1500、inferTags/inferAliases true、customProps 空串、tagLanguage 'auto'），并导出供 main.ts 合并的默认值段；含字段职责注释
- [x] 1.2 [TDD-红] 新增 `tests/ai/ai-settings.test.ts`：验证深合并（旧 settings.json 无 `ai` 段时取默认值、部分字段时缺省补齐且不丢子字段）、enabled 默认 false；测试含目的/内容/预期注释
- [x] 1.3 [TDD-绿] 实现设置合并辅助（复用 `src/backup/backup-settings.ts` 的 `deepMerge` 模式），使 1.2 通过
- [x] 1.4 实现 `renderAiSettings(containerEl, plugin)` 设置分区渲染：总开关、baseUrl、model、apiKey（保存时优先 `saveSecret`，回退明文并标注风险提示）、批量/截断数值项、推断项开关、customProps、tagLanguage 下拉；含渲染职责注释
- [x] 1.5 main.ts 设置 Tab 调用 `renderAiSettings`，`DEFAULT_SETTINGS` 合并 `ai` 段；`npm run build` 验证通过

## 2. AI Provider 客户端（地基二）

- [x] 2.1 [TDD-红] 新增 `tests/ai/ai-provider.test.ts`（注入 fake fetch）：非 2xx 抛 Error 且含 HTTP status 与 body 摘要；请求携带 `Authorization: Bearer`、`response_format: json_object`、`temperature: 0.2`；baseUrl 尾斜杠正确拼接；测试含目的/内容/预期注释
- [x] 2.2 [TDD-绿] 新增 `src/ai/ai-provider.ts`：`ChatMessage` 类型 + `chatJson(messages)` 实现（node-fetch v2，`response.ok` 检查 + 错误抛出模式对齐 flomo 同步）；含模块职责注释
- [x] 2.3 [TDD-重构] 抽取请求头/URL 拼接为可测小函数，消除用例间重复

## 3. 分批并发调度器（地基三）

- [x] 3.1 [TDD-红] 新增 `tests/ai/batch.test.ts`：空集返回 `{ok:[],failed:[]}`；余数批正确分片；并发不超上限（用计数器断言峰值）；单批失败计入 failed 不中断整体；失败批重试一次后成功进入 ok；测试含目的/内容/预期注释
- [x] 3.2 [TDD-绿] 新增 `src/ai/batch.ts`：`runBatches(items, batchSize, concurrency, worker)` 返回 `{ok, failed}`，失败批指数退避重试一次；含调度语义注释
- [x] 3.3 [TDD-重构] 审视命名与分片边界逻辑，确保 P2/P3 复用时无需改动内部结构

## 4. 推断逻辑（prompt 契约与校验）

- [x] 4.1 [TDD-红] 新增 `tests/ai/prop-infer.test.ts`：合法 JSON 响应解析出提案列表；非法 JSON 抛出可识别错误；path 无法回配的条目丢弃；tags 规范化（转小写/去 `#`/去空白/去重）；aliases 去空串；提案与现有值相同则跳过；词表构建（去 `#`、上限 200）；测试含目的/内容/预期注释
- [x] 4.2 [TDD-绿] 新增 `src/ai/prop-infer.ts`：system/user prompt 构建（含 tagLanguage 指令、词表注入、逐文件上下文字段）、响应解析校验、值规范化、相同值跳过；导出 `buildInferPrompts` / `parseInferResponse` / `normalizeTags` 等纯函数；含契约与校验规则注释
- [x] 4.3 [TDD-重构] 用真实感样例（中英混合标题、含 `#` 的模型输出）补充边界用例

## 5. AiPropertiesAction 与弹窗（交互与应用）

- [x] 5.1 [TDD-红] 新增 `tests/ai/ai-properties-modal.test.ts`（沿 `tests/mocks/vault-mock.ts` 风格）：默认全选；取消勾选后 Apply 集合仅含勾选行；编辑提案值后按新值应用；全部取消勾选时 Apply 零写入；多值属性追加合入去重；标量属性存在且 Override 关闭时跳过；测试含目的/内容/预期注释
- [x] 5.2 [TDD-绿] 新增 `src/modal/ai-properties-modal.ts`：进度态（`Analyzing files ... n/N` + 可取消）与提案态（行级勾选、提案值可编辑、发送范围明示、Apply/Cancel）双状态渲染，复用 `modal-ui.ts` 布局助手；含状态机与渲染职责注释
- [x] 5.3 [TDD-绿] 新增 `src/action/ai-properties-action.ts`（implements Action）：AI 配置检查（未配置 Notice 阻断）→ 打开弹窗 → 应用分支走备份通道（`getBackup().begin('ai-properties', ...)` / 逐文件 snapshot / `finish` / `abort`）→ 逐文件 `processFrontMatter` 写入 → Notice 汇报成功/跳过/失败（失败列路径）；含 Action 职责与备份集成注释
- [x] 5.4 [TDD-重构] 弹窗渲染中与 EditPropertiesModal 重复的多值合入逻辑评估下沉为共享工具（仅在无行为风险时执行，否则说明保留原因）

## 6. 命令与入口挂接

- [x] 6.1 五个来源命令类（clipboard / current-file / search / dataview / bases）各新增 `registAiCompleteProps()`：命令 id `ai-complete-properties-in-<source>`，复用该来源既有 Reader 产出 `ActionModel[]` 后交给 `AiPropertiesAction`；含命令注册注释
- [x] 6.2 `context-menu-command.ts` 文件管理器右键新增 `File Cooker > AI complete properties` 单文件入口；含菜单项注释
- [ ] 6.3 手工验收清单执行：未配置阻断、五来源 + 右键全链路、取消零写入、备份历史可回滚、移动端冒烟；记录结果

## 7. 验收与收尾

- [x] 7.1 对照 specs 全量自查：每个 Scenario 映射到自动化测试或手工验收记录，无遗漏
- [x] 7.2 `npm test` 全绿；`npm run build` 通过
- [x] 7.3 README（中英）新增 "🤖 AI（实验性）" 简短章节：功能说明、默认关闭、配置入口、隐私说明；设置项表格补充 AI 分区
- [x] 7.4 更新 `AGENTS.md` 如有新命令/测试约定变化（如无变化则说明跳过原因）
