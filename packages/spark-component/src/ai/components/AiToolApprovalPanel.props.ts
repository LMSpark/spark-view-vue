/**
 * @module @spark-appworks/spark-component:ai/components/AiToolApprovalPanel.props
 * @spark-appworks/spark-component 的 ai/components/AiToolApprovalPanel.props 模块。
 * 导出 ClassModel symbol: AiToolApprovalPanelProps（共 1 个 symbol）。
 */
import type { ToolApprovalDisplayItem } from '../types'

/** Ai Tool Approval Panel Props 的属性契约。 */
export type AiToolApprovalPanelProps = Readonly<{
  pending: readonly ToolApprovalDisplayItem[]
  emptyText?: string
}>
