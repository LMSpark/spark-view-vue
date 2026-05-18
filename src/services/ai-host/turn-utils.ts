import type { AiChatSendRequest } from '@spark-view/spark-component'
import type { AiHostTurnMeta } from '@spark-view/spark-ai/host'

/**
 * 从历史消息中提取最后一条用户输入。
 */
export function latestUserInput(request: AiChatSendRequest): string {
  for (let index = request.historyMsgs.length - 1; index >= 0; index -= 1) {
    const item = request.historyMsgs[index]
    if (item?.role === 'user') return item.content.trim()
  }
  return ''
}

/**
 * 将请求归一化为 turn 元信息。
 * 保留已有的 turn 元信息，缺省值由 spark-ai/host 的 normalizeTurn 生成。
 */
export function normalizeTurn(request: AiChatSendRequest): AiHostTurnMeta {
  const now = new Date().toISOString()
  const raw = (request as unknown as Record<string, unknown>)
  const turn = raw['turn'] as Record<string, unknown> | undefined
  return {
    turnId: (turn?.['turnId'] as string | undefined) ?? globalThis.crypto.randomUUID(),
    seq: (turn?.['seq'] as number | undefined) ?? 1,
    baseRevision: (turn?.['baseRevision'] as number | undefined) ?? Math.max(0, request.historyMsgs.length - 1),
    queuedAt: (turn?.['queuedAt'] as string | undefined) ?? now,
    startedAt: (turn?.['startedAt'] as string | undefined) ?? now,
    maxParallelTurns: (turn?.['maxParallelTurns'] as number | undefined) ?? 1,
  }
}
