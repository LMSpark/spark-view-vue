/**
 * @module @spark-appworks/spark-component:ai/index
 * @spark-appworks/spark-component 的 ai/index 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
// ── 组件 ──
export { default as AiSessionTracePanel } from './components/AiSessionTracePanel.vue'
export { default as AiToolApprovalCard } from './components/AiToolApprovalCard.vue'
export { default as AiToolApprovalPanel } from './components/AiToolApprovalPanel.vue'

// ── composables ──

// ── 组件 Props 类型 ──
export type { AiSessionTracePanelProps } from './components/AiSessionTracePanel.props'
export type { SessionStreamViewProps } from './components/SessionStreamView.props'
export type { SessionChatBubbleProps } from './components/SessionChatBubble.props'
export type { SessionReasoningBlockProps } from './components/SessionReasoningBlock.props'
export type { SessionToolCallCardProps } from './components/SessionToolCallCard.props'
export type { SessionDiagnosticsPanelProps } from './components/SessionDiagnosticsPanel.props'
export type { AiToolApprovalCardProps, AiToolApprovalCardEmits } from './components/AiToolApprovalCard.props'
export type { AiToolApprovalPanelProps } from './components/AiToolApprovalPanel.props'

// ── composable 类型 ──

// ── 领域类型（SSOT） ──
export type {
  StreamDisplayEntry,
  ToolCallDisplayItem,
  ReasoningDisplayItem,
  SessionDiagnosticsData,
  SessionDiagnosticIssue,
  ToolApprovalDisplayItem,
} from './types'
