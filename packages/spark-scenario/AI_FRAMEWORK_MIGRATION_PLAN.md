# spark-scenario AI 框架化与 FC/SSE 迁移方案

> 记录日期：2026-05-04
>
> 本文用于固化本轮关于 `spark-scenario`、AI 框架、FC、SSE、会话 ID 与逐步淘汰 `packages/spark-ai` 的讨论结论，便于检查、评审和持续开发。

## 1. 背景与目标

当前 `packages/spark-scenario` 已具备场景注册、分级查询、运行时执行、LLM planner 与历史记录能力。现有 LLM 接口以 `AiBrowserLlmClient.generate()` 为核心，planner 通过文本 JSON 规划 `scenarioId` 和 `toolCalls`。

当前 `packages/spark-ai` 承担了较多 AI 前端职责，包括 SSE 传输、会话后端客户端、stills / FC 编排、提示词、目录和编辑链路。后续目标是逐步淘汰 `packages/spark-ai`，将 AI 框架主线迁移到更清晰的分层：

- AI 框架负责主会话、子会话、Agent 调度、SSE 通信、滑动窗口、LLM 主循环、后端 FC 和查询类 FC。
- `spark-scenario` 负责场景协议、场景注册、能力目录、工具/函数定义、前端 FC 执行桥接和人机交互相关能力。
- 前端应用只知道当前会话 ID 或 AI 框架分配的会话上下文，不负责创建会话、裁剪窗口、追加历史或销毁会话。

第一期目标：只在 `packages/spark-scenario` 内落地面向未来 AI 框架的 FC/SSE 协议与迁移基础，不修改 `packages/spark-ai`、`spark-ai-server`、根应用或其它包。

第二期目标：在不重新引入 `packages/spark-ai` 依赖的前提下，补齐 `spark-ai-server` 的后端 FC 执行入口，让 `host='backend'` 的查询类 FC 可以真实运行。第二期方案见第 12 节。

## 2. 已确认的代码事实

### 2.1 spark-scenario 现状

- `src/contracts/llm-contracts.ts` 定义 `AiBrowserLlmClient.generate()`，返回 `{ text, raw? }`。
- `src/llm/browser-scenario-planner.ts` 当前执行两段式规划：先让 LLM 选 `scenarioId`，再让 LLM 输出 JSON 格式 `toolCalls`。
- `src/runtime/scenario-runtime.ts` 已能根据 `AiScenarioRunRequest` 执行场景工具。
- `src/runtime/scenario-registry.ts` 已提供分级查询协议，如 `queryIntentCatalog`、`queryScenarioInfo`、`queryToolSchemaNode`、`queryToolRegistration`。

### 2.2 spark-ai / 后端现状

- `packages/spark-ai/src/core/session/session-backend.ts` 已实现基于 `/api/ai/sessions` 的 SSE 会话客户端。
- 后端 `/api/ai/sessions/{sessionId}/turn/stream` 会发送 `delta`、`reasoning`、`result`、`error`、`done`。
- 后端 `/api/ai/chat/stream` 是通用聊天 SSE，主要累积 `delta`，没有强制 `result` 语义。
- 当前后端 session 接口使用 `protocolVersion=3`。

## 3. 总体设计原则

### 3.1 不依赖待淘汰包

`spark-scenario` 不新增对 `@spark-view/spark-ai` 的依赖。即使兼容现有 `spark-ai-server` SSE 协议，也应在 `spark-scenario` 内实现协议适配，避免把待淘汰包变成新的基础依赖。

### 3.2 前端不负责供应商密钥

浏览器端不得接收或保存 OpenAI、DeepSeek 等 provider API Key。前端只请求自家后端或 AI 框架入口。供应商密钥只应存在于后端环境变量、Secret 或服务端配置中。

`createScenarioSseLlmClient` 不应提供 `apiKey` 选项。可支持：

- `getHeaders()`：注入用户鉴权、租户、项目等业务 header。
- `credentials`：支持 HttpOnly Cookie 场景。

### 3.3 会话 ID 由 AI 框架维护

`spark-scenario` 不创建、不销毁、不管理会话池，也不理解滑动窗口或历史裁剪。它只接受 AI 框架分配的会话上下文。

可接受入口：

- 固定 `sessionId`。
- `getSessionId(request)` 动态返回当前会话 ID。
- `resolveSession(request)` 返回完整会话上下文，如 `sessionId`、`requestId`、`turnId`、`agentId`、`parentSessionId`、`streamUrl`。

当无法解析会话 ID 时必须 fail-fast。

### 3.4 按 Copilot 式主/子 Agent 思路抽象

主会话与子会话由 AI 框架负责。`spark-scenario` 不内建 `main/sub` 枚举，不自行判断是否子会话。

建议通过：

- `resolveSession(request)`：由 AI 框架决定使用哪个 session。
- `streamUrlBuilder(session, request)`：由 AI 框架决定最终请求 URL。

这样既可兼容当前 `/api/ai/sessions/{sessionId}/turn/stream`，也可支持未来子 Agent 的 `/generate/stream`、`/agent/stream` 或其它协议入口。

### 3.5 场景应用只关心 FC

`delta`、`reasoning`、`result`、`error`、`done` 属于 AI 框架传输层事件。场景应用不应直接判断这些底层事件。

场景应用真正关心的是：

- LLM/Agent 要调用哪个 function。
- function 参数是什么。
- 该 function 应由前端还是后端执行。
- 执行结果如何回写给 AI 框架。

因此未来主路径应从“LLM 输出 JSON toolCalls”升级为“FC 是一等协议”。现有文本 JSON planner 只作为过渡兼容层保留。

## 4. 本轮讨论形成的关键决策

| 主题 | 结论 |
| --- | --- |
| 目标 | 最终淘汰 `packages/spark-ai`，不让 `spark-scenario` 依赖它 |
| 默认 SSE 后端 | 兼容当前 `/api/ai/sessions/*`，必要时兼容 `/api/ai/chat/stream` |
| 新客户端命名 | `createScenarioSseLlmClient`，不在名称里绑定 `spark-ai` |
| 认证安全 | 只请求自家后端；支持 `getHeaders()` 和 `credentials`；不提供 provider `apiKey` |
| 会话管理 | AI 框架维护会话 ID；`spark-scenario` 不创建/销毁/append/裁剪窗口 |
| 多会话 | 支持固定 `sessionId` 与动态 `getSessionId` / `resolveSession` |
| 主/子 Agent | 不在 client 内建枚举；由 AI 框架通过 session/URL 决定 |
| SSE 事件 | 兼容当前事件与未来统一信封；底层事件交给 AI 框架处理 |
| 场景关注点 | 场景应用关注 FC，不直接关心 `delta/reasoning/result/error/done` |
| 第一版范围 | 一次性建立协议、SSE client、FC bridge、测试与导出，后续迭代完善 |
| 执行宿主 | 在工具注册里声明前端或后端执行 |
| 后期注册 | 场景注册未来可入库，所以注册信息应尽量可序列化 |

## 5. FC 执行宿主设计

### 5.1 工具注册扩展

计划在 `AiScenarioToolRegistration` 中增加 `execution` 元数据：

```ts
export type AiScenarioToolExecutionHost = 'frontend' | 'backend'

export type AiScenarioToolExecutionKind =
  | 'query'
  | 'prompt'
  | 'tool'
  | 'system'
  | 'debug'

export interface AiScenarioToolExecutionRegistration {
  host: AiScenarioToolExecutionHost
  kind?: AiScenarioToolExecutionKind
  debugHostOverride?: AiScenarioToolExecutionHost
  backendRoute?: string
}

export interface AiScenarioToolRegistration {
  category?: string
  tags?: readonly string[]
  example?: Record<string, unknown>
  rules?: readonly string[]
  failureCodes?: readonly string[]
  fixHints?: readonly string[]
  execution?: AiScenarioToolExecutionRegistration
}
```

### 5.2 字段语义

- `host: 'frontend'`：前端执行。典型场景包括人机交互、页面 live model、浏览器状态、可视化确认、前端运行态读写。
- `host: 'backend'`：后端执行。典型场景包括查询类 FC、固定 FC、通用提示词、数据库或服务端能力、未来真正 Agent 能独立执行的工具。
- `kind`：给 Agent、调试台和运行策略分类，如 `query`、`prompt`、`tool`、`system`、`debug`。
- `debugHostOverride`：调试阶段的宿主覆盖元数据。是否启用由 AI 框架或调试台决定，`spark-scenario` 不应偷偷切换。
- `backendRoute`：后端执行路由或路由 ID。未来场景注册入库后，该字段可成为后端 Agent 的调度入口。

### 5.3 默认行为

- 未声明 `execution` 的旧工具默认视为 `frontend`，保持兼容现有 `tool.execute`。
- `host='frontend'` 的工具允许由前端 bridge 调用本地 `tool.execute`。
- `host='backend'` 的工具第一版不在前端执行；若 AI 框架要求前端 bridge 执行，应返回结构化的“需要后端执行”结果或 fail-fast。
- `host='backend'` 但缺少 `backendRoute` 时，应在 function definition 中标记不可直接前端执行，并在需要前端执行时 fail-fast。

## 6. 计划新增的核心 API

### 6.1 createScenarioSseLlmClient

职责：为过渡期提供 `AiBrowserLlmClient` 兼容实现，让现有 planner 能通过 AI 框架 SSE 获取最终文本结果。

关键能力：

- 不接受 provider key。
- 支持 `getHeaders()` 与 `credentials`。
- 支持 `sessionId`、`getSessionId()`、`resolveSession()`。
- 支持 `streamUrlBuilder()`，避免在 `spark-scenario` 中写死主/子 Agent 协议。
- 兼容当前 `delta/reasoning/result/error/done`。
- 支持未来统一事件信封。
- 最终返回 `{ text, raw }` 给现有 `AiBrowserLlmClient` 消费者。

### 6.2 function-call-contracts

职责：新增 FC 一等协议类型，不再只依赖文本 JSON 规划。

当前已落地类型摘录：

```ts
export interface AiScenarioAgentSessionContext {
  sessionId: string
  requestId?: string
  turnId?: string
  agentId?: string
  parentSessionId?: string
  streamUrl?: string
  metadata?: Record<string, unknown>
}

export interface AiScenarioFunctionDefinition {
  name: string
  description: string
  parameters?: JsonSchema
  scenarioId?: string
  toolName?: string
  execution: AiScenarioToolExecutionRegistration
}

export interface AiScenarioFunctionCall {
  id: string
  name: string
  arguments?: unknown
  userInput?: string
  context?: Omit<AiScenarioContext, 'userInput'>
  session?: AiScenarioAgentSessionContext
}

export type AiScenarioFunctionCallStatus = 'executed' | 'requires-backend' | 'failed'

export interface AiScenarioFunctionCallResult {
  callId: string
  functionName: string
  ok: boolean
  status: AiScenarioFunctionCallStatus
  executionHost: AiScenarioToolExecutionHost
  scenarioId?: string
  toolName?: string
  backendRoute?: string
  result?: unknown
  error?: string
  raw?: unknown
}
```

### 6.3 scenario-function-call-bridge

职责：把 `runtime.registry` 中的场景工具投影成 AI 框架可调用的 function definitions，并桥接前端可执行 FC。

关键行为：

- 从 `AiScenarioToolRegistration.execution` 读取执行宿主。
- 生成 `functionName -> { scenarioId, toolName }` 映射。
- 工具名需要经过 mapper，避免 provider 函数名限制或跨场景工具名冲突。
- 对冲突 fail-fast，不静默覆盖。
- `frontend` 工具可调用本地 `tool.execute`。
- `backend` 工具不在前端执行，返回后端执行指示或 fail-fast。

## 7. 第一期实施范围

第一期只修改 `packages/spark-scenario`：

1. 扩展场景工具注册类型，加入 `registration.execution`。
2. 新增 FC 契约文件。
3. 新增 `createScenarioSseLlmClient`。
4. 新增 `scenario-function-call-bridge`。
5. 更新 `index.ts` 导出。
6. 增加针对性测试。
7. 保留现有 `browser-fetch-llm-client`、`browser-local-llm-client`、`browser-scenario-planner`，不破坏原有路径。

不做：

- 不修改 `packages/spark-ai`。
- 不修改 `spark-ai-server`。
- 不修改根应用 `src`。
- 不引入 `@spark-view/spark-ai` 依赖。
- 不把 provider API Key 放入浏览器端。
- 不让 `spark-scenario` 创建、销毁或维护会话池。

## 8. 第一期建议实施步骤

1. 修改 `src/contracts/scenario-types.ts`：补充执行宿主相关类型与 `registration.execution`。
2. 新增 `src/contracts/function-call-contracts.ts`：定义 FC、会话上下文、统一事件信封和结果类型。
3. 新增 `src/llm/scenario-sse-llm-client.ts`：实现 AI 框架 SSE 兼容 LLM client。
4. 新增 `src/runtime/scenario-function-call-bridge.ts`：实现 registry 到 function definition 的投影与前端执行桥接。
5. 更新 `src/index.ts`：按 contracts -> runtime -> llm 顺序导出新增类型和函数。
6. 增加测试：覆盖 session 解析、SSE 事件解析、FC definition 投影、执行宿主策略、冲突检测、后端工具前端执行拒绝。
7. 运行 `pnpm run typecheck` 与针对性 Vitest。

## 9. 第一期验证计划

在 `packages/spark-scenario` 内运行：

```powershell
Set-Location D:\SPARK_VIEW\packages\spark-scenario
pnpm run typecheck
pnpm run lint
pnpm exec vitest run src/tests/scenario-sse-llm-client.test.ts src/tests/scenario-function-call-bridge.test.ts --reporter verbose
```

必要时在仓库根目录运行：

```powershell
Set-Location D:\SPARK_VIEW
pnpm run typecheck
```

## 10. 第一期风险与注意事项

- 当前 `/api/ai/sessions/{sessionId}/turn/stream` 无 body；如果 AI 框架没有提前把本轮输入写入会话，单独调用该端点无法完成生成。这符合本方案边界：前端不负责通信过程。
- 统一事件信封后端暂未实现；第一版只能做到“兼容当前事件 + 为未来信封预留解析结构”。
- 第一期 `backendRoute` 只作为可序列化元数据落地；第二期第一版已收敛为 `/api/ai/scenario-functions/{functionName}`，详见第 12 节。
- `host='backend'` 的工具不应被前端误执行。实现时必须 fail-fast 或返回明确的后端执行指示。
- 现有文本 JSON planner 与未来 FC planner 会短期并存。文档和导出应明确：FC 是未来主路径，text-json 是兼容路径。

## 11. 当前评审状态

本文件已从讨论方案更新为本期实施记录。当前已在 `packages/spark-scenario` 内完成：

- `src/contracts/scenario-types.ts`：增加工具执行宿主与执行类别元数据。
- `src/contracts/function-call-contracts.ts`：新增 FC、会话上下文、SSE 事件信封和 FC 结果契约。
- `src/runtime/scenario-function-call-bridge.ts`：新增 registry -> function definitions 投影与前端 FC 执行桥接。
- `src/llm/scenario-sse-llm-client.ts`：新增不依赖 `spark-ai` 的 AI 框架 SSE LLM client。
- `src/contracts/llm-contracts.ts`：为 `generate()` 请求增加可选 `signal`。
- `src/llm/browser-fetch-llm-client.ts`：透传 `signal` 到底层 fetch。
- `src/index.ts`：按 contracts -> runtime -> llm 顺序导出新增 API。
- `src/tests/scenario-function-call-bridge.test.ts` 与 `src/tests/scenario-sse-llm-client.test.ts`：覆盖本期 FC/SSE 行为。

本期已验证通过：

```powershell
Set-Location D:\SPARK_VIEW\packages\spark-scenario
pnpm run typecheck
pnpm run lint
pnpm exec vitest run src/tests/scenario-sse-llm-client.test.ts src/tests/scenario-function-call-bridge.test.ts --reporter verbose
```

注意：第一期仍未修改 `packages/spark-ai`、`spark-ai-server`、根应用或其它包。后续可在此基础上继续推进 FC planner、后端固定 FC 注册与后端 Agent 执行协议。

## 12. 后端 FC 执行入口补充方案

> 记录日期：2026-05-04
>
> 本节记录在 `spark-scenario` FC/SSE 基础完成后，为了让 `host='backend'` 的工具真正可运行而补齐 `spark-ai-server` 的后端变更方案。该方案不改变 `packages/spark-ai`，也不把 `spark-scenario` 绑定回 `packages/spark-ai`。

### 12.1 已确认的后端代码事实

- 现有 `/api/ai/sessions` 负责会话、turn、SSE stream、append 和 conversation。
- 现有后端可以把 tools 透传给 LLM，也可以解析 provider 返回的 `tool_calls`。
- 现有后端尚没有按 function name 执行 backend FC 的 executor。
- 现有 `FilterExpressionCaseService.queryCases(tenantId, projectId, query)` 已提供可复用的租户/项目 scoped 查询能力。

### 12.2 本轮确认的接口形态

新增后端 FC 执行入口：

```http
POST /api/ai/scenario-functions/{functionName}
```

请求体采用和 `AiScenarioFunctionCall` 接近的扁平结构，由路径提供 `functionName`。这里的 `context` 是后端 FC 请求上下文，允许携带 `tenantId`；它不是严格等同于 `spark-scenario` 当前的 `AiScenarioContext`：

```json
{
  "protocolVersion": 3,
  "callId": "call-1",
  "arguments": {},
  "context": {
    "tenantId": "tenant-1",
    "projectId": "project-1"
  },
  "session": {
    "sessionId": "session-1"
  }
}
```

`protocolVersion` 必须为 `3`。缺失、类型错误或版本不匹配时直接返回 HTTP 400，不进入函数执行。

### 12.3 tenant/project 上下文规则

后端 FC 第一版采用 header 优先、body 兜底：

1. 优先读取 `X-Tenant-Id` 和 `X-Project-Id`。
2. header 缺失时读取 `context.tenantId` 和 `context.projectId`。
3. 任一值缺失或为空字符串时返回 HTTP 400。
4. 如果 header 与 body 同时存在，本轮以 header 为准，不做静默合并。

这样可以兼容未来统一 AI 框架通过 HTTP scope 注入租户/项目，也能兼容当前 FC body 内携带上下文的调用方式。

### 12.4 首批内置后端函数

本轮只内置一个后端函数，函数名必须精确匹配：

```text
filterExpressionCases.query
```

执行规则：

- `{functionName}` 只接受 `filterExpressionCases.query`。
- `arguments` 整体就是 query 对象，不再额外读取 `arguments.query`。
- executor 调用 `FilterExpressionCaseService.queryCases(tenantId, projectId, arguments)`。
- 函数名不支持 kebab-case、双下划线或其它别名，错误名称直接返回 HTTP 404 `UNKNOWN_FUNCTION`。

### 12.5 响应形态与失败语义

成功响应采用 `AiScenarioFunctionCallResult` 风格：

```json
{
  "callId": "call-1",
  "functionName": "filterExpressionCases.query",
  "ok": true,
  "status": "executed",
  "executionHost": "backend",
  "result": {
    "rows": [],
    "total": 0
  }
}
```

失败策略分三类：

- 协议版本错误、缺少 tenant/project、请求结构错误：返回 HTTP 400，并使用明确错误码与 message。
- 未知函数名：返回 HTTP 404 `UNKNOWN_FUNCTION`。
- 已进入函数执行但业务查询抛错：返回 HTTP 200，body 中 `ok=false`、`status='failed'`、`executionHost='backend'`，由 AI 框架按 `callId` 回填工具结果。

函数执行失败响应示例：

```json
{
  "callId": "call-1",
  "functionName": "filterExpressionCases.query",
  "ok": false,
  "status": "failed",
  "executionHost": "backend",
  "error": "过滤值表达式引用了不存在的字段 \"missingField\""
}
```

### 12.6 会话边界

本轮后端 FC endpoint 不自动追加 tool result 到 AI session。

原因：

- AI 框架仍然是会话、滑动窗口、append 和下一轮 turn 的唯一所有者。
- FC executor 只负责执行一个函数并返回结果。
- 调用方拿到结果后，继续通过现有 `/api/ai/sessions/{sessionId}/append` 回写 assistant/tool 消息。

后续如果要支持真正后端 Agent loop，可以再新增显式选项或独立 endpoint，例如 `autoAppend=true`、session-aware function endpoint 或 turn 内部自动执行 backend FC。本轮不混入该职责。

### 12.7 已实施后端文件

第二期已按最小实现边界落地：

1. `spark-ai-server/src/main/java/com/spark/ai/service/ScenarioFunctionExecutionService.java`：负责函数名 dispatch、scope 解析后的业务执行、FC result 构造。
2. `spark-ai-server/src/main/java/com/spark/ai/controller/ScenarioFunctionController.java`：暴露 `/api/ai/scenario-functions/{functionName}`，负责 protocolVersion、callId、context、header 校验。
3. `spark-ai-server/src/test/java/com/spark/ai/controller/ScenarioFunctionControllerTest.java`：覆盖协议错误、缺 scope、未知函数、成功 query、header 优先、函数执行失败。
4. `spark-ai-server/src/test/java/com/spark/ai/service/FilterExpressionCaseServiceTest.java`：复用既有底层 query service 测试，确认远端过滤语义没有被包装层破坏。

本轮不修改：

- `packages/spark-ai`。
- `packages/spark-scenario` 的运行时代码。
- 根应用 `src`。
- 现有 `/api/ai/sessions` 的会话行为。

### 12.8 后端验证结果

已在 `spark-ai-server` 内运行聚焦验证：

```powershell
Set-Location D:\SPARK_VIEW\spark-ai-server
mvn "-Dtest=ScenarioFunctionControllerTest,FilterExpressionCaseServiceTest" test
```

验证结果：

- `ScenarioFunctionControllerTest`：7 tests passed。
- `FilterExpressionCaseServiceTest`：4 tests passed。
- Maven 总计：11 tests, 0 failures, 0 errors, BUILD SUCCESS。

完成后检查 Git 变更范围，确认本轮只包含：

- 本节 Markdown 记录。
- 后端 FC executor/controller/test 相关文件。
- 与本轮实现直接相关的最小改动。

### 12.9 后续演进方向

- 将场景注册信息入库后，后端可从数据库读取 function definition、execution host、kind、backendRoute。
- 后端可支持更多固定 FC，如通用 prompt、系统查询、调试工具和真正 Agent 子任务。
- AI 框架可在 turn 内自动处理 backend FC，并在服务端完成 assistant/tool result append 与下一轮 LLM 调用。
- 前端仍只负责人机交互和前端 FC；后端 FC 与会话通信过程对场景应用保持透明。
