/**
 * AI 对话与流式通用类型定义
 */

export type ProtocolRole = 'user' | 'assistant' | 'system'

export interface ProtocolMessage {
  role: ProtocolRole
  content: string
}

/** Token 用量统计（LLM 返回的标准化格式） */
export interface TokenUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  promptCacheHitTokens?: number
  promptCacheMissTokens?: number
}

/** SSE 流式事件回调（通用，可用于任何 SSE 端点） */
export interface StreamCallbacks {
  onDelta?: (text: string) => void
  onReasoning?: (text: string) => void
  onPhase?: (phase: number, status: string, message: string) => void
  onUsage?: (usage: Record<string, unknown>) => void
  onError?: (error: string) => void
}
