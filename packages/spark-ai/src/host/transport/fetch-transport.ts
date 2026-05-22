/**
 * host/transport/fetch-transport.ts
 *
 * Public Fetch + SSE transport. Request construction stays here; stream
 * reading and response envelope validation live in dedicated transport files.
 */

import { toAiHostRuntimeScope } from '../business/business-scope'
import {
  assertOkResponse,
  DEFAULT_PROTOCOL_VERSION,
  normalizeBaseUrl,
  resolveFetch,
} from './http-utils'
import {
  readAppendMessagesEnvelope,
  requireSseResponseBody,
  toTransportTurn,
} from './fetch-response-envelope'
import { readAiHostSseStream } from './sse-stream-reader'
import {
  AiHostTransport,
  type AiHostAppendMessagesInput,
  type AiHostFetch,
  type AiHostFetchTransportOptions,
  type AiHostHeadersProvider,
  type AiHostStreamTurnInput,
  type AiHostStreamTurnResult,
} from './transport-types'

export class AiHostFetchTransport extends AiHostTransport {
  private readonly baseUrl: string
  private readonly fetchClient: AiHostFetch
  private readonly getHeaders: AiHostHeadersProvider
  private readonly protocolVersion: number

  public constructor(options: AiHostFetchTransportOptions = {}) {
    super()
    this.baseUrl = normalizeBaseUrl(options.baseUrl)
    this.fetchClient = resolveFetch(options.fetch)
    this.getHeaders = options.getHeaders ?? (() => ({}))
    this.protocolVersion = options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION
  }

  public async streamTurn(input: AiHostStreamTurnInput): Promise<AiHostStreamTurnResult> {
    const response = await this.fetchClient(
      `${this.baseUrl}/sessions/${encodeURIComponent(input.sessionId)}/turn/stream`,
      {
        method: 'POST',
        headers: await this.jsonHeaders(),
        body: JSON.stringify({
          protocolVersion: this.protocolVersion,
          systemPrompt: input.systemPrompt,
          tools: input.tools,
          mode: 'function',
          scope: toAiHostRuntimeScope(input.scope),
          turn: toTransportTurn(input.turn),
          messages: input.messages,
        }),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
    )

    await assertOkResponse(response, 'AI stream turn')
    return readAiHostSseStream(input, requireSseResponseBody(response, 'AI stream turn'))
  }

  public async appendMessages(input: AiHostAppendMessagesInput): Promise<void> {
    const response = await this.fetchClient(
      `${this.baseUrl}/sessions/${encodeURIComponent(input.sessionId)}/turn/append`,
      {
        method: 'POST',
        headers: await this.jsonHeaders(),
        body: JSON.stringify({
          protocolVersion: this.protocolVersion,
          scope: toAiHostRuntimeScope(input.scope),
          turn: toTransportTurn(input.turn),
          messages: input.messages,
        }),
      },
    )

    await assertOkResponse(response, 'AI append messages')
    await readAppendMessagesEnvelope(response, input)
  }

  private async jsonHeaders(): Promise<Headers> {
    const headers = new Headers(await Promise.resolve(this.getHeaders()))
    headers.set('Content-Type', 'application/json')
    return headers
  }
}

export { parseAiHostSseBlocks } from './sse-parser'
