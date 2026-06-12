/**
 * @module app:services/ai-turn-bridge
 * 职责：提供应用运行时 service 层的 ai turn bridge 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * APP-owned AI turn bridge.
 *
 * HTTP commands and APP SSE subscription stay in src/services; spark-ai only
 * receives callbacks and aggregates events.
 */

import {
  createAiAgentHost,
  createAiAgentTransportTurn,
  createTurnEventCollector,
  toAiAgentRuntimeScope,
  type AiAgentTurnCallbacks,
} from '@spark-appworks/spark-ai/agent'
import type * as SparkAiAgent from '@spark-appworks/spark-ai/agent'
import { isRecord } from '@spark-appworks/spark-utils'
import { http } from '@/services/http'
import { createAppSseEventSource } from '@/services/sse-events'

const AI_TURN_PROTOCOL_VERSION = 4
const AI_TURN_EVENT_TIMEOUT_MS = 300_000
const AI_TURN_IDLE_TIMEOUT_MS = 90_000
const AI_SESSION_TURN_SAFE_RETRIES = 2
const AI_SESSION_TURN_RETRY_BASE_MS = 800
const AI_SESSION_API_BASE = '/api/ai/sessions'
const AI_TURN_API = '/api/ai/turns'
const MAX_AI_TURN_DIAGNOSTICS = 300

/** Ai Turn Bridge Diagnostic 的诊断信息。 */
type AiTurnBridgeDiagnostic = Readonly<{
  at: number
  type: string
  sessionId?: string
  turnId?: string
  message?: string
  details?: Record<string, unknown>
}>

const aiTurnDiagnostics: AiTurnBridgeDiagnostic[] = []

/** Ai Agent Turn Bridge Options 的调用配置。 */
export type AiAgentTurnBridgeOptions = Readonly<{
  transport?: 'app-sse' | 'session-turn'
  timeoutMs?: number
  idleTimeoutMs?: number
  windowSize?: number
}>

export function createAiAgentTurnCallbacks(options: AiAgentTurnBridgeOptions = {}): AiAgentTurnCallbacks {
  const transport = options.transport ?? 'app-sse'
  const timeoutMs = options.timeoutMs ?? AI_TURN_EVENT_TIMEOUT_MS
  const idleTimeoutMs = options.idleTimeoutMs ?? AI_TURN_IDLE_TIMEOUT_MS
  const windowSize = normalizeWindowSize(options.windowSize)

  return {
    prepareSession: async (input) => {
      // The backend owns session lifecycle and persistence; APP only ensures it before a turn.
      recordAiTurnDiagnostic({ type: 'prepare-session-request', sessionId: input.sessionId })
      const body = await http.post(AI_SESSION_API_BASE, {
        protocolVersion: AI_TURN_PROTOCOL_VERSION,
        sessionId: input.sessionId,
        systemPrompt: input.systemPrompt,
        messages: [],
        tools: input.tools,
        mode: 'function',
        scope: toAiAgentRuntimeScope(input.scope),
        reuseScopeSession: false,
        ...(windowSize === undefined ? {} : { windowSize }),
      }, signalConfig(input.signal))
      assertPreparedSession(body, input)
      recordAiTurnDiagnostic({ type: 'prepare-session-ok', sessionId: input.sessionId })
    },
    executeTurn: async (input) => {
      if (transport === 'session-turn') {
        return executeSessionTurn(input, windowSize)
      }

      const diagnosticInput = withTurnDiagnostics(input)
      const collector = createTurnEventCollector({
        input: diagnosticInput,
        source: createAppSseEventSource(),
        timeoutMs,
        idleTimeoutMs,
      })
      try {
        recordAiTurnDiagnostic({
          type: 'turn-start-request',
          sessionId: input.sessionId,
          turnId: input.turn.turnId,
          details: { messageCount: input.messages.length },
        })
        const body = await http.post(AI_TURN_API, {
          sessionId: input.sessionId,
          turnId: input.turn.turnId,
          messages: input.messages,
          systemPrompt: input.systemPrompt,
          ...(windowSize === undefined ? {} : { windowSize }),
        }, signalConfig(input.signal))
        assertTurnStart(body, input)
        recordAiTurnDiagnostic({
          type: 'turn-start-accepted',
          sessionId: input.sessionId,
          turnId: input.turn.turnId,
          details: { started: isRecord(body) ? body['started'] : undefined },
        })
        return await collector.result
      } catch (error) {
        recordAiTurnDiagnostic({
          type: 'turn-error',
          sessionId: input.sessionId,
          turnId: input.turn.turnId,
          message: errorMessage(error),
        })
        collector.close()
        throw error
      }
    },
    appendMessages: async (input) => {
      const body = await http.post(`${AI_SESSION_API_BASE}/${encodeURIComponent(input.sessionId)}/turn/append`, {
        protocolVersion: AI_TURN_PROTOCOL_VERSION,
        scope: toAiAgentRuntimeScope(input.scope),
        turn: createAiAgentTransportTurn(input),
        messages: input.messages,
      })
      assertAppendMessages(body, input)
    },
  }
}

export function readAiTurnBridgeDiagnostics(): readonly AiTurnBridgeDiagnostic[] {
  return aiTurnDiagnostics.map(item => ({ ...item }))
}

export function clearAiTurnBridgeDiagnostics(): void {
  aiTurnDiagnostics.length = 0
}

function withTurnDiagnostics(
  input: SparkAiAgent.AiAgentStreamTurnInput,
): SparkAiAgent.AiAgentStreamTurnInput {
  return {
    ...input,
    onStreamEvent: (event) => {
      recordAiTurnDiagnostic({
        type: 'turn-frame',
        sessionId: input.sessionId,
        turnId: input.turn.turnId,
        details: { frameType: event.type },
      })
      input.onStreamEvent?.(event)
    },
  }
}

type RecordAiTurnDiagnosticCommand = Readonly<{
  type: string
  sessionId?: string
  turnId?: string
  message?: string
  details?: Record<string, unknown>
}>

function recordAiTurnDiagnostic(command: RecordAiTurnDiagnosticCommand): void {
  aiTurnDiagnostics.push({
    at: Date.now(),
    type: command.type,
    ...(command.sessionId === undefined ? {} : { sessionId: command.sessionId }),
    ...(command.turnId === undefined ? {} : { turnId: command.turnId }),
    ...(command.message === undefined ? {} : { message: command.message }),
    ...(command.details === undefined ? {} : { details: command.details }),
  })
  while (aiTurnDiagnostics.length > MAX_AI_TURN_DIAGNOSTICS) {
    aiTurnDiagnostics.shift()
  }
}

async function executeSessionTurn(
  input: SparkAiAgent.AiAgentStreamTurnInput,
  windowSize: number | undefined,
): Promise<SparkAiAgent.AiAgentStreamTurnResult> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await executeSessionTurnOnce(input, windowSize)
    } catch (error) {
      if (attempt >= AI_SESSION_TURN_SAFE_RETRIES || !isSafeRetryableTurnError(error)) throw error
      await delay(AI_SESSION_TURN_RETRY_BASE_MS * 2 ** attempt, input.signal)
    }
  }
}

async function executeSessionTurnOnce(
  input: SparkAiAgent.AiAgentStreamTurnInput,
  windowSize: number | undefined,
): Promise<SparkAiAgent.AiAgentStreamTurnResult> {
  const body = await http.post(`${AI_SESSION_API_BASE}/${encodeURIComponent(input.sessionId)}/turn`, {
    protocolVersion: AI_TURN_PROTOCOL_VERSION,
    scope: toAiAgentRuntimeScope(input.scope),
    turn: createAiAgentTransportTurn(input),
    messages: input.messages,
    ...(windowSize === undefined ? {} : { windowSize }),
  }, signalConfig(input.signal))
  const result = readSessionTurnResult(body, input)
  emitSyntheticSessionTurnEvent(input, body)
  if (result.reasoning !== undefined && result.reasoning.length > 0) {
    input.onReasoning?.(result.reasoning)
  }
  if (result.toolCalls.length === 0 && result.text.length > 0) {
    input.onDelta?.(result.text)
  }
  return result
}

function isSafeRetryableTurnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ''
  const record = isRecord(error) ? error : {}
  const code = typeof record['code'] === 'string' ? record['code'] : ''
  const response = record['response']
  const retryPolicy = readNestedString(response, ['error', 'retryPolicy'])
    ?? readNestedString(response, ['error', 'details', 'error', 'retryPolicy'])
  const envelopeCode = readNestedString(response, ['error', 'code'])
    ?? readNestedString(response, ['error', 'details', 'error', 'code'])
  return retryPolicy === 'safe-retry'
    || code === 'LLM_CALL_FAILED'
    || envelopeCode === 'LLM_CALL_FAILED'
    || message.includes('LLM_CALL_FAILED')
}

function readNestedString(value: unknown, path: readonly string[]): string | undefined {
  let current = value
  for (const key of path) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }
  return typeof current === 'string' && current.trim().length > 0 ? current.trim() : undefined
}

async function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) throw new Error('AI session turn retry aborted')
  await new Promise<void>((resolve, reject) => {
    let onAbort = (): void => undefined
    const cleanup = (): void => signal?.removeEventListener('abort', onAbort)
    const timer = window.setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    onAbort = (): void => {
      window.clearTimeout(timer)
      cleanup()
      reject(new Error('AI session turn retry aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function signalConfig(signal: AbortSignal | undefined): { signal: AbortSignal } | undefined {
  return signal === undefined ? undefined : { signal }
}

function normalizeWindowSize(value: number | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('createAiAgentTurnCallbacks.windowSize must be a positive number')
  }
  return Math.floor(value)
}

function assertPreparedSession(body: unknown, input: SparkAiAgent.AiAgentPrepareSessionInput): void {
  const sessionId = readString(body, 'sessionId') ?? input.sessionId
  if (sessionId !== input.sessionId) {
    throw new Error(`AI prepare sessionId mismatch: expected=${input.sessionId}, actual=${sessionId}`)
  }
}

function assertTurnStart(body: unknown, input: SparkAiAgent.AiAgentStreamTurnInput): void {
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

function assertAppendMessages(body: unknown, input: SparkAiAgent.AiAgentAppendMessagesInput): void {
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

function readSessionTurnResult(
  body: unknown,
  input: SparkAiAgent.AiAgentStreamTurnInput,
): SparkAiAgent.AiAgentStreamTurnResult {
  if (!isRecord(body)) {
    throw new Error('AI session turn response missing body')
  }
  const sessionId = readString(body, 'sessionId')
  if (sessionId !== input.sessionId) {
    throw new Error('AI session turn response sessionId mismatch')
  }
  const turnId = readString(body, 'turnId')
  if (turnId !== undefined && turnId !== input.turn.turnId) {
    throw new Error('AI session turn response turnId mismatch')
  }
  return {
    text: typeof body['text'] === 'string' ? body['text'] : '',
    ...(typeof body['reasoning'] === 'string' ? { reasoning: body['reasoning'] } : {}),
    toolCalls: readToolCalls(body['toolCalls']),
    assistantMessagePersisted: true,
  }
}

function readToolCalls(value: unknown): readonly SparkAiAgent.AiAgentTransportToolCall[] {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeToolCall)
    .filter((call): call is SparkAiAgent.AiAgentTransportToolCall => call !== null)
}

function normalizeToolCall(value: unknown): SparkAiAgent.AiAgentTransportToolCall | null {
  if (!isRecord(value)) return null
  const fn = isRecord(value['function']) ? value['function'] : null
  if (fn === null || typeof fn['name'] !== 'string' || fn['name'].trim() === '') return null
  if (typeof value['id'] !== 'string' || value['id'].trim() === '') return null
  const rawArguments = fn['arguments']
  return {
    id: value['id'],
    type: 'function',
    function: {
      name: fn['name'],
      arguments: typeof rawArguments === 'string' ? rawArguments : JSON.stringify(rawArguments ?? {}),
    },
  }
}

function emitSyntheticSessionTurnEvent(input: SparkAiAgent.AiAgentStreamTurnInput, body: unknown): void {
  const event: SparkAiAgent.AiAgentStreamEvent = {
    type: 'result',
    data: body,
    turnKey: '',
    streamKey: '',
    scope: {
      businessRegistrationId: input.scope.businessRegistrationId,
      businessInstanceId: input.scope.businessInstanceId,
      eventModuleId: 'llm',
      turnId: input.turn.turnId,
    },
  }
  input.onStreamEvent?.(event)
}

function readString(value: unknown, key: string): string | undefined {
  return isRecord(value) && typeof value[key] === 'string' ? value[key] : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 生产 AiAgentHost 单例：session-turn + app SSE transport。 */
export const appAiAgent = createAiAgentHost({
  turnCallbacks: createAiAgentTurnCallbacks({ transport: 'app-sse' }),
  maxToolRounds: 16,
})
