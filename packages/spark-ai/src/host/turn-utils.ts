/**
 * Turn 轮次工具函数。
 *
 * 职责：从聊天请求中提取用户输入、归一化 turn 元信息、转换为传输层消息。
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │                    turn-utils                            │
 * │                                                          │
 * │  latestUserInput()        → 从 historyMsgs 反向查找       │
 * │                               最后一条 user 消息          │
 * │  normalizeTurn()          → 生成 turnId / seq / 时间戳    │
 * │  toCurrentTurnMessages()  → 仅保留最新用户消息作为        │
 * │                               传输层消息                  │
 * └─────────────────────────────────────────────────────────┘
 */

import type { AiHostChatRequest, AiHostTransportMessage, AiHostTurnMeta } from './types'

/** 从历史消息中反向查找最后一条用户输入 */
export function latestUserInput(request: AiHostChatRequest): string {
  for (let index = request.historyMsgs.length - 1; index >= 0; index -= 1) {
    const item = request.historyMsgs[index]
    if (item?.role === 'user') return item.content.trim()
  }
  return ''
}

/** 生成默认 turn 元信息：turnId / seq / 时间戳 */
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

/** 将聊天请求转换为传输层消息：仅保留最新用户输入 */
export function toCurrentTurnMessages(request: AiHostChatRequest): AiHostTransportMessage[] {
  const latestUser = latestUserInput(request)
  return latestUser === ''
    ? []
    : [{ role: 'user', content: latestUser }]
}
