import type { AiChatSendRequest } from '@spark-view/spark-component'
import type {
  AppAiTransportMessage,
  AppAiTurnMeta,
} from './types'

export function latestUserInput(request: AiChatSendRequest): string {
  for (let index = request.historyMsgs.length - 1; index >= 0; index -= 1) {
    const item = request.historyMsgs[index]
    if (item?.role === 'user') return item.content.trim()
  }
  return ''
}

export function normalizeTurn(request: AiChatSendRequest): AppAiTurnMeta {
  const now = new Date().toISOString()
  return {
    turnId: request.turn?.turnId ?? globalThis.crypto.randomUUID(),
    seq: request.turn?.seq ?? 1,
    baseRevision: request.turn?.baseRevision ?? Math.max(0, request.historyMsgs.length - 1),
    queuedAt: request.turn?.queuedAt ?? now,
    startedAt: request.turn?.startedAt ?? now,
    maxParallelTurns: request.turn?.maxParallelTurns ?? 1,
  }
}

export function toCurrentTurnMessages(request: AiChatSendRequest): AppAiTransportMessage[] {
  const latestUser = latestUserInput(request)
  return latestUser === ''
    ? []
    : [{ role: 'user', content: latestUser }]
}
