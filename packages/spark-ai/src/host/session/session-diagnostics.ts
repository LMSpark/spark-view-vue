/**
 * AI Host session diagnostics.
 *
 * 该模块只解释 `AiHostSessionRecord` 的通用历史结构，用于 Agent 能力诊断、
 * smoke 当前运行摘要、调试面板或日志导出。
 *
 * 历史会话本身仍保留在 `sessionStore` 中，也是后续再次接入同一会话的起点。
 * diagnostics 只提供摘要/转录视图，不理解 pageDesign、业务模块、工具参数语义，
 * 也不改变 sessionStore 状态。
 */

import type {
  AiHostFunctionCallHistoryEntry,
  AiHostHistoryEntry,
  AiHostMessageHistoryEntry,
  AiHostSessionRecord,
} from './session-types'

// ── 公共 DTO ────────────────────────────────────────────────

export type AiHostSessionSummary = Readonly<{
  status: string | null
  historyCount: number
  messageCount: number
  toolCallCount: number
  failedToolCallCount: number
  actionNames: readonly string[]
  lastAssistantText: string
}>

export type AiHostSessionTranscriptEntry = Readonly<{
  seq: number | null
  id: string
  timestamp: string | null
  kind: 'message' | 'functionCall' | 'unknown'
  direction: string
  role?: string
  source?: string
  toolName?: string
  status?: string
  content?: string
  args?: string
  result?: string
}>

export type AiHostSessionTranscriptOptions = Readonly<{
  contentLimit?: number
}>

// ── 公共诊断入口 ────────────────────────────────────────────

// PAGE_DESIGN_REFACTOR_SOURCE[session-diagnostics]: AI 会话历史摘要/转录的通用来源；历史保留在 spark-ai sessionStore，smoke 只读取，不另存完整历史副本。
/**
 * 汇总会话历史的数量、失败工具调用和最后一条助手文本。
 * 用于判断 Agent 工具能力是否闭环，也是再次接入会话前的轻量状态视图。
 *
 * `sessionRecord` 为空时返回空摘要，便于 smoke 在会话启动失败后仍能生成当前运行摘要。
 */
export function summarizeAiHostSessionRecord(sessionRecord: AiHostSessionRecord | null | undefined): AiHostSessionSummary {
  const history = getAiHostSessionHistory(sessionRecord)
  const messageEntries = history.filter(isMessageEntry)
  const functionCallEntries = history.filter(isFunctionCallEntry)
  const failedFunctionCalls = functionCallEntries.filter((entry) => entry.status === 'failed')
  const actionNames = functionCallEntries
    .map((entry) => entry.toolName.trim())
    .filter((toolName) => toolName.length > 0)
  return {
    status: sessionRecord?.status ?? null,
    historyCount: history.length,
    messageCount: messageEntries.length,
    toolCallCount: functionCallEntries.length,
    failedToolCallCount: failedFunctionCalls.length,
    actionNames,
    lastAssistantText: latestAiHostAssistantText(sessionRecord),
  }
}

/**
 * 将 session history 转成固定方向标识的调试转录。
 *
 * 转录会裁剪长字段，但不会丢弃条目顺序；调用方可展示在调试面板或临时日志中。
 * 它是 sessionStore 历史的视图，不是新的历史存储。
 */
export function createAiHostSessionTranscript(
  sessionRecord: AiHostSessionRecord | null | undefined,
  options: AiHostSessionTranscriptOptions = {},
): readonly AiHostSessionTranscriptEntry[] {
  const limit = normalizePreviewLimit(options.contentLimit)
  return getAiHostSessionHistory(sessionRecord).map((entry) => {
    const base = {
      seq: typeof entry.seq === 'number' ? entry.seq : null,
      id: typeof entry.id === 'string' ? entry.id : '',
      timestamp: typeof entry.timestamp === 'number' ? new Date(entry.timestamp).toISOString() : null,
    }
    if (isMessageEntry(entry)) {
      return {
        ...base,
        kind: 'message',
        direction: messageDirection(entry.role),
        role: entry.role,
        source: entry.source,
        content: previewAiHostDiagnosticValue(entry.content, limit),
      }
    }
    if (isFunctionCallEntry(entry)) {
      return {
        ...base,
        kind: 'functionCall',
        direction: 'AGENT TOOL => LLM',
        toolName: entry.toolName,
        status: entry.status,
        args: previewAiHostDiagnosticValue(entry.args, limit),
        result: previewAiHostDiagnosticValue(entry.result ?? entry.error ?? null, limit),
      }
    }
    return {
      ...base,
      kind: 'unknown',
      direction: 'UNKNOWN',
      content: previewAiHostDiagnosticValue(entry, limit),
    }
  })
}

/**
 * 安全序列化诊断值，并按字符数裁剪。
 *
 * 该函数只用于日志/诊断展示，不应作为协议 payload 编解码入口。
 */
export function previewAiHostDiagnosticValue(value: unknown, contentLimit = 12_000): string {
  const text = typeof value === 'string' ? value : stringifyDiagnosticValue(value)
  if (text.length <= contentLimit) return text
  return `${text.slice(0, contentLimit)}\n...<truncated ${text.length - contentLimit} chars>`
}

// ── 内部读取流程 ────────────────────────────────────────────

function getAiHostSessionHistory(sessionRecord: AiHostSessionRecord | null | undefined): readonly AiHostHistoryEntry[] {
  return sessionRecord?.history ?? []
}

function latestAiHostAssistantText(sessionRecord: AiHostSessionRecord | null | undefined): string {
  const history = getAiHostSessionHistory(sessionRecord)
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index]
    if (entry === undefined) continue
    if (isAssistantMessageEntry(entry)) {
      const content = entry.content.trim()
      if (content.length > 0) return content
    }
  }
  return ''
}

// ── 私有类型守卫与格式化 ───────────────────────────────────

function isMessageEntry(entry: AiHostHistoryEntry): entry is AiHostMessageHistoryEntry {
  return entry.kind === 'message'
}

function isAssistantMessageEntry(entry: AiHostHistoryEntry): entry is AiHostMessageHistoryEntry {
  return isMessageEntry(entry) && entry.role === 'assistant'
}

function isFunctionCallEntry(entry: AiHostHistoryEntry): entry is AiHostFunctionCallHistoryEntry {
  return entry.kind === 'functionCall'
}

function messageDirection(role: string): string {
  if (role === 'user') return 'USER => AGENT'
  if (role === 'assistant') return 'LLM => AGENT'
  return 'SYSTEM => AGENT'
}

function normalizePreviewLimit(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 12_000
}

function stringifyDiagnosticValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
