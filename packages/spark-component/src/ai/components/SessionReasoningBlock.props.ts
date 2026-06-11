/**
 * @module @spark-appworks/spark-component:ai/components/SessionReasoningBlock.props
 * 职责：维护 @spark-appworks/spark-component 中 ai/components/SessionReasoningBlock.props 的模块能力，围绕 SessionReasoningBlockProps 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 ai/components/SessionReasoningBlock.props 的声明、导出和使用边界时，从本模块开始。
 */
/** Session Reasoning Block Props 的属性契约。 */
export type SessionReasoningBlockProps = Readonly<{
  text: string
  collapsed?: boolean
  isActive?: boolean
}>
