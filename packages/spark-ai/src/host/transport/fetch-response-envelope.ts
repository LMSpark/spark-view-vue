import {
  isRecord,
  readResponseJson,
  unwrapApiEnvelope,
} from './http-utils'
import type {
  AiHostAppendMessagesInput,
  AiHostStreamTurnInput,
} from './transport-types'

export function toTransportTurn(input: AiHostStreamTurnInput['turn']): { turnId: string } {
  return { turnId: input.turnId }
}

export function requireSseResponseBody(
  response: Response,
  operation: string,
): ReadableStream<Uint8Array> {
  if (response.body === null) {
    throw new Error(`${operation} failed: response body is null`)
  }
  return response.body
}

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
