/**
 * AI 会话监视组件 — 共享领域类型（SSOT）。
 *
 * StreamDisplayEntry、ToolCallDisplayItem、ReasoningDisplayItem
 * 等流展示类型只在这里定义。UI 组件只消费外部传入的展示投影。
 */

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
 * 真正的状态机在 spark-ai，UI 只消费这个简版投影。
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
 * 由外部 runtime/diagnostics 层生成；UI 只渲染摘要投影，不读取完整 session。
 */
export type SessionDiagnosticsData = Readonly<{
  summary: AiAgentSessionSummary
  transcript: readonly AiAgentSessionTranscriptEntry[]
  issues: readonly SessionDiagnosticIssue[]
}>

// ── 工具审批 ──

/**
 * 待审批工具调用的展示条目。
 * 只包含调用方映射后的展示字段，不依赖上游包类型。
 */
export type ToolApprovalDisplayItem = Readonly<{
  id: string
  toolName: string
  argsPreview: string
  moduleId: string
}>
