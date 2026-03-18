/**
 * AI 协议传输层
 *
 * 职责：仅负责 SSE 流式传输（依赖 spark-utils FetchClient + auth headers）
 * 协议解析全部委托给 @spark-view/spark-ai/protocol
 *
 * 消费方直接从本模块导入即可同时获得传输 + 解析能力。
 */
import { createFetchClient } from '@spark-view/spark-utils'
import { createAuthHeaders } from '@/services/http'

// ── Re-export 协议解析原语（来自 spark-ai） ──────────────────────────────────
// 消费方无需关心实现在哪个包，统一从这里导入
export {
  extractToolBlocks as extractToolProtocolBlocks,
  stripToolBlocks as stripToolProtocolBlocks,
  parseToolPayload as parseToolProtocolPayload,
  extractProposalBlocks as extractProposalProtocolBlocks,
  stripProposalBlocks as stripProposalProtocolBlocks,
  stripProtocolBlocksWithUnclosed,
  extractFirstJsonObject,
  parseTokenUsage,
} from '@spark-view/spark-ai'
export type {
  ProtocolRole,
  ProtocolMessage,
  ToolProtocolBlock,
  ProposalProtocolBlock,
  ToolBlockFilter,
  TokenUsage,
} from '@spark-view/spark-ai'

// ── SSE 流式传输（本模块独有） ────────────────────────────────────────────────

interface StreamAiChatOptions {
  messages: Array<{ role: string; content: string }>
  mode?: 'single' | 'multi'
  systemPrompt?: string
  signal?: AbortSignal
  onDelta?: (delta: string) => void
  onReasoning?: (reasoning: string) => void
  onUsage?: (usage: Record<string, unknown>) => void
  onPhase?: (phase: number, status: string, message: string) => void
}

export type { StreamAiChatOptions }

export async function streamAiChatText(options: StreamAiChatOptions): Promise<string> {
  const sseClient = createFetchClient()
  const events = await sseClient.streamSSE({
    url: '/api/ai/chat/stream',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...createAuthHeaders(),
    },
    data: {
      messages: options.messages.map(message => ({ role: message.role, content: message.content })),
      mode: options.mode ?? 'multi',
      ...(options.systemPrompt !== undefined ? { systemPrompt: options.systemPrompt } : {}),
    },
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  })

  let fullText = ''

  for await (const event of events) {
    if (event.data === '[DONE]') break

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(event.data) as Record<string, unknown>
    } catch {
      continue
    }

    if (parsed['done'] === true) break

    if (typeof parsed['error'] === 'string' && parsed['error'] !== '') {
      throw new Error(parsed['error'])
    }

    const delta = parsed['delta']
    if (typeof delta === 'string' && delta !== '') {
      fullText += delta
      options.onDelta?.(delta)
    }

    const reasoning = parsed['reasoning']
    if (typeof reasoning === 'string' && reasoning !== '') {
      options.onReasoning?.(reasoning)
    }

    const usageRaw = parsed['usage']
    if (usageRaw !== null && typeof usageRaw === 'object') {
      options.onUsage?.(usageRaw as Record<string, unknown>)
    }

    const phaseRaw = parsed['phase']
    const statusRaw = parsed['status']
    const messageRaw = parsed['message']
    if (typeof phaseRaw === 'number' && typeof statusRaw === 'string' && typeof messageRaw === 'string') {
      options.onPhase?.(phaseRaw, statusRaw, messageRaw)
    }
  }

  return fullText
}
