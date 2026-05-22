/**
 * Host transport contracts.
 */

import type { AiHostBusinessScope } from '../business/business-types'
import type { AiHostSseEvent, AiHostTurnMeta } from '../chat/chat-types'

export type AiHostTransportToolSpec = Readonly<{
  type: 'function'
  function: {
    readonly name: string
    readonly description: string
    readonly parameters: Record<string, unknown>
  }
}>

export type AiHostTransportMessage = Readonly<{
  role: string
  content: string
  tool_call_id?: string | undefined
  tool_calls?: readonly AiHostTransportToolCall[] | undefined
}>

export type AiHostTransportToolCall = Readonly<{
  id?: string | undefined
  type?: string | undefined
  function?: {
    readonly name?: string | undefined
    readonly arguments?: string | undefined
  } | undefined
}>

export type AiHostStreamTurnInput = Readonly<{
  sessionId: string
  scope: AiHostBusinessScope
  turn: AiHostTurnMeta
  systemPrompt: string
  tools: readonly AiHostTransportToolSpec[]
  messages: readonly AiHostTransportMessage[]
  signal?: AbortSignal | undefined
  onSseEvent?: ((event: AiHostSseEvent) => void) | undefined
  onDelta?: ((delta: string) => void) | undefined
  onReasoning?: ((reasoning: string) => void) | undefined
  onUsage?: ((usage: Record<string, unknown>) => void) | undefined
}>

export type AiHostStreamTurnResult = Readonly<{
  text: string
  reasoning?: string | undefined
  toolCalls: readonly AiHostTransportToolCall[]
}>

export type AiHostAppendMessagesInput = Readonly<{
  sessionId: string
  scope: AiHostBusinessScope
  turn: AiHostTurnMeta
  messages: readonly AiHostTransportMessage[]
}>

export abstract class AiHostTransport {
  public abstract streamTurn(input: AiHostStreamTurnInput): Promise<AiHostStreamTurnResult>
  public abstract appendMessages(input: AiHostAppendMessagesInput): Promise<void>
}

export type AiHostHeadersProvider = () => HeadersInit | Promise<HeadersInit>

export type AiHostFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type AiHostFetchTransportOptions = Readonly<{
  baseUrl?: string | undefined
  fetch?: AiHostFetch | undefined
  getHeaders?: AiHostHeadersProvider | undefined
  protocolVersion?: number | undefined
}>

export type AiHostUploadedAttachment = Readonly<{
  fileId: string
  name: string
  size: number
  mimeType: string
}>
