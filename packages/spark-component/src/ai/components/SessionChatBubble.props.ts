/**
 * @module @spark-appworks/spark-component:ai/components/SessionChatBubble.props
 * @spark-appworks/spark-component 的 ai/components/SessionChatBubble.props 模块。
 * 导出 ClassModel symbol: SessionChatBubbleProps（共 1 个 symbol）。
 */
/** Session Chat Bubble Props 的属性契约。 */
export type SessionChatBubbleProps = Readonly<{
  role: 'user' | 'assistant' | 'system' | 'error'
  content: string
  timestamp?: number
  isTyping?: boolean
}>
