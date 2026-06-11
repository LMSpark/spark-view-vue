/**
 * @module @spark-appworks/spark-ai:agent/session/session-run-trace
 * 职责：定义或实现 Agent 会话存储、诊断和运行轨迹中的 session run trace 能力。
 * 边界：只维护 session 层状态和观测数据，不生成业务输入契约，也不直接执行工具 runtime。
 * AI用途：追踪会话记录、诊断事件或 run trace 时，用本模块确认 session 数据如何保存和读取。
 */
/**
 * agent/session/session-run-trace.ts — headless AI run trace.
 *
 * This is a compact, UI-independent projection of one active AI run. It is
 * not the durable conversation source; the backend DB owns persisted history.
 */

import type { AiAgentStreamEvent, AiAgentToolCallRecord } from '../chat/chat-types'
import { previewAiAgentDiagnosticValue } from './session-diagnostics'

/** Ai Agent Run Trace Tool Call 的语义模型。 */
export type AiAgentRunTraceToolCall = Readonly<{
  toolName: string
  argsPreview: string
  turnId: string
  round: number
  callId: string | null
  status: 'success' | 'error'
  resultSummary: string | null
  durationMs: number
}>

/** Ai Agent Run Trace Reasoning 的语义模型。 */
export type AiAgentRunTraceReasoning = Readonly<{
  text: string
  turnId: string
  collapsed: boolean
}>

/** Ai Agent Run Trace Entry 的语义模型。 */
export type AiAgentRunTraceEntry =
  | Readonly<{ kind: 'user-message'; content: string; timestamp: number }>
  | Readonly<{ kind: 'assistant-delta'; content: string; turnId: string }>
  | Readonly<{ kind: 'assistant-complete'; content: string; turnId: string }>
  | Readonly<{ kind: 'reasoning'; item: AiAgentRunTraceReasoning }>
  | Readonly<{ kind: 'tool-call'; item: AiAgentRunTraceToolCall }>
  | Readonly<{ kind: 'error'; message: string; timestamp: number }>
  | Readonly<{ kind: 'system-message'; content: string; timestamp: number }>

/** Ai Agent Run Trace Snapshot 的语义模型。 */
export type AiAgentRunTraceSnapshot = Readonly<{
  streamText: string
  reasoningText: string
  isStreaming: boolean
  isReasoning: boolean
  entries: readonly AiAgentRunTraceEntry[]
  toolCalls: readonly AiAgentRunTraceToolCall[]
}>

/** Ai Agent Run Trace Options 的调用配置。 */
export type AiAgentRunTraceOptions = Readonly<{
  now?: () => number
  argsPreviewLimit?: number
  resultPreviewLimit?: number
}>

/** Ai Agent Run Trace Listener 的语义模型。 */
export type AiAgentRunTraceListener = (snapshot: AiAgentRunTraceSnapshot) => void

/** Ai Agent Run Trace 的语义模型。 */
export type AiAgentRunTrace = Readonly<{
  snapshot(): AiAgentRunTraceSnapshot
  subscribe(listener: AiAgentRunTraceListener): () => void
  appendUserMessage(content: string): void
  appendDelta(delta: string): void
  appendReasoning(text: string): void
  appendEvent(event: AiAgentStreamEvent): void
  appendToolCall(record: AiAgentToolCallRecord): void
  appendError(message: string): void
  markAborted(message?: string): void
  finish(): void
  reset(): void
}>

type MutableTraceState = {
  streamText: string
  reasoningText: string
  isStreaming: boolean
  isReasoning: boolean
  entries: AiAgentRunTraceEntry[]
  toolCalls: AiAgentRunTraceToolCall[]
  activeTurnId: string | null
}

const DEFAULT_ARGS_PREVIEW_LIMIT = 200
const DEFAULT_RESULT_PREVIEW_LIMIT = 300

export function createAiAgentRunTrace(options: AiAgentRunTraceOptions = {}): AiAgentRunTrace {
  return new DefaultAiAgentRunTrace(options)
}

class DefaultAiAgentRunTrace implements AiAgentRunTrace {
  private readonly state: MutableTraceState = createEmptyState()
  private readonly listeners = new Set<AiAgentRunTraceListener>()
  private readonly now: () => number
  private readonly argsPreviewLimit: number
  private readonly resultPreviewLimit: number

  public constructor(options: AiAgentRunTraceOptions) {
    this.now = options.now ?? Date.now
    this.argsPreviewLimit = options.argsPreviewLimit ?? DEFAULT_ARGS_PREVIEW_LIMIT
    this.resultPreviewLimit = options.resultPreviewLimit ?? DEFAULT_RESULT_PREVIEW_LIMIT
  }

  public snapshot(): AiAgentRunTraceSnapshot {
    return snapshotState(this.state)
  }

  public subscribe(listener: AiAgentRunTraceListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  public appendEvent(event: AiAgentStreamEvent): void {
    const turnId = event.scope.turnId
    if (turnId.length === 0) return

    const eventType = String(event.type)

    if (
      eventType === 'llm-request'
      || eventType === 'delta'
      || eventType.includes('message.delta')
    ) {
      this.state.activeTurnId = turnId
      this.state.isStreaming = true
      this.emit()
      return
    }

    if (eventType === 'reasoning') {
      this.state.activeTurnId = turnId
      this.state.isStreaming = true
      this.state.isReasoning = true
      this.emit()
      return
    }

    if (
      eventType === 'result'
      || eventType === 'done'
      || eventType.includes('message.completed')
    ) {
      this.finalizeCurrentTurn()
      return
    }

    if (eventType === 'error') {
      this.appendError(readErrorMessage(event.data))
      this.finalizeCurrentTurn()
    }
  }

  public appendDelta(delta: string): void {
    const turnId = this.state.activeTurnId
    if (turnId === null) {
      this.appendProtocolError('Received AI delta before any turn event.')
      return
    }
    this.appendAssistantDelta(turnId, delta)
  }

  public appendReasoning(text: string): void {
    const turnId = this.state.activeTurnId
    if (turnId === null) {
      this.appendProtocolError('Received AI reasoning before any turn event.')
      return
    }
    this.appendReasoningEntry(turnId, text)
  }

  public appendToolCall(record: AiAgentToolCallRecord): void {
    const item: AiAgentRunTraceToolCall = {
      toolName: record.toolName,
      argsPreview: previewAiAgentDiagnosticValue(record.args, this.argsPreviewLimit),
      turnId: record.turnId,
      round: record.round,
      callId: record.callId ?? null,
      status: record.status,
      resultSummary: previewAiAgentDiagnosticValue(record.result, this.resultPreviewLimit),
      durationMs: record.durationMs,
    }
    this.state.toolCalls = [...this.state.toolCalls, item]
    this.state.entries = [
      ...this.state.entries,
      { kind: 'tool-call', item },
    ]
    this.emit()
  }

  public appendUserMessage(content: string): void {
    this.state.entries = [
      ...this.state.entries,
      { kind: 'user-message', content, timestamp: this.now() },
    ]
    this.emit()
  }

  public appendError(message: string): void {
    this.state.entries = [
      ...this.state.entries,
      { kind: 'error', message, timestamp: this.now() },
    ]
    this.state.isStreaming = false
    this.state.isReasoning = false
    this.emit()
  }

  public markAborted(message?: string): void {
    this.state.entries = [
      ...this.state.entries,
      {
        kind: 'system-message',
        content: message ?? '本地已中断',
        timestamp: this.now(),
      },
    ]
    this.finish()
  }

  public finish(): void {
    if (this.state.activeTurnId !== null) {
      this.finalizeCurrentTurn()
      return
    }
    this.state.isStreaming = false
    this.state.isReasoning = false
    this.emit()
  }

  public reset(): void {
    replaceState(this.state, createEmptyState())
    this.emit()
  }

  private appendProtocolError(message: string): void {
    this.state.entries = [
      ...this.state.entries,
      { kind: 'error', message, timestamp: this.now() },
    ]
    this.emit()
  }

  private appendAssistantDelta(turnId: string, delta: string): void {
    this.state.streamText += delta
    this.state.isStreaming = true

    const index = findLastEntryIndex(
      this.state.entries,
      (entry) => entry.kind === 'assistant-delta' && entry.turnId === turnId,
    )
    if (index >= 0) {
      const existing = this.state.entries[index]
      if (existing?.kind === 'assistant-delta') {
        this.replaceEntryAt(index, {
          ...existing,
          content: existing.content + delta,
        })
        this.emit()
        return
      }
    }
    this.state.entries = [
      ...this.state.entries,
      { kind: 'assistant-delta', content: delta, turnId },
    ]
    this.emit()
  }

  private appendReasoningEntry(turnId: string, text: string): void {
    this.state.reasoningText += text
    this.state.isReasoning = true

    const index = findLastEntryIndex(
      this.state.entries,
      (entry) => entry.kind === 'reasoning' && entry.item.turnId === turnId,
    )
    if (index >= 0) {
      const existing = this.state.entries[index]
      if (existing?.kind === 'reasoning') {
        this.replaceEntryAt(index, {
          kind: 'reasoning',
          item: { text: existing.item.text + text, turnId, collapsed: false },
        })
        this.emit()
        return
      }
    }
    this.state.entries = [
      ...this.state.entries,
      { kind: 'reasoning', item: { text, turnId, collapsed: false } },
    ]
    this.emit()
  }

  private finalizeCurrentTurn(): void {
    const turnId = this.state.activeTurnId
    if (turnId === null) {
      this.state.isStreaming = false
      this.state.isReasoning = false
      this.emit()
      return
    }

    this.state.entries = this.state.entries.map((entry) => {
      if (entry.kind === 'assistant-delta' && entry.turnId === turnId) {
        return { kind: 'assistant-complete', content: entry.content, turnId }
      }
      if (entry.kind === 'reasoning' && entry.item.turnId === turnId) {
        return { kind: 'reasoning', item: { ...entry.item, collapsed: true } }
      }
      return entry
    })

    this.state.activeTurnId = null
    this.state.isStreaming = false
    this.state.isReasoning = false
    this.emit()
  }

  private replaceEntryAt(index: number, replacement: AiAgentRunTraceEntry): void {
    this.state.entries = this.state.entries.map((entry, i) =>
      i === index ? replacement : entry,
    )
  }

  private emit(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}

function createEmptyState(): MutableTraceState {
  return {
    streamText: '',
    reasoningText: '',
    isStreaming: false,
    isReasoning: false,
    entries: [],
    toolCalls: [],
    activeTurnId: null,
  }
}

function replaceState(target: MutableTraceState, source: MutableTraceState): void {
  target.streamText = source.streamText
  target.reasoningText = source.reasoningText
  target.isStreaming = source.isStreaming
  target.isReasoning = source.isReasoning
  target.entries = source.entries
  target.toolCalls = source.toolCalls
  target.activeTurnId = source.activeTurnId
}

function snapshotState(state: MutableTraceState): AiAgentRunTraceSnapshot {
  return {
    streamText: state.streamText,
    reasoningText: state.reasoningText,
    isStreaming: state.isStreaming,
    isReasoning: state.isReasoning,
    entries: [...state.entries],
    toolCalls: [...state.toolCalls],
  }
}

function findLastEntryIndex(
  entries: readonly AiAgentRunTraceEntry[],
  predicate: (entry: AiAgentRunTraceEntry) => boolean,
): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry !== undefined && predicate(entry)) return index
  }
  return -1
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readErrorMessage(data: unknown): string {
  if (typeof data === 'string' && data.trim().length > 0) return data
  if (isPlainObject(data)) {
    const message = data['message']
    if (typeof message === 'string' && message.trim().length > 0) return message
  }
  return 'AI turn error'
}
