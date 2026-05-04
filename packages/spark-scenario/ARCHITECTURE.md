# spark-scenario 架构说明

`spark-scenario` 是纯 TypeScript、无框架依赖的 AI 场景协议与运行时包。它不接管 AI 框架的会话、SSE、滑动窗口或 provider 调度，而是把业务场景、工具、函数定义和 payload 契约整理成 AI 框架可查询、可调用、可回放的结构。

本文按五级模型解释架构边界：框架级、场景级、工具级、函数级、货载级。

## 核心结论

- 框架级负责通信和主循环：会话 ID、主/子 Agent、SSE、function_call、function_result、append、滑动窗口都属于 AI 框架。
- 场景级负责业务组织：场景定义意图、提示词策略、payload 契约、流程、完成条件和恢复提示。
- 工具级负责能力声明：工具描述参数 schema、执行宿主、分类、规则、失败码和修复提示。
- 函数级负责 FC 协议：工具被投影成 AI 框架可见的 function definition，调用结果用 `callId` 回写。
- 货载级负责数据形状：用户输入、上下文、参数槽位、函数 arguments、工具结果都必须有清晰结构边界。

## 五级架构图

```text
┌──────────────────────────────────────────────────────────────┐
│ 框架级：AI Framework / Agent Loop                             │
│ sessionId, SSE, sliding window, LLM loop, function routing     │
│ createScenarioSseLlmClient, AiBrowserLlmClient                 │
└──────────────────────────────┬───────────────────────────────┘
                               │ 投喂 function definitions / 回写 function results
┌──────────────────────────────▼───────────────────────────────┐
│ 函数级：Function Calling 协议                                  │
│ AiScenarioFunctionDefinition / Call / Result                  │
│ createScenarioFunctionCallBridge                              │
└──────────────────────────────┬───────────────────────────────┘
                               │ functionName 映射到 scenarioId + toolName
┌──────────────────────────────▼───────────────────────────────┐
│ 场景级：Scenario 定义与运行                                     │
│ AiScenarioDefinition, promptPolicy, flow, recovery             │
│ createScenarioRegistry, createScenarioRuntime                  │
└──────────────────────────────┬───────────────────────────────┘
                               │ 场景包含工具，工具消费 payload/context
┌──────────────────────────────▼───────────────────────────────┐
│ 工具级：Tool 能力声明                                           │
│ AiScenarioTool, parameters, registration.execution             │
│ frontend FC / backend FC                                       │
└──────────────────────────────┬───────────────────────────────┘
                               │ 参数 schema、槽位、上下文和结果
┌──────────────────────────────▼───────────────────────────────┐
│ 货载级：Payload / Context / Arguments / Result                 │
│ AiScenarioPayloadContract, AiScenarioPayloadSlot, JsonSchema   │
└──────────────────────────────────────────────────────────────┘
```

这不是传统“上层调用下层”的单向代码依赖图，而是 AI 运行时的信息责任图。`spark-scenario` 提供场景、工具、函数和 payload 的结构；AI 框架决定何时调用、如何通信、如何继续推理。

## 层级责任详解

### 1. 框架级

框架级是 AI 主循环所在地。它决定本轮使用哪个 session、是否创建子 Agent、如何打开 SSE、如何维护滑动窗口、如何把 function result append 回会话。

`spark-scenario` 在框架级只提供适配点：

- `AiBrowserLlmClient`：统一 LLM 客户端接口。
- `createScenarioSseLlmClient`：连接 AI 框架 SSE 的浏览器端兼容客户端。
- `TIERED_QUERY_CONSTRAINT`：要求模型先查询能力目录，再使用工具或函数。
- `buildScenarioSystemPrompt`：生成框架级基础约束和场景职责说明。

框架级不应该做的事：

- 不在浏览器保存 provider API Key。
- 不让场景应用解析 `delta/reasoning/result/error/done` 做业务决策。
- 不要求 `spark-scenario` 创建、销毁、裁剪或持久化 AI session。

框架级提示词的职责是“教 Agent 怎么使用系统”，不是写业务细节。例如：必须先调用 registry 查询场景、工具和 schema；未知字段必须停止；不能猜测参数。

### 2. 场景级

场景级是业务意图和流程的所有者。一个 `AiScenarioDefinition` 描述：

- 这个场景是谁：`id`、`title`、`scope`、`description`。
- 什么时候匹配它：`intents`、`matchIntent`。
- 该场景的提示词策略：`promptPolicy`。
- 需要哪些货载数据：`payload`。
- 推荐执行顺序：`flow`、`buildSteps`。
- 完成和失败如何处理：`completion`、`recovery`。
- 能调用哪些工具：`tools`。

场景级提示词不负责通信，也不应该写死 provider 协议。它只描述业务角色、业务边界、确认策略和恢复策略。

```typescript
const scenario: AiScenarioDefinition = {
  id: 'scenario.filter-expression-cases',
  title: '过滤表达式案例查询',
  scope: 'business',
  intents: ['过滤表达式', '案例查询'],
  promptPolicy: {
    promptTemplateId: 'filter-expression-cases',
    confirmPolicy: 'auto',
    recoveryPolicy: 'strict',
  },
  payload: {
    required: ['keyword'],
    slots: [{ key: 'keyword', description: '查询关键词', required: true, source: 'user' }],
  },
  // tool 见下一节“工具级”示例。
  tools: [tool],
}
```

场景级通过 registry 暴露分级查询协议。LLM 或 AI 框架应先查 `queryIntentCatalog()`，再查 `queryScenarioInfo()`、`queryScenarioTools()`、`queryToolSchemaNode()`，最后才构造计划或 function call。

### 3. 工具级

工具级是可执行能力的声明层。工具属于某个场景，但可以通过函数级投影暴露给 AI 框架。

工具包含四类信息：

- 可读描述：`name`、`description`。
- 参数结构：`parameters`，使用 `JsonSchema`。
- 注册元数据：`registration.category/tags/example/rules/failureCodes/fixHints`。
- 执行宿主：`registration.execution`。

```typescript
const tool: AiScenarioTool = {
  name: 'filterExpressionCases.query',
  description: '查询过滤表达式案例。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string' },
      limit: { type: 'number' },
    },
  },
  registration: {
    rules: ['执行前必须具备 tenantId 和 projectId。'],
    execution: {
      host: 'backend',
      kind: 'query',
      backendRoute: '/api/ai/scenario-functions/filterExpressionCases.query',
    },
  },
}
```

执行宿主是当前 FC 迁移的关键：

- `frontend`：前端执行，适合页面状态、人机交互、可视化确认、浏览器 live model。
- `backend`：后端执行，适合查询、固定 FC、通用 prompt、服务端数据访问和未来 Agent 后端自动执行。

工具级规则和失败码是提示词材料，但不是提示词本体。模型在调用工具前应通过 `queryToolRegistration()` 读取它们。

### 4. 函数级

函数级把工具转换成 AI 框架可见的一等 FC 协议。这个层级解决三个问题：

1. provider/Agent 需要一个合法 function name。
2. AI 框架需要知道 function 的参数 schema 和执行宿主。
3. 调用结果必须以 `callId` 对齐返回。

`createScenarioFunctionCallBridge(runtime)` 负责从 registry 当前快照生成 function definitions：

```typescript
const bridge = createScenarioFunctionCallBridge(runtime)
const definitions = bridge.listFunctionDefinitions()
```

函数级对象：

```typescript
interface AiScenarioFunctionDefinition {
  name: string
  description: string
  parameters?: JsonSchema
  scenarioId?: string
  toolName?: string
  execution: AiScenarioToolExecutionRegistration
  metadata?: Record<string, unknown>
}
```

函数调用进入 bridge 后按宿主分流：

- 前端函数：解析 `arguments`，调用 `runtime.run()`，返回 `status='executed'` 或 `status='failed'`。
- 后端函数：前端 bridge 不执行，返回 `status='requires-backend'` 与 `backendRoute`，由 AI 框架或后端 executor 执行。
- 未注册函数或函数名冲突：fail-fast，不静默猜测。

后端 FC 第一版已经收敛为：

```http
POST /api/ai/scenario-functions/{functionName}
```

该 endpoint 负责执行后端函数本身，不负责 append 会话，不负责继续下一轮 LLM 调用。对 `host='backend'` 的工具，调度时应优先使用 `registration.execution.backendRoute` 或 `AiScenarioFunctionCallResult.backendRoute`；provider 侧函数名可能经过 mapper 处理，不一定等同于后端 executor 的 `{functionName}`。

### 5. 货载级

货载级是数据结构边界。它回答“本次要带什么数据，字段从哪里来，缺失时如何追问”。

货载级包含：

- `AiScenarioContext`：页面、项目、路由、用户、metadata 等上下文。
- `AiScenarioPayloadContract`：场景运行需要补齐的 payload 槽位与 schema。
- `AiScenarioToolCall.args`：工具执行参数。
- `AiScenarioFunctionCall.arguments`：函数调用原始参数。
- `AiScenarioFunctionCallResult.result`：函数执行结果。

货载级不是数据库模型，也不表达外键、索引或约束。它是 AI 运行过程中的结构化数据合同。

```typescript
const payload = {
  required: ['keyword'],
  slots: [
    {
      key: 'keyword',
      description: '要查询的过滤表达式关键词。',
      required: true,
      source: 'user',
      askWhenMissing: '请提供查询关键词。',
    },
  ],
}
```

Payload、Context、Arguments 的分工：

| 对象 | 归属 | 说明 |
| --- | --- | --- |
| `context` | 框架/运行级 | 当前页面、项目、用户、路由、metadata，不是业务参数 |
| `payload` | 场景级 | 本次场景运行的已补齐业务数据 |
| `tool.args` | 工具级 | 某次工具执行参数，通常来自 payload 或前一步结果 |
| `function.arguments` | 函数级 | provider/Agent 发起 FC 时的原始参数 |
| `result` | 函数/工具级 | 执行返回值，由 AI 框架决定是否 append 到会话 |

## 提示词在五级中的位置

提示词不是单一大字符串，而是按层级拼装的行为约束：

| 层级 | 提示词内容 | 代码位置 |
| --- | --- | --- |
| 框架级 | 分级查询约束、禁止猜测、函数调用纪律、失败必须显式 | `TIERED_QUERY_CONSTRAINT`、`buildScenarioSystemPrompt` |
| 场景级 | 场景角色、业务目标、确认/恢复策略、模板绑定 | `AiScenarioPromptPolicy`、`promptTemplateId` |
| 工具级 | 工具调用规则、示例、失败码、修复提示 | `AiScenarioToolRegistration.rules/example/failureCodes/fixHints` |
| 函数级 | function 描述、参数 schema、执行宿主 | `AiScenarioFunctionDefinition` |
| 货载级 | 字段说明、必填槽位、缺失追问文本 | `AiScenarioPayloadSlot.description/askWhenMissing` |

推荐拼装原则：框架级负责纪律，场景级负责业务身份，工具级负责调用规则，货载级负责字段语义。函数级只提供给 AI 框架，不应该再塞入大段业务提示词。

## FC 在五级中的位置

FC 的来源是工具级，运行入口是函数级，调度所有权在框架级。

```text
工具级 AiScenarioTool
  ↓ 投影
函数级 AiScenarioFunctionDefinition
  ↓ 由 AI 框架投喂给 LLM
AI 框架收到 function_call
  ↓ 按 execution.host 分流
frontend: createScenarioFunctionCallBridge.executeFunctionCall()
backend: POST /api/ai/scenario-functions/{functionName}
  ↓
AiScenarioFunctionCallResult / 后端同形结果
  ↓
AI 框架 append tool result 并决定是否继续推理
```

场景应用只关心 FC 的业务语义：要调用哪个函数、参数是什么、结果是什么。SSE 的 `delta/reasoning/result/error/done` 属于框架级传输细节。

## 运行时序

### 文本 planner 兼容路径

现有 `createBrowserScenarioPlanner` 仍支持文本 JSON 规划：

```text
用户输入
  ↓
planner 调用 llm.generate()
  ↓
LLM 输出 { scenarioId, toolCalls }
  ↓
runtime.run({ scenarioId, toolCalls })
  ↓
toolResolver 执行工具
```

该路径用于兼容和测试，不是未来主路径。它不具备一等 function_call/function_result 语义。

### FC 主路径

未来主路径以 AI 框架为中心：

```text
AI 框架解析/创建 session
  ↓
读取 registry / bridge，获得 function definitions
  ↓
LLM turn 产生 function_call
  ↓
AI 框架把 function_call 交给前端 bridge 或后端 executor
  ↓
拿到 function result
  ↓
AI 框架 append 结果并继续下一轮 turn
```

`spark-scenario` 在这个路径中提供函数目录和执行桥接，但不拥有会话生命周期。

### 后端 FC 路径

后端函数由 `execution.host='backend'` 标记，第一版接口：

```http
POST /api/ai/scenario-functions/{functionName}
```

请求体包含：

- `protocolVersion: 3`
- `callId`
- `arguments`
- `context.tenantId/context.projectId`，或通过 `X-Tenant-Id`、`X-Project-Id` header 注入
- `session`，仅作为上下文，不触发自动 append

失败语义：协议错误返回 HTTP 400；未知函数返回 HTTP 404；业务执行失败返回 `ok=false,status='failed'` 的函数结果。

## 代码分层

```text
src/contracts/
  scenario-types.ts            场景、工具、payload、执行宿主
  function-call-contracts.ts   FC、SSE 信封、会话上下文、函数结果
  llm-contracts.ts             LLM client 与 planner 契约
  query-protocol.ts            分级查询协议
  json-schema.ts               JSON Schema 子集

src/prompt/
  prompt-constraints.ts        框架级查询约束与系统提示词构造
  scenario-prompt-template-registry.ts

src/runtime/
  scenario-registry.ts         场景注册、查询、意图匹配
  scenario-runtime.ts          场景执行和工具执行
  scenario-function-call-bridge.ts

src/llm/
  scenario-sse-llm-client.ts   AI 框架 SSE 兼容客户端
  browser-fetch-llm-client.ts  OpenAI 兼容 fetch 客户端
  browser-local-llm-client.ts  浏览器本地模型客户端
  browser-scenario-planner.ts 文本 planner 兼容路径

src/system/
  scenario-system.ts           registry/runtime/planner/history 装配

src/history/
  run-history-store.ts         运行历史抽象
```

## 设计约束

- 不依赖 `@spark-view/spark-ai`，避免把待淘汰包变成新基础设施。
- 不在 `spark-scenario` 中硬编码主/子 Agent 类型；由 AI 框架通过 session 和 stream URL 决定。
- 不在前端保存 provider API Key。
- 不用旧知识猜测工具和参数；必须通过 registry 查询和 schema 校验。
- 后端工具不能被前端静默执行；必须返回 `requires-backend` 或显式失败。
- 函数名冲突必须 fail-fast。
- 货载缺失必须追问或失败，不用静默默认值掩盖问题。

## 当前状态

已完成的基础能力：

- 场景定义、注册中心、运行时、分级查询协议。
- prompt template registry 与基础分级约束。
- 本地/远程 LLM client 与文本 planner 兼容路径。
- `AiScenarioToolRegistration.execution` 执行宿主元数据。
- `function-call-contracts.ts` FC 契约。
- `createScenarioFunctionCallBridge` 工具到函数的投影与前端执行桥接。
- `createScenarioSseLlmClient` AI 框架 SSE 兼容客户端。
- 后端 FC 第一版 executor：`filterExpressionCases.query`。

后续演进方向：

- 场景注册信息入库后，后端可读取 function definitions、execution host 和 backendRoute。
- AI 框架可在服务端自动完成 backend FC、append tool result 和下一轮 LLM turn。
- 前端继续只负责人机交互和 `host='frontend'` 的 FC。

## 参考

- [API_REFERENCE.md](./API_REFERENCE.md)：按五级模型查看公开 API。
- [AI_FRAMEWORK_MIGRATION_PLAN.md](./AI_FRAMEWORK_MIGRATION_PLAN.md)：FC/SSE 迁移方案与后端执行入口记录。