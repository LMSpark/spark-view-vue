import type { ApiEnvelopeContext, ApiEnvelopeEvent } from '@spark-view/spark-utils'

export type AiAgentAppSseEventName =
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
  | (string & {})

export type AiAgentAppSseEvent<T = unknown> = Readonly<{
  name: AiAgentAppSseEventName
  ok: boolean
  data: T
  rawData: string
  rawPayload: unknown
  protocolVersion?: number
  context?: ApiEnvelopeContext
  event?: ApiEnvelopeEvent
}>
