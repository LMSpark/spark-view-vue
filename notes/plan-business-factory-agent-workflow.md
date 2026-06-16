# 业务工厂改 Agent Workflow 方案计划书

## 1. 本阶段目标

把“业务工厂”先定性为可序列化的 `AgentWorkflowDefinition`，并验证从编辑态 `design.json` 到发布态 `definition.json`，再到现有 Host `dryRun()` 的数据链路是否成立。

本阶段不做完整 LLM/tool 执行引擎，不执行 F9 save/rollback 交付，只把 F9 表达为 definition 中的 delivery plan。`Host.ensure()` 仍会被使用，但只能作为 workflow 激活链路里的内部步骤，而不再作为业务侧主入口。

## 2. 已确认的用户选择

- 第一个业务范围：同时覆盖 `pageDesign` 与 `projectPlanning`，但走最小闭环。
- 入口方向：旧手写注册入口不再作为主入口，目标是 `AgentWorkflowDefinition + bindings + workflow activation/dryRun`。
- 当前推进节奏：先把 `AgentWorkflowDefinition` 定性，评估数据链路是否正确，一步一个脚印。
- definition 粒度：类型结构 + dryRun 数据链；definition 定位现有 registration provider 并跑 `host.dryRun()`。
- 文件归属：公共类型放 `packages/spark-ai`，definition 来自 workflow design 数据发布。
- 发布方式：从 `design.json` 生成 `definition.json`，保存在同一 workflow 目录。
- 发布执行者：前端读取当前 `design.json`，生成 definition，再调用保存接口。
- 接口形态：新增 `POST .../__publish`，后端负责校验并写入 `definition.json`。
- 验证门禁：`pnpm run typecheck`、`pnpm run lint`、`pnpm run verify:rules`、`pnpm run test:run`，加 Java 后端测试。

## 3. 核心设计

### 3.1 AgentWorkflowDefinition

新增 `packages/spark-ai/src/agent/workflow/` 子域，只放无 APP 依赖、可 JSON 序列化的定义类型和轻量校验/投影函数。

建议文件：

- `packages/spark-ai/src/agent/workflow/agent-workflow-definition.ts`
- `packages/spark-ai/src/agent/workflow/agent-workflow-validation.ts`
- `packages/spark-ai/src/agent/workflow/agent-workflow-dry-run.ts`
- `packages/spark-ai/src/agent/workflow/index.ts`
- `packages/spark-ai/src/agent/index.ts`

类型约束：

- 使用 `type` alias，不新增非 allowlist `interface`。
- definition 内不放函数、class、实例、Worker、editor、delivery port 等不可序列化对象。
- definition 只记录 identity、materials、knowledge、contract、runtime、governance、acceptance、activation、workOrder、delivery 的结构化配置。
- 不把模型 class metadata 复制成第二真源；LLM 知识真源仍是业务 class / DTS ClassModel，definition 只记录 workflow 接线与 binding key。

建议顶层结构：

```ts
type AgentWorkflowDefinition = Readonly<{
  kind: 'agent.workflow'
  version: 1
  workflowId: string
  source: {
    designKind: 'agent.workflow.design'
    designId: string
    designVersion: number
  }
  factory: {
    identity: AgentWorkflowFactorySection<'F0', 'identity'>
    materials: AgentWorkflowFactorySection<'F1', 'materials'>
    knowledge: AgentWorkflowFactorySection<'F2', 'knowledge'>
    contract: AgentWorkflowFactorySection<'F3', 'contract'>
    runtime: AgentWorkflowFactorySection<'F4', 'runtime'>
    governance: AgentWorkflowFactorySection<'F5', 'governance'>
    acceptance: AgentWorkflowFactorySection<'F6', 'acceptance'>
    activation: AgentWorkflowFactorySection<'F7', 'activation'>
    workOrder: AgentWorkflowFactorySection<'F8', 'workOrder'>
    delivery: AgentWorkflowFactorySection<'F9', 'delivery'>
  }
  x_spark: {
    schema: 'spark.agent.workflow.definition.v1'
    publishedAt: string
    validation: AgentWorkflowDefinitionValidation
  }
}>
```

实际编码时可根据现有 `BusinessFactoryWorkflowPhaseKind` 复用或抽出 phase 常量，避免重复定义 F0-F9 映射。

### 3.2 design.json -> definition.json 发布

在 `src/services/workflow-designs.ts` 增加纯函数：

- `createAgentWorkflowDefinitionFromDesign(document, options)`
- `validateAgentWorkflowDefinition(definition)`
- `publishWorkflowDefinition(workflowId, definition)`

转换规则：

- 只采集 `single_model_edit` tool 节点。
- 用 `data.x_spark.publishPath` 识别目标路径，例如 `workflow.factory.identity`。
- 用 `data.x_spark.phaseId` 识别 F0-F9。
- 用 `data.model.value` 作为该 section 的 value。
- 保留 `nodeId`、`scopePath`、`sectionPath`、`publishPath`，方便回查设计稿来源。
- 当前样例中很多 `model.value` 为空对象，本阶段允许空对象通过结构发布，但在 `x_spark.validation.issues` 中记录 `empty_section_value` warning；缺失 F0-F9 节点或 publishPath 冲突应阻断发布。

新增 API：

- 前端：`POST ${getWorkflowDesignApi()}/${workflowId}/__publish`
- 请求体：发布后的 `AgentWorkflowDefinition`
- 后端写入：`spark-ai-server/data/workflow-designs/{tenantId}/{projectId}/{workflowId}/definition.json`

### 3.3 后端写 definition.json

修改：

- `spark-ai-server/src/main/java/com/spark/ai/service/WorkflowDesignService.java`
- `spark-ai-server/src/main/java/com/spark/ai/controller/WorkflowDesignController.java`

新增行为：

- `DEFINITION_FILENAME = "definition.json"`
- `publishDefinition(tenantId, projectId, workflowId, JsonNode definition)`
- 校验 `workflowId`、project guard、`design.json` 必须存在。
- 校验 definition：对象、`kind = agent.workflow`、`version = 1`、`workflowId` 与路径一致、`source.designId` 与路径一致、`factory` 中 F0-F9 section 存在。
- 写入 `definition.json` 后返回 `{ ok, workflowId, filename, timestamp }`。
- scoped route 和 flat header route 都补齐 `__publish`。

### 3.4 Workflow dryRun 数据链

新增一个“只跑验收链”的 activation/dryRun 辅助，不做完整 runtime engine：

- `AgentWorkflowBindings`：运行时不可序列化依赖的容器，按 binding key 提供 registration provider。
- `dryRunAgentWorkflowDefinition(options)`：读取 definition 的 F7 activation / binding key，调用现有 provider 生成 registration，内部走 `host.ensure()`，然后调用 `host.dryRun(alias, sampleInput)`。
- `createBusinessFactoryAcceptanceReport()` 可继续用于把 dryRun 投影成 F0-F9 验收报告。

APP 层新增或调整：

- 为 `pageDesign` 和 `projectPlanning` 各抽出 registration provider 工厂，保留现有 `ClassModelAgentAdapter.createRegistration(...)` 的业务细节。
- `ensurePageDesignBusiness()` / `ensureProjectPlanningBusiness()` 不再直接作为主入口；运行侧改为通过 workflow activation helper 进入。
- 因 `pageDataDesign` 是 `pageDesign` preset，本阶段不做独立 workflow definition，只跟随 `pageDesign`。

破坏性迁移处理：

- 不保留新的手写注册主路径。
- 允许保留同名兼容函数一小段时间，但内部必须委托 workflow activation helper；这样既满足调用点迁移，又避免一次性破坏 host-run provider 测试。
- 若实施时发现必须删除导出函数，会同步更新所有调用点与测试 mock。

## 4. 影响文件

公共包：

- `packages/spark-ai/src/agent/business/business-factory.ts`
- `packages/spark-ai/src/agent/workflow/*`
- `packages/spark-ai/src/agent/index.ts`
- `packages/spark-ai/src/tests/*agent-workflow*.test.ts`
- `packages/spark-ai/src/tests/ai-agent-host-business-factory.test.ts`

前端服务与页面：

- `src/services/workflow-designs.ts`
- `src/views/app/WorkflowDesigns.vue`
- `src/services/page-design/page-design-business.ts`
- `src/services/project-planning/project-planning-business.ts`
- 可能新增 `src/services/ai/agent-workflow-bindings.ts`
- `src/services/page-design/page-design-ai-runner.ts`
- `src/services/page-design/page-design-host-run-provider.ts`
- `src/services/project-planning/project-planning-ai-runner.ts`
- `src/services/project-planning/project-planning-host-run-provider.ts`

后端：

- `spark-ai-server/src/main/java/com/spark/ai/service/WorkflowDesignService.java`
- `spark-ai-server/src/main/java/com/spark/ai/controller/WorkflowDesignController.java`

测试与规则：

- `tests/services/workflow-designs.test.ts`
- `tests/views/workflow-designs.test.ts`
- `tests/services/page-design-host-run-provider.test.ts`
- `tests/services/project-planning-host-run-provider.test.ts`
- `tests/page/verify-rules.test.ts`
- `spark-ai-server/src/test/java/com/spark/ai/service/WorkflowDesignServiceTest.java`
- `spark-ai-server/src/test/java/com/spark/ai/controller/WorkflowDesignControllerTest.java`
- `spark-ai-server/src/test/java/com/spark/ai/integration/WorkflowDesignApiIntegrationTest.java`

## 5. 实施步骤

1. 实施前门禁
   - 确认不在 `main` 上直接改生产代码，或由用户明确授权创建/切换 feature 分支。
   - 先跑 `pnpm run typecheck` 作为修改前基线。

2. 公共 definition 类型
   - 新增 `AgentWorkflowDefinition` 类型、F0-F9 section 类型、validation issue 类型。
   - 导出 workflow 子域。
   - 增加最小单测：合法 definition 通过，缺 phase / workflowId mismatch 失败。

3. 前端发布转换
   - 在 `workflow-designs.ts` 增加 `createAgentWorkflowDefinitionFromDesign()`。
   - 增加 `publishWorkflowDefinition()` 调 `POST __publish`。
   - 覆盖 F0-F9 映射、空 value warning、缺节点阻断、publishPath 冲突阻断。

4. 后端 publish API
   - Service 增加 `definition.json` 写入与校验。
   - Controller 增加 scoped/flat 两套 `__publish` route。
   - Java 单测覆盖写入、非法 kind、workflowId mismatch、缺 design。

5. 设计器 UI 接线
   - 顶部新增独立“发布”按钮，不复用“保存”按钮语义。
   - 发布前先应用当前右侧编辑器 draft；若设计稿 dirty，先提示保存或自动保存后发布，实施时按现有 UI 风格选最小方案。
   - 发布成功提示 `definition.json` 已写入。

6. Workflow dryRun 链路
   - 增加 `AgentWorkflowBindings` 和 dryRun helper。
   - 抽出 `pageDesign` / `projectPlanning` registration provider，workflow helper 内部调用。
   - 更新 host-run provider / runner 调用点，使主路径进入 workflow activation helper。
   - 更新 verify-rules 中“src/services 应使用 ClassModelAgentAdapter.createRegistration”的旧提示，改为允许 workflow binding provider。

7. 验证
   - 前端/TS：跑目标测试，再跑全量门禁。
   - 后端：跑 workflow design 相关 Java 测试，必要时跑 `mvn test`。

## 6. 验证命令

实施前：

```bash
pnpm run typecheck
```

实施后：

```bash
pnpm run typecheck
pnpm run lint
pnpm run verify:rules
pnpm run test:run
```

后端：

```bash
cd spark-ai-server
mvn test
```

必要的定向测试：

```bash
pnpm exec vitest run tests/services/workflow-designs.test.ts tests/views/workflow-designs.test.ts
pnpm exec vitest run tests/services/page-design-host-run-provider.test.ts tests/services/project-planning-host-run-provider.test.ts
pnpm exec vitest run packages/spark-ai/src/tests/ai-agent-host-business-factory.test.ts
```

## 7. 风险与处理

- 当前分支是 `main` 且已有脏工作树：实施前必须处理分支门禁，避免违反仓库规则。
- `design.json` 样例大量空 section：本阶段结构允许发布，但以 warning 记录；否则会阻断当前数据链验证。
- Q3 的“删除旧入口”与本阶段“先定性 definition”存在节奏冲突：本计划按“主路径切 workflow，必要兼容函数内部委托”执行，避免在 dryRun 链验证前盲删所有调用点。
- `verify-rules` 目前仍引导旧注册方式：实施时必须同步更新，否则规则会和新架构冲突。
- 不引入新依赖，不修改 `pnpm-lock.yaml`。

## 8. 不做事项

- 不把 APP delivery/save/rollback 端口下沉到 `packages/spark-ai`。
- 不让 `pageDataDesign` 成为独立 registration。
- 不执行完整 Agent workflow runtime、LLM tool loop 或 F9 落盘交付。
- 不重构 workflow design 编辑器布局和非发布相关 UI。
- 不批量格式化或顺手清理无关文件。
