import type { StreamDisplayEntry, SessionDiagnosticsData } from '../types'

/**
 * AiSessionTracePanel 根组件 Props。
 *
 * entries       — 外部 AI runtime 传入的 live 流展示条目（不由 UI 组件创建或缓存）。
 * isStreaming   — 是否正在接收流式增量。
 * isReasoning   — 是否正在接收推理文本。
 * diagnostics   — 外部诊断投影。永远有值（含空摘要）。
 * height        — 面板高度 CSS 值，默认 '100%'。
 * emptyText     — 无 live entries 且诊断投影为空时的占位文本。
 */
export type AiSessionTracePanelProps = Readonly<{
  entries: readonly StreamDisplayEntry[]
  isStreaming: boolean
  isReasoning: boolean
  diagnostics: SessionDiagnosticsData
  height?: string
  emptyText?: string
}>
