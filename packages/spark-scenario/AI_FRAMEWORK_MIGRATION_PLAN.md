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

## 13. 页面 4 文件编辑注册制替换方案

> 记录日期：2026-05-04
>
> 本节记录“将旧 `packages/spark-ai` 页面 4 文件编辑链路，按 `spark-scenario` 注册制重新实现”的确认方案。该方案不以兼容旧 Stills 为目标，而是建立可 UI / 无 UI 运行的新闭环，并继续服务最终淘汰 `packages/spark-ai` 的目标。

### 13.1 本期目标

直接替换旧页面模型级 AI 编辑链路：

- 页面 4 文件编辑运行时不再依赖 `@spark-view/spark-ai`。
- UI 与无 UI/headless 都通过同一套场景、流程、函数与会话框架运行。
- `edit.*` 作为流程控制函数族，不再写死某个固定 bootstrap 顺序。
- `sparkNodeTree.*`、`datasetTool.*`、`textModel.*` 作为同一 `PageModelHost` 实例上的实际操作函数。
- 所有 `PageModelHost` 实例按 `tenantId + projectId + pageId + sessionId` 隔离。
- Headless 模式必须按注册流程完成校验与提交，最终强制导出落盘；未完成提交即视为本次运行失败。

### 13.2 不兼容策略

本期采用“不破不立”的策略：

- 不做旧 Stills 运行时兼容层。
- 不保留页面编辑链路对 `packages/spark-ai` 的运行时依赖。
- 继续使用 `edit.*`、`sparkNodeTree.*`、`datasetTool.*`、`textModel.*` 这些函数名，是因为它们的领域语义清晰；它们在新方案中是正式注册函数名，不是旧系统兼容别名。

旧命名空间的新语义：

| 命名空间 | 新方案职责 |
| --- | --- |
| `edit.*` | 流程控制、反问、需求确认、校验、提交、回滚、导出 |
| `sparkNodeTree.*` | `rule.json` 的页面节点树操作 |
| `datasetTool.*` | `pagedata.json` 的 DataSet / DataView 操作 |
| `textModel.*` | `script.js` / `style.css` 文本读写 |

### 13.3 PageModelHost

新增 `PageModelHost` 作为页面 4 文件编辑的统一执行实例。所有工具和函数必须作用在同一个 host 实例上，禁止各工具自行创建模型副本。

Host key：

```ts
export interface PageModelHostKey {
  tenantId: string
  projectId: string
  pageId: string
  sessionId: string
}
```

第一版建议能力边界：

```ts
export interface PageModelHost {
  readonly key: PageModelHostKey
  readonly mode: 'ui' | 'headless'
  getNodeTree(): unknown
  setNodeTree(next: unknown): void
  getDataSetTool(): unknown
  setDataSetTool(next: unknown): void
  readScript(): string
  writeScript(content: string): void
  readStyle(): string
  writeStyle(content: string): void
  getFlowState(): PageModelFlowState
  setFlowState(next: PageModelFlowState): void
  getRequirements(): PageModelRequirements | null
  setRequirements(next: PageModelRequirements): void
  validate(): PageModelValidationResult
  commit(): Promise<PageModelCommitResult>
}
```

说明：

- `spark-scenario` 核心框架仍保持干净。
- 页面编辑能力放在 `spark-scenario/page-model` 子入口；该子入口允许引入 `spark-component` / `spark-data` 相关适配。
- UI 模式 host 由 DevSystem 4 文件 `documents` 适配，写操作只更新 live model，不强制保存。
- Headless 模式 host 由内存或文件实现承载；流程完成后必须事务式导出落盘。

### 13.4 Host 实例管理

新增 `PageModelHostRegistry`，按 `PageModelHostKey` 管理实例：

- 同一个 `tenantId + projectId + pageId + sessionId` 下所有 FC 共享同一个 host。
- 任一维度变化都视为不同实例，避免跨租户、跨项目、跨页面、跨会话污染。
- registry 不负责 LLM 会话历史裁剪；它只负责业务模型 host 生命周期。
- host 可以由 UI、内存、文件、API 或未来后端 Agent 注入。

### 13.5 流程注册与 edit.*

框架不能写死 `bootstrap`。流程必须通过注册机制表达，`edit.*` 只提供流程控制函数与可编排节点。

第一版流程函数建议：

| 函数 | 职责 |
| --- | --- |
| `edit.open` | 绑定或创建当前 `PageModelHost`，读取当前 4 文件事实 |
| `edit.inspect` | 汇总当前页面模型、已确认需求、flow state 与关键风险 |
| `edit.ask` | 当用户意图不足时发起结构化反问 |
| `edit.confirmRequirements` | 将反问或模型判断得到的具体业务需求与限制写入 host + session store |
| `edit.validate` | 校验当前 4 文件模型、DataKey、script/style 基本约束和流程完成度 |
| `edit.commit` | Headless 模式事务式落盘；UI 模式只标记流程已提交或交由 UI 保存 |
| `edit.rollback` | 回滚本次未提交变更，主要服务 headless 和失败恢复 |

流程注册示例语义：

1. `edit.open` 必须在任何写工具前完成。
2. 意图缺失时优先 `edit.ask`，不得猜测业务约束。
3. 写入前必须读取相关模型事实和函数规格。
4. Headless 模式结束前必须 `edit.validate` + `edit.commit`。
5. `edit.commit` 失败时必须保持 4 文件原子性，不允许部分写入。

### 13.6 场景注册知识体系

这里回到注册制。注册不是运行时工具清单，而是给 LLM 查询和编排的知识体系；工具只是承载这些注册项执行的运行载体。场景提示词也是注册内容，不能在框架写死。

| 注册级别 | 责任 |
| --- | --- |
| 场景级 | 页面模型编辑场景的身份、边界、意图、系统规则和场景提示词 |
| 流程级 | 可编排流程节点、关键步骤、闭合要求 |
| 荷载级 | host key、requirements、SparkNode、Vue 组件 props、DataSet、文本内容等可传递数据结构 |
| 工具级 | `edit` / `sparkNodeTree` / `datasetTool` / `textModel` 运行载体，以及其下可执行函数/action |

荷载级必须完整注册：`SparkNode.props` 不是普通任意对象，它承载大量 Vue 组件属性。具体 props 字段必须来自 component catalog / `catalog.guide`，不能由模型凭经验猜测。`sparkNodeTree.addNode`、`sparkNodeTree.setProps` 等函数只是消费这些荷载的运行入口。

具体业务需求和限制不作为静态注册项表达。场景提示词必须要求 LLM 不假设、不猜测；不清楚时先查询 `edit.ask` 的工具注册和参数 schema，再按 `reason/questions/id/prompt/options/allowFreeform` 货载调用 `edit.ask` 反问用户，最后由 `edit.confirmRequirements` 固化为 requirements 货载。

### 13.7 框架层会话缓存

历史会话、滑动窗口、缓存属于框架层职责，无论有无 UI 都必须可用。UI 只知道会话 ID，并消费事件展示。

第一版新增可插拔 `AiScenarioSessionStore`：

```ts
export interface AiScenarioSessionStore {
  get(sessionKey: AiScenarioSessionKey): Promise<AiScenarioSessionState | undefined>
  set(sessionKey: AiScenarioSessionKey, state: AiScenarioSessionState): Promise<void>
  appendMessage(sessionKey: AiScenarioSessionKey, message: AiScenarioMessage): Promise<void>
  appendFunctionResult(sessionKey: AiScenarioSessionKey, result: AiScenarioFunctionCallResult): Promise<void>
  clear(sessionKey: AiScenarioSessionKey): Promise<void>
}
```

缓存内容：

- 框架消息历史。
- 已确认的 requirements。
- FC 调用结果。
- flow state。
- 会话状态与可恢复信息。

不缓存内容：

- 不缓存完整 4 文件快照。
- 4 文件当前事实仍由 `PageModelHost` 或其背后的文件/API/DB/UI 模型维护。

默认实现：内存 `SessionStore`。后续可接浏览器、文件、后端或数据库实现。

### 13.8 Headless 提交与落盘

Headless 模式必须强制导出落盘，但不能在任意写工具后立即写文件。

规则：

1. 普通 `sparkNodeTree.*`、`datasetTool.*`、`textModel.*` 只修改 host 内存态。
2. `edit.validate` 校验通过后才能 `edit.commit`。
3. `edit.commit` 采用事务式写入：先写临时文件，再原子替换目标文件。
4. 任何一个文件写入失败，必须保留原 4 文件不变，并返回结构化错误。
5. headless run 结束时若 flow 要求提交但未提交，返回失败。

UI 模式差异：

- UI 模式写入 live model，不强制保存到后端。
- UI 保存仍由 DevSystem 原有 `savePageFile` / `saveAllDirtyPageFiles` 控制。

### 13.9 第一期实施范围

第一期以可运行闭环为目标：

1. 在 `packages/spark-scenario` 新增 `page-model` 子入口。
2. 定义 `PageModelHost`、`PageModelHostKey`、`PageModelHostRegistry`、`PageModelFlowState`、`PageModelRequirements`。
3. 提供 `MemoryPageModelHost` 和 `FilePageModelHost`。
4. 提供页面模型场景注册工厂，注册 `edit.*`、`sparkNodeTree.*`、`datasetTool.*`、`textModel.*` 函数。
5. 新增框架层 `AiScenarioSessionStore` 与内存实现。
6. 新增 tool loop / FC 闭环，使 function definitions、function call、tool result、session store、flow state 可以串起来。
7. DevSystem 页面模型级 AI 编辑改接新 `spark-scenario/page-model` 运行时，移除该链路对 `@spark-view/spark-ai` 的依赖。

不做：

- 不做旧 Stills 兼容。
- 不把 4 文件快照塞进 session store。
- 不在本期重构整个 AI 面板 UI 总线。
- 不在核心 `spark-scenario` 入口直接暴露 `spark-component` / `spark-data` 依赖。

### 13.10 实施步骤

建议分最小闭环推进：

1. 先落 `page-model` 类型与 host registry。
2. 落内存 host 与文件 host，先不接 LLM。
3. 落 `edit.open` / `edit.inspect` / `edit.confirmRequirements` / `edit.validate` / `edit.commit` 最小流程函数。
4. 迁移最小 `textModel.*`，验证 script/style 读写。
5. 迁移最小 `sparkNodeTree.*`，验证 rule.json 节点树读写。
6. 迁移最小 `datasetTool.*`，验证 pagedata.json DataSet 读写。
7. 接入 session store 与 function-call loop。
8. 接 DevSystem UI host，替换旧页面模型编辑运行时。
9. 逐步补齐旧目录中的全量 nodeTree / dataset 工具。

### 13.11 验证计划

`packages/spark-scenario` 聚焦验证：

```powershell
Set-Location D:\SPARK_VIEW\packages\spark-scenario
pnpm run typecheck
pnpm run lint
pnpm exec vitest run src/tests/page-model-headless.e2e.test.ts --reporter verbose
```

首批 E2E 测试必须覆盖：

- Memory host：读 4 文件、写文本、修改节点树、修改 DataSet、确认 requirements、validate。
- File host：headless `edit.commit` 事务式落盘。
- Host key 隔离：不同 `tenantId/projectId/pageId/sessionId` 不串状态。
- Function bridge：连续调用 `edit.*`、`sparkNodeTree.*`、`datasetTool.*`、`textModel.*` 作用在同一 host。
- Session store：缓存消息、requirements、FC 结果，不缓存 4 文件快照。
- Flow guard：headless 未 validate/commit 结束时失败。

DevSystem 接入后追加验证：

```powershell
Set-Location D:\SPARK_VIEW
pnpm run typecheck
pnpm run lint
```

必要时运行与 DevSystem 页面模型编辑相关的 focused Vitest。

### 13.12 风险项

- `spark-scenario/page-model` 会引入 `spark-component` / `spark-data` 相关实现，需要通过子入口隔离，避免污染核心入口。
- 旧 dataset/nodeTree catalog 规模大，第一期应先迁最小闭环，再补齐全量工具。
- Headless 事务式落盘必须严谨，否则会造成 4 文件部分写入。
- requirements 同时写 host 和 session store，要明确执行真源：工具执行以 host 为准，模型推理可见性以 session store 消息/结果为准。
- DevSystem 当前 AI 面板事件体系仍由 `spark-component` 承载，本期只替换页面编辑运行时，不扩大为 UI 总线重构。
