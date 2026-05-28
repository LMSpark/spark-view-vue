/**
 * useSessionStream — 回调 → 响应式流缓冲 + 状态机。
 *
 * 代表一条被监视的会话流，不支持多个并发 host.run() 共享同一实例。
 * 每个 stream 实例对应一个串行 turn 序列。
 */

import { ref } from 'vue'
import type { Ref } from 'vue'
import type {
  AiAgentToolCallRecord,
  AiAgentStreamEvent,
} from '@spark-view/spark-ai/agent'
import { previewAiAgentDiagnosticValue } from '@spark-view/spark-ai/agent'
import type { StreamDisplayEntry, ToolCallDisplayItem } from '../types'

export type UseSessionStreamReturn = Readonly<{
  streamText: Ref<string>
  reasoningText: Ref<string>
  isStreaming: Ref<boolean>
  isReasoning: Ref<boolean>
  entries: Ref<StreamDisplayEntry[]>
  toolCalls: Ref<ToolCallDisplayItem[]>

  appendUserMessage: (content: string) => void
  appendDelta: (delta: string) => void
  appendReasoning: (text: string) => void
  appendEvent: (event: AiAgentStreamEvent) => void
  appendToolCall: (record: AiAgentToolCallRecord) => void
  appendError: (message: string) => void
  markAborted: (message?: string) => void
  finish: () => void
  reset: () => void
}>

export function useSessionStream(): UseSessionStreamReturn {
  // ── 响应式状态 ──
  const streamText = ref('')
  const reasoningText = ref('')
  const isStreaming = ref(false)
  const isReasoning = ref(false)
  const entries = ref<StreamDisplayEntry[]>([])
  const toolCalls = ref<ToolCallDisplayItem[]>([])

  // ── 内部状态 ──
  let activeTurnId: string | null = null

  // ── 条目查找辅助 ──

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
    const turnId = event.scope.turnId
    if (turnId.length === 0) return

    const eventType = String(event.type)

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
      appendError(readErrorMessage(event.data))
      finalizeCurrentTurn()
      return
    }
  }

  // ── error data 安全读取 ──

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

  // ── 用户消息 ──

  function appendUserMessage(content: string): void {
    entries.value = [
      ...entries.value,
      { kind: 'user-message', content, timestamp: Date.now() },
    ]
  }

  // ── 错误 ──

  function appendError(message: string): void {
    entries.value = [
      ...entries.value,
      { kind: 'error', message, timestamp: Date.now() },
    ]
    isStreaming.value = false
    isReasoning.value = false
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

  // ── 重置 ──

  function reset(): void {
    activeTurnId = null
    streamText.value = ''
    reasoningText.value = ''
    isStreaming.value = false
    isReasoning.value = false
    entries.value = []
    toolCalls.value = []
  }

  return {
    streamText,
    reasoningText,
    isStreaming,
    isReasoning,
    entries,
    toolCalls,

    appendUserMessage,
    appendDelta,
    appendReasoning,
    appendEvent,
    appendToolCall,
    appendError,
    markAborted,
    finish,
    reset,
  } as const
}
