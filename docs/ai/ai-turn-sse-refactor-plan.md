# AI POST + APP SSE 数据流重构方案 v2

## 设计原则

**后端只管通信，不管业务。** 后端只做四件事：

```
追加消息 → 拼 window → 调 LLM → 按 (connectionId, turnId) 投帧
```

前端 Agent 掌握所有业务协议：mode、state machine、tool loop、消息角色语义。

---

## 1. SSE 连接管理

### 1.1 连接身份

前端在页面初始化时生成 `connectionId`（UUID v4），整个页面生命周期不变。

| 场景 | 传输方式 |
|------|---------|
| SSE 连接 | `GET /api/events?connectionId=<uuid>` |
| HTTP 请求 | `X-SSE-Connection-Id: <uuid>` 请求头 |

EventSource 不支持自定义请求头，所以 SSE 侧走 query param。HTTP POST 走标准请求头。

### 1.2 SseService 重构

```
当前：CopyOnWriteArrayList<SseEmitter>    — 广播模型，无身份
重构：ConcurrentHashMap<String, SseEmitter> — 按 connectionId 寻址
```

公开方法：

```java
// 连接生命周期
void registerConnection(String connectionId, SseEmitter emitter)
void unregisterConnection(String connectionId)
boolean hasConnection(String connectionId)

// 帧投递（AI 层调用）
void sendFrame(String connectionId, String eventName, Object payload)

// 心跳
void sendHeartbeat(String connectionId)
```

移除所有 AI 事件名常量（`EVENT_AI_TURN_DELTA` 等）——这些由 AI 服务层自行管理。

### 1.3 SSE 心跳

用 SSE comment 替代当前 `connected` 业务事件：

```java
emitter.send(SseEmitter.event().comment(""));
```

间隔 30 秒。EventSource `onopen` 在收到 HTTP 响应头时即触发，不依赖 data 事件，MJS `subscription.opened` 同理。

### 1.4 连接级队列

`sendFrame` 内部按 `(connectionId, turnId)` 组织队列：

- 同一 turn 内帧严格有序
- 不同 turn 间独立并发，互不阻塞
- 队列容量默认 256 帧，超出时 oldest-first 丢弃并记录 warning

队列不持久化，内存管理。

---

## 2. API 契约

### 2.1 POST /api/ai/sessions — 创建会话

一次性设定会话级配置，后续 turn 不再重复传递。

**请求：**

```json
{
  "systemPrompt": "<string>",
  "tools": [],
  "windowSize": 30,
  "scope": {
    "moduleId": "<string>",
    "moduleInstanceId": "<string>"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `systemPrompt` | string | 是 | 系统提示词 |
| `tools` | array | 否 | LLM function tool schema，透传给 LLM |
| `windowSize` | number | 否 | 上下文中保留的最大消息条数，默认 30 |
| `scope` | object | 否 | 模块实例绑定，用于 session 复用 |

**响应 (200)：**

```json
{
  "sessionId": "<uuid>",
  "protocolVersion": 4
}
```

### 2.2 POST /api/ai/turns — 执行 LLM 调用

统一的 turn 入口，替代当前 `/turn/stream` 和 `/turn/append` 两个端点。

**请求：**

```json
{
  "sessionId": "<string>",
  "turnId": "<uuid>",
  "messages": [
    { "role": "user", "content": "实现请假表单" },
    { "role": "assistant", "content": null, "tool_calls": [...] },
    { "role": "tool", "content": "{...}", "tool_call_id": "call_xxx" }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sessionId` | string | 是 | 已创建的会话 ID |
| `turnId` | uuid | 是 | 本次调用的幂等键，用于匹配 `llm-frame` |
| `messages` | array | 是 | 本轮新增消息，追加到 session 对话历史 |

后端行为：

1. 校验 `X-SSE-Connection-Id` 请求头对应的 SSE 连接是否在线
2. 校验 session 存在
3. 校验 turnId 幂等性
4. 将 messages 追加到 session 对话历史
5. 按 `windowSize` 截取上下文窗口
6. 拼装 LLM 请求（systemPrompt + 窗口消息 + tools）
7. 异步调用 LLM
8. 流式结果按 `(connectionId, turnId)` 投递 `llm-frame`

**响应 (202)：**

```json
{
  "accepted": true,
  "sessionId": "...",
  "turnId": "..."
}
```

**错误响应：**

| HTTP | code | 说明 |
|------|------|------|
| 404 | `SESSION_NOT_FOUND` | sessionId 不存在 |
| 503 | `APP_SSE_NOT_CONNECTED` | connectionId 对应的 SSE 连接不在线，未启动 LLM |
| 409 | `TURN_ID_REUSED` | 同一 turnId 重复提交且 messages 不一致 |
| 200 | `TURN_ID_REPLAY` | 同一 turnId 重复提交且 messages 一致，幂等返回（不重新调 LLM） |

### 2.3 不再保留旧端点

不保留 `/turn/stream`、`/turn/append`、`/turn` 兼容入口。同步更新所有调用方（`ai-turn-bridge.ts`、`verify-page-design-e2e.mjs`）。

---

## 3. llm-frame 事件

### 3.1 事件结构

SSE `event:` 字段统一为 `llm-frame`，按 `sessionId + turnId` 过滤。

**v4 envelope 包装：**

```json
event: llm-frame
data: {
  "v": 4,
  "ok": true,
  "data": {
    "sessionId": "<string>",
    "turnId": "<string>",
    "frame": {
      "type": "message.delta",
      "data": "Hello"
    }
  },
  "context": {
    "requestId": "<uuid>",
    "session": { "sessionId": "<string>" },
    "turn": { "turnId": "<string>" }
  },
  "event": {
    "transport": "sse",
    "name": "llm-frame",
    "terminal": false
  }
}
```

### 3.2 frame.type 枚举

| type | terminal | data 内容 | 说明 |
|------|----------|----------|------|
| `message.delta` | false | string | LLM 流式文本片段 |
| `message.reasoning` | false | string | LLM 推理/思考文本（Claude/DeepSeek） |
| `message.completed` | false | `{ text, toolCalls?, usage? }` | 单条消息完成，携带完整结果 |
| `error` | true | `{ code, message }` | LLM 调用或处理出错 |
| `done` | true | `null` | turn 结束，此后不再有帧 |

`message.completed` 和 `done` 独立发送。`done` 是真正的终止信号；`message.completed` 可能在 tool loop 中出现多次。

### 3.3 前端消费

`TurnEventCollector` 改为只订阅 `llm-frame` 事件，按 `sessionId + turnId` 过滤：

```
APP SSE → raw EventSource → 按 event:name 分发 → llm-frame → TurnEventCollector
```

---

## 4. 并行 turn

同一 session 下不同 turnId 可以并发执行，前端 Agent 控制并发度。

```
sessionId=S
  turnId=A → messages_A → LLM → llm-frame (sessionId=S, turnId=A)
  turnId=B → messages_B → LLM → llm-frame (sessionId=S, turnId=B)
```

后端不做 turn 间因果推断、不做状态机、不做冲突检测。并发安全由会话层的 `synchronized (session)` 保护消息追加顺序。

---

## 5. 连接断开处理

当 SSE 连接断开时：

1. `SseEmitter.onError` / `onCompletion` / `onTimeout` 触发 → `unregisterConnection(connectionId)` 
2. 该连接下所有进行中的 turn 队列清空
3. 如果 LLM 调用正在进行，通过 `AbortController`（或等价机制）取消
4. `POST /api/ai/turns` 在校验阶段发现连接不在线 → 返回 `APP_SSE_NOT_CONNECTED`，不启动 LLM

重连后前端生成新 `connectionId`，进行中的 turn 作废。Agent 负责重试。

---

## 6. 接口变更汇总

| 当前 | 重构后 | 说明 |
|------|--------|------|
| `GET /api/events` | `GET /api/events?connectionId=<uuid>` | SSE 连接带身份 |
| `POST /api/ai/sessions` | 保留，body 精简 | 去掉 `mode`/`protocolVersion`/`reuseScopeSession` |
| `POST .../turn/stream` | **删除**，合并到 `POST /api/ai/turns` | — |
| `POST .../turn/append` | **删除**，合并到 `POST /api/ai/turns` | tool result 用同一入口 |
| `POST .../turn` | **删除** | 同步模式不再支持 |
| — | `POST /api/ai/turns` | 新增，统一 turn 入口 |
| `event: connected` | **删除**，用 SSE comment 心跳替代 | — |
| `event: ai-turn-*` | **删除**，改为 `event: llm-frame` | 中性帧命名 |
| `event: debug-*` | 保留（调试桥，非 AI 事件） | — |
| `event: data-*` | 保留（配置变更广播） | — |
| `event: notification` | 保留 | — |

---

## 7. 测试计划

### 后端

| 场景 | 预期 |
|------|------|
| 无 SSE 连接时 POST turn | 返回 `APP_SSE_NOT_CONNECTED`，不启动 LLM |
| 有连接时 POST turn | 返回 `accepted`，异步产生 `llm-frame` |
| 同 `sessionId + turnId` + 同 messages 重复提交 | 返回 `TURN_ID_REPLAY`，不重新调 LLM |
| 同 `sessionId + turnId` + 不同 messages 重复提交 | 返回 `TURN_ID_REUSED` |
| 同一 session 不同 turnId 并发执行 | 事件按各自 turn 队列有序，互不干扰 |
| SSE 连接断开 mid-turn | LLM 调用取消，队列清空 |

### 前端

| 场景 | 预期 |
|------|------|
| APP SSE transport 只分发 raw event | `sse-events.ts` 不解析 AI 业务语义 |
| AI bridge 按 `sessionId + turnId` 过滤 `llm-frame` | collector 正确聚合 |
| SSE 中断/timeout | collector fail-fast |
| 并行 turn | 两个 collector 各自独立接收帧 |

### 验证命令

```
pnpm run typecheck
pnpm run verify:rules
pnpm run test
```
