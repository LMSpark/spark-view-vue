/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  AI HOST · Fetch 响应信封处理                                                 │
 * │  Response Envelope Helpers                                                    │
 * │                                                                              │
 * │  本模块提供 fetch-transport 请求/响应周期的辅助函数：                           │
 * │    · toTransportTurn         — 提取 turnId / turnKey 用于传输层请求体          │
 * │    · requireSseResponseBody  — 校验 response.body 非 null                     │
 * │    · readAppendMessagesEnvelope — 校验 append 接口的响应信封                   │
 * │                                                                              │
 * │  调用方：fetch-transport.ts、sse-stream-reader.ts                             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import {
  isRecord,
  readApiEnvelopeContext,
  readResponseJson,
  unwrapApiEnvelope,
} from './http-utils'
import { createAiHostStreamKey, createAiHostTurnKey } from '../business/business-scope'
import type {
  AiHostAppendMessagesInput,
  AiHostStreamTurnInput,
} from './transport-types'

/* -------------------------------------------------------------------------------
 * 一、Turn 元数据投影
 * ----------------------------------------------------------------------------- */

type TransportTurnEnvelope = Readonly<{
  turnId: string
  turnKey: string
  streamKey?: string | undefined
}>

/** 从 turn 元数据中提取传输层需要的 turnId + turnKey；只有真实流式请求才携带 streamKey */
export function toTransportTurn(input: Pick<AiHostStreamTurnInput, 'scope' | 'turn'>, streamId?: string): TransportTurnEnvelope {
  return {
    turnId: input.turn.turnId,
    turnKey: createAiHostTurnKey(input.scope, input.turn.turnId),
    ...(streamId === undefined ? {} : { streamKey: createAiHostStreamKey(input.scope, input.turn.turnId, streamId) }),
  }
}

/* -------------------------------------------------------------------------------
 * 二、Response Body 校验
 * ----------------------------------------------------------------------------- */

/**
 * 校验 response.body 非 null。
 * ReadableStream 为 null 通常表示响应已完成消费或浏览器不支持流式读取。
 */
export function requireSseResponseBody(
  response: Response,
  operation: string,
): ReadableStream<Uint8Array> {
  if (response.body === null) {
    throw new Error(`${operation} failed: response body is null`)
  }
  return response.body
}

/* -------------------------------------------------------------------------------
 * 三、Append 响应校验
 * ----------------------------------------------------------------------------- */

/**
 * 校验 appendMessages 接口的响应。
 *
 * 校验项：
 *   1. 解包 API 信封（unwrapApiEnvelope）
 *   2. body 必须为 Record 类型
 *   3. sessionId 必须与请求一致
 *   4. turnId 必须与请求一致
 */
// PAGE_DESIGN_AI_TRACE[host-append-envelope]: V4 appendMessages 响应解包和身份校验入口；只保证后端会话历史同步成功，不代表页面四文件已保存。
export async function readAppendMessagesEnvelope(
  response: Response,
  input: AiHostAppendMessagesInput,
): Promise<void> {
  const rawBody = await readResponseJson(response)
  const context = readApiEnvelopeContext(rawBody)
  const body = unwrapApiEnvelope(rawBody)
  if (!isRecord(body)) {
    throw new Error('AI append response missing body')
  }
  const sessionId = typeof body['sessionId'] === 'string'
    ? body['sessionId']
    : context?.session?.sessionId
  const turnId = typeof body['turnId'] === 'string'
    ? body['turnId']
    : context?.turn?.turnId
  if (sessionId !== input.sessionId) {
    throw new Error('AI append response sessionId mismatch')
  }
  if (turnId !== input.turn.turnId) {
    throw new Error('AI append response turnId mismatch')
  }
}
