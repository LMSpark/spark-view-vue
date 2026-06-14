/**
 * @module @spark-appworks/spark-component:ai/components/SparkAgentPanel.props
 * 职责：定义 SparkAgentPanel 组合壳 props。
 * 边界：只描述现有 AI trace UI 与 AG-UI timeline 投影的组合输入。
 * AI用途：接入 AG-UI 事件展示时，用本模块确认组件输入契约。
 */
import type {
  SessionDiagnosticsData,
  SparkAgentTimelineEvent,
  StreamDisplayEntry,
} from '../types'

/** SparkAgentPanel 的组合输入，复用既有 trace UI，并可选展示 AG-UI timeline 摘要。 */
export type SparkAgentPanelProps = Readonly<{
  entries: readonly StreamDisplayEntry[]
  isStreaming: boolean
  isReasoning: boolean
  diagnostics: SessionDiagnosticsData
  timelineEvents?: readonly SparkAgentTimelineEvent[]
  showTimeline?: boolean
  height?: string
  emptyText?: string
  timelineEmptyText?: string
}>
