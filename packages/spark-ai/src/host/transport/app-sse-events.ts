import type { ApiEnvelopeContext, ApiEnvelopeEvent } from './http-utils'

export type AiHostAppSseEventName =
  | 'page-config'
  | 'data-batch-job'
  | 'data-change'
  | 'notification'
  | 'debug-route-request'
  | 'debug-route-result'
  | 'debug-screenshot-request'
  | 'debug-screenshot-result'
  | 'debug-fc-error-report'
  | 'llm-frame'
  | 'ai-turn-delta'
  | 'ai-turn-reasoning'
  | 'ai-turn-usage'
  | 'ai-turn-result'
  | 'ai-turn-error'
  | 'ai-turn-done'
  | (string & {})

export type AiHostAppSseEvent<T = unknown> = Readonly<{
  name: AiHostAppSseEventName
  ok: boolean
  data: T
  rawData: string
  rawPayload: unknown
  protocolVersion?: number
  context?: ApiEnvelopeContext
  event?: ApiEnvelopeEvent
  legacy: boolean
}>
