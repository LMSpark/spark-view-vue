# 业务工厂改 Agent Workflow 研读记录

## 用户确认

用户已确认以下研读理解正确：本任务目标是先拿第一个真实业务能力做“业务工厂”迁移，把现有散落在 `ensureXxxBusiness()` 里的手写注册，从 `host.ensure(... create: () => ClassModelAgentAdapter.createRegistration(...))` 旧接入壳，逐步改成以 `AgentWorkflowDefinition + AgentWorkflowBindings + AgentWorkflowEngine` 为主入口的 agent workflow。`Host.ensure()` 后续应只是 engine 内部的 F7 激活步骤，而不是业务侧主 API。

## 已读文档

- `docs/ai/AI_CODE_CHANGE_PROTOCOL.md`
- `docs/ai/ai-code-generation-behavior.md`
- `docs/ai/AI_MODEL_SPEC.md`
- `docs/ai/spark-ai-workflow.md`
- `knowledge/README.md`
- `knowledge/class-model-system.md`
- `knowledge/monorepo-dependencies.md`
- `knowledge/page-design.md`
- `knowledge/testing.md`
- `knowledge/vue-frontend.md`
- `packages/spark-ai/ARCHITECTURE.md`
- `packages/spark-ai/src/agent/business/README.md`
- `packages/spark-ai/docs/business-factory-workflow-zh-cn.md`
- `docs/research/frontend-agent-integration.md`

## 现有代码事实

- `packages/spark-ai/src/agent/business/business-factory.ts` 目前只定义 `BusinessFactoryAcceptanceReport`、`BusinessFactoryWorkflowGraph` 和 F0-F9 DTO，并把 `host.dryRun()` 结果投影成首版工厂报告；它不调用 LLM、不执行工具、不保存或回滚业务产物。
- `packages/spark-ai/src/agent/business/ai-host.ts` 当前公开 `register`、`ensure`、`dryRun`、`inspectFactory`、`run` 等入口；没有 `registerWorkflow`、`executeWorkflow` 或 `AgentWorkflowEngine`。
- `AiAgentHost.ensure(alias, { moduleId, create })` 是当前激活门：检查 alias/moduleId 冲突，只在 alias 不存在时调用 `create()`，再委托 `register()` 写入 registry 和 alias 映射。文档已明确 `create` 概念上只是 registration provider，不是完整业务工厂。
- `packages/spark-ai/src/agent/business/class-model-agent-adapter.ts` 有两层 API：`createRegistration()` 组装 `AiAgentRegistration`；`register()` 只是 `createRegistration()` 后直接 `host.register()`。真实 app 业务目前用的是 `createRegistration()`。
- `src/services/page-design/page-design-business.ts` 里的 `ensurePageDesignBusiness()` 当前直接 `host.ensure(PAGE_DESIGN_MODULE_ID, { create: () => ClassModelAgentAdapter.createRegistration(...) })`，其中包括 `ProjectModel`、DTS manifest URL、Worker knowledge provider、inputContract、resolveInstance、beforeFunctionCall gate、executionToolNames、planWithoutToolMarkers、toolLoopNudge。
- `src/services/project-planning/project-planning-business.ts` 的 `ensureProjectPlanningBusiness()` 结构类似，额外配置 `agentCompleteMethodName: 'completeProjectPlanning'`，并有 projectPlanning 专属 tool gate、nudge 和输入归一化。
- `src/services/page-data-design/page-data-design-host-run-provider.ts` 不是独立业务注册；它是 `pageDataDesign` alias preset，归一化为 `pageDesign` 输入，并绑定只保存 `pagedata.json` 的上下文。
- `src/services/workflow-designs.ts` 和后端 workflow-design API 只处理编辑态 `agent.workflow.design` JSON，支持 Dify-like graph、loop、`single_model_edit` tool node 和草稿保存；它明确不执行 Agent workflow 运行时。
- `spark-ai-server/data/workflow-designs/lmspark/homepage/*/design.json` 已有业务工厂 F0-F9 编辑稿样例，但各阶段 `data.model.value` 大多为空，尚未发布为运行时 `AgentWorkflowDefinition`。

## 调用链

当前运行链：

1. APP 调用 `ensurePageDesignBusiness()` 或 `ensureProjectPlanningBusiness()`。
2. 业务函数调用 `host.ensure(alias, { moduleId, create })`。
3. `create()` 调 `ClassModelAgentAdapter.createRegistration()` 组装 `AiAgentRegistration`。
4. `AiAgentHost.ensure()` 内部调用 `register()` 写入 `AiAgentRegistry` 和 alias/moduleId 映射。
5. 外部调用 `host.run(alias, args, chat)`。
6. Host 按 alias 找 moduleId，调用 `runAiAgent()`。
7. `createAiAgentTask()` 执行 inputContract schema 校验、normalize、scope 和 orchestration 生成。
8. `AiAgentSession` 启动 session，`AiAgentToolLoopRunner` 调 `turnCallbacks.executeTurn()`。
9. `AiAgentToolCallExecutor` 先执行 request/registration 的 `beforeFunctionCall`，再调用 registration.runtime.executeTool。
10. `ClassModelAgentToolRuntime` 执行 `model_query` / guide / `model_script` / `agent_complete`。
11. Host Run provider 在成功后调用 APP 层 `AiDeliveryPort.save()`，失败时 `rollback()`，并把 delivery 回执写入 `resultExtras` 或 Error extras。

目标态应把第 1-4 步从业务函数手写注册，迁移为 workflow engine 解释 `AgentWorkflowDefinition + AgentWorkflowBindings` 后生成并激活 registration。

## 约束

- 修改代码前必须完成 7 阶段协议；本记录是阶段 1 用户确认后的持久化锚点。
- 任务复杂度预判为复杂：涉及 `packages/spark-ai` 公共 agent API、`src/services` 业务接入、现有测试和文档规则，且可能新增跨模块 runtime 结构。
- `packages/spark-ai` 不能引入 app 层、Vue、DeliveryPort 具体实现或 pageDesign/projectPlanning 业务材料。
- workflow definition 不应放函数、class、实例或闭包；不可序列化依赖必须放在 bindings/ref 里。
- 当前 `verify-rules` 仍引导 `src/services` 使用 `ClassModelAgentAdapter.createRegistration`；如果新增 workflow 入口，需要同步相关规则测试，否则会继续误导新接入方式。
- `pageDesign` / `projectPlanning` 的 delivery 仍在 APP Host Run provider 层；如果第一阶段做运行时 engine，需要明确 F9 是记录/补充检查，还是只通过 wrapper 保持现状。
- `pageDataDesign` 应继续作为 pageDesign preset，不应误做成独立 registration，除非后续需求明确。
- 修改生产代码前必须先跑 `pnpm run typecheck` 作为基线；当前工作树在 `main...origin/main [ahead 1]`，且已有未提交改动，需要进入实施前再次确认分支和工作树。

## 影响面

可能涉及：

- `packages/spark-ai/src/agent/business/ai-host.ts`
- `packages/spark-ai/src/agent/business/class-model-agent-adapter.ts`
- `packages/spark-ai/src/agent/business/business-factory.ts`
- 新的 `packages/spark-ai/src/agent/workflow/` 子域
- `packages/spark-ai/src/agent/index.ts`
- `src/services/ai/spark-ai-agent-bindings.ts`
- `src/services/page-design/page-design-business.ts`
- `src/services/project-planning/project-planning-business.ts`
- `tests/page/verify-rules.test.ts`
- `packages/spark-ai/src/tests/ai-agent-host-business-factory.test.ts`
- 可能新增 workflow engine / binding / activation 测试

暂不应触碰：

- `pageDataDesign` 独立 registration
- APP DeliveryPort 进入 `spark-ai` 内核
- workflow design 前端编辑器的 UI 行为
- 旧 `Host.run()` 和已有注册 API 的兼容行为
