/**
 * Turn 工具函数。
 */

import type { AiHostChatRequest, AiHostTransportMessage, AiHostTurnMeta } from './types'

export function latestUserInput(request: AiHostChatRequest): string {
  for (let index = request.historyMsgs.length - 1; index >= 0; index -= 1) {
    const item = request.historyMsgs[index]
    if (item?.role === 'user') return item.content.trim()
  }
  return ''
}

export function normalizeTurn(request: AiHostChatRequest): AiHostTurnMeta {
  const now = new Date().toISOString()
  return {
    turnId: globalThis.crypto.randomUUID(),
    seq: 1,
    baseRevision: Math.max(0, request.historyMsgs.length - 1),
    queuedAt: now,
    startedAt: now,
    maxParallelTurns: 1,
  }
}

export function toCurrentTurnMessages(request: AiHostChatRequest): AiHostTransportMessage[] {
  const latestUser = latestUserInput(request)
  return latestUser === ''
    ? []
    : [{ role: 'user', content: latestUser }]
}
