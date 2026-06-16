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

## 2026-06-16 页面设计工厂方向修正

用户确认：F0-F9 的业务工厂思想必须保留，但 workflow/design/definition 的职责是“工艺说明书”，不是运行时执行器。页面设计工厂应把恢复的 `docs/ai/DATASET_PAGE_DESIGN_AI_FLOW_100_STEPS_ZH.md` 作为 pageDesign 业务内部工艺输入。

新的边界：

- `AgentWorkflowDefinition` 描述能力出厂工艺、工序、验收标准、交付约束和运行时绑定引用。
- `AgentWorkflowDefinition` 不直接执行 Host 激活、ToolLoop、`model_script` 或 DeliveryPort save/rollback。
- F0-F9 继续作为业务工厂检查维度：能力定义、原料绑定、知识绑定、工单契约、工位/工具规格、治理纪律、验收标准、注册交接、工单生产工艺、交付规则；但不作为流程图节点。
- 页面设计 100 步不是替代 F0-F9，而是 pageDesign workflow 的真实工艺流程来源；流程图应按 100 步归并后的 7 大步骤表达。
- 当前 `agent.workflow.20260615130850` 的 `design.json` / `definition.json` 只有简化注册值，需要升级为“页面设计工厂”：明确数据规划优先、四文件内存编辑、DataSet/DataTable/DataView、tableRelations、viewDependencies、rule/script/style 交叉校验等工艺。
- 运行时推进不是旧 loop 容器的职责；旧的 `start -> loop.business-factory -> end` 包装应删除。删除后根图本身就是工艺流程图，必须保留 `start -> 接单与盘点 -> 数据规划与最小表模型 -> 表关系建模 -> 页面规划与数据消费 -> 按需视图与依赖 -> 结构行为样式落地 -> 交叉校验与收尾 -> end` 的完整工艺关系。F0-F9 按需挂入每个 stage 的 `considerations.metrics`，用 `metricId/operator/target/unit` 数字化验收，而不是口号式全量套用。

本轮落地的最小闭环应避免重写运行时：

1. 恢复并保留 100 步文档，作为 pageDesign 工艺来源。
2. 扩展 `AgentWorkflowDefinition` 的可选 process/craft 类型，让 definition 能保存业务内部工艺阶段。
3. 更新 `createPageDesignAgentWorkflowDefinition()`，把页面设计 100 步归并为 7 个 process stages，保持 F0-F9 为按需量化检查维度。
4. 更新页面设计 workflow design/definition 数据，使 `/workflow-designs` 打开后看到的是 pageDesign 工艺流程图，而不是旧的“F0-F9 即执行步骤”。
5. 只运行类型检查和相关 workflow/pageDesign 测试，不触碰无关脏文件。

## 2026-06-16 流程图定型优先

用户进一步明确：先不考虑运行时，要通过多轮迭代把流程图定型，以免流程图一接运行时就大改。当前阶段的 definition/design 数据只承担静态工艺说明书职责。

落实边界：

- 根图是页面设计工艺编排，不是运行时编排。
- 节点是 100 步归并后的 7 大工艺阶段；F0-F9 是每个节点内的思考/检查维度。
- 编写流程图时必须同时读取 100 步文档和 `generated/dts-class-model/` 知识库：前者确定工艺步骤，后者确定模型能力、参数来源和可验证约束。
- 每个节点要能回答：前置条件有哪些、选什么模型、参数从哪里来、LLM 做什么、如何验证、什么条件结束。
- 当前 `F4 runtime`、`F7 activation`、`F9 delivery` 只保留流程图定型占位，不携带 Host 激活、ToolLoop 推进或保存/回滚策略。
