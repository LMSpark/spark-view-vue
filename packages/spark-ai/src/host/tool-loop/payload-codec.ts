import type { LlmJsonValue } from '../../schema'
import { ModuleKind } from '../../module-semantic'
import { latestUserInput } from '../business/business-scope'
import type { AiHostChatRequest } from '../chat/chat-types'
import type { AiHostTransportMessage } from '../transport/transport-types'

export function parseToolArgs(raw: string | undefined): Readonly<Record<string, LlmJsonValue>> {
  if (raw === undefined || raw.trim() === '') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return toProtocolArgs(parsed)
  } catch {
    return {}
  }
}

export function toCurrentTurnMessages(request: AiHostChatRequest): AiHostTransportMessage[] {
  const latestUser = latestUserInput(request)
  return latestUser === ''
    ? []
    : [{ role: 'user', content: latestUser }]
}

export function stringifyAiHostPayload(data: unknown): string {
  const seen = new WeakSet<object>()
  const text = JSON.stringify(data, (_key, item: unknown) => {
    if (typeof item === 'bigint') return item.toString()
    if (typeof item === 'object' && item !== null) {
      if (seen.has(item)) return '[Circular]'
      seen.add(item)
    }
    return item
  })
  return text
}

function toProtocolArgs(value: unknown): Readonly<Record<string, LlmJsonValue>> {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, LlmJsonValue> = {}
  for (const [key, raw] of Object.entries(value)) {
    const coerced = ModuleKind.coerceJsonValue(raw)
    if (coerced !== undefined) out[key] = coerced
  }
  return out
}
