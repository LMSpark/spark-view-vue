import type { ToolApprovalDisplayItem } from '../types'

export type AiToolApprovalCardProps = Readonly<{
  request: ToolApprovalDisplayItem
}>

export type AiToolApprovalCardEmits = Readonly<{
  allow: [id: string]
  reject: [id: string, reason: string]
  abort: [id: string, reason: string]
}>
