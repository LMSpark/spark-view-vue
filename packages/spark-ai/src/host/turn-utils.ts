/**
 * Turn 轮次工具函数。
 *
 * 职责：从聊天请求中提取用户输入、归一化 turn 元信息、转换为传输层消息。
 * 这些函数在消息发送前被调用，为工具循环准备初始数据。
 *
 * 调用时序：
 * ┌────────────────────────────────────────────────────────────┐
 * │ 消息发送流程中的调用顺序：                                    │
 * │                                                             │
 * │ 1. latestUserInput(request)                                 │
 * │    → 从 historyMsgs 反向查找最后一条 user 消息               │
 * │    → 用于追加到会话历史和作为传输层消息                       │
 * │                                                             │
 * │ 2. normalizeTurn(request)                                   │
 * │    → 当 request.turn 未提供时生成默认 turn 元信息             │
 * │    → 生成 turnId（UUID）、seq（1）、时间戳                    │
 * │                                                             │
 * │ 3. toCurrentTurnMessages(request)                           │
 * │    → 将聊天请求转换为传输层消息数组                           │
 * │    → 仅保留最新用户消息，过滤系统/助手消息                    │
 * └────────────────────────────────────────────────────────────┘
 */

import type { AiHostChatRequest, AiHostTransportMessage, AiHostTurnMeta } from './types'

// ═══════════════════════════════════════════════════════
// 用户输入提取
// ═══════════════════════════════════════════════════════

/**
 * 从历史消息中反向查找最后一条用户输入。
 * 遍历方向：从数组末尾向前，找到第一条 role === 'user' 的消息。
 * 返回 trim 后的内容，如果没有用户消息则返回空字符串。
 *
 * 用途：在发送前提取用户实际输入的内容，用于追加到会话历史。
 */
export function latestUserInput(request: AiHostChatRequest): string {
  for (let index = request.historyMsgs.length - 1; index >= 0; index -= 1) {
    const item = request.historyMsgs[index]
    if (item?.role === 'user') return item.content.trim()
  }
  return ''
}

// ═══════════════════════════════════════════════════════
// Turn 元信息归一化
// ═══════════════════════════════════════════════════════

/**
 * 生成默认 turn 元信息。
 * 当 AiHostChatRequest.turn 未提供时调用此函数生成默认值。
 *
 * 字段说明：
 * - turnId: 使用 crypto.randomUUID() 生成唯一 ID
 * - seq: 固定为 1（每次发送都是新轮次的第一轮）
 * - baseRevision: 历史消息数量减 1，表示当前消息的基础版本
 * - queuedAt / startedAt: 当前时间（ISO 8601 格式）
 * - maxParallelTurns: 固定为 1（当前不支持并行轮次）
 */
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

// ═══════════════════════════════════════════════════════
// 消息转换
// ═══════════════════════════════════════════════════════

/**
 * 将聊天请求转换为传输层消息数组。
 * 仅提取最新的用户输入作为传输层消息，过滤掉系统和助手消息。
 *
 * 用途：在首次请求 LLM 时，仅发送最新的用户消息，
 * 历史消息已经由 LLM 服务端通过 sessionId 关联。
 */
export function toCurrentTurnMessages(request: AiHostChatRequest): AiHostTransportMessage[] {
  const latestUser = latestUserInput(request)
  return latestUser === ''
    ? []
    : [{ role: 'user', content: latestUser }]
}
