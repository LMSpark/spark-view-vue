/**
 * ═══════════════════════════════════════════════════════════════
 * agent/transport/transport-turn.ts — AI turn 线路标识投影
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Agent 传输层的 turn/stream 标识构造。spark-ai 拥有
 *   纯 key 格式定义，APP 和脚本桥接层无需重复构造 turnKey/streamKey，
 *   同时保持 HTTP I/O 在包外。
 *
 * 【核心类型/函数】
 *   AiAgentTransportTurn      — turn 标识结构（turnId + turnKey + streamKey）
 *   createAiAgentTransportTurn — 从 scope + turnMeta 构造标识
 *
 * 【消费方】Agent 传输层（SSE 流、HTTP 请求标识）
 * ═══════════════════════════════════════════════════════════════
 */

import { createAiAgentStreamKey, createAiAgentTurnKey } from '../business/business-scope'
import type { AiAgentStreamTurnInput } from './transport-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 类型定义
// ═══════════════════════════════════════════════════════════════

/** Turn 标识结构：含 turnId（唯一 ID）、turnKey（业务键）、可选 streamKey（流式键） */
export type AiAgentTransportTurn = Readonly<{
  turnId: string
  turnKey: string
  streamKey?: string
}>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 工厂函数
// ═══════════════════════════════════════════════════════════════

/** 从 scope + turnMeta 构造 TransportTurn，可选传入 streamId 生成 streamKey */
export function createAiAgentTransportTurn(
  input: Pick<AiAgentStreamTurnInput, 'scope' | 'turn'>,
  streamId?: string,
): AiAgentTransportTurn {
  return {
    turnId: input.turn.turnId,
    turnKey: createAiAgentTurnKey(input.scope, input.turn.turnId),
    ...(streamId === undefined ? {} : {
      streamKey: createAiAgentStreamKey(input.scope, input.turn.turnId, streamId),
    }),
  }
}
