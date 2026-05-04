# spark-scenario 架构说明

`spark-scenario` 是纯 TypeScript、无框架依赖的 AI 场景协议与运行时包。它不接管 AI 框架的会话、通信、滑动窗口或 provider 调度，而是把业务场景、工具、函数定义和 payload 契约整理成 AI 框架可查询、可调用、可回放的结构。

本文按五级模型解释架构边界：框架级、场景级、工具级、函数级、货载级。

## 核心结论

- 框架级负责通信和 LLM turn loop：会话 ID、主/子 Agent、function_call、function_result、append、滑动窗口都属于 AI 框架；`spark-scenario` 不拥有这些生命周期。
- 场景级负责业务知识组织：场景定义意图、提示词策略、payload 契约、过程知识、完成条件和恢复提示。
- 工具级负责能力声明：工具描述参数 schema、分类、规则、失败码、修复提示和执行宿主。
- 函数级负责 FC 投影和执行桥接：工具被投影成 AI 框架可见的 function definition，调用结果用 `callId` 回写。
- 货载级负责数据形状：用户输入、上下文、参数槽位、函数 arguments、工具结果、错误反馈和进程状态都必须有清晰结构边界。

核心语义：LLM 是业务编排者，注册信息是 LLM 的知识协议。`flow`、`completion`、`recovery` 告诉 LLM 做事时可参考的阶段、检查点和恢复方式，不是要求框架把每种业务场景都强制编译成固定计划。

## 五级架构图

```text
┌──────────────────────────────────────────────────────────────┐
│ 框架级：AI Framework / Agent Loop                             │
│ sessionId, sliding window, LLM turn loop, function routing      │
└──────────────────────────────┬───────────────────────────────┘
                               │ 投喂 function definitions / 回写 function results
┌──────────────────────────────▼───────────────────────────────┐
│ 函数级：Function Calling 协议                                  │
│ AiScenarioFunctionDefinition / Call / Result                  │
│ createScenarioFunctionCallBridge                              │
└──────────────────────────────┬───────────────────────────────┘
                               │ functionName 映射到 scenarioId + toolName
┌──────────────────────────────▼───────────────────────────────┐
│ 场景级：Scenario 注册知识                                       │
│ AiScenarioDefinition, promptPolicy, flow, recovery             │
│ createScenarioRegistry, createScenarioRuntime                  │
└──────────────────────────────┬───────────────────────────────┘
                               │ 场景包含工具，工具消费 payload/context
┌──────────────────────────────▼───────────────────────────────┐
│ 工具级：Tool 能力声明                                           │
│ AiScenarioTool, parameters, registration.execution             │
│ 当前页面模型 FC 均为 frontend tool                              │
└──────────────────────────────┬───────────────────────────────┘
                               │ 参数 schema、槽位、上下文和结果
┌──────────────────────────────▼───────────────────────────────┐
│ 货载级：Payload / Context / Arguments / Result                 │
│ AiScenarioPayloadContract, AiScenarioPayloadSlot, JsonSchema   │
└──────────────────────────────────────────────────────────────┘
```

这不是传统“上层调用下层”的单向代码依赖图，而是 AI 运行时的信息责任图。`spark-scenario` 提供场景、工具、函数和 payload 的结构；AI 框架决定何时调用、如何通信、如何继续推理。LLM 根据这些注册知识自主选择下一次 FC，工具结果再作为反馈回到 LLM。

## 层级责任详解

### 1. 框架级

框架级是 AI 主循环所在地。它决定本轮使用哪个 session、是否创建子 Agent、如何通信、如何维护滑动窗口、如何把 function result append 回会话。

`spark-scenario` 在框架级只提供适配点：

- `AiBrowserLlmClient`：统一 LLM 客户端接口。
- `createScenarioSseLlmClient`：连接 AI 框架通信流的浏览器端兼容客户端；通信细节不进入场景业务判断。
- `TIERED_QUERY_CONSTRAINT`：要求模型不猜测工具、函数和货载；需要信息时查询能力目录、schema 或工具注册。
- `buildScenarioSystemPrompt`：生成框架级基础约束和场景职责说明。

框架级不应该做的事：

- 不在浏览器保存 provider API Key。
- 不让场景应用解析 `delta/reasoning/result/error/done` 做业务决策。
- 不要求 `spark-scenario` 创建、销毁、裁剪或持久化 AI session。

框架级提示词的职责是“教 Agent 怎么使用系统”，不是写业务细节。例如：不能猜测工具、函数、参数和货载；未知字段必须通过注册查询、FC 结果或结构化反问补足。查询顺序是推荐路径，不是固定业务计划。

### 2. 场景级

场景级是业务意图和流程的所有者。一个 `AiScenarioDefinition` 描述：

- 这个场景是谁：`id`、`title`、`scope`、`description`。
- 什么时候匹配它：`intents`、`matchIntent`。
- 该场景的提示词策略：`promptPolicy`。
- 需要哪些货载数据：`payload`。
- 过程知识：`flow`。
- 兼容默认调用：`buildSteps`。
- 完成和失败如何处理：`completion`、`recovery`。
- 能调用哪些工具：`tools`。

场景级提示词不负责通信，也不应该写死 provider 协议。它只描述业务角色、业务边界、确认策略、恢复策略，以及 LLM 应如何用 tool + function + payload 检查当前进程。

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

场景级通过 registry 暴露分级查询协议。LLM 或 AI 框架可按需要查询 `queryIntentCatalog()`、`queryScenarioInfo()`、`queryScenarioTools()`、`queryToolSchemaNode()`、`queryToolRegistration()`。要求不是“每次必须先生成计划”，而是“不允许在缺少事实时猜测”；缺信息时先查询、反问或执行只读检查 FC。

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
    execution: { host: 'frontend', kind: 'tool' },
  },
}
```

执行宿主是当前 FC 迁移的关键。当前页面模型场景的 FC 全部注册为前端执行：

- `frontend`：前端执行，适合页面状态、人机交互、可视化确认、浏览器 live model。
- `backend`：协议预留和未来扩展；前端 bridge 不会执行 backend 工具，只会返回 `requires-backend` 指示。它不是当前页面模型 FC 主路径。

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

函数调用进入 bridge 后按宿主分流。当前页面模型工具均为前端函数：

- 前端函数：解析 `arguments`，调用 `runtime.run()`，返回 `status='executed'` 或 `status='failed'`。
- 后端函数：仅作为协议能力保留；前端 bridge 不执行，返回 `status='requires-backend'` 与 `backendRoute`，交由外部框架处理。
- 未注册函数或函数名冲突：fail-fast，不静默猜测。

注意：不要把 backend executor 当成当前页面模型 FC 方案的一部分。当前迁移主线是前端 bridge 承接页面模型工具执行，AI 框架负责把 function result 回灌给 LLM。

### 5. 货载级

货载级是数据结构边界。它回答“本次要带什么数据，字段从哪里来，缺失时如何追问”。

货载级包含：

- `AiScenarioContext`：页面、项目、路由、用户、metadata 等上下文。
- `AiScenarioPayloadContract`：场景运行需要补齐的 payload 槽位与 schema。
- `AiScenarioToolCall.args`：工具执行参数。
- `AiScenarioFunctionCall.arguments`：函数调用原始参数。
- `AiScenarioFunctionCallResult.result`：函数执行结果，也可以承载可恢复的业务失败、修复建议和当前进程状态。

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
| `result` | 函数/工具级 | 执行返回值、业务失败反馈、修复建议和状态摘要，由 AI 框架 append 给 LLM |

业务失败和框架失败必须分层。函数名不存在、参数无法解析、执行宿主不匹配属于框架失败；工具执行后返回的 `{ ok: false, code, msg, fix }` 属于业务反馈，应尽量作为 result 回灌给 LLM，让 LLM 自主决定 inspect、ask、retry、validate、rollback 或 commit。

## 提示词在五级中的位置

提示词不是单一大字符串，而是按层级拼装的行为约束：

| 层级 | 提示词内容 | 代码位置 |
| --- | --- | --- |
| 框架级 | 禁止猜测、按需查询注册知识、函数调用纪律、反馈必须显式 | `TIERED_QUERY_CONSTRAINT`、`buildScenarioSystemPrompt` |
| 场景级 | 场景角色、业务目标、确认/恢复策略、模板绑定 | `AiScenarioPromptPolicy`、`promptTemplateId` |
| 工具级 | 工具调用规则、示例、失败码、修复提示 | `AiScenarioToolRegistration.rules/example/failureCodes/fixHints` |
| 函数级 | function 描述、参数 schema、执行宿主 | `AiScenarioFunctionDefinition` |
| 货载级 | 字段说明、必填槽位、缺失追问文本 | `AiScenarioPayloadSlot.description/askWhenMissing` |

推荐拼装原则：框架级负责纪律，场景级负责业务身份，工具级负责调用规则，货载级负责字段语义。函数级只提供给 AI 框架，不应该再塞入大段业务提示词。提示词要鼓励 LLM 用注册知识自主编排，而不是要求框架替 LLM 固定计划。

## FC 在五级中的位置

FC 的来源是工具级，运行入口是函数级，调度所有权在框架级。

```text
工具级 AiScenarioTool
  ↓ 投影
函数级 AiScenarioFunctionDefinition
  ↓ 由 AI 框架投喂给 LLM
AI 框架收到 function_call
  ↓ 按 execution.host 分流；当前页面模型为 frontend
frontend: createScenarioFunctionCallBridge.executeFunctionCall()
backend: 返回 requires-backend 指示，非当前页面模型主路径
  ↓
AiScenarioFunctionCallResult / 后端同形结果
  ↓
AI 框架 append function result，LLM 基于成功或失败反馈继续自主编排
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

该路径用于兼容和测试，不是未来主路径。它不具备一等 function_call/function_result 回灌语义，也不代表所有业务都必须先生成计划。

### FC 主路径

未来主路径以 AI 框架和 LLM 自主编排为中心；这里描述 FC 语义，不讨论通信细节：

```text
AI 框架解析/创建 session
  ↓
读取 registry / bridge，获得 function definitions
  ↓
LLM 基于注册知识产生 function_call
  ↓
AI 框架把 function_call 交给前端 bridge；当前页面模型 FC 全部前端执行
  ↓
拿到 function result
  ↓
AI 框架 append 结果，LLM 根据 result 继续 inspect / ask / retry / validate / commit / rollback
```

`spark-scenario` 在这个路径中提供函数目录和执行桥接，但不拥有会话生命周期。

### backend 执行宿主保留语义

`execution.host='backend'` 是协议保留能力，不是当前页面模型 FC 主路径。若未来工具声明为 backend，前端 bridge 不应静默执行，只返回 `requires-backend` 和可选 `backendRoute`，由外部框架或后端 executor 接管。

示例接口形态可以是：

```http
POST /api/ai/scenario-functions/{functionName}
```

请求体包含：

- `protocolVersion: 3`
- `callId`
- `arguments`
- `context.tenantId/context.projectId`，或通过 `X-Tenant-Id`、`X-Project-Id` header 注入
- `session`，仅作为上下文，不触发自动 append

失败语义需要区分：协议错误、未知函数、路由缺失属于框架失败；工具业务失败应返回结构化 function result，并由 AI 框架 append 给 LLM 继续推理。

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
  scenario-function-call-bridge.ts 当前页面模型 FC 的前端执行桥接

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
- 当前页面模型 FC 全部在前端执行；backend host 只是协议保留和未来扩展。
- 后端工具不能被前端静默执行；若出现 backend host，必须返回 `requires-backend` 或显式失败。
- 工具业务失败应尽量作为 function result 反馈给 LLM，不要和框架级协议失败混在一起。
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
- `createScenarioSseLlmClient` AI 框架通信兼容客户端。
- 页面模型场景工具通过前端 bridge 执行。

后续演进方向：

- 强化 function result 回灌语义：业务失败、修复建议和进程状态应回到 LLM，而不是由框架替业务固定编排。
- 场景注册信息入库后，后端可读取 function definitions 和 execution host；backendRoute 仅作为未来 backend 工具调度元数据。
- 前端继续承接当前页面模型 `host='frontend'` 的 FC。

## 参考

- [API_REFERENCE.md](./API_REFERENCE.md)：按五级模型查看公开 API。
- [AI_FRAMEWORK_MIGRATION_PLAN.md](./AI_FRAMEWORK_MIGRATION_PLAN.md)：FC/SSE 迁移方案与后端执行入口记录。