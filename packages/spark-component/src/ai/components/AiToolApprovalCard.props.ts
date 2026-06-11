/**
 * @module @spark-appworks/spark-component:ai/components/AiToolApprovalCard.props
 * 职责：维护 @spark-appworks/spark-component 中 ai/components/AiToolApprovalCard.props 的模块能力，围绕 AiToolApprovalCardProps、AiToolApprovalCardEmits 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 ai/components/AiToolApprovalCard.props 的声明、导出和使用边界时，从本模块开始。
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
