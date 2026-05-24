/**
 * Pure helpers for API envelope-shaped payloads.
 *
 * This file intentionally contains no browser request/Response/stream helpers; APP and
 * script layers own all network I/O.
 */

import { isRecord } from '@spark-view/spark-utils'
import type {
  ApiEnvelope as SharedApiEnvelope,
  ApiEnvelopeContext,
  ApiEnvelopeEvent,
} from '@spark-view/spark-utils'

export type { ApiEnvelopeContext, ApiEnvelopeEvent }
export { isRecord }

type ApiEnvelope = Readonly<SharedApiEnvelope<unknown>>

export function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

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
