# WorkflowDesigns 旧设计稿 unreadable 处理方案

## 任务目标

让 `WorkflowDesigns` 页面在存在旧结构设计稿时能正常进入，不自动触发 `400 forbidden field: app`，同时保持旧 schema 不兼容、不迁移的规则。

## 影响范围

- `spark-ai-server/src/main/java/com/spark/ai/service/WorkflowDesignService.java`
  - 在列表摘要读取阶段对 `design.json` 执行现有 schema 校验。
  - 对旧结构、非法 JSON、读文件失败统一标记 `status: unreadable`。
  - `error` 保留短错误消息，例如 `forbidden field: app`。

- `spark-ai-server/src/test/java/com/spark/ai/service/WorkflowDesignServiceTest.java`
  - 增加列表中旧结构设计稿被标记为 `unreadable` 的测试。
  - 保持 `readDesign` / `writeDesign` 对旧结构直接失败的现有语义。

- `src/views/app/WorkflowDesigns.vue`
  - 列表中 `unreadable` 项保留显示，但点击/键盘打开/“打开”按钮不发请求，直接提示错误。
  - 页面 mounted 后自动打开第一个可读设计稿，而不是盲目打开第一个列表项。
  - 如果全部都是 `unreadable`，主区域保留“选择或新建工作流”空态，并弹一次 warning。

- `tests/views/workflow-designs.test.ts`
  - 增加自动跳过 `unreadable` 项并打开第一个可读新稿的测试。
  - 增加手动点击 `unreadable` 项不调用 `readWorkflowDesign` 且提示错误的测试。
  - 增加全列表不可读时保持空态并 warning 的测试。

## 技术方案

1. 后端复用 `WorkflowDesignService` 已有的 `validateDesignDocument` / `rejectLegacyNode` 逻辑，在 `addDesignSummary` 读取 JSON 后执行完整校验。
2. `addDesignSummary` 对 `IOException` 与 `IllegalArgumentException` 统一写入：
   - `status = "unreadable"`
   - `error = <exception message>`
3. 后端保留旧稿摘要中的基础信息读取能力；校验失败时覆盖 `status` 为 `unreadable`，避免旧稿显示成 `saved`。
4. 前端增加本地判断：`item.status === 'unreadable'` 视为不可打开。
5. 前端 `openDesign` 入口先查找当前 summary；不可读时直接 `ElMessage.error("设计稿不可打开: <error>")` 并返回，不调用 `readWorkflowDesign`。
6. 前端 mounted 自动打开时只选择第一个可读 summary。
7. 当前列表有数据但没有可读 summary 时，保留空态并 `ElMessage.warning` 提示存在不可打开设计稿。
8. 测试覆盖后端摘要状态和前端三条关键交互路径。

## 兼容性

- 新建、保存、发布新 schema 设计稿不改变。
- 旧 `app` / `process-stage` / `single_model_edit` 结构仍然失败，不做兼容或迁移。
- 列表 API 响应会更准确：旧稿从原来的 `saved` 变为 `unreadable`，并带短错误消息。
- 前端会保留旧稿可见性和删除能力，但阻止打开请求，避免启动阶段产生 400。

## 验证计划

- 类型检查：`pnpm run typecheck`
- 前端定向测试：`pnpm exec vitest run tests/views/workflow-designs.test.ts`
- 后端定向测试：
  - 设置 JDK 17：
    - `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.16.8-hotspot`
  - 运行：
    - `mvn -pl spark-ai-server -Dtest=WorkflowDesignServiceTest test`
- 浏览器验证：
  - 启动本地服务。
  - 打开 `http://localhost:5273/t/lmspark/homepage/workflow-designs`。
  - 确认页面进入后没有自动请求旧设计稿 `design.json` 产生 400。
  - 确认旧稿列表仍可见，状态为 `unreadable`，点击打开只提示错误，不发打开请求。

## 风险项

- `listDesigns` 会对每个 `design.json` 多做一次 schema 校验；当前设计稿数量很少，风险可接受。
- 如果未来列表需要展示非常多设计稿，可能需要把摘要校验缓存化；本次不引入缓存，避免超范围。
- 前端测试需要适配自动打开策略变化；只改相关测试，不做批量重构。
