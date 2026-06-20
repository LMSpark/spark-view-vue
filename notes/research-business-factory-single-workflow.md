# 补齐 agent-workflow 声明式 DSL 纠偏 — 研读锚点

> 研读锚点。基于 2026-06-21 全仓代码研读，针对提交 `a2d6cb83e` 之后的"解释器骨架 + 应用侧回调注入"现状，梳理"补齐声明式 DSL，按计划纯粹化"纠偏任务的三块未声明式化业务逻辑、解释器可复用样板、落盘 JSON 真实字段和跨包影响面。涉及产品事实时以对应源码、模型 class、JSDoc 和产品层文档为准。

## 1. 当前实现架构（文字版调用链）

发布态 definition（落盘 JSON）→ 运行时解释器（`spark-ai`）→ 应用侧回调注入（`agent-workflow-bindings.ts`）→ 真实业务函数（`*-agent-workflow-binding.ts`）。三块业务逻辑（systemPrompt / gate / knowledge）均未声明式化，解释器只透传声明 + 调用应用侧回调。

### 1.1 启动调用链（以 pageDesign 为例）

1. `runPageDesignAiSession` (`src/services/page-design/page-design-ai-runner.ts:105`) → `activatePageDesignAgentWorkflow({ host, getPageDesignEditor })` (`src/services/ai/agent-workflow-bindings.ts:75`)
2. `activatePageDesignAgentWorkflow` (`agent-workflow-bindings.ts:75`) → `readRequiredAgentWorkflowDefinition('agent.workflow.pageDesign')` (`agent-workflow-bindings.ts:244`，走 HTTP `readWorkflowDefinition`) → `activateAgentWorkflowFromDefinition({ host, definition, bindings })` (`packages/spark-ai/src/agent/workflow/agent-workflow-runtime.ts:152`)
3. `activateAgentWorkflowFromDefinition` (`agent-workflow-runtime.ts:152`) → `interpretAgentWorkflowDefinition` (`agent-workflow-runtime.ts:82`) → `host.ensure(alias, { moduleId, create })` (`agent-workflow-runtime.ts:156`)
4. `interpretAgentWorkflowDefinition` (`agent-workflow-runtime.ts:82`)：
   - `findSingleBusinessNode` (`agent-workflow-runtime.ts:162`) 取唯一业务节点
   - `bindings.moduleClassResolver(runtimeBinding.moduleClassRef)` (`agent-workflow-runtime.ts:91`) → app 注入的 `ProjectModel` 构造器 (`agent-workflow-bindings.ts:105`)
   - `resolveEditorGetter` (`agent-workflow-runtime.ts:174`) 按 `editorSource` 从 `editorGetterRegistry` 取 getter
   - `bindings.knowledgeProviderFactory(runtimeBinding.knowledge)` (`agent-workflow-runtime.ts:93`) → app 注入的 `createAgentWorkflowKnowledgeProvider` (`agent-workflow-bindings.ts:252`)
   - `createBeforeFunctionCall` (`agent-workflow-runtime.ts:186`) 包装 `bindings.gateExecutor` (`agent-workflow-bindings.ts:270` 的 `executeAgentWorkflowGate`)
   - `systemPrompt` 回调 (`agent-workflow-runtime.ts:116`) 包装 `bindings.systemPromptInterpolator` (`agent-workflow-bindings.ts:124`)

projectPlanning 路径同构：`runProjectPlanningAiSession` (`src/services/project-planning/project-planning-ai-runner.ts:80`) → `activateProjectPlanningAgentWorkflow` (`agent-workflow-bindings.ts:88`)。

### 1.2 运行时回调注入现状（`src/services/ai/agent-workflow-bindings.ts:101`）

`createAppAgentWorkflowRuntimeBindings` 返回 5 个 binding 字段，其中 3 个承载未声明式化的业务逻辑：

| binding 字段 | 行号 | 现状 | 声明式化目标 |
|---|---|---|---|
| `moduleClassResolver` | `:105` | 返回 `ProjectModel` 构造器 | 保留（moduleClassRef.kind 路由） |
| `editorGetterRegistry` | `:111` | 按 `editorSource` 路由到 `resolvePageDesignProject` / `resolveProjectPlanningDomainRoot` | 保留（editorSource 路由） |
| `knowledgeProviderFactory` | `:119` | `createAgentWorkflowKnowledgeProvider`，workerUrl 硬编码 `new URL('../class-model-knowledge.worker.ts', import.meta.url)` (`:262`) | 补 `workerUrlRef`，解释器消费 |
| `gateExecutor` | `:123` | `executeAgentWorkflowGate` 按 `editorSource` 分发到 `evaluatePageDesignBeforeFunctionCall` / `evaluateProjectPlanningBeforeFunctionCall` | 删除，解释器按 `gateRules.kind` 声明式执行 |
| `systemPromptInterpolator` | `:124` | 按 `editorSource` 分发到 `formatPageDesignSystemPrompt` / `createProjectPlanningSystemPrompt` | 删除，解释器做 `{{var}}` 插值 + `conditionalHints[].when` 条件求值 |

## 2. 三块未声明式化业务逻辑的完整现状清单

### 2.1 systemPrompt — 真实 prompt 由应用侧 TS 函数全量生成

#### pageDesign：`formatPageDesignSystemPrompt` (`src/services/page-design/page-design-agent-workflow-binding.ts:129`)

落盘 JSON 的 `systemPrompt.template` 是占位字符串 `"pageDesign system prompt is interpolated by app binding."`（`spark-ai-server/data/.../agent.workflow.pageDesign/definition.json:286`），真实 prompt 由 `formatPageDesignSystemPrompt(input: PageDesignRunInput)` 全量生成。条件分支：

- **dataset-only mode 分支**（`:143` `isPageDesignDataSetOnlyMode(input.allowedOperations)`）：当 `allowedOperations = { dataSet: true, nodeTree: false, script: false, style: false, navigation: false }` 时，走 pageDataDesign preset 专用 prompt（只改 pagedata.json，禁止 editNodeTree/rule.json/script.js/style.css）。
- **默认分支**（`:156`）：通用 pageDesign prompt，含 `pageDesignScriptSopLines(input)`。
- **请假页 hint**（`:177` `leaveRequestPageDesignHintLines`）：当 `description + effectiveDescription + planningTitle` 拼接后 toLowerCase 包含 `请假` 或 `leave` 时，追加 3 条 LeaveRequest 验收字段、options、rule.json 结构 hint。**这是当前落盘 JSON 的 `conditionalHints` 完全没覆盖的分支**（JSON 里只有一个 `when: { allowedOperations: 'dataSetOnly' }` 的 hint，且解释器不消费它）。
- **插值变量**：`projectId` / `pageId` / `planningTitle` / `planningPath` / `effectiveDescription` / `description` / `allowedOperations`。其中 `planningTitle` / `planningPath` 有兜底默认值（`:134-135`）。

声明式化需要的 DSL 表达力：
1. `{{var}}` 插值（`projectId` / `pageId` / `planningTitle` / `planningPath` / `effectiveDescription` / `description`）—— 复用已实现的 `interpolateRuntimeTemplate`（见 §3）。
2. `conditionalHints[].when` 条件求值，需支持谓词：
   - `allowedOperations dataSetOnly`（对象字段组合判断，当前 JSON 用 `when: { allowedOperations: 'dataSetOnly' }` 表达，但解释器未实现求值）
   - `input.description|effectiveDescription|planningTitle contains '请假|leave'`（多字段拼接 + 多关键词 OR，当前 TS 用 `text.includes('请假') || text.includes('leave')`）
3. **模板内嵌固定 SOP 行**：`pageDesignScriptSopLines` / `leaveRequestPageDesignHintLines` 是纯数据字符串数组，可内联到 template 或 conditionalHints.template。

#### projectPlanning：`createProjectPlanningSystemPrompt` (`src/services/project-planning/project-planning-agent-workflow-binding.ts:254`)

落盘 JSON 的 `systemPrompt.template` 同样是占位字符串（`spark-ai-server/data/.../agent.workflow.projectPlanning/definition.json:256`），`conditionalHints: []`。真实 prompt 由 `createProjectPlanningSystemPrompt(input: ProjectPlanningAgentInput)` 全量生成。条件分支：

- **无显式条件分支**，但有动态插值：`input.projectId`（`:260`）、`formatProjectPlanningPromptContext(input)` 的多行拼接（`:255`，含 `tenantId?` / `projectId` / `requirement` / `planningAttachmentRef?` / `navigationNodes[]` 列表）。
- **`projectPlanningScriptSopLines(input.projectId)`**（`:365`）：纯数据 SOP 行，含一段 children 示例代码块（`:372-383`），末行插值 `projectId`。

声明式化需要的 DSL 表达力：
1. `{{var}}` 插值（`projectId` / `requirement` / `planningAttachmentRef`）。
2. **数组遍历插值**（`navigationNodes[]` → 每节点 `nodeId/title/nodeKind/requirement/planningAttachmentRef`）—— 当前 `interpolateRuntimeTemplate` 只支持标量替换，**不支持数组遍历**。这是 DSL 表达力的关键缺口。
3. **条件块**（`tenantId` 存在时追加一行、`planningAttachmentRef` 存在时追加一行）—— 需要 `when` 支持存在性判断。

### 2.2 gate — 实际 gate 逻辑由应用侧 TS 函数执行

解释器 `createBeforeFunctionCall` (`agent-workflow-runtime.ts:186`) 只把 `gateRules` 透传给 `gateExecutor` 回调，app 层 `executeAgentWorkflowGate` (`agent-workflow-bindings.ts:270`) 按 `editorSource` 分发，实际 gate 逻辑在两个 TS 函数里。

#### pageDesign：`evaluatePageDesignBeforeFunctionCall` (`page-design-agent-workflow-binding.ts:217`)

读取上下文：
- `options.moduleInstanceId`（即 pageId，`:221`）
- `project.readPlanningProjection()` 找 `summary`（`:225`）—— **读 ProjectModel 运行时实例**，声明式化难点
- `readPageDesignRunContext(pageId).allowedOperations`（`:233`，来自 `page-design-gates.ts:69` 的模块级 Map `pageDesignRunContexts`）—— **读进程内模块级状态**，声明式化难点

判断逻辑：
1. `pageId` 为空 → allow（`:223`）
2. `summary` 不存在 → reject（`:227`）
3. `evaluatePageDesignMutationToolGate` (`page-design-gates.ts:261`)：
   - `isPageDesignMutationTool(toolName)` 判断是否变更类工具（`model_script` / `writepagefile` / `openpagedesign`，`:166`）
   - `readPageDesignGateState(summary)` → `validatePageDesignRunGate` 三重校验：`planningReady`（effectiveDescription 非空）/ `implGate`（closed/open）/ `upstreamContractsSatisfied`（`:188`）
   - `evaluatePageDesignScriptOperationGate` (`page-design-gates.ts:287`)：`allowedOperations` 非空时，对 `model_script` 的 script 体做 marker 扫描（`OPERATION_FALSE_SCRIPT_MARKERS`，`:233`）

#### projectPlanning：`evaluateProjectPlanningBeforeFunctionCall` (`project-planning-agent-workflow-binding.ts:296`) → `evaluateProjectPlanningToolGate` (`:341`)

读取上下文：
- `options.toolName` / `options.args`（`:342`）—— 纯工具调用参数，可声明式化

判断逻辑：
1. `evaluateProjectActionLookupGate`（`:390`）：`model_attribute_guide` 工具且 `kind='project'` 时，若 `attributeName` 是 `PROJECT_ACTION_NAMES`（`readProjectPlanningInput`/`readNavigationPlanningInputs`/`replaceNavigationChildren`，`:331`）→ reject；若是 `PROJECT_PARAM_TYPE_NAMES`（`ProjectNodeData`，`:337`）→ reject。
2. `toolName !== 'model_script'` → allow（`:347`）
3. `findForbiddenProjectPlanningScriptMarker`（`:422`）：扫描 script 是否含 `FORBIDDEN_SCRIPT_MARKERS`（`openPageDesign`/`writePageFile`/`setFileText`/`editNodeTree`/`editDataSet`/`getNodeTree`/`getDataSetTool`，`:320`）→ reject。

#### 当前落盘 JSON 的 gateRules（声明式骨架已存在，解释器未消费）

pageDesign (`definition.json:310`)：
```json
"gateRules": [
  { "kind": "pageDesignMutationGate" },
  { "kind": "allowedOperations" },
  { "kind": "forbiddenScriptMarkers", "markers": ["editNodeTree","editDataSet","setFileText","writePageFile"] }
]
```

projectPlanning (`definition.json:273`)：
```json
"gateRules": [
  { "kind": "projectPlanningToolGate" },
  { "kind": "projectActionLookup" },
  { "kind": "forbiddenScriptMarkers", "markers": ["openPageDesign","writePageFile","setFileText","editNodeTree","editDataSet"] }
]
```

声明式化需定义 `gateRules[].kind` 枚举 + 每 kind 的参数 schema + 解释器执行逻辑：

| kind | 现状归属 | 声明式化难点 |
|---|---|---|
| `forbiddenScriptMarkers` | pageDesign / projectPlanning 共用 | **可完全声明式化**：参数 `markers: string[]`，解释器读 `options.args.script` 做字符串包含扫描 |
| `allowedOperations` | pageDesign | **部分难点**：需读 `readPageDesignRunContext(pageId).allowedOperations`（进程内模块级 Map），解释器无法直接读；需 app 层通过 `editorGetter` 拿 ProjectModel 后读，或把 allowedOperations 从 input 透传 |
| `pageDesignMutationGate` | pageDesign | **难声明式化**：需读 `project.readPlanningProjection()` 的 `summary`（effectiveDescription/implGate/upstreamContractsSatisfied），这是 ProjectModel 运行时实例的三重校验 |
| `projectPlanningToolGate` | projectPlanning | **可声明式化**：本质是 `forbiddenScriptMarkers` 的特例，可合并 |
| `projectActionLookup` | projectPlanning | **可声明式化**：参数 `kind='project'` + `actionNames[]` + `paramTypeNames[]`，解释器读 `options.args.kind/attributeName` 做匹配 |

### 2.3 knowledge — 缺 `workerUrlRef`

当前 schema (`agent-workflow-definition.ts:134`)：
```typescript
export type AgentWorkflowNodeKnowledge = Readonly<{
  rootClassName: string
  manifestUrlRef: string
}>
```

落盘 JSON 两者都填 `"rootClassName": "ProjectModel"` / `"manifestUrlRef": "dts-class-model"`（`definition.json:296`）。

解释器消费 (`agent-workflow-runtime.ts:93`)：
```typescript
const knowledge = command.bindings.knowledgeProviderFactory(runtimeBinding.knowledge)
```
app 层 `createAgentWorkflowKnowledgeProvider` (`agent-workflow-bindings.ts:252`) 用 `config.rootClassName` + `getDtsClassModelManifestUrl()`（app 层硬编码，不读 `manifestUrlRef`）+ `new URL('../class-model-knowledge.worker.ts', import.meta.url)`（app 层硬编码 workerUrl）构造 `createWorkerDtsClassModelKnowledgeProvider`。

**`workerUrl` 无法 JSON 序列化**：`new URL('../class-model-knowledge.worker.ts', import.meta.url)` 是 bundler 特定的模块引用（Vite/Webpack 在构建时解析为 chunk URL），不能放进 JSON。因此 `workerUrlRef` 必须是符号引用（如 `'class-model-knowledge.worker'`），由 app 层 `knowledgeProviderFactory` 据此路由到实际 worker URL。

**`manifestUrlRef` 当前未被真正消费**：app 层 `getDtsClassModelManifestUrl()` 忽略 `config.manifestUrlRef`，直接用 `DTS_CLASS_MODEL_MANIFEST_PATH` 常量拼 URL（`src/class-model-artifacts/artifact-urls.ts:12`）。补 `workerUrlRef` 时需同步决定 `manifestUrlRef` 是否也要真正消费（当前是"声明了但没用"）。

补 `workerUrlRef` 需改的点：
1. `agent-workflow-definition.ts:134` schema 加 `workerUrlRef: string`
2. `agent-workflow-validation.ts:571` 校验 `workerUrlRef` 非空
3. `agent-workflow-runtime.ts:93` `knowledgeProviderFactory` 传入完整 config（含 `workerUrlRef`）
4. `agent-workflow-bindings.ts:252` `createAgentWorkflowKnowledgeProvider` 按 `workerUrlRef` 路由到 `new URL('../class-model-knowledge.worker.ts', import.meta.url)`
5. `tools/generate-workflow-design-data.mjs` 落盘 JSON 填 `workerUrlRef`
6. `packages/spark-ai/src/tests/agent-workflow-definition.test.ts:358` 测试 fixture 补 `workerUrlRef`

## 3. 解释器已实现的声明式样板（可复用）

### 3.1 nudge 的 `interpolateRuntimeTemplate`（`agent-workflow-runtime.ts:233`）

```typescript
function interpolateRuntimeTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/gu, (_match, key: string) => values[key] ?? '')
}
```

已用于 `createToolLoopNudge` (`agent-workflow-runtime.ts:213`)，支持 `{{moduleInstanceId}}` / `{{runtimeContext.moduleId}}` 等点号路径。落盘 JSON 的 nudge templates 已用此格式（`definition.json:302`）。

**systemPrompt 插值可直接复用**，但需扩展 values 构造：
- nudge 的 values 来自 `AiAgentToolLoopNudgeContext`（`moduleInstanceId` / `runtimeContext.moduleId` 等）
- systemPrompt 的 values 需来自 `AiJsonParams` input（`pageId` / `description` / `effectiveDescription` / `projectId` / `planningTitle` / `planningPath` / `requirement` / `navigationNodes` 等）

**当前 systemPromptInterpolator 回调契约**（`agent-workflow-runtime.ts:49` `AgentWorkflowRuntimeSystemPromptCommand`）：
```typescript
{
  editorSource: string
  template: string
  hints: readonly AgentWorkflowNodeConditionalHint[]
  input: AiJsonParams
}
```
解释器已把 `template` / `hints` / `input` 都传给回调，纯粹化时只需把回调内部逻辑搬进解释器：`interpolateRuntimeTemplate(template, flattenInput(input))` + 条件求值 `hints`。

### 3.2 `conditionalHints[].when` 当前未求值

当前 schema (`agent-workflow-definition.ts:124`)：
```typescript
export type AgentWorkflowNodeConditionalHint = Readonly<{
  when: AgentWorkflowJsonRecord  // 任意 JSON 对象，无 schema 约束
  template: string
}>
```
validation (`agent-workflow-validation.ts:660`) 只校验 `when` 是 object，不校验内部结构。落盘 JSON 用 `when: { allowedOperations: 'dataSetOnly' }`（pageDesign）或空数组（projectPlanning）。**解释器完全没有读 `when` 做条件求值**——`systemPromptInterpolator` 回调里 `command.hints.map(hint => hint.template)` 直接拼所有 hint（见测试 `agent-workflow-definition.test.ts:453`），无条件判断。

## 4. 落盘 JSON 当前 runtimeBinding 真实字段值（关键片段）

### pageDesign (`spark-ai-server/data/.../agent.workflow.pageDesign/definition.json:207-343`)

- `registration`: `{ alias: "pageDesign", moduleId: "pageDesign", businessId: "pageDesign" }`
- `inputContract.identityField`: `"pageId"`，`messageField`: `"description"`，`paramsSchema` 内联完整（10 字段），`readonlySteps` 2 条
- `systemPrompt.template`: `"pageDesign system prompt is interpolated by app binding."`（占位）
- `systemPrompt.conditionalHints`: 1 条 `{ when: { allowedOperations: "dataSetOnly" }, template: "pageDataDesign preset: only pagedata.json/DataSet changes are allowed." }`
- `knowledge`: `{ rootClassName: "ProjectModel", manifestUrlRef: "dts-class-model" }`（无 `workerUrlRef`）
- `toolLoopNudge.templates`: 3 个 reason 模板，已用 `{{moduleInstanceId}}` 插值（**已声明式化**）
- `beforeFunctionCall.gateRules`: 3 条（`pageDesignMutationGate` / `allowedOperations` / `forbiddenScriptMarkers` with markers）
- `executionToolNames`: `["model_script"]`
- `planWithoutToolMarkers`: `["openpagedesign","editnodetree","editdataset"]`
- `resolveInstance`: `{ editorSource: "pageDesign", identityField: "pageId" }`
- `moduleClassRef`: `{ kind: "ProjectModel" }`
- **无 `agentCompleteMethodName`**（pageDesign 走默认 `agent_complete`）

### projectPlanning (`spark-ai-server/data/.../agent.workflow.projectPlanning/definition.json:184-309`)

- `registration`: `{ alias: "projectPlanning", moduleId: "projectPlanning", businessId: "projectPlanning" }`
- `inputContract.identityField`: `"projectScopeKey"`，`messageField`: `"requirement"`
- `systemPrompt.template`: `"projectPlanning system prompt is interpolated by app binding."`（占位）
- `systemPrompt.conditionalHints`: `[]`
- `knowledge`: 同 pageDesign（无 `workerUrlRef`）
- `beforeFunctionCall.gateRules`: 3 条（`projectPlanningToolGate` / `projectActionLookup` / `forbiddenScriptMarkers` with markers）
- `agentCompleteMethodName`: `"completeProjectPlanning"`
- `resolveInstance`: `{ editorSource: "projectPlanning", identityField: "projectScopeKey" }`

## 5. 硬门禁风险

### 5.1 非 allowlist interface

当前 `agent-workflow-definition.ts` 全部用 `type` alias（`Readonly<{...}>`），无 `interface`。补 DSL 时若新增条件求值器、gate 执行器等，**禁止引入 `interface`**（ai-spec 2.2 节硬门禁）。应继续用 `type` alias + 函数。

### 5.2 非 `as const` 类型断言

`agent-workflow-runtime.ts` 的 `interpolateRuntimeTemplate` 正则用了 `/\{\{...\}\}/gu` 字面量（合规）。补 DSL 时若定义 `gateRules[].kind` 枚举，用 `as const` satisfies（参照 `agent-workflow-definition.ts:279` 的 `AGENT_WORKFLOW_GRAPH_NODE_TYPES` 写法），禁止尖括号断言。

### 5.3 函数签名约束

`interpretAgentWorkflowDefinition(command: InterpretAgentWorkflowDefinitionCommand<TInstance>)` (`agent-workflow-runtime.ts:82`) 是单参数 options object，合规。补 DSL 解释器函数（如 `evaluateGateRules` / `interpolateSystemPrompt`）也必须用单参数 options object，不超过 3 个位置参数。

### 5.4 导出约束

`packages/spark-ai/src/agent/workflow/index.ts` 显式 export（无 `export *`）。新增 DSL 类型若要公开，必须在此文件加显式 export，并同步 `host-public-surface.test.ts` 断言（`:27-48` 已列出所有公共导出符号）。

## 6. 跨包影响面

动 `packages/spark-ai/src/agent/workflow/agent-workflow-definition.ts` schema 是公共契约改动，影响以下消费方：

| 消费方 | 文件 | 影响点 |
|---|---|---|
| 解释器 | `packages/spark-ai/src/agent/workflow/agent-workflow-runtime.ts` | 补 systemPrompt 插值 + 条件求值 + gate 声明式执行 + knowledge workerUrlRef 消费 |
| 校验器 | `packages/spark-ai/src/agent/workflow/agent-workflow-validation.ts` | 同步校验新字段（`when` 谓词结构、`gateRules` kind 枚举、`workerUrlRef`） |
| 旧 dry-run | `packages/spark-ai/src/agent/workflow/agent-workflow-dry-run.ts` | 不消费 runtimeBinding，不受影响；但需决定是否收敛删除（见 §7） |
| 测试 | `packages/spark-ai/src/tests/agent-workflow-definition.test.ts` | mock 的 `systemPromptInterpolator`/`gateExecutor` 需改为验证解释器输出；fixture 补 `workerUrlRef` |
| 公共面测试 | `packages/spark-ai/src/tests/host-public-surface.test.ts` | 若新增公开类型需加断言 |
| 设计器白名单 | `src/services/workflow-designs.ts:811` `normalizeNodeDataForDefinition` | 已透传 `runtimeBinding`（`data.runtimeBinding`），schema 变更无需改白名单，但需确认新字段能透传 |
| 设计器测试 | `tests/services/workflow-designs.test.ts:124` | fixture 含 `runtimeBinding`，需同步补 `workerUrlRef` 等 |
| 落盘 JSON | `spark-ai-server/data/.../agent.workflow.{pageDesign,projectPlanning}/definition.json` | systemPrompt.template 改真实模板、gateRules 填真实参数、knowledge 补 workerUrlRef |
| 生成脚本 | `tools/generate-workflow-design-data.mjs` | 同上，4 个 JSON 重新生成 |
| 应用侧 binding | `src/services/ai/agent-workflow-bindings.ts` | 删 `systemPromptInterpolator` / `gateExecutor` 注入，`knowledgeProviderFactory` 按 `workerUrlRef` 路由 |
| 应用侧领域 binding | `src/services/page-design/page-design-agent-workflow-binding.ts` / `src/services/project-planning/project-planning-agent-workflow-binding.ts` | 删 `formatPageDesignSystemPrompt` / `createProjectPlanningSystemPrompt` / `evaluatePageDesignBeforeFunctionCall` / `evaluateProjectPlanningBeforeFunctionCall` / `evaluateProjectPlanningToolGate` 等 TS 函数；保留 sop lines 纯数据（若作为 template 内联可删） |
| runner/provider | `src/services/page-design/page-design-ai-runner.ts` / `project-planning-ai-runner.ts` / `*-host-run-provider.ts` | 调用点签名可能微调（若 `activate*AgentWorkflow` options 变） |
| 文档 | `packages/spark-ai/docs/business-factory-workflow-zh-cn.md` | 补声明式 DSL schema 与解释器行为文档 |
| generated dts | `generated/dts-class-model/files/packages/spark-ai/src/agent/workflow/*.json` | 自动重新生成，无需手改 |

## 7. 旧 dry-run API 是否一起收敛

`agent-workflow-dry-run.ts` 的 `activateAgentWorkflowDefinition` / `dryRunAgentWorkflowDefinition` / `resolveAgentWorkflowActivation`（`:56-103`）是旧链路：只用 `workflowId` 路由到 `bindings.workflows[workflowId]`，不消费 graph / runtimeBinding。当前消费方：
- `host-public-surface.test.ts:28` 断言其导出
- `agent-workflow-definition.test.ts:129` 用 `dryRunAgentWorkflowDefinition` 做旧链路测试
- 无 app 层生产消费方（app 层全走 `activateAgentWorkflowFromDefinition`）

**纠偏任务需决定**：是否同时删除旧 dry-run API（减少公共面），还是保留作为过渡。原计划 `notes/plan-business-factory-single-workflow.md:55` 写"activateAgentWorkflowDefinition / dryRunAgentWorkflowDefinition 本轮保留"。

## 8. resolveInstance 的 identityField 未兑现问题

审计指出：`resolveInstance.identityField` 当前未被解释器真正用来从 input 取 moduleInstanceId。

代码事实（`agent-workflow-runtime.ts:174` `resolveEditorGetter`）：
```typescript
const editorSource = runtimeBinding.resolveInstance.editorSource
const getter = bindings.editorGetterRegistry[editorSource]
return getter  // 直接返回 getter，不读 identityField
```
`editorGetter` 在 app 层（`agent-workflow-bindings.ts:112`）是 `(context: AiAgentRuntimeContext) => ProjectModel`，`context.moduleInstanceId` 由 Host 运行时注入（来自 `AiAgentRuntimeContext`，不是从 input 按 `identityField` 取）。

app 层 `resolvePageDesignProject` (`page-design-agent-workflow-binding.ts:204`) 直接用 `ctx.moduleInstanceId`，不读 `identityField`；`resolveProjectPlanningDomainRoot` (`project-planning-agent-workflow-binding.ts:237`) 同样。

**纯粹化时需决定**：是否让解释器按 `identityField` 从 `input` 取值作为 `moduleInstanceId` 传给 editorGetter（兑现声明），还是继续依赖 Host 运行时注入的 `context.moduleInstanceId`（当前行为）。落盘 JSON 里 `identityField` 分别是 `"pageId"` / `"projectScopeKey"`，与 Host 注入的 `moduleInstanceId` 语义一致但来源不同。
