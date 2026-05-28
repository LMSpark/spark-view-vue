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
