import type { ToolApprovalDisplayItem } from '../types'

export type AiToolApprovalPanelProps = Readonly<{
  pending: readonly ToolApprovalDisplayItem[]
  emptyText?: string
}>
