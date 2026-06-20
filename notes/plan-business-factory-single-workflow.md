状态：draft

## 任务目标

把业务工厂注册从"应用侧 `*Business.ts` 手写 definition + 自注册"纠偏成"运行时直接读设计器落盘的 workflow definition 驱动注册与运行"，definition 承载全部业务配置（含声明式 DSL 描述的运行时回调），`*Business.ts` 整体删除，编译通过，仓库自洽。

## 背景

- definition 真源是流程设计器，不是 TS 代码。当前 `src/services/**-business.ts` 里手写 `create*AgentWorkflowDefinition` 是过渡期补救，运行时（`activateAgentWorkflowDefinition`）只用 workflowId 路由 + 结构校验，graph 不被消费。
- registration 执行时真正用的 inputContract/systemPrompt/gates/nudge/knowledge/resolveInstance 全在 `*Business.ts` 里以 TS 代码存在，不在 definition graph 里。
- 用户定调：本轮运行时就接设计数据（"暂不考虑运行时"作废），完整闭环，不留断口，编译必须通过。

## 影响范围

### 删除
- `src/services/page-design/page-design-business.ts`（整体删除）
- `src/services/project-planning/project-planning-business.ts`（整体删除）
- `tests/services/agent-workflow-business.test.ts`（整体删除）

### 修改 — packages/spark-ai（definition schema + 解释器）
- `packages/spark-ai/src/agent/workflow/agent-workflow-definition.ts`
  - 扩展 `AgentWorkflowBusinessNodeData`，新增承载 registration 全部业务配置的字段：
    - `inputContract`：{ identityField, messageField, paramsSchema, readonlySteps[] }（可序列化）
    - `systemPrompt`：{ template, conditionalHints[] }（声明式模板 + 条件分支）
    - `knowledge`：{ rootClassName, workerUrlRef, manifestUrlRef }（声明式，运行时解析为 provider）
    - `toolLoopNudge`：{ templates: { reason: template }, contextFields[] }（声明式 nudge）
    - `resolveInstance`：{ editorSource, identityField }（声明式，解释器按 editorSource 路由到对应编辑器 getter）
    - `beforeFunctionCall`：{ gateRules[] }（声明式 gate 规则，解释器执行）
    - `executionToolNames`、`planWithoutToolMarkers`、`agentCompleteMethodName`（可直接序列化）
- `packages/spark-ai/src/agent/workflow/agent-workflow-validation.ts`
  - 校验新字段结构
- `packages/spark-ai/src/agent/workflow/agent-workflow-dry-run.ts`（或新建 `agent-workflow-runtime.ts`）
  - 新建 workflow runtime 解释器：从 definition 节点 data 读声明式描述，构造 `AiAgentRegistration`（含 resolveInstance/beforeFunctionCall/systemPrompt/nudge 的解释执行版本）
  - `activateAgentWorkflowDefinition` 改造成"读 definition → 解释 → host.ensure"
- `packages/spark-ai/src/agent/workflow/index.ts` + `packages/spark-ai/src/agent/index.ts`
  - 导出新解释器公共 API
- `packages/spark-ai/src/tests/agent-workflow-definition.test.ts`
  - 更新断言覆盖新字段
- `packages/spark-ai/src/tests/host-public-surface.test.ts`
  - 更新公共导出断言
- `packages/spark-ai/docs/business-factory-workflow-zh-cn.md`
  - 文档化新 schema 字段与声明式 DSL

### 修改 — 应用侧运行时（改成读设计数据驱动）
- `src/services/page-design/page-design-ai-runner.ts`
  - `runPageDesignAiSession` 内部从 `ensurePageDesignBusiness` 改成"读 definition + 走解释器注册 + host.run"
  - 业务逻辑（systemPrompt/gates/nudge/resolveInstance）不再以 TS 函数存在，由解释器从 definition 执行
- `src/services/project-planning/project-planning-ai-runner.ts`
  - 同上
- `src/services/page-design/page-design-host-run-provider.ts`
  - `preparePageDesignHostRun` 内部从 `ensurePageDesignBusiness` 改成读 definition 注册
- `src/services/project-planning/project-planning-host-run-provider.ts`
  - 同上
- `src/services/ai/spark-ai-agent-bindings.ts`
  - 调整 re-export（移除已删的 `ensure*Business` 相关，保留解释器入口）
- `src/views/app/dev-system/useDevState.ts`
  - `runPageDesignAi` / `runProjectPlanningDocumentImportAi` 调用点适配新签名（若签名变）

### 修改 — 测试
- `tests/services/page-design-ai-runner.test.ts`
  - 适配新注册路径（mock 读 definition + 解释器，而非 `ensurePageDesignBusiness`）
- `tests/services/project-planning-ai-runner.test.ts`
  - 同上
- `tests/services/page-design-host-run-provider.test.ts`
  - 适配
- `tests/services/project-planning-host-run-provider.test.ts`
  - 适配
- `tests/services/page-data-design-host-run-provider.test.ts`
  - 适配

### 新增 — mjs 脚本
- `tools/generate-workflow-design-data.mjs`（新建）
  - 生成 pageDesign / projectPlanning 两套落盘 design.json + definition.json
  - workflowId 改为 `agent.workflow.pageDesign` / `agent.workflow.projectPlanning`（与运行时路由对齐）
  - definition 用新 schema：三节点 graph + 全部业务配置字段（inputContract/systemPrompt/knowledge/nudge/resolveInstance/beforeFunctionCall）
  - 变量 schema 内联（不再 `$ref` 指向要删的 `page-design-business.ts`）
  - 删除 Dify 遗留字段（features/environment_variables/conversation_variables）

### 落盘 JSON（mjs 产物覆盖）
- `spark-ai-server/data/workflow-designs/lmspark/homepage/agent.workflow.pageDesign/{design,definition}.json`（新目录名对齐 workflowId）
- `spark-ai-server/data/workflow-designs/lmspark/homepage/agent.workflow.projectPlanning/{design,definition}.json`
- 旧目录 `agent.workflow.20260615130850/` / `agent.workflow.20260615130928/` 删除

## 技术方案

### 1. definition schema 扩展（packages/spark-ai）

`AgentWorkflowBusinessNodeData` 新增字段，全部为可序列化 JSON：

```typescript
export type AgentWorkflowNodeInputContract = Readonly<{
  identityField: string
  messageField: string
  paramsSchema: AgentWorkflowJsonRecord  // JSON Schema，内联不 $ref
  readonlySteps?: readonly string[]
}>

export type AgentWorkflowNodeSystemPrompt = Readonly<{
  template: string  // 含 {{var}} 占位
  conditionalHints?: ReadonlyArray<Readonly<{
    condition: string  // 声明式条件，如 "input.description contains 请假|leave"
    hint: string
  }>>
}>

export type AgentWorkflowNodeToolLoopNudge = Readonly<{
  templates: Readonly<Record<string, string>>  // reason -> template
  contextFields?: readonly string[]  // 如 ["pageId", "allowedOperations"]
}>

export type AgentWorkflowNodeResolveInstance = Readonly<{
  editorSource: 'pageDesign' | 'projectPlanning'  // 解释器据此路由编辑器 getter
  identityField: string
}>

export type AgentWorkflowNodeBeforeFunctionCall = Readonly<{
  gateRules: readonly AgentWorkflowJsonRecord[]  // 声明式 gate 规则
}>

export type AgentWorkflowNodeRuntimeBinding = Readonly<{
  inputContract: AgentWorkflowNodeInputContract
  systemPrompt: AgentWorkflowNodeSystemPrompt
  knowledge: AgentWorkflowJsonRecord  // { rootClassName, workerUrlRef, manifestUrlRef }
  toolLoopNudge?: AgentWorkflowNodeToolLoopNudge
  resolveInstance: AgentWorkflowNodeResolveInstance
  beforeFunctionCall?: AgentWorkflowNodeBeforeFunctionCall
  executionToolNames?: readonly string[]
  planWithoutToolMarkers?: readonly string[]
  agentCompleteMethodName?: string
}>
```

`AgentWorkflowBusinessNodeData` 增加 `runtimeBinding: AgentWorkflowNodeRuntimeBinding`。

### 2. workflow runtime 解释器（packages/spark-ai）

新建 `packages/spark-ai/src/agent/workflow/agent-workflow-runtime.ts`：

- `interpretAgentWorkflowDefinition(definition, options)`：遍历 graph 节点，对 `node` 类型读 `data.runtimeBinding`，构造 `AiAgentRegistration`：
  - `inputContract`：从声明式 schema 构造 `createSimpleInputContract`
  - `systemPrompt`：模板插值 + 条件 hint 求值（解释器实现 `{{var}}` 替换 + `contains` 条件）
  - `knowledge`：按 `workerUrlRef`/`manifestUrlRef` 构造 `createWorkerDtsClassModelKnowledgeProvider`
  - `resolveInstance`：按 `editorSource` 从 `options.editorGetters` 取对应 getter，按 `identityField` 取 moduleInstanceId
  - `beforeFunctionCall`：按 `gateRules` 声明式执行（pageDesign 的 `forbiddenScriptMarkers` / `allowedOperations` 规则、projectPlanning 的 `FORBIDDEN_SCRIPT_MARKERS` 规则声明式化）
  - `toolLoopNudge`：按 `templates` + `contextFields` 插值
- `activateAgentWorkflowFromDefinition({ host, definition, editorGetters })`：解释 → `host.ensure`
- 应用侧调用改为传 `editorGetters: { pageDesign, projectPlanning }`，不再传 `ensure*Business`

### 3. mjs 脚本生成落盘 JSON

`tools/generate-workflow-design-data.mjs`：
- 读 `*Business.ts` 当前业务配置（本轮仍可参考，脚本跑完即弃）
- 产出 4 个 JSON 文件，用新 schema
- workflowId = `agent.workflow.pageDesign` / `agent.workflow.projectPlanning`
- 删旧目录

### 4. 应用侧运行时改造

`*-ai-runner.ts` / `*-host-run-provider.ts`：
- 移除 `ensure*Business` 调用
- 改成 `readWorkflowDefinition(workflowId)` → `activateAgentWorkflowFromDefinition({ host, definition, editorGetters })` → `host.run(alias, input)`
- `editorGetters` 由 runner/provider 注入（pageDesign 的 `getPageDesignEditor`、projectPlanning 的 `getProjectPlanningEditor`）

### 5. 删除清单

- `*Business.ts` 两文件
- `tests/services/agent-workflow-business.test.ts`
- 旧落盘 JSON 目录两个

## 兼容性

- DevSystem pageDesign / projectPlanning AI 入口保留，调用方式可能微调签名
- 运行时执行链路（工具循环/ClassModelRuntime/agent_complete）不变，只是 registration 构造来源从 TS 代码变成 definition 解释
- 不修改 `pnpm-lock.yaml`，不引入新依赖
- workflowId 从时间戳改为语义 ID，设计器目录列表会变化（旧 ID 消失，新 ID 出现）

## 验证计划

- 开工基线：`pnpm run typecheck`（记录当前状态）
- 最小验证：
  - `pnpm --filter @spark-appworks/spark-ai run typecheck`
  - `pnpm --filter @spark-appworks/spark-ai run test`（agent-workflow-definition.test / host-public-surface.test）
  - `node tools/generate-workflow-design-data.mjs` + `pnpm run verify:workflow-designs`
- 定向测试：
  - `pnpm exec vitest run tests/services/page-design-ai-runner.test.ts tests/services/project-planning-ai-runner.test.ts tests/services/page-design-host-run-provider.test.ts tests/services/project-planning-host-run-provider.test.ts tests/services/page-data-design-host-run-provider.test.ts`
- 收口验证：
  - `pnpm run typecheck`
  - `pnpm run verify:rules`

## 风险项

- **DSL 解释器工作量**：resolveInstance/beforeFunctionCall/systemPrompt/nudge 的声明式 DSL + 解释器是本轮最大工作量，且要覆盖现有 `*Business.ts` 里所有条件分支（如 pageDesign 的请假页 hint、dataset-only mode、mode/allowedOperations 分支）。若 DSL 表达力不足，可能需要多轮迭代。
- **gate 规则声明式化**：当前 `evaluatePageDesignMutationToolGate` / `evaluateProjectPlanningToolGate` 逻辑较复杂（读 planningProjection、allowedOperations、script marker 匹配），声明式化可能丢失部分运行时上下文。若无法完全声明式化，需评估是否保留少量应用侧钩子。
- **落盘 JSON 体积**：全部业务配置进 definition 后，单个 definition.json 可能较大（systemPrompt 模板、paramsSchema、nudge 模板全内联）。需确认后端读写无体积限制。
- **`verify:rules` 阻断**：可能受既有 arch/class-model 问题阻断；若发生，记录阻断项并用定向命令证明本次改动面通过。
- **跨包改动面大**：动 `packages/spark-ai` 的 definition schema 是公共契约，会影响所有消费方。需确认 `agent-workflow-definition.test.ts` / `host-public-surface.test.ts` 同步更新。
- **前序计划状态**：`notes/plan-agent-workflow-contract-correction.md` 还在 `implementing`，本计划与其范围部分重叠（落盘 JSON 迁移），需将其标为 `superseded`。

## 待用户审核确认的点

1. DSL 解释器放 `packages/spark-ai` 是否接受（跨包公共能力）
2. workflowId 从时间戳改为语义 ID 是否接受
3. gate 规则若无法完全声明式化，是否接受保留少量应用侧钩子（违反"全部进 definition"的纯粹性）
