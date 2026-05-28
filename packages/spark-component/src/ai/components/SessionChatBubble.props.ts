export type SessionChatBubbleProps = Readonly<{
  role: 'user' | 'assistant' | 'system' | 'error'
  content: string
  timestamp?: number
  isTyping?: boolean
}>
