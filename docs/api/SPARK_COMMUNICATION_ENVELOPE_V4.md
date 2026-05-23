# SPARK Communication Envelope v4

本文件定义 SPARK View 前端、Java 后端、SSE 流之间唯一的 wire 信封。v4 是新的通信真源；v3/plain payload 只保留前端解析兼容，不再作为后端新响应格式。

## 统一结构

```ts
type SparkEnvelope<T> = {
  protocolVersion: 4
  ok: boolean
  data: T | null
  error: SparkEnvelopeError | null
  context: {
    requestId: string
    tenantId?: string
    projectId?: string
    username?: string
    scope?: {
      moduleId?: string
      moduleInstanceId?: string
      instanceId?: string
      runtimeInstanceId?: string
    }
    session?: { sessionId?: string }
    turn?: {
      turnId?: string
      turnKey?: string
      seq?: number
      baseRevision?: number
    }
    stream?: {
      streamId?: string
      streamKey?: string
    }
  }
  event: {
    transport: 'http' | 'sse'
    name: string
    terminal: boolean
    sequence?: number
  }
}

type SparkEnvelopeError = {
  code: string
  message: string
  category: string
  severity: 'error' | 'warning' | string
  retryPolicy?: string
  details?: Record<string, unknown>
}
```

## HTTP 响应

所有 `/api/**` JSON REST 响应由 `ApiEnvelopeAdvice` 包装为 v4。OpenAPI、Swagger、HTML、二进制下载、SSE 连接本身不包装。

HTTP 固定事件层级：

```json
{
  "protocolVersion": 4,
  "ok": true,
  "data": { "sessionId": "session-1" },
  "error": null,
  "context": {
    "requestId": "req-1",
    "tenantId": "lmspark",
    "projectId": "demo",
    "username": "admin"
  },
  "event": {
    "transport": "http",
    "name": "response",
    "terminal": true
  }
}
```

错误响应同样使用 v4：

```json
{
  "protocolVersion": 4,
  "ok": false,
  "data": null,
  "error": {
    "code": "SESSION_SCOPE_MISMATCH",
    "message": "后端 AI 会话与当前模块实例不匹配",
    "category": "session-scope",
    "severity": "error",
    "retryPolicy": "recreate-session"
  },
  "context": { "requestId": "req-err" },
  "event": { "transport": "http", "name": "response", "terminal": true }
}
```

## SSE 响应

SSE 的 `event:` 名称保持原样用于 EventSource 路由，并同步写入 `envelope.event.name`。SSE `data:` 必须是完整 v4 envelope。

AI session stream 示例：

```text
event: delta
data: {"protocolVersion":4,"ok":true,"data":{"delta":"你好"},"error":null,"context":{"requestId":"req-1","scope":{"moduleId":"demoRuntime","moduleInstanceId":"page-a","instanceId":"page-a"},"session":{"sessionId":"session-1"},"turn":{"turnId":"turn-1","turnKey":"demoRuntime::page-a::turn-1","seq":1,"baseRevision":0},"stream":{"streamId":"llm-stream","streamKey":"demoRuntime::page-a::turn-1::llm-stream"}},"event":{"transport":"sse","name":"delta","terminal":false}}

event: result
data: {"protocolVersion":4,"ok":true,"data":{"text":"你好"},"error":null,"context":{"requestId":"req-1","session":{"sessionId":"session-1"},"turn":{"turnId":"turn-1"},"stream":{"streamId":"llm-stream","streamKey":"demoRuntime::page-a::turn-1::llm-stream"}},"event":{"transport":"sse","name":"result","terminal":false}}

event: done
data: {"protocolVersion":4,"ok":true,"data":{"done":true},"error":null,"context":{"requestId":"req-1","session":{"sessionId":"session-1"},"turn":{"turnId":"turn-1"},"stream":{"streamId":"llm-stream","streamKey":"demoRuntime::page-a::turn-1::llm-stream"}},"event":{"transport":"sse","name":"done","terminal":true}}
```

SSE 业务载荷只放在 `data`。`sessionId`、`turnId`、`streamKey` 等定位信息统一放入 `context`，不再散落在业务 payload 中。旧 v3 payload 仍由前端兼容读取。

平台事件总线 `/api/events` 示例：

```text
event: page-config
data: {"protocolVersion":4,"ok":true,"data":{"pageId":"home","file":"rule.json","timestamp":1770000000000},"error":null,"context":{"requestId":"req-2"},"event":{"transport":"sse","name":"page-config","terminal":false}}
```

页面配置、数据任务、数据变更订阅者仍监听原事件名：`page-config`、`data-batch-job`、`data-change`。前端事件总线先解 v4 envelope，再把 `data` 分发给业务回调。

## 命名差异

前端 AI Host 内部仍使用历史业务命名：

- `businessRegistrationId`
- `businessInstanceId`

wire 层统一投影到后端模块命名：

- `context.scope.moduleId`
- `context.scope.moduleInstanceId`

这是刻意保留的边界：前端业务注册表继续使用 `business*`，所有 HTTP/SSE wire payload 只暴露 `module*`。

## 兼容策略

- 新后端响应只生成 v4 envelope。
- Java AI session 请求暂时接受 `protocolVersion: 3` 和 `protocolVersion: 4`，响应统一为 v4 envelope。
- 前端 HTTP 层同时识别 v4 `context.requestId` 与旧 v3 顶层 `requestId`。
- 前端 AI SSE reader 优先用 `context.session/turn/stream` 校验会话、轮次和流，旧 v3 `data.sessionId/data.turnId/data.streamKey` 继续兼容。
- 前端遇到 v3/plain SSE payload 时继续解析，并通过诊断事件或 logger 记录一次协议兼容警告。
