/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  AI HOST · Fetch 响应信封处理                                                 │
 * │  Response Envelope Helpers                                                    │
 * │                                                                              │
 * │  本模块提供 fetch-transport 请求/响应周期的辅助函数：                           │
 * │    · toTransportTurn         — 提取 turnId 用于传输层请求体                   │
 * │    · requireSseResponseBody  — 校验 response.body 非 null                     │
 * │    · readAppendMessagesEnvelope — 校验 append 接口的响应信封                   │
 * │                                                                              │
 * │  调用方：fetch-transport.ts、sse-stream-reader.ts                             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import {
  isRecord,
  readResponseJson,
  unwrapApiEnvelope,
} from './http-utils'
import type {
  AiHostAppendMessagesInput,
  AiHostStreamTurnInput,
} from './transport-types'

/* -------------------------------------------------------------------------------
 * 一、Turn 元数据投影
 * ----------------------------------------------------------------------------- */

/** 从 turn 元数据中提取传输层需要的 turnId */
export function toTransportTurn(input: AiHostStreamTurnInput['turn']): { turnId: string } {
  return { turnId: input.turnId }
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
export async function readAppendMessagesEnvelope(
  response: Response,
  input: AiHostAppendMessagesInput,
): Promise<void> {
  const body = unwrapApiEnvelope(await readResponseJson(response))
  if (!isRecord(body)) {
    throw new Error('AI append response missing body')
  }
  if (body['sessionId'] !== input.sessionId) {
    throw new Error('AI append response sessionId mismatch')
  }
  if (body['turnId'] !== input.turn.turnId) {
    throw new Error('AI append response turnId mismatch')
  }
}
