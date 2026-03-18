import { createFetchClient } from '@spark-view/spark-utils'
import { createAuthHeaders } from '@/services/http'

export type ProtocolRole = 'user' | 'assistant' | 'system'

export interface ProtocolMessage {
  role: ProtocolRole
  content: string
}

export interface ToolProtocolBlock {
  type: string
  action: string
  id: string
  body: string
  raw: string
}

export interface ProposalProtocolBlock {
  name: string
  body: string
  raw: string
}

interface ToolBlockFilter {
  type?: string
  actions?: string[]
}

interface ProposalBlockFilter {
  names?: string[]
}

interface StreamAiChatOptions {
  messages: ProtocolMessage[]
  mode?: 'single' | 'multi'
  systemPrompt?: string
  signal?: AbortSignal
  onDelta?: (delta: string) => void
  onReasoning?: (reasoning: string) => void
  onUsage?: (usage: Record<string, unknown>) => void
  onPhase?: (phase: number, status: string, message: string) => void
}

const TOOL_BLOCK_RE = /@@(\w+):([\w.]+)#([\w-]+)\n([\s\S]*?)\n@@end/g
const PROPOSAL_BLOCK_RE = /^@@proposal:([\w-]+)\s*$([\s\S]*?)^@@end\s*$/gm

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

export function extractToolProtocolBlocks(text: string, filter?: ToolBlockFilter): ToolProtocolBlock[] {
  const blocks: ToolProtocolBlock[] = []
  TOOL_BLOCK_RE.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = TOOL_BLOCK_RE.exec(text)) !== null) {
    const block: ToolProtocolBlock = {
      type: match[1] ?? '',
      action: match[2] ?? '',
      id: match[3] ?? '',
      body: match[4] ?? '',
      raw: match[0],
    }

    if (filter?.type !== undefined && block.type !== filter.type) continue
    if (filter?.actions !== undefined && !filter.actions.includes(block.action)) continue
    blocks.push(block)
  }

  return blocks
}

export function stripToolProtocolBlocks(text: string, filter?: ToolBlockFilter): string {
  TOOL_BLOCK_RE.lastIndex = 0
  const stripped = text.replace(TOOL_BLOCK_RE, (_raw: string, type: string, action: string) => {
    if (filter?.type !== undefined && type !== filter.type) return _raw
    if (filter?.actions !== undefined && !filter.actions.includes(action)) return _raw
    return ''
  })

  return stripped.replace(/\n{3,}/g, '\n\n').trim()
}

export function parseToolProtocolPayload<T>(block: ToolProtocolBlock): T | null {
  try {
    return JSON.parse(block.body) as T
  } catch {
    return null
  }
}

export function extractProposalProtocolBlocks(text: string, filter?: ProposalBlockFilter): ProposalProtocolBlock[] {
  const blocks: ProposalProtocolBlock[] = []
  PROPOSAL_BLOCK_RE.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = PROPOSAL_BLOCK_RE.exec(text)) !== null) {
    const block: ProposalProtocolBlock = {
      name: match[1] ?? '',
      body: (match[2] ?? '').trim(),
      raw: match[0],
    }
    if (filter?.names !== undefined && !filter.names.includes(block.name)) continue
    blocks.push(block)
  }

  return blocks
}

export function stripProposalProtocolBlocks(text: string, filter?: ProposalBlockFilter): string {
  PROPOSAL_BLOCK_RE.lastIndex = 0
  const stripped = text.replace(PROPOSAL_BLOCK_RE, (_raw: string, name: string) => {
    if (filter?.names !== undefined && !filter.names.includes(name)) return _raw
    return ''
  })

  return stripped.replace(/\n{3,}/g, '\n\n').trim()
}

export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  const end = text.lastIndexOf('}')
  if (end <= start) return null

  return text.slice(start, end + 1)
}
