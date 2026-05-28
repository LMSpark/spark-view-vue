# AiSessionTracePanel 详细设计方案（V5 — Codex 复审修正版）

## 一、背景与问题

### 1.1 问题

SPARK VIEW 平台通过 spark-ai 包提供了完整的 AI Agent 运行时（`AiAgentHost` → `AiAgentSession` → Tool Loop → SSE 事件），但目前缺少标准的前端组件来**监视** AI 业务会话的实时流式输出、**展示**工具调用状态和历史诊断。

spark-app 和 spark-component 中均无现成的 AI 会话监视 UI 组件。

### 1.2 目标

在 `packages/spark-component/src/ai/` 下创建 AI 会话监视组件系统，分三期交付：

- **M1（本方案）**：只读 trace panel + 流缓冲（live callbacks）+ 诊断面板（post-completion snapshot）。组件不管理 Host 生命周期，由调用方传入 callbacks 和 sessionRecord。
- **M2**：增加 runner adapter（start/send/abort UI）+ 附件引用支持。
- **M3**：等 spark-ai 内核补齐 beforeFunctionCall、session.stop() 后，增加工具审批和多会话管理。

### 1.3 关键约束

- spark-component 需新增 `@spark-view/spark-ai` 为 dependency，同时补充 tsconfig.build.json 路径、vitest.config.ts alias
- AI 组件集中在 `src/ai/`，不污染通用组件系统（不注册到 Spark registry）
- 遵循 `ai-code-generation-behavior.md`（参数 ≤3、禁止匿名内联对象类型、禁止参数内嵌 JSDoc）
- 遵循 spark-component 现有 Vue 模式（`<script setup lang="ts">`、BEM + scoped 样式、composable 提取逻辑）
- 函数签名最多 3 个位置参数；可选参数用 `?` 不用 `| undefined`
- **禁止 `src/ai/**` import `@spark-view/spark-page-config`**；Panel 不感知 PageModel
- **禁止 `src/ai/**` 引用 `PageModelLike` / `PageModelRenderConfig`** 或读取 `pagedata/rule`
- **禁止 `AiSessionTracePanel` 直接持有 SSE connection** 或处理 transport heartbeat/keepalive；SSE 由 `spark-ai` runtime 管理

---

## 二、核心架构认知（来自 spark-ai 运行时分析）

以下事实来自对 spark-ai 源码的逐文件分析，所有设计决策基于这些事实：

| 事实 | 来源 | 设计影响 |
|------|------|---------|
| `host.run()` 内部 `await session.send()`，Promise resolve 时首轮已结束 | `business-session.ts:294-302` | `sessionRecord` 仅在 `host.run()` 返回后可用，诊断面板是"完成后 snapshot" |
| `onDelta` 签名是 `(delta: string)`，无 turnId | `chat-types.ts` | turn 归属靠 `appendEvent` 从 `event.scope.turnId` 记录 activeTurnId |
| `onStreamEvent` 签名是 `(event: AiAgentStreamEvent)`，`event.scope.turnId` 存 turnId | `chat-types.ts` | `appendEvent` 是唯一能获取 turnId 的入口 |
| `afterFunctionCall` 在 `runtime.executeTool()` **之后**执行 | `tool-call-executor.ts:142→179` | M1 不做执行前审批，工具卡片展示已完成结果 |
| 不存在 `beforeFunctionCall` 钩子 | 全代码搜索零结果 | 审批需等 spark-ai 内核先补齐 |
| `AbortController.abort()` 导致 tool loop `return`，但**不调用** `stopSession()` | `tool-loop-runner.ts:132-133` | UI 显示"本地已中断"，标注 `abort ≠ session stopped` |
| `AiAgentSession` 没有 `stop()` 方法 | `business-session.ts:225-275` | 无法从外部正确停止会话 |
| `AiAgentChatMessage.content` 是 `string` | `chat-types.ts` | 多模态仅文本引用（URL/文件名），base64 不进 historyMsgs |
| `DefaultAiAgentSessionStore` 内部用 `moduleId + "\0" + moduleInstanceId` 做 key | `default-session-store.ts` | 这是实现细节，M1 不暴露为公共 API；组件内部用 `{ moduleId, moduleInstanceId }` 对 |

---

## 三、M1 文件结构

```
packages/spark-component/src/ai/
├── index.ts                              # barrel export
├── types.ts                              # 共享领域类型（无 M2 预留类型）

├── composables/
│   ├── useSessionStream.ts               # 回调 → 响应式流缓冲 + 状态机
│   └── useSessionDiagnostics.ts          # SessionRecord → 摘要+转录+问题列表

├── components/
│   ├── AiSessionTracePanel.vue           # 根面板（布局壳）
│   ├── AiSessionTracePanel.props.ts
│   ├── SessionStreamView.vue             # 流式消息主视图（打字机效果）
│   ├── SessionStreamView.props.ts        # 展示类型 import 自 ../types，无独立 .types.ts
│   ├── SessionChatBubble.vue             # 单条聊天气泡
│   ├── SessionChatBubble.props.ts
│   ├── SessionReasoningBlock.vue         # 可折叠推理块
│   ├── SessionReasoningBlock.props.ts
│   ├── SessionToolCallCard.vue           # 工具调用卡片（纯渲染，截断在 composable 完成）
│   ├── SessionToolCallCard.props.ts
│   ├── SessionDiagnosticsPanel.vue       # 诊断统计面板
│   └── SessionDiagnosticsPanel.props.ts
```

共约 **15 个文件**。M1 无标签栏、输入栏、独立历史面板——流视图仅展示 live callbacks entries；诊断面板消费 `sessionRecord`（`host.run()` 完成后由调用方设置）。

---

## 四、核心类型定义

### 4.1 领域类型 (`ai/types.ts`)

```typescript
import type {
  AiAgentSessionSummary,
  AiAgentSessionTranscriptEntry,
} from '@spark-view/spark-ai/agent'

// ── 流展示条目 ──

export type ToolCallDisplayItem = Readonly<{
  toolName: string
  argsPreview: string
  turnId: string
  round: number
  callId: string | null
  status: 'success' | 'error'
  resultSummary: string | null
  durationMs: number
}>

export type ReasoningDisplayItem = Readonly<{
  text: string
  turnId: string
  collapsed: boolean
}>

/**
 * 流视图中的一条渲染条目。
 * 所有字段 Readonly——实现中通过数组项替换而非原地修改来更新。
 */
export type StreamDisplayEntry =
  | Readonly<{ kind: 'user-message'; content: string; timestamp: number }>
  | Readonly<{ kind: 'assistant-delta'; content: string; turnId: string }>
  | Readonly<{ kind: 'assistant-complete'; content: string; turnId: string }>
  | Readonly<{ kind: 'reasoning'; item: ReasoningDisplayItem }>
  | Readonly<{ kind: 'tool-call'; item: ToolCallDisplayItem }>
  | Readonly<{ kind: 'error'; message: string; timestamp: number }>
  | Readonly<{ kind: 'system-message'; content: string; timestamp: number }>

// ── 诊断数据 ──

export type SessionDiagnosticIssue = Readonly<{
  level: 'error' | 'warn' | 'info'
  code: string
  message: string
  hint?: string
}>

/**
 * 诊断数据——永远有值（非 null）。
 * summarizeAiAgentSessionRecord(null) 本身支持空记录，
 * composable 返回空摘要而非 null。
 */
export type SessionDiagnosticsData = Readonly<{
  summary: AiAgentSessionSummary
  transcript: readonly AiAgentSessionTranscriptEntry[]
  issues: readonly SessionDiagnosticIssue[]
}>
```

注意：
- `ToolCallDisplayItem.argsPreview` 替代原来的 `args: unknown`——通过 `previewAiAgentDiagnosticValue(args, 200)` 截断
- `AiSessionKey` 删除——`sessionKey = moduleId + "\0" + moduleInstanceId` 是 `DefaultAiAgentSessionStore` 内部实现细节，不暴露为公共 API
- M2 类型（`AiSessionRunner`、`AiSessionMonitorEntry`、`AiSessionRunResult`）**不在 M1 中导出**，仅保留在第十一节展望文字中

### 4.2 根组件 Props (`AiSessionTracePanel.props.ts`)

```typescript
import type { AiAgentSessionRecord } from '@spark-view/spark-ai/agent'
import type { StreamDisplayEntry, SessionDiagnosticsData } from '../types'

/**
 * AiSessionTracePanel 根组件 Props。
 *
 * sessionRecord — host.run() 完成后由调用方设置。null 表示尚无已完成会话。
 * entries       — 来自 useSessionStream() 的 live 流条目（仅回调驱动，不含 history 重放）。
 * isStreaming   — 是否正在接收流式增量。
 * isReasoning   — 是否正在接收推理文本。
 * diagnostics   — 来自 useSessionDiagnostics(sessionRecord)。永远有值（含空摘要）。
 * height        — 面板高度 CSS 值，默认 '100%'。
 * emptyText     — sessionRecord 为 null 且无 live entries 时的占位文本。
 */
export type AiSessionTracePanelProps = Readonly<{
  sessionRecord: AiAgentSessionRecord | null
  entries: readonly StreamDisplayEntry[]
  isStreaming: boolean
  isReasoning: boolean
  diagnostics: SessionDiagnosticsData
  height?: string
  emptyText?: string
}>
```

注意：
- Props 类型命名不使用 `R*` 前缀（`R` 是 Spark Renderer/SparkNode 命名约定，AI 面板不是 registry renderer）
- `diagnostics` 非 null——`useSessionDiagnostics` 在 sessionRecord 为 null 时返回空摘要

### 4.3 子组件 Props 概要

**SessionStreamView.props.ts**:
```typescript
import type { StreamDisplayEntry } from '../types'

export type SessionStreamViewProps = Readonly<{
  entries: readonly StreamDisplayEntry[]
  isStreaming: boolean
  isReasoning: boolean
  emptyText?: string
}>
```

**SessionChatBubble.props.ts**:
```typescript
export type SessionChatBubbleProps = Readonly<{
  role: 'user' | 'assistant' | 'system' | 'error'
  content: string
  timestamp?: number
  isTyping?: boolean
}>
```

**SessionReasoningBlock.props.ts**:
```typescript
export type SessionReasoningBlockProps = Readonly<{
  text: string
  collapsed?: boolean
  isActive?: boolean
}>
```

**SessionToolCallCard.props.ts**:
```typescript
import type { ToolCallDisplayItem } from '../types'

export type SessionToolCallCardProps = Readonly<{
  toolCall: ToolCallDisplayItem
}>
```

**SessionDiagnosticsPanel.props.ts**:
```typescript
import type { SessionDiagnosticsData } from '../types'

export type SessionDiagnosticsPanelProps = Readonly<{
  data: SessionDiagnosticsData
  loading?: boolean
}>
```

---

## 五、组件树

```
AiSessionTracePanel.vue (根)
├── el-row (主内容区)
│   ├── el-col (左侧：流视图)
│   │   └── SessionStreamView.vue
│   │       ├── SessionChatBubble.vue      ← 按 StreamDisplayEntry.kind 分发
│   │       ├── SessionReasoningBlock.vue  ← kind='reasoning'
│   │       └── SessionToolCallCard.vue    ← kind='tool-call'
│   └── el-col (右侧：诊断面板，完成后 snapshot）
│       └── SessionDiagnosticsPanel.vue    ← el-descriptions + el-timeline
```

职责边界：
- **StreamView**：仅展示 live callback entries（由 `useSessionStream` 驱动）。不读取 `sessionRecord.history`
- **DiagnosticsPanel**：仅消费 `sessionRecord`（`host.run()` 完成后由调用方设置）。展示摘要统计 + 转录 + 问题列表

---

## 六、数据流设计

### 6.1 调用方集成模式

```
调用方代码（如 AI run adapter / app shell）            AiSessionTracePanel 组件
  │                                                    │
  ├── const stream = useSessionStream()                │
  ├── const sessionRecord = ref<AiAgentSessionRecord   │
  │       | null>(null)                                │
  ├── const diagnostics = useSessionDiagnostics(       │
  │       () => sessionRecord.value                    │
  │     )                                              │
  │                                                    │
  ├── const abortController = new AbortController()    │
  ├── function abortAiRun(): void {                    │
  │     abortController.abort()                        │
  │     stream.markAborted('本地已中断')               │
  │   }                                                │
  │                                                    │
  ├── void host.run(alias, input, {                    │
  │     onStreamEvent: stream.appendEvent,             │
  │     onDelta: stream.appendDelta,                   │
  │     onReasoning: stream.appendReasoning,           │
  │     onToolCall: stream.appendToolCall,             │
  │     signal: abortController.signal,                │
  │   })                                               │
  │     .then((result) => {                            │
  │       sessionRecord.value =                        │
  │         result.session.getSessionRecord()          │
  │     })                                             │
  │     .catch((error: unknown) => {                   │
  │       stream.appendError(                          │
  │         error instanceof Error                     │
  │           ? error.message                          │
  │           : String(error)                          │
  │       )                                            │
  │     })                                             │
  │     .finally(() => {                               │
  │       stream.finish()                              │
  │     })                                             │
  │                                                    │
  │     ──── props 传入 ────>                          │
  │                                                    ├── 纯展示渲染
  │                                                    │   SessionStreamView
  │                                                    │     → entries 按 kind 分发子组件
  │                                                    │   SessionDiagnosticsPanel
  │                                                    │     → summary + transcript + issues
```

关键时序：
1. `useSessionStream()` 创建空状态（单会话、串行 turn）
2. 调用方以 `host.run()` 启动（不 await，.then/.catch/.finally 处理）
3. 流式期间：`onStreamEvent` → `appendEvent` 记录 activeTurnId；`onDelta`/`onReasoning` → 使用 activeTurnId
4. `host.run()` resolve → `sessionRecord.value = result.session.getSessionRecord()` → 诊断面板更新
5. `host.run()` reject → `stream.appendError(...)` → 流视图显示错误
6. `.finally()` → `stream.finish()` → 兜底关闭 streaming 状态，固化残留条目
7. 用户点击本地 Stop → `abortController.abort()` + `stream.markAborted('本地已中断')`

**注意**：`useSessionStream()` 代表一条被监视的会话流。不支持多个并发 `host.run()` 共享同一个 stream 实例。每个 stream 实例对应一个串行 turn 序列。

**SSE 归属**：APP SSE connection 由 `spark-ai` runtime/transport/collector 持有和管理。`AiSessionTracePanel` 只消费 normalized callbacks（`onDelta`/`onReasoning`/`onStreamEvent`/`onToolCall`）和 immutable session snapshot（`sessionRecord`）。SSE keepalive/heartbeat frame 如存在，须在 transport/collector 层过滤或忽略，不进入 trace panel 协议。Panel 不直接创建 `EventSource`，不处理 SSE 连接生命周期。

### 6.2 useSessionStream（流缓冲 + 状态机）

```typescript
import type { Ref } from 'vue'
import type { AiAgentToolCallRecord, AiAgentStreamEvent } from '@spark-view/spark-ai/agent'
import type { StreamDisplayEntry, ToolCallDisplayItem } from '../types'

export type UseSessionStreamReturn = Readonly<{
  streamText: Ref<string>
  reasoningText: Ref<string>
  isStreaming: Ref<boolean>
  isReasoning: Ref<boolean>
  entries: Ref<StreamDisplayEntry[]>
  toolCalls: Ref<ToolCallDisplayItem[]>

  /** 追加用户消息（调用方在 host.run() 前手动调用）。 */
  appendUserMessage: (content: string) => void

  /** 追加文本增量。使用 appendEvent 记录的 activeTurnId。无活跃 turn 时追加协议错误条目。 */
  appendDelta: (delta: string) => void

  /** 追加推理文本。使用 appendEvent 记录的 activeTurnId。无活跃 turn 时追加协议错误条目。 */
  appendReasoning: (text: string) => void

  /**
   * 追加流事件——唯一能获取 turnId 的入口。
   *
   * 状态机规则：
   * - event.type 暗示 delta/reasoning/llm-request → 记录 activeTurnId，标记 isStreaming/isReasoning
   * - event.type 暗示 result/done → finalizeCurrentTurn()
   * - event.type 暗示 error → appendError + finalizeCurrentTurn()
   * - tool-result → 仅诊断，不改变条目列表
   */
  appendEvent: (event: AiAgentStreamEvent) => void

  /**
   * 追加工具调用记录（工具已执行完毕，来自 onToolCall 回调）。
   * 内部调用 previewAiAgentDiagnosticValue 截断 args/result，
   * 组件层只接收字符串。
   */
  appendToolCall: (record: AiAgentToolCallRecord) => void

  /** 追加错误并关闭 streaming 状态。 */
  appendError: (message: string) => void

  /**
   * 标记本地中断。追加 system-message 条目（如"本地已中断"），
   * 然后调用 finish()。不依赖 host.run() 的 reject/catch。
   */
  markAborted: (message?: string) => void

  /**
   * 兜底关闭：若存在活跃 turn 则 finalize，始终设置
   * isStreaming=false、isReasoning=false。调用方在 .finally() 中调用。
   */
  finish: () => void

  /** 重置所有状态。 */
  reset: () => void
}>
```

**内部实现要点：**

```typescript
// 内部状态
let activeTurnId: string | null = null

// ── 条目查找辅助（替换 findLastIndex） ──

function findLastEntryIndex(
  predicate: (entry: StreamDisplayEntry) => boolean,
): number {
  for (let index = entries.value.length - 1; index >= 0; index -= 1) {
    const entry = entries.value[index]
    if (entry !== undefined && predicate(entry)) return index
  }
  return -1
}

function replaceEntryAt(
  index: number,
  replacement: StreamDisplayEntry,
): void {
  entries.value = entries.value.map((entry, i) =>
    i === index ? replacement : entry,
  )
}

// ── 事件状态机 ──

function appendEvent(event: AiAgentStreamEvent): void {
  const turnId = event.scope?.turnId
  if (turnId === undefined || turnId.length === 0) return

  const eventType = String(event.type ?? '')

  if (
    eventType === 'llm-request' ||
    eventType === 'delta' ||
    eventType.includes('message.delta')
  ) {
    activeTurnId = turnId
    isStreaming.value = true
    return
  }

  if (eventType === 'reasoning') {
    activeTurnId = turnId
    isStreaming.value = true
    isReasoning.value = true
    return
  }

  if (
    eventType === 'result' ||
    eventType === 'done' ||
    eventType.includes('message.completed')
  ) {
    finalizeCurrentTurn()
    return
  }

  if (eventType === 'error') {
    const message = typeof event.data === 'string'
      ? event.data
      : (event.data as Record<string, unknown>)?.message
    appendError(String(message ?? 'AI turn error'))
    finalizeCurrentTurn()
    return
  }

  // tool-result：仅诊断，不改变条目列表
}

// ── delta / reasoning：不静默丢弃 ──

function appendDelta(delta: string): void {
  const turnId = activeTurnId
  if (turnId === null) {
    appendProtocolError('Received AI delta before any turn event.')
    return
  }
  appendAssistantDelta(turnId, delta)
}

function appendReasoning(text: string): void {
  const turnId = activeTurnId
  if (turnId === null) {
    appendProtocolError('Received AI reasoning before any turn event.')
    return
  }
  appendReasoningEntry(turnId, text)
}

function appendProtocolError(message: string): void {
  entries.value = [
    ...entries.value,
    { kind: 'error', message, timestamp: Date.now() },
  ]
}

// ── 带 findLastIndex 的条目更新（处理 delta/reasoning 交错） ──

function appendAssistantDelta(turnId: string, delta: string): void {
  streamText.value += delta
  isStreaming.value = true

  const index = findLastEntryIndex(
    (e) => e.kind === 'assistant-delta' && e.turnId === turnId,
  )
  if (index >= 0) {
    const existing = entries.value[index]
    if (existing?.kind === 'assistant-delta') {
      replaceEntryAt(index, {
        ...existing,
        content: existing.content + delta,
      })
      return
    }
  }
  entries.value = [
    ...entries.value,
    { kind: 'assistant-delta', content: delta, turnId },
  ]
}

function appendReasoningEntry(turnId: string, text: string): void {
  reasoningText.value += text
  isReasoning.value = true

  const index = findLastEntryIndex(
    (e) => e.kind === 'reasoning' && e.item.turnId === turnId,
  )
  if (index >= 0) {
    const existing = entries.value[index]
    if (existing?.kind === 'reasoning') {
      replaceEntryAt(index, {
        kind: 'reasoning',
        item: { text: existing.item.text + text, turnId, collapsed: false },
      })
      return
    }
  }
  entries.value = [
    ...entries.value,
    { kind: 'reasoning', item: { text, turnId, collapsed: false } },
  ]
}

// ── 工具调用：截断在 composable 完成 ──

function appendToolCall(record: AiAgentToolCallRecord): void {
  const item: ToolCallDisplayItem = {
    toolName: record.toolName,
    argsPreview: previewAiAgentDiagnosticValue(record.args, 200),
    turnId: record.turnId,
    round: record.round,
    callId: record.callId ?? null,
    status: record.status,
    resultSummary: previewAiAgentDiagnosticValue(record.result, 300),
    durationMs: record.durationMs,
  }
  toolCalls.value = [...toolCalls.value, item]
  entries.value = [
    ...entries.value,
    { kind: 'tool-call', item },
  ]
}

// ── 生命周期收尾 ──

function finalizeCurrentTurn(): void {
  const turnId = activeTurnId
  if (turnId === null) return

  entries.value = entries.value.map((entry) => {
    if (entry.kind === 'assistant-delta' && entry.turnId === turnId) {
      return { kind: 'assistant-complete', content: entry.content, turnId }
    }
    if (entry.kind === 'reasoning' && entry.item.turnId === turnId) {
      return { kind: 'reasoning', item: { ...entry.item, collapsed: true } }
    }
    return entry
  })

  activeTurnId = null
  isStreaming.value = false
  isReasoning.value = false
}

function finish(): void {
  if (activeTurnId !== null) {
    finalizeCurrentTurn()
  }
  isStreaming.value = false
  isReasoning.value = false
}

function markAborted(message?: string): void {
  entries.value = [
    ...entries.value,
    {
      kind: 'system-message',
      content: message ?? '本地已中断',
      timestamp: Date.now(),
    },
  ]
  finish()
}
```

关键设计：
- `appendDelta`/`appendReasoning` 签名与真实回调一致（只有 `(text: string)`）
- turnId 由 `appendEvent` 从 `event.scope.turnId` 提取——`onStreamEvent` 先于 `onDelta`/`onReasoning` 触发
- 无活跃 turn 时**不静默丢弃**——追加 `kind='error'` 协议错误条目（fail-fast）
- delta/reasoning 合并使用 `findLastIndex`（从末尾向前查找同 kind+同 turnId 的条目），正确处理交错场景
- 工具调用截断（`previewAiAgentDiagnosticValue`）在 `appendToolCall` 中完成，组件层只接收字符串
- `markAborted` 供本地 Stop 按钮调用，不依赖 `host.run()` reject
- `finish` 供 `.finally()` 兜底，保证 streaming 状态一定关闭
- 所有条目更新使用数组替换，不原地修改

### 6.3 useSessionDiagnostics（诊断计算）

```typescript
import type { ComputedRef } from 'vue'
import type { AiAgentSessionRecord } from '@spark-view/spark-ai/agent'
import type { SessionDiagnosticsData } from '../types'

export type UseSessionDiagnosticsOptions = Readonly<{
  sessionRecord: () => AiAgentSessionRecord | null
}>

export type UseSessionDiagnosticsReturn = Readonly<{
  data: ComputedRef<SessionDiagnosticsData>
}>
```

实现要点：
- `computed` 驱动，`sessionRecord()` 变化时重新计算
- `sessionRecord()` 为 null 时调用 `summarizeAiAgentSessionRecord(null)` 和 `createAiAgentSessionTranscript(null)`——两个 helper 均接受 `null | undefined`，返回空结果。不手写空摘要，防止 `AiAgentSessionSummary` 变更时漂移
- 从 record.history 中过滤失败的 functionCall 条目（`AiAgentFunctionCallHistoryEntry.status === 'failed'`）转为 `SessionDiagnosticIssue[]`
- 无轮询——仅响应式计算
- `host.run()` 完成后 `sessionRecord` 才被设置，在此之前诊断面板显示空摘要

---

## 七、与 spark-ai 运行时的集成

### 7.1 依赖配置

**package.json 新增**：
```json
"@spark-view/spark-ai": "workspace:*"
```

**tsconfig.build.json 补充 paths**（build config 指向 built declaration files）：
```json
"@spark-view/spark-ai": ["../spark-ai/dist/index.d.ts"],
"@spark-view/spark-ai/agent": ["../spark-ai/dist/agent/index.d.ts"]
```

**tsconfig.json 和 vitest.config.ts** 使用 source alias（仅 dev/test）。

### 7.2 导入清单

```typescript
// 类型（verbatimModuleSyntax）
import type {
  AiAgentSessionRecord,
  AiAgentSessionSummary,
  AiAgentSessionTranscriptEntry,
  AiAgentHistoryEntry,
  AiAgentToolCallRecord,
  AiAgentStreamEvent,
  AiAgentFunctionCallHistoryEntry,
} from '@spark-view/spark-ai/agent'

// 值
import {
  summarizeAiAgentSessionRecord,
  createAiAgentSessionTranscript,
  previewAiAgentDiagnosticValue,
} from '@spark-view/spark-ai/agent'
```

### 7.3 生命周期边界

M1 组件不调用任何 spark-ai **写操作**。仅消费：

| 调用 | 触发方 | 用途 |
|------|--------|------|
| `session.getSessionRecord()` | 调用方 | host.run() 完成后获取 record |
| `summarizeAiAgentSessionRecord(record)` | `useSessionDiagnostics` | 生成摘要统计 |
| `createAiAgentSessionTranscript(record)` | `useSessionDiagnostics` | 生成转录视图 |
| `previewAiAgentDiagnosticValue(args, limit)` | `useSessionStream.appendToolCall` | 转换 `ToolCallDisplayItem` 时截断 args/result |

流式数据通过调用方传入的 callbacks 驱动 `useSessionStream`，组件不直接接触 `AiAgentHost` 或 `AiAgentSession`。

### 7.4 Abort 语义

- `abortController.abort()` → tool-loop-runner 在下一轮开始时 `return`（`tool-loop-runner.ts:132-133`）；`host.run()` 可能 resolve 而非 reject
- `stopSession()` **不**被调用——sessionStore 中该会话仍为 `'Started'`
- 本地 Stop 按钮应调用 `stream.markAborted('本地已中断')`，**不依赖** `host.run()` 的 reject/catch
- `.finally(() => stream.finish())` 负责兜底关闭 streaming 状态

---

## 八、导出策略

### 8.1 barrel export (`ai/index.ts`)

```typescript
// ── 组件 ──
export { default as AiSessionTracePanel } from './components/AiSessionTracePanel.vue'

// ── composables ──
export { useSessionStream } from './composables/useSessionStream'
export { useSessionDiagnostics } from './composables/useSessionDiagnostics'

// ── 组件 Props 类型 ──
export type { AiSessionTracePanelProps } from './components/AiSessionTracePanel.props'
export type { SessionStreamViewProps } from './components/SessionStreamView.props'
export type { SessionChatBubbleProps } from './components/SessionChatBubble.props'
export type { SessionReasoningBlockProps } from './components/SessionReasoningBlock.props'
export type { SessionToolCallCardProps } from './components/SessionToolCallCard.props'
export type { SessionDiagnosticsPanelProps } from './components/SessionDiagnosticsPanel.props'

// ── composable 类型 ──
export type { UseSessionStreamReturn } from './composables/useSessionStream'
export type { UseSessionDiagnosticsOptions, UseSessionDiagnosticsReturn } from './composables/useSessionDiagnostics'

// ── 领域类型（SSOT：ai/types.ts） ──
export type {
  StreamDisplayEntry,
  ToolCallDisplayItem,
  ReasoningDisplayItem,
  SessionDiagnosticsData,
  SessionDiagnosticIssue,
} from './types'
```

注意：
- **不导出** `AiSessionKey`（sessionKey 是内部实现细节）
- **不导出** M2 类型（`AiSessionRunner`、`AiSessionMonitorEntry` 等）——避免在当前内核能力不足时提前冻结 API

### 8.2 在 spark-component 总入口中注册

在 `packages/spark-component/src/index.ts` 中添加 AI 段落的导出。AI 组件**不**注册到 `Spark.register()`（不是页面渲染器，不由 `SparkComponentRenderer` 递归渲染）。

---

## 九、工具结果截断规范

工具调用参数的截断在 `useSessionStream.appendToolCall()` 中完成（composable 层），组件层只接收 `argsPreview: string` 和 `resultSummary: string | null`：

```typescript
function toToolCallDisplayItem(record: AiAgentToolCallRecord): ToolCallDisplayItem {
  return {
    toolName: record.toolName,
    argsPreview: previewAiAgentDiagnosticValue(record.args, 200),
    turnId: record.turnId,
    round: record.round,
    callId: record.callId ?? null,
    status: record.status,
    resultSummary: previewAiAgentDiagnosticValue(record.result, 300),
    durationMs: record.durationMs,
  }
}
```

- `argsPreview`：200 字符截断
- `resultSummary`：300 字符截断
- 诊断面板转录条目中的 content/args/result：使用 `previewAiAgentDiagnosticValue` 默认 12000 字符限制

禁止在 `SessionToolCallCard` 组件中做 `JSON.stringify` + `JSON dump`，防止大参数撑爆 UI。

---

## 十、Element Plus 组件使用清单

| 场景 | 组件 |
|------|------|
| 布局 | `el-row`, `el-col` |
| 卡片 | `el-card` |
| 折叠（推理块） | `el-collapse`, `el-collapse-item` |
| 标签/徽章（工具状态） | `el-tag`, `el-badge` |
| 描述列表（诊断统计） | `el-descriptions`, `el-descriptions-item` |
| 时间线（诊断问题） | `el-timeline`, `el-timeline-item` |
| 空状态 | `el-empty` |
| 加载骨架 | `el-skeleton` |
| 滚动条 | `el-scrollbar` |
| 提示 | `el-tooltip` |
| 图标 | `Loading`, `CircleCheck`, `CircleClose`, `Promotion`（`@element-plus/icons-vue`） |

---

## 十一、验证方案

### 11.1 类型检查

```bash
pnpm --filter @spark-view/spark-component run typecheck
```

### 11.2 代码规范

```bash
pnpm --filter @spark-view/spark-component run lint
pnpm run verify:rules
pnpm run lint          # 根级 lint，因为 package lint 当前不扫 .vue
```

### 11.3 单元测试

```bash
pnpm --filter @spark-view/spark-component exec vitest run src/tests/ai/
```

测试文件与关键用例：

**`useSessionStream.test.ts`**：
- `appendEvent` 记录 activeTurnId → `appendDelta` 归入正确 turn
- **`onStreamEvent` 先到、`onDelta` 后到时**，delta 能归入正确 turn（核心用例）
- delta/reasoning **交错**出现（reasoning → delta → reasoning → delta），同 turnId 的同类条目正确合并
- 顺序 turn 切换——第二个 `appendEvent` 切换 activeTurnId 后，delta 归入新 turn
- **无活跃 turn 时调用 `appendDelta`** → 追加 `kind='error'` 协议错误条目，不静默丢弃
- **无活跃 turn 时调用 `appendReasoning`** → 同上
- `appendReasoning` + `finalizeCurrentTurn` → reasoning 折叠
- `appendToolCall` → 条目追加，argsPreview/resultSummary 为截断后的字符串
- **`markAborted('本地已中断')`** → 追加 system-message 条目 + `finish()` 关闭 streaming
- **`finish()` 在活跃 turn 存在时** → 调用 `finalizeCurrentTurn` 固化条目，`isStreaming=false`
- **`finish()` 在无活跃 turn 时** → 仅设置 `isStreaming=false`，不抛错
- `reset` → 所有状态清空
- **`host.run` reject → `appendError` + `finish()`** → streaming 关闭，错误条目可见

**`useSessionDiagnostics.test.ts`**：
- 正常 sessionRecord → summary/transcript/issue 正确
- null sessionRecord → 返回空摘要（非 null）
- 失败 functionCall → issue 列表包含对应条目

**`AiSessionTracePanel.test.ts`**：
- 挂载测试（传入 mock record + entries），验证子组件渲染
- 空状态：无 record + 无 entries → emptyText 显示

### 11.4 配置验证

实施时需确认以下配置文件已更新：
- `packages/spark-component/package.json` — 新增 `@spark-view/spark-ai: workspace:*`
- `packages/spark-component/tsconfig.build.json` — 新增 `@spark-view/spark-ai` 和 `/agent` 路径映射
- `packages/spark-component/vitest.config.ts` — 新增 spark-ai alias

---

## 十二、M2/M3 展望

### M2 计划（依赖 M1 完成）

- `SessionInputBar.vue`（textarea + 附件引用 + Send/Stop 按钮）
- `AiSessionRunner` 接口 + adapter 实现示例（调用方参考）
- 多模态附件引用：文本描述 + URL + 文件名（base64 仅 UI 预览，不进 historyMsgs）
- `SessionTabBar.vue`（el-tabs，按 `{ moduleId, moduleInstanceId }` 对管理多个 session）

### M3 计划（依赖 spark-ai 内核补齐）

- `beforeFunctionCall` 钩子 → 执行前工具审批
- `AiAgentSession.stop(reason)` → 正确的会话停止
- `sessionStore.listSessions()` 暴露 → 多会话发现
- `AiSessionRunner` / `AiSessionMonitorEntry` 在此时正式导出为公共 API

---

## 十三、关键设计决策

| 决策 | 理由 |
|------|------|
| 组件不管理 Host 生命周期 | `host.run()` await 首轮完成才 resolve；调用方自行编排 |
| turnId 由 `appendEvent` 从 `event.scope.turnId` 提取 | `onDelta`/`onReasoning` 签名无 turnId；`onStreamEvent` 是唯一入口 |
| 流视图仅展示 live callbacks entries | 不与 `sessionRecord.history` 混合，避免重复和时序混乱 |
| 诊断面板 = post-completion snapshot | `sessionRecord` 仅在 `host.run()` 返回后可用 |
| Props 类型不用 `R*` 前缀 | `R` 是 Renderer/SparkNode 命名约定，AI 面板不是 registry renderer |
| `diagnostics` 永远有值（非 null） | `summarizeAiAgentSessionRecord(null)` 支持空记录 |
| 条目更新用数组替换 | 遵循 Readonly 约束，保证 Vue 响应式正确触发 |
| args/result 用 `previewAiAgentDiagnosticValue` 截断 | 防止大 JSON dump 撑爆 UI |
| M1 不导出 M2 类型 | 避免在 `send/abort/stop` 管线不完整时提前冻结 API |
| 不暴露 DefaultAiAgentSessionStore 内部 key 格式 | `sessionKey = moduleId + "\0" + moduleInstanceId"` 是实现细节 |
