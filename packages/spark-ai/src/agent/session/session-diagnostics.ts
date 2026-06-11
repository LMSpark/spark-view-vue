/**
 * ═══════════════════════════════════════════════════════════════
 * agent/session/session-diagnostics.ts — AI 会话历史诊断工具
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Agent 会话层的只读诊断入口。从 AiAgentSessionRecord
 *   提取摘要和转录视图，用于 Agent 能力诊断、冒烟运行摘要、
 *   调试面板或日志导出。不修改 sessionStore 状态。
 *
 * 【核心函数】
 *   summarizeAiAgentSessionRecord  — 汇总会话数量、失败工具调用、最后助手文本
 *   createAiAgentSessionTranscript  — 将 session history 转为方向标识的调试转录
 *   previewAiAgentDiagnosticValue   — 安全序列化并裁剪诊断值
 *
 * 【消费方】APP 层调试面板、冒烟运行摘要、日志导出
 * ═══════════════════════════════════════════════════════════════
 */

import type {
  AiAgentFunctionCallHistoryEntry,
  AiAgentHistoryEntry,
  AiAgentMessageHistoryEntry,
  AiAgentSessionRecord,
} from './session-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 公共 DTO
// ═══════════════════════════════════════════════════════════════

/** Ai Agent Session Summary 的语义模型。 */
export type AiAgentSessionSummary = Readonly<{
  status: string | null
  historyCount: number
  messageCount: number
  toolCallCount: number
  failedToolCallCount: number
  functionNames: readonly string[]
  lastAssistantText: string
}>

/** Ai Agent Session Transcript Entry 的语义模型。 */
export type AiAgentSessionTranscriptEntry = Readonly<{
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

/** Ai Agent Session Transcript Options 的调用配置。 */
export type AiAgentSessionTranscriptOptions = Readonly<{
  contentLimit?: number
}>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 公共诊断入口
// ═══════════════════════════════════════════════════════════════

// AI_AGENT_REFACTOR_SOURCE[session-diagnostics]: AI 会话摘要和转录来自 sessionStore；冒烟检查不能维护重复历史。
/**
 * 汇总会话历史的数量、失败工具调用和最后一条助手文本。
 * 用于判断 Agent 工具能力是否闭环，也是再次接入会话前的轻量状态视图。
 *
 * `sessionRecord` 为空时返回空摘要，便于冒烟检查在会话启动失败后仍能生成当前运行摘要。
 */
export function summarizeAiAgentSessionRecord(sessionRecord: AiAgentSessionRecord | null | undefined): AiAgentSessionSummary {
  const history = getAiAgentSessionHistory(sessionRecord)
  const messageEntries = history.filter(isMessageEntry)
  const functionCallEntries = history.filter(isFunctionCallEntry)
  const failedFunctionCalls = functionCallEntries.filter((entry) => entry.status === 'failed')
  const functionNames = functionCallEntries
    .map((entry) => entry.toolName.trim())
    .filter((toolName) => toolName.length > 0)
  return {
    status: sessionRecord?.status ?? null,
    historyCount: history.length,
    messageCount: messageEntries.length,
    toolCallCount: functionCallEntries.length,
    failedToolCallCount: failedFunctionCalls.length,
    functionNames,
    lastAssistantText: latestAiAgentAssistantText(sessionRecord),
  }
}

/**
 * 将 session history 转成固定方向标识的调试转录。
 *
 * 转录会裁剪长字段，但不会丢弃条目顺序；调用方可展示在调试面板或临时日志中。
 * 它是 sessionStore 历史的视图，不是新的历史存储。
 */
export function createAiAgentSessionTranscript(
  sessionRecord: AiAgentSessionRecord | null | undefined,
  options: AiAgentSessionTranscriptOptions = {},
): readonly AiAgentSessionTranscriptEntry[] {
  const limit = normalizePreviewLimit(options.contentLimit)
  return getAiAgentSessionHistory(sessionRecord).map((entry) => {
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
        content: previewAiAgentDiagnosticValue(entry.content, limit),
      }
    }
    if (isFunctionCallEntry(entry)) {
      return {
        ...base,
        kind: 'functionCall',
        direction: 'AGENT TOOL => LLM',
        toolName: entry.toolName,
        status: entry.status,
        args: previewAiAgentDiagnosticValue(entry.args, limit),
        result: previewAiAgentDiagnosticValue(entry.result ?? entry.error ?? null, limit),
      }
    }
    return {
      ...base,
      kind: 'unknown',
      direction: 'UNKNOWN',
      content: previewAiAgentDiagnosticValue(entry, limit),
    }
  })
}

/**
 * 安全序列化诊断值，并按字符数裁剪。
 *
 * 该函数只用于日志/诊断展示，不应作为协议 payload 编解码入口。
 */
export function previewAiAgentDiagnosticValue(value: unknown, contentLimit = 12_000): string {
  const text = typeof value === 'string' ? value : stringifyDiagnosticValue(value)
  if (text.length <= contentLimit) return text
  return `${text.slice(0, contentLimit)}\n...<truncated ${text.length - contentLimit} chars>`
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 内部读取辅助
// ═══════════════════════════════════════════════════════════════

function getAiAgentSessionHistory(sessionRecord: AiAgentSessionRecord | null | undefined): readonly AiAgentHistoryEntry[] {
  return sessionRecord?.history ?? []
}

function latestAiAgentAssistantText(sessionRecord: AiAgentSessionRecord | null | undefined): string {
  const history = getAiAgentSessionHistory(sessionRecord)
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

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 内部类型守卫与格式化
// ═══════════════════════════════════════════════════════════════

function isMessageEntry(entry: AiAgentHistoryEntry): entry is AiAgentMessageHistoryEntry {
  return entry.kind === 'message'
}

function isAssistantMessageEntry(entry: AiAgentHistoryEntry): entry is AiAgentMessageHistoryEntry {
  return isMessageEntry(entry) && entry.role === 'assistant'
}

function isFunctionCallEntry(entry: AiAgentHistoryEntry): entry is AiAgentFunctionCallHistoryEntry {
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
