/**
 * APP-owned AI turn bridge.
 *
 * HTTP commands and APP SSE subscription stay in src/services; spark-ai only
 * receives callbacks and aggregates events.
 */

import {
  createAiHostTransportTurn,
  createTurnEventCollector,
  toAiHostRuntimeScope,
  type AiHostAppendMessagesInput,
  type AiHostPrepareSessionInput,
  type AiHostStreamTurnInput,
  type AiHostTurnCallbacks,
} from '@spark-view/spark-ai'
import { isRecord } from '@spark-view/spark-utils'
import { http } from '@/services/http'
import { createAppSseEventSource } from '@/services/sse-events'

const AI_TURN_PROTOCOL_VERSION = 4
const AI_TURN_EVENT_TIMEOUT_MS = 300_000
const AI_SESSION_API_BASE = '/api/ai/sessions'
const AI_TURN_API = '/api/ai/turns'

export type AiHostTurnBridgeOptions = Readonly<{
  timeoutMs?: number
  windowSize?: number
}>

export function createAiHostTurnCallbacks(options: AiHostTurnBridgeOptions = {}): AiHostTurnCallbacks {
  const preparedSessionIds = new Set<string>()
  const timeoutMs = options.timeoutMs ?? AI_TURN_EVENT_TIMEOUT_MS
  const windowSize = normalizeWindowSize(options.windowSize)

  return {
    prepareSession: async (input) => {
      if (preparedSessionIds.has(input.sessionId)) return
      const body = await http.post(AI_SESSION_API_BASE, {
        protocolVersion: AI_TURN_PROTOCOL_VERSION,
        sessionId: input.sessionId,
        systemPrompt: input.systemPrompt,
        messages: [],
        tools: input.tools,
        mode: 'function',
        scope: toAiHostRuntimeScope(input.scope),
        reuseScopeSession: false,
        ...(windowSize === undefined ? {} : { windowSize }),
      }, signalConfig(input.signal))
      assertPreparedSession(body, input)
      preparedSessionIds.add(input.sessionId)
    },
    executeTurn: async (input) => {
      const collector = createTurnEventCollector({
        input,
        source: createAppSseEventSource(),
        timeoutMs,
      })
      try {
        const body = await http.post(AI_TURN_API, {
          sessionId: input.sessionId,
          turnId: input.turn.turnId,
          messages: input.messages,
          systemPrompt: input.systemPrompt,
          ...(windowSize === undefined ? {} : { windowSize }),
        }, signalConfig(input.signal))
        assertTurnStart(body, input)
        return await collector.result
      } catch (error) {
        collector.close()
        throw error
      }
    },
    appendMessages: async (input) => {
      const body = await http.post(`${AI_SESSION_API_BASE}/${encodeURIComponent(input.sessionId)}/turn/append`, {
        protocolVersion: AI_TURN_PROTOCOL_VERSION,
        scope: toAiHostRuntimeScope(input.scope),
        turn: createAiHostTransportTurn(input),
        messages: input.messages,
      })
      assertAppendMessages(body, input)
    },
  }
}

function signalConfig(signal: AbortSignal | undefined): { signal: AbortSignal } | undefined {
  return signal === undefined ? undefined : { signal }
}

function normalizeWindowSize(value: number | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('createAiHostTurnCallbacks.windowSize must be a positive number')
  }
  return Math.floor(value)
}

function assertPreparedSession(body: unknown, input: AiHostPrepareSessionInput): void {
  const sessionId = readString(body, 'sessionId') ?? input.sessionId
  if (sessionId !== input.sessionId) {
    throw new Error(`AI prepare sessionId mismatch: expected=${input.sessionId}, actual=${sessionId}`)
  }
}

function assertTurnStart(body: unknown, input: AiHostStreamTurnInput): void {
  if (!isRecord(body)) {
    throw new Error('AI turn start response missing body')
  }
  if (body['accepted'] !== true) {
    throw new Error('AI turn start response was not accepted')
  }
  const sessionId = readString(body, 'sessionId')
  const turnId = readString(body, 'turnId')
  if (sessionId !== input.sessionId) {
    throw new Error('AI turn start response sessionId mismatch')
  }
  if (turnId !== input.turn.turnId) {
    throw new Error('AI turn start response turnId mismatch')
  }
}

function assertAppendMessages(body: unknown, input: AiHostAppendMessagesInput): void {
  if (!isRecord(body)) {
    throw new Error('AI append response missing body')
  }
  const sessionId = readString(body, 'sessionId')
  const turnId = readString(body, 'turnId')
  if (sessionId !== input.sessionId) {
    throw new Error('AI append response sessionId mismatch')
  }
  if (turnId !== input.turn.turnId) {
    throw new Error('AI append response turnId mismatch')
  }
}

function readString(value: unknown, key: string): string | undefined {
  return isRecord(value) && typeof value[key] === 'string' ? value[key] : undefined
}
