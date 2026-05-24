/**
 * ═══════════════════════════════════════════════════════════════
 * host/transport/http-utils.ts — HTTP 通用工具函数
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Fetch Transport 的共享工具集。提供 fetch 解析、API 信封解包等
 *   AI 传输协议能力，被 fetch-transport 和 attachment-upload 共用。
 *
 * 【函数清单】
 *   tryParseJson       — 安全 JSON.parse（解析失败返回原值）
 *   unwrapApiEnvelope  — 解包 API 响应信封（v4 context/requestId，兼容 v3 requestId）
 *   resolveFetch       — 解析 fetch 实现（优先自定义，回退 globalThis.fetch）
 *   normalizeBaseUrl   — 规范化 baseUrl（去尾部斜杠）
 *   readResponseJson   — 读取 Response body 并解析 JSON
 *   assertOkResponse   — 断言 Response.ok，否则抛异常
 *
 * 【消费方】fetch-transport、attachment-upload、default-session-store
 * ═══════════════════════════════════════════════════════════════
 */

import { isRecord } from '@spark-view/spark-utils'
import type {
  ApiEnvelope as SharedApiEnvelope,
  ApiEnvelopeContext,
  ApiEnvelopeEvent,
} from '@spark-view/spark-utils'
import type { AiHostFetch } from './transport-types'

/** 默认协议版本号 */
export const DEFAULT_PROTOCOL_VERSION = 4
/** 默认 API 前缀 */
export const DEFAULT_BASE_URL = '/api/ai'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · API 信封类型（从 spark-utils 导入，本模块仅做再导出）
// ═══════════════════════════════════════════════════════════════

export type { ApiEnvelopeContext, ApiEnvelopeEvent }
export { isRecord }

/** AI 后端 API 响应信封（内部类型守卫用）。 */
type ApiEnvelope = Readonly<SharedApiEnvelope<unknown>>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · JSON 解析
// ═══════════════════════════════════════════════════════════════

/** 安全 JSON.parse：解析失败时返回原值 */
export function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · API 信封解包
// ═══════════════════════════════════════════════════════════════

/**
 * 解包 API 响应信封。
 * 若输入符合 ApiEnvelope 格式：
 *   ok:true  → 返回 data 字段
 *   ok:false → 抛出异常（含 error.message）
 * 若输入不是信封格式 → 原样返回（兼容非信封 API）
 */
export function unwrapApiEnvelope(value: unknown): unknown {
  if (!isApiEnvelope(value)) return value
  if (value.ok) return value.data
  const message = isRecord(value.error) && typeof value.error['message'] === 'string'
    ? value.error['message']
    : 'AI request failed'
  throw new Error(message)
}

export function readApiEnvelopeContext(value: unknown): ApiEnvelopeContext | undefined {
  return isApiEnvelope(value) ? value.context : undefined
}

export function readApiEnvelopeEvent(value: unknown): ApiEnvelopeEvent | undefined {
  return isApiEnvelope(value) ? value.event : undefined
}

export function readApiEnvelopeRequestId(value: unknown): string | undefined {
  if (!isApiEnvelope(value)) return undefined
  return value.context?.requestId ?? value.requestId
}

export function isProtocolV4Envelope(value: unknown): boolean {
  return isApiEnvelope(value) && value.protocolVersion === DEFAULT_PROTOCOL_VERSION
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · Fetch 工具
// ═══════════════════════════════════════════════════════════════

/**
 * 解析 fetch 实现。
 * 优先使用传入的 fetchClient，否则回退到 globalThis.fetch。
 */
export function resolveFetch(fetchClient: AiHostFetch | undefined): AiHostFetch {
  if (fetchClient !== undefined) return fetchClient
  if (typeof fetch !== 'function') {
    throw new Error('AiHostFetchTransport requires a fetch implementation')
  }
  return fetch.bind(globalThis)
}

/** 规范化 baseUrl：去除尾部斜杠，未提供时使用默认值 */
export function normalizeBaseUrl(value: string | undefined): string {
  return (value ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
}

/** 读取 Response body 文本并尝试解析 JSON */
export async function readResponseJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.trim() === '') return null
  return tryParseJson(text)
}

/** 断言 Response.ok，否则读取 body 并抛异常 */
export async function assertOkResponse(response: Response, action: string): Promise<void> {
  if (response.ok) return
  const body = await response.text()
  throw new Error(`${action} failed: ${response.status} ${body}`)
}

// ═══════════════════════════════════════════════════════════════
// 第 5 节 · 内部：信封格式判定
// ═══════════════════════════════════════════════════════════════

/** 判定值是否符合 ApiEnvelope 形状（v4 + legacy v3） */
export function isApiEnvelope(value: unknown): value is ApiEnvelope {
  if (!isRecord(value)) return false
  const context = value['context']
  const hasV4RequestId = isRecord(context) && typeof context['requestId'] === 'string'
  const hasLegacyRequestId = typeof value['requestId'] === 'string'
  const ok = value['ok']
  const hasError = Object.prototype.hasOwnProperty.call(value, 'error')
  const hasData = Object.prototype.hasOwnProperty.call(value, 'data')
  return typeof ok === 'boolean'
    && (ok ? hasData : hasError)
    && (hasV4RequestId || hasLegacyRequestId)
}
