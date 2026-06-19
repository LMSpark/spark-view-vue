# WorkflowDesigns 旧设计稿启动失败研读记录

日期：2026-06-19

## 用户确认

用户选择方向 A：后端列表把旧/非法设计稿标记为 `unreadable`，前端自动跳过并禁用/拦截打开。

## 现象

应用启动链路本身完成，`WorkflowDesigns` 页面挂载后自动打开第一个设计稿时失败。

控制台请求：

`GET /api/tenants/lmspark/projects/homepage/workflow-designs/agent.workflow.20260615130850/design.json`

后端返回 400，错误信息为 `forbidden field: app`。

## 已确认的数据文件

- `spark-ai-server/data/workflow-designs/lmspark/homepage/agent.workflow.20260615130850/design.json`
- `spark-ai-server/data/workflow-designs/lmspark/homepage/agent.workflow.20260615130928/design.json`

两个设计稿均为旧结构：

- 顶层包含 `app`
- graph 节点里存在 `process-step` / `process-stage`
- 对应 `definition.json` 也仍保留旧 `process`

## 关键代码链路

前端：

- `src/views/app/WorkflowDesigns.vue`
  - `onMounted` 调用 `loadDesigns()`
  - 若列表非空且当前未打开设计稿，直接 `openDesign(designs[0].workflowId)`
  - `openDesign` 调用 `readWorkflowDesign`
- `src/services/workflow-designs.ts`
  - `listWorkflowDesigns` 调用 `GET .../__list`
  - `readWorkflowDesign` 调用 `GET .../{workflowId}/design.json`

后端：

- `spark-ai-server/src/main/java/com/spark/ai/controller/WorkflowDesignController.java`
  - scoped API 转发到 `WorkflowDesignService`
- `spark-ai-server/src/main/java/com/spark/ai/service/WorkflowDesignService.java`
  - `listDesigns` 读取目录和摘要
  - `addDesignSummary` 当前只处理 JSON 读取异常，不对 schema 做完整校验
  - `readDesign` 读取后调用 `validateDesignDocument`
  - `validateDesignDocument` 明确拒绝顶层 `app`、`factory`、`process`
  - `rejectLegacyNode` 明确拒绝 `single_model_edit`、`process-step`、`process-stage`

## 规范约束

`packages/spark-ai/docs/business-factory-workflow-zh-cn.md` 明确规定：

- `design.json` 禁止 `app`、`factory`、`process-stage`、`single_model_edit`、F0-F9
- 旧结构本轮不兼容、不迁移、不只读导入
- 旧结构应打开或校验失败

因此修复不应放行旧 schema，也不应做自动迁移。

## 影响面

直接影响：

- 后端设计稿列表摘要状态
- 前端列表展示、自动打开和手动打开 guard
- 前端挂载测试
- 后端 service 测试

不应影响：

- 新建设计稿 scaffold
- 保存当前新 schema 设计稿
- 发布 `definition.json`
- workflow 运行时语义

## 基线验证

修改前已运行：

- `pnpm run typecheck`：通过

历史验证中相关测试已通过：

- `tests/views/workflow-designs.test.ts`
- `tests/services/workflow-designs.test.ts`
- `spark-ai-server/src/test/java/com/spark/ai/service/WorkflowDesignServiceTest.java`
- `spark-ai-server/src/test/java/com/spark/ai/controller/WorkflowDesignControllerTest.java`
- `spark-ai-server/src/test/java/com/spark/ai/controller/WorkflowDesignApiIntegrationTest.java`

Java 测试需要 JDK 17 环境。
