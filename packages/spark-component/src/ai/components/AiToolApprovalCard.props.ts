/**
 * @module @spark-appworks/spark-component:ai/components/AiToolApprovalCard.props
 * @spark-appworks/spark-component 的 ai/components/AiToolApprovalCard.props 模块。
 * 导出 ClassModel symbol: AiToolApprovalCardProps, AiToolApprovalCardEmits（共 2 个 symbol）。
 */
import type { ToolApprovalDisplayItem } from '../types'

/** Ai Tool Approval Card Props 的属性契约。 */
export type AiToolApprovalCardProps = Readonly<{
  request: ToolApprovalDisplayItem
}>

/** Ai Tool Approval Card Emits 的语义模型。 */
export type AiToolApprovalCardEmits = Readonly<{
  allow: [id: string]
  reject: [id: string, reason: string]
  abort: [id: string, reason: string]
}>
