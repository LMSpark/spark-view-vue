/**
 * Shared HTTP helpers for Host fetch transport.
 */

import type { AiHostFetch } from './transport-types'

export const DEFAULT_PROTOCOL_VERSION = 3
export const DEFAULT_BASE_URL = '/api/ai'

type ApiEnvelope = Readonly<{
  ok: boolean
  data: unknown
  error: { readonly code?: unknown; readonly message?: unknown } | null
  requestId: string
}>

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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

export function resolveFetch(fetchClient: AiHostFetch | undefined): AiHostFetch {
  if (fetchClient !== undefined) return fetchClient
  if (typeof fetch !== 'function') {
    throw new Error('AiHostFetchTransport requires a fetch implementation')
  }
  return fetch.bind(globalThis)
}

export function normalizeBaseUrl(value: string | undefined): string {
  return (value ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
}

export async function readResponseJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.trim() === '') return null
  return tryParseJson(text)
}

export async function assertOkResponse(response: Response, action: string): Promise<void> {
  if (response.ok) return
  const body = await response.text()
  throw new Error(`${action} failed: ${response.status} ${body}`)
}

function isApiEnvelope(value: unknown): value is ApiEnvelope {
  return isRecord(value)
    && typeof value['ok'] === 'boolean'
    && Object.prototype.hasOwnProperty.call(value, 'data')
    && Object.prototype.hasOwnProperty.call(value, 'error')
    && typeof value['requestId'] === 'string'
}
