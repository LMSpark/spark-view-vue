# spark-scenario API 参考

本文按五个层级说明 `@spark-view/spark-scenario` 的公开 API：框架级、场景级、工具级、函数级、货载级。读 API 时先确认对象属于哪一层，再决定由谁注册、由谁执行、由谁回写结果。

## 目录

- [五级模型速览](#五级模型速览)
- [导出概览](#导出概览)
- [框架级 API](#框架级-api)
- [场景级 API](#场景级-api)
- [工具级 API](#工具级-api)
- [函数级 API](#函数级-api)
- [货载级 API](#货载级-api)
- [端到端接入示例](#端到端接入示例)

## 五级模型速览

| 层级 | 解决的问题 | 提示词归属 | FC 归属 | 主要 API |
| --- | --- | --- | --- | --- |
| 框架级 | 会话、SSE、LLM 主循环、主/子 Agent 调度、函数目录投喂 | 分级查询约束、通用 Agent 行为约束 | 负责收集 function definitions、接收 function_call、回写 function_result | `createScenarioSystem`、`createScenarioSseLlmClient`、`AiBrowserLlmClient` |
| 场景级 | 某个业务场景能做什么、何时确认、失败如何恢复 | 场景角色、业务边界、场景模板绑定 | 不直接暴露给模型，先声明工具集合与流程 | `AiScenarioDefinition`、`createScenarioRegistry`、`createScenarioRuntime` |
| 工具级 | 场景内一个可执行能力的元数据、参数 schema、执行宿主 | 工具规则、示例、失败码、修复提示 | 工具是 FC 的来源，但不是 provider 直接调用名 | `AiScenarioTool`、`AiScenarioToolRegistration` |
| 函数级 | AI 框架可见的一等 Function Calling 协议 | 函数描述来自工具描述与 schema | function definition/call/result 的标准形态 | `createScenarioFunctionCallBridge`、`AiScenarioFunctionDefinition`、`AiScenarioFunctionCallResult` |
| 货载级 | 用户输入、上下文、参数槽位、函数 arguments/result 的结构 | payload 缺失时的追问文本、字段说明 | function arguments 是一次调用的 payload 实例 | `AiScenarioPayloadContract`、`AiScenarioPayloadSlot`、`JsonSchema` |

关键边界：

- `delta`、`reasoning`、`result`、`error`、`done` 是 AI 框架传输事件；场景应用不直接依赖这些事件做业务分支。
- `Tool` 是场景内的能力声明；`Function` 是 AI 框架可调用的协议投影。
- `Payload/货载` 不是数据库模型，也不是会话历史；它只描述本次场景运行或函数调用需要携带的数据结构。
- `spark-scenario` 不管理会话池、不裁剪滑动窗口、不保存 provider API Key。

## 导出概览

```typescript
import {
  // contracts
  type AiScenarioDefinition,
  type AiScenarioPromptPolicy,
  type AiScenarioTool,
  type AiScenarioToolRegistration,
  type AiScenarioToolExecutionRegistration,
  type AiScenarioPayloadContract,
  type AiScenarioAgentSessionContext,
  type AiScenarioFunctionDefinition,
  type AiScenarioFunctionCall,
  type AiScenarioFunctionCallResult,

  // prompt
  TIERED_QUERY_CONSTRAINT,
  buildScenarioSystemPrompt,
  createScenarioPromptTemplateRegistry,

  // runtime
  createScenarioRegistry,
  createScenarioRuntime,
  createScenarioFunctionCallBridge,

  // system
  createScenarioSystem,
  registerScenarios,

  // llm
  createBrowserFetchLlmClient,
  createBrowserLocalLlmClient,
  createBrowserScenarioPlanner,
  createScenarioSseLlmClient,

  // history
  createScenarioRunHistoryStore,
} from '@spark-view/spark-scenario'
```

## 框架级 API

框架级负责把场景能力接入 AI 主循环。它关心会话 ID、SSE 流、LLM client、function definitions 和 function result 回写，但不直接写业务工具。

### `createScenarioSystem(options)`

统一装配 registry、runtime，以及可选的 planner、prompt registry、history store。

```typescript
const system = createScenarioSystem({
  definitions: [],
  toolResolver: async (call, context) => {
    return {
      tool: call.tool,
      args: call.args,
      ok: true,
      result: { handled: true, context },
    }
  },
})
```

框架级只提供 `toolResolver` 入口；具体工具是否前端执行、是否后端执行，由工具级 `registration.execution` 决定。

### `createScenarioSseLlmClient(options)`

提供 AI 框架 SSE 的 `AiBrowserLlmClient` 兼容实现。它连接自家 AI 框架的 SSE turn 流，不连接 provider，不接收 provider API Key。

```typescript
const llm = createScenarioSseLlmClient({
  getSessionId: () => activeSessionId,
  getHeaders: () => ({
    'X-Tenant-Id': tenantId,
    'X-Project-Id': projectId,
  }),
  onEvent: (event) => {
    console.debug(event.type, event.payload)
  },
})

const response = await llm.generate({
  messages: [
    { role: 'system', content: TIERED_QUERY_CONSTRAINT },
    { role: 'user', content: '查询过滤表达式案例' },
  ],
  signal: abortController.signal,
})
```

常用选项：

| 选项 | 用途 |
| --- | --- |
| `sessionId` | 单会话面板已绑定会话时使用 |
| `getSessionId()` | 多会话前端按当前 UI 状态取会话 ID |
| `resolveSession(request)` | 由 AI 框架返回完整 `AiScenarioAgentSessionContext` |
| `streamUrlBuilder(session)` | 自定义主/子 Agent 或未来统一 endpoint |
| `requestBodyBuilder(request, session)` | 需要向新 endpoint 发送 body 时使用 |
| `headers/getHeaders` | 注入认证、租户、项目等业务 header |
| `credentials` | Cookie 鉴权场景 |
| `onEvent(event)` | 调试原始 SSE 事件 |

### `AiBrowserLlmClient`

所有 LLM 客户端都实现同一接口，planner 只依赖该接口。

```typescript
interface AiBrowserLlmClient {
  generate(request: AiBrowserLlmGenerateRequest): Promise<AiBrowserLlmGenerateResponse>
}

interface AiBrowserLlmGenerateRequest {
  messages: readonly AiBrowserLlmMessage[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}
```

`createBrowserFetchLlmClient` 和 `createBrowserLocalLlmClient` 仍可用于本地测试、OpenAI 兼容服务或浏览器本地模型；正式接 AI 框架时优先使用 `createScenarioSseLlmClient`。

### 框架级提示词

框架级提示词只描述“如何使用系统能力”，不写具体业务参数。

```typescript
const systemPrompt = buildScenarioSystemPrompt(
  '场景 Agent',
  'business',
  '必须先查询场景、工具和 schema，再生成计划或发起 function call。',
)
```

`TIERED_QUERY_CONSTRAINT` 是框架级基础约束，要求 LLM 通过 registry 查询能力，不允许猜工具、猜参数或静默降级。

## 场景级 API

场景级描述一个业务场景的身份、意图、提示词策略、payload 契约、流程、完成条件、恢复提示和工具集合。

### `AiScenarioDefinition`

```typescript
const filterCaseScenario: AiScenarioDefinition = {
  id: 'scenario.filter-expression-cases',
  title: '过滤表达式案例查询',
  scope: 'business',
  description: '帮助用户查询和理解过滤表达式案例。',
  intents: ['过滤表达式', '案例查询', 'filterExpression'],
  promptPolicy: {
    promptTemplateId: 'filter-expression-cases',
    confirmPolicy: 'auto',
    recoveryPolicy: 'strict',
  },
  payload: {
    required: ['keyword'],
    slots: [
      {
        key: 'keyword',
        description: '要查询的案例关键词。',
        required: true,
        source: 'user',
        askWhenMissing: '请提供要查询的过滤表达式关键词。',
      },
    ],
  },
  flow: {
    steps: [
      {
        id: 'query-cases',
        title: '查询过滤表达式案例',
        kind: 'tool',
        tool: 'filterExpressionCases.query',
        requiredPayloadKeys: ['keyword'],
      },
    ],
  },
  // queryCasesTool 见“工具级 API”示例。
  tools: [queryCasesTool],
}
```

场景级提示词入口：

| 字段 | 说明 |
| --- | --- |
| `promptPolicy.systemPrompt` | 静态或动态系统提示词 |
| `promptPolicy.promptTemplateId` | 绑定 prompt registry 中的模板 ID |
| `promptPolicy.promptTemplateContext` | 模板上下文，可静态给定或按 `AiScenarioContext` 生成 |
| `promptPolicy.confirmPolicy` | 执行前确认粒度 |
| `promptPolicy.recoveryPolicy` | 失败恢复策略 |

### `createScenarioRegistry(options)`

registry 是场景级能力目录和查询协议实现。

```typescript
const registry = createScenarioRegistry({ definitions: [filterCaseScenario] })

const catalog = registry.queryIntentCatalog()
const info = registry.queryScenarioInfo('scenario.filter-expression-cases')
const tools = registry.queryScenarioTools({ scenarioId: 'scenario.filter-expression-cases' })
const schemaNode = registry.queryToolSchemaNode({
  toolName: 'filterExpressionCases.query',
  pointer: '/keyword',
})
```

常用查询 API：

| API | 层级 | 用途 |
| --- | --- | --- |
| `queryIntentCatalog()` | 场景级 | 获取可匹配场景目录 |
| `queryScenarioInfo(scenarioId)` | 场景级 | 获取场景详情和工具摘要 |
| `queryScenarioPayload(scenarioId)` | 货载级 | 获取 payload 契约 |
| `queryScenarioFlow(scenarioId)` | 场景级 | 获取流程步骤 |
| `queryScenarioTools(query)` | 工具级 | 分页查询工具目录 |
| `queryToolSchema(toolName, scenarioId?)` | 工具/货载级 | 获取完整工具参数 schema |
| `queryToolSchemaNode(query)` | 货载级 | 通过 JSON Pointer 查询参数节点 |
| `queryToolRegistration(toolName, scenarioId?)` | 工具级 | 获取工具规则、示例、失败码、执行宿主 |

### `createScenarioRuntime(options)`

runtime 执行场景或单个工具。文本 planner 的兼容路径仍通过 `runtime.run()` 执行 `toolCalls`。

```typescript
const runtime = createScenarioRuntime({
  registry,
  toolResolver: async (call, context) => {
    if (call.tool === 'local-preview.open') {
      return { tool: call.tool, args: call.args, ok: true, result: { opened: true, context } }
    }
    return { tool: call.tool, args: call.args, ok: false, error: 'UNKNOWN_TOOL' }
  },
})

const result = await runtime.run({
  scenarioId: 'scenario.filter-expression-cases',
  userInput: '查询 status 字段的过滤案例',
  context: { projectId: 'project-1' },
  toolCalls: [{ tool: 'local-preview.open', args: { id: 'case-1' } }],
})
```

## 工具级 API

工具级是场景内的原子能力声明。它包含工具名、描述、参数 schema、注册规则和可选的前端执行函数。

### `AiScenarioTool`

```typescript
const queryCasesTool: AiScenarioTool = {
  name: 'filterExpressionCases.query',
  description: '按关键词、分类、分页等条件查询过滤表达式案例。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词' },
      offset: { type: 'number', minimum: 0 },
      limit: { type: 'number', minimum: 1, maximum: 100 },
    },
  },
  registration: {
    category: 'filter-expression',
    tags: ['query', 'case'],
    example: { keyword: 'status', limit: 20 },
    rules: ['执行前必须确认 tenant/project scope 已存在。'],
    failureCodes: ['UNKNOWN_FIELD', 'INVALID_FILTER_EXPRESSION'],
    fixHints: ['缺字段时先提示用户确认字段名。'],
    execution: {
      host: 'backend',
      kind: 'query',
      backendRoute: '/api/ai/scenario-functions/filterExpressionCases.query',
    },
  },
}
```

执行宿主规则：

| `execution.host` | 说明 |
| --- | --- |
| `frontend` | 前端 FC。适合页面 live model、人机确认、浏览器状态、可视化操作。允许 `tool.execute` 或 runtime `toolResolver` 本地执行。 |
| `backend` | 后端 FC。适合查询类、固定 FC、通用 prompt、服务端数据访问、未来 Agent 后端执行。前端 bridge 不直接执行。 |

`execution.kind` 用于调试和调度分类，可为 `query`、`prompt`、`tool`、`system`、`debug`。

## 函数级 API

函数级是 AI 框架看见的一等 Function Calling 协议。它把场景工具投影为 provider/Agent 可调用的函数定义，并把调用结果按 `callId` 回交给 AI 框架。

### `createScenarioFunctionCallBridge(runtime, options)`

```typescript
const bridge = createScenarioFunctionCallBridge(runtime, {
  functionNameMapper: ({ scenarioId, toolName }) => `${scenarioId}__${toolName}`.replace(/[^A-Za-z0-9_]/g, '_'),
})

const definitions = bridge.listFunctionDefinitions()
const resolution = bridge.resolveFunctionName(definitions[0].name)
const fcResult = await bridge.executeFunctionCall({
  id: 'call-1',
  name: definitions[0].name,
  arguments: JSON.stringify({ keyword: 'status', limit: 20 }),
  userInput: '查询 status 的案例',
  context: { projectId: 'project-1' },
  session: { sessionId: 'session-1' },
})
```

函数定义：

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

函数调用：

```typescript
interface AiScenarioFunctionCall {
  id: string
  name: string
  arguments?: unknown
  userInput?: string
  context?: Omit<AiScenarioContext, 'userInput'>
  session?: AiScenarioAgentSessionContext
}
```

函数结果：

```typescript
interface AiScenarioFunctionCallResult {
  callId: string
  functionName: string
  ok: boolean
  status: 'executed' | 'requires-backend' | 'failed'
  executionHost: 'frontend' | 'backend'
  scenarioId?: string
  toolName?: string
  backendRoute?: string
  result?: unknown
  error?: string
  raw?: unknown
}
```

状态语义：

| 状态 | 说明 |
| --- | --- |
| `executed` | 前端 bridge 已执行工具，并返回结果。 |
| `requires-backend` | 该工具声明为后端执行；前端 bridge 只返回路由指示。 |
| `failed` | 参数解析、函数未注册、工具执行或后端业务执行失败。 |

后端 FC 第一版接口约定：

```http
POST /api/ai/scenario-functions/{functionName}
```

对 `host='backend'` 的工具，`backendRoute` 是后端执行入口的权威来源。provider 侧 `AiScenarioFunctionDefinition.name` 可能经过 mapper 规避命名限制，不一定等于后端 executor 支持的 `{functionName}`。

```json
{
  "protocolVersion": 3,
  "callId": "call-1",
  "arguments": { "keyword": "status", "limit": 20 },
  "context": { "tenantId": "tenant-1", "projectId": "project-1" },
  "session": { "sessionId": "session-1" }
}
```

后端 executor 只执行函数并返回结果，不自动 append 会话消息；append、滑动窗口和下一轮 turn 仍由 AI 框架负责。

## 货载级 API

货载级也称 Payload/载荷级，描述一次场景运行或函数调用需要携带的数据结构。它覆盖三类对象：

1. `AiScenarioContext`：运行上下文，如 `projectId`、`pageId`、`user`、`metadata`。
2. `AiScenarioPayloadContract`：场景级 payload 契约，声明槽位、schema、必填字段、追问文本。
3. `AiScenarioFunctionCall.arguments`：函数级一次调用的实际参数值。

### `AiScenarioPayloadContract`

```typescript
const payload: AiScenarioPayloadContract = {
  description: '过滤表达式案例查询输入。',
  schema: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词' },
      category: { type: 'string', description: '案例分类' },
      limit: { type: 'number', minimum: 1, maximum: 100 },
    },
    required: ['keyword'],
  },
  required: ['keyword'],
  slots: [
    {
      key: 'keyword',
      label: '关键词',
      description: '用于搜索案例名称、说明或表达式内容。',
      required: true,
      source: 'user',
      askWhenMissing: '请提供要查询的关键词。',
      examples: ['status', '日期范围', '金额大于'],
    },
  ],
}
```

货载级字段来源：

| `source` | 说明 |
| --- | --- |
| `user` | 来自用户自然语言输入或追问回复 |
| `context` | 来自页面、项目、路由、用户等上下文 |
| `tool` | 来自前一个工具的执行输出 |
| `system` | 来自系统默认值或 AI 框架注入值 |

Payload 与 function arguments 的区别：

| 对象 | 生命周期 | 用途 |
| --- | --- | --- |
| `payload` | 场景运行级 | 承载一次场景运行的已补齐业务数据 |
| `tool.args` | 工具执行级 | 给某个工具的一次执行参数 |
| `function.arguments` | 函数调用级 | provider/Agent 发起 FC 时携带的原始参数，可为对象或 JSON 字符串 |
| `context` | 框架/运行级 | 承载页面、项目、用户、会话相关但不属于业务参数的数据 |

## 端到端接入示例

下面示例展示五级对象如何串起来：

```typescript
const scenario: AiScenarioDefinition = {
  id: 'scenario.filter-expression-cases',
  title: '过滤表达式案例查询',
  scope: 'business',
  intents: ['过滤表达式案例'],
  promptPolicy: {
    promptTemplateId: 'filter-expression-cases',
    confirmPolicy: 'auto',
    recoveryPolicy: 'strict',
  },
  payload: {
    required: ['keyword'],
    slots: [{ key: 'keyword', description: '查询关键词', required: true, source: 'user' }],
  },
  tools: [queryCasesTool],
}

const registry = createScenarioRegistry({ definitions: [scenario] })
const runtime = createScenarioRuntime({
  registry,
  toolResolver: async (call) => ({ tool: call.tool, args: call.args, ok: false, error: 'BACKEND_ONLY' }),
})
const bridge = createScenarioFunctionCallBridge(runtime)

const functions = bridge.listFunctionDefinitions()

// AI 框架把 functions 投喂给 LLM。LLM 返回 function_call 后：
const result = await bridge.executeFunctionCall({
  id: 'call-1',
  name: functions[0].name,
  arguments: { keyword: 'status', limit: 20 },
  userInput: '查询 status 过滤表达式案例',
  context: { projectId: 'project-1' },
  session: { sessionId: 'session-1' },
})

if (result.status === 'requires-backend') {
  // 调用方转交 AI 框架或后端 executor：
  // 优先使用 result.backendRoute；第一版内置后端函数为 filterExpressionCases.query。
}
```

推荐接入顺序：

1. 先定义场景级 `AiScenarioDefinition`，明确 `promptPolicy`、`payload`、`flow`。
2. 再定义工具级 `AiScenarioTool`，补齐 `parameters` 和 `registration.execution`。
3. 用 `createScenarioFunctionCallBridge` 生成函数级 definitions。
4. AI 框架负责把 definitions 交给 LLM，并处理 function_call/function_result 主循环。
5. 前端只执行 `host='frontend'` 的 FC；`host='backend'` 交给后端 executor。

更多设计背景见 [ARCHITECTURE.md](./ARCHITECTURE.md)。