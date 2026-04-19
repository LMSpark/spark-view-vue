/**
 * 协议与流式通用类型定义
 */

export type ProtocolRole = 'user' | 'assistant' | 'system'

export interface ProtocolMessage {
  role: ProtocolRole
  content: string
}

/** 通用协议块 — @@type:name ... @@end */
export interface ProtocolBlock {
  type: string
  name: string
  payload: string
  raw: string
}

/** 提案协议块 — 从通用块中提取的 proposal 子集 */
export interface ProposalProtocolBlock {
  name: string
  body: string
  raw: string
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

export interface ProtocolBlockFilter {
  types?: string[]
  names?: string[]
}

export interface UiConfirmOption {
  key: string
  label: string
  description?: string
}

export interface UiConfirmQuestion {
  id: string
  text: string
  type: 'single' | 'multi'
  options: UiConfirmOption[]
}

export interface UiConfirmPayload {
  title?: string
  questions: UiConfirmQuestion[]
}
