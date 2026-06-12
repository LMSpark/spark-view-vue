/**
 * @module app:services/ai-host-run-bridge
 * 职责：提供应用运行时 service 层的 ai host run bridge 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * APP 层 Host Run 分布式桥接器。
 *
 * 后端通过 APP 公共 SSE 定向下发 ai-host-run-request，本桥接器只负责
 * 校验平台载荷、调用本地 AiAgentHost.run(alias,args)、收集 trace 并提交回执。
 * 业务状态和业务流程编排仍由注册方与 LLM 协作完成，APP bridge 不理解具体能力。
 */

import {
  createAiAgentRunTrace,
  type AiAgentHostDryRunResult,
  type AiAgentHostRunResult,
  type AiAgentTaskChatOptions,
  type AiAgentRunTraceToolCall,
} from '@spark-appworks/spark-ai/agent'
import { coerceStrictJsonValue, type AiJsonParams, type AiJsonValue } from '@spark-appworks/spark-ai/json'
import { http } from '@/services/http'
import {
  clearAiTurnBridgeDiagnostics,
  readAiTurnBridgeDiagnostics,
} from '@/services/ai/ai-turn-bridge'
import {
  onAiHostRunRequest,
  type AiHostRunRequestEvent,
  type AiHostRunResultStatus,
} from '@/services/sse-events'
import { readAiDeliveryErrorExtras } from '@/services/ai/ai-delivery-port'

/** Ai Host Run Target 的语义模型。 */
export type AiHostRunTarget = Readonly<{
  has(alias: string): boolean
  dryRun(alias: string, args: unknown): AiAgentHostDryRunResult
  run(alias: string, args: AiJsonParams, chat?: AiAgentTaskChatOptions): Promise<AiAgentHostRunResult>
}>

/** Ai Host Run Prepare 的语义模型。 */
export type AiHostRunPrepare<THost extends AiHostRunTarget = AiHostRunTarget> = (
  event: AiHostRunRequestEvent,
  host: THost,
) => AiHostRunTarget | Promise<AiHostRunTarget>

/** Ai Host Run Bridge Options 的调用配置。 */
export type AiHostRunBridgeOptions<THost extends AiHostRunTarget = AiHostRunTarget> = Readonly<{
  host: THost
  prepareRun?: AiHostRunPrepare<THost>
  defaultTimeoutMs?: number
  maxParallelRuns?: number
}>

/** Ai Host Run Bridge 的语义模型。 */
export type AiHostRunBridge = Readonly<{
  start(): () => void
}>

type AiHostRunErrorCode =
  | 'AI_HOST_RUN_INVALID_REQUEST'
  | 'AI_HOST_RUN_UNKNOWN_ALIAS'
  | 'AI_HOST_RUN_NON_RUNNABLE'
  | 'AI_HOST_RUN_BUSY'
  | 'AI_HOST_RUN_TIMEOUT'
  | 'AI_HOST_RUN_CANCELLED'
  | 'AI_HOST_RUN_DELIVERY_FAILED'
  | 'AI_HOST_RUN_FAILED'

type AiHostRunError = Readonly<{
  code: AiHostRunErrorCode
  message: string
  details?: Record<string, unknown>
}>

type AiHostRunResultPayload = {
  requestId: string
  alias: string
  status: AiHostRunResultStatus
  durationMs: number
  clientTimestamp: number
  sessionId?: string
  businessRegistrationId?: string
  businessInstanceId?: string
  text?: string
  reasoning?: string
  toolCalls?: readonly AiAgentRunTraceToolCall[]
  sseEvents?: readonly string[]
  error?: AiHostRunError
  [key: string]: unknown
}

const AI_HOST_RUN_RESULT_API = '/api/ai/host-run/result'
const DEFAULT_HOST_RUN_TIMEOUT_MS = 300_000
const DEFAULT_MAX_PARALLEL_RUNS = 4
const MAX_COMPLETED_RESULT_CACHE_SIZE = 50

export function createAiHostRunBridge<THost extends AiHostRunTarget>(
  options: AiHostRunBridgeOptions<THost>,
): AiHostRunBridge {
  const defaultTimeoutMs = normalizeTimeoutMs(options.defaultTimeoutMs, DEFAULT_HOST_RUN_TIMEOUT_MS)
  const maxParallelRuns = normalizeParallelRuns(options.maxParallelRuns, DEFAULT_MAX_PARALLEL_RUNS)
  const activeRequestIds = new Set<string>()
  const completedResults = new Map<string, AiHostRunResultPayload>()

  async function handleRequest(event: AiHostRunRequestEvent): Promise<void> {
    const cached = completedResults.get(event.requestId)
    if (cached !== undefined) {
      await postAiHostRunResult(cached)
      return
    }

    if (activeRequestIds.has(event.requestId)) {
      await completeRequest(completedResults, createFailureResult({
        event,
        status: 'busy',
        startedAt: Date.now(),
        code: 'AI_HOST_RUN_BUSY',
        message: `AI Host Run request is already in progress: ${event.requestId}`,
      }))
      return
    }

    const startedAt = Date.now()
    const trace = createAiAgentRunTrace()
    const sseEvents = new Set<string>()
    if (activeRequestIds.size >= maxParallelRuns) {
      await completeRequest(completedResults, createFailureResult({
        event,
        status: 'busy',
        startedAt,
        code: 'AI_HOST_RUN_BUSY',
        message: `AI Host Run parallel limit reached: ${maxParallelRuns}`,
        details: {
          activeRequestIds: Array.from(activeRequestIds),
        },
      }))
      return
    }

    activeRequestIds.add(event.requestId)
    const timeoutMs = normalizeTimeoutMs(event.timeoutMs, defaultTimeoutMs)
    const controller = new AbortController()
    const timeoutState = { timedOut: false }
    const timeoutId = setTimeout(() => {
      timeoutState.timedOut = true
      controller.abort()
    }, timeoutMs)

    try {
      let args: AiJsonParams
      try {
        args = toAiJsonParams(event.args)
      } catch (error: unknown) {
        await completeRequest(completedResults, createFailureResult({
          event,
          status: 'invalid_args',
          startedAt,
          code: 'AI_HOST_RUN_INVALID_REQUEST',
          message: errorMessage(error),
        }))
        return
      }
      const runHost = options.prepareRun === undefined
        ? options.host
        : await awaitAbortable(options.prepareRun(event, options.host), controller.signal)

      if (!runHost.has(event.alias)) {
        await completeRequest(completedResults, createFailureResult({
          event,
          status: 'unknown_alias',
          startedAt,
          code: 'AI_HOST_RUN_UNKNOWN_ALIAS',
          message: `AI host run alias is not registered: ${event.alias}`,
        }))
        return
      }

      const dryRun = runHost.dryRun(event.alias, args)
      if (!dryRun.ok) {
        await completeRequest(completedResults, createDryRunFailureResult(event, startedAt, dryRun))
        return
      }

      trace.reset()
      trace.appendUserMessage(dryRun.orchestration.userMessage)
      clearAiTurnBridgeDiagnostics()
      const runResult = await awaitAbortable(runHost.run(event.alias, args, {
        signal: controller.signal,
        onStreamEvent: (streamEvent) => {
          sseEvents.add('llm-frame')
          trace.appendEvent(streamEvent)
        },
        onDelta: (delta) => trace.appendDelta(delta),
        onReasoning: (reasoning) => trace.appendReasoning(reasoning),
        onToolCall: (record) => trace.appendToolCall(record),
      }), controller.signal)
      trace.finish()

      const snapshot = trace.snapshot()
      const resultExtras = readHostRunResultExtras(runResult)
      await completeRequest(completedResults, {
        requestId: event.requestId,
        alias: event.alias,
        status: 'completed',
        durationMs: elapsedSince(startedAt),
        clientTimestamp: Date.now(),
        sessionId: runResult.session.sessionId,
        businessRegistrationId: runResult.session.scope.businessRegistrationId,
        businessInstanceId: runResult.session.scope.businessInstanceId,
        text: snapshot.streamText,
        reasoning: snapshot.reasoningText,
        toolCalls: snapshot.toolCalls,
        sseEvents: Array.from(sseEvents),
        aiTurnDiagnostics: readAiTurnBridgeDiagnostics(),
        ...resultExtras,
      })
    } catch (error: unknown) {
      const deliveryExtras = readAiDeliveryErrorExtras(error)
      const failure = timeoutState.timedOut
        ? { status: 'timeout' as const, code: 'AI_HOST_RUN_TIMEOUT' as const }
        : deliveryExtras !== undefined
          ? { status: 'failed' as const, code: 'AI_HOST_RUN_DELIVERY_FAILED' as const }
        : classifyRuntimeFailure(errorMessage(error))
      await completeRequest(completedResults, createFailureResult({
        event,
        status: failure.status,
        startedAt,
        code: failure.code,
        message: errorMessage(error),
        details: {
          aiTurnDiagnostics: readAiTurnBridgeDiagnostics(),
        },
        extras: {
          ...failureTraceExtras(trace, sseEvents),
          ...(deliveryExtras ?? {}),
        },
      }))
    } finally {
      clearTimeout(timeoutId)
      activeRequestIds.delete(event.requestId)
    }
  }

  return {
    start() {
      return onAiHostRunRequest((event) => {
        void handleRequest(event)
      })
    },
  }
}

function toAiJsonParams(args: Record<string, unknown>): AiJsonParams {
  const coerced = coerceStrictJsonValue(args)
  if (!isAiJsonParams(coerced)) {
    throw new Error('AI Host Run args must be a JSON object.')
  }
  return coerced
}

function isAiJsonParams(value: AiJsonValue | undefined): value is AiJsonParams {
  return value !== undefined
    && value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
}

function createDryRunFailureResult(
  event: AiHostRunRequestEvent,
  startedAt: number,
  dryRun: Extract<AiAgentHostDryRunResult, { ok: false }>,
): AiHostRunResultPayload {
  const message = dryRun.error.message
  const classified = classifyDryRunFailure(message)
  return createFailureResult({
    event,
    status: classified.status,
    startedAt,
    code: classified.code,
    message,
    details: {
      diagnostics: dryRun.diagnostics,
    },
  })
}

function classifyDryRunFailure(message: string): Readonly<{
  status: AiHostRunResultStatus
  code: AiHostRunErrorCode
}> {
  if (message.includes('missing inputContract')) {
    return { status: 'non_runnable', code: 'AI_HOST_RUN_NON_RUNNABLE' }
  }
  if (
    message.includes('schema validation')
    || message.includes('input')
    || message.includes('params')
  ) {
    return { status: 'invalid_args', code: 'AI_HOST_RUN_INVALID_REQUEST' }
  }
  return { status: 'non_runnable', code: 'AI_HOST_RUN_NON_RUNNABLE' }
}

function classifyRuntimeFailure(message: string): Readonly<{
  status: AiHostRunResultStatus
  code: AiHostRunErrorCode
}> {
  if (
    message.includes('schema validation')
    || message.includes('input')
    || message.includes('params')
  ) {
    return { status: 'invalid_args', code: 'AI_HOST_RUN_INVALID_REQUEST' }
  }
  return { status: 'failed', code: 'AI_HOST_RUN_FAILED' }
}

function createFailureResult(input: Readonly<{
  event: AiHostRunRequestEvent
  status: AiHostRunResultStatus
  startedAt: number
  code: AiHostRunErrorCode
  message: string
  details?: Record<string, unknown>
  extras?: Record<string, unknown>
}>): AiHostRunResultPayload {
  return {
    requestId: input.event.requestId,
    alias: input.event.alias,
    status: input.status,
    durationMs: elapsedSince(input.startedAt),
    clientTimestamp: Date.now(),
    error: {
      code: input.code,
      message: input.message,
      ...(input.details === undefined ? {} : { details: input.details }),
    },
    ...(input.extras ?? {}),
  }
}

function failureTraceExtras(
  trace: ReturnType<typeof createAiAgentRunTrace>,
  sseEvents: ReadonlySet<string>,
): Record<string, unknown> {
  const snapshot = trace.snapshot()
  return {
    text: snapshot.streamText,
    reasoning: snapshot.reasoningText,
    toolCalls: snapshot.toolCalls,
    sseEvents: Array.from(sseEvents),
    aiTurnDiagnostics: readAiTurnBridgeDiagnostics(),
  }
}

async function completeRequest(
  completedResults: Map<string, AiHostRunResultPayload>,
  payload: AiHostRunResultPayload,
): Promise<void> {
  cacheCompletedResult(completedResults, payload)
  await postAiHostRunResult(payload)
}

function cacheCompletedResult(
  completedResults: Map<string, AiHostRunResultPayload>,
  payload: AiHostRunResultPayload,
): void {
  completedResults.set(payload.requestId, payload)
  while (completedResults.size > MAX_COMPLETED_RESULT_CACHE_SIZE) {
    const firstKey = completedResults.keys().next().value
    if (typeof firstKey !== 'string') return
    completedResults.delete(firstKey)
  }
}

async function postAiHostRunResult(payload: AiHostRunResultPayload): Promise<void> {
  try {
    await http.post(AI_HOST_RUN_RESULT_API, payload)
  } catch (error: unknown) {
    if (import.meta.env.DEV) {
      console.error('[AI Host Run] 回执提交失败', error)
    }
  }
}

function readHostRunResultExtras(result: AiAgentHostRunResult): Record<string, unknown> {
  const value = result.resultExtras
  if (value === undefined) return {}
  return { ...value }
}

function normalizeTimeoutMs(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.floor(value)
}

function normalizeParallelRuns(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.max(1, Math.floor(value))
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function awaitAbortable<T>(value: T | Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    throw new Error('AI Host Run aborted')
  }
  const promise = Promise.resolve(value)
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const onAbort = (): void => {
        reject(new Error('AI Host Run aborted'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
      promise.finally(() => signal.removeEventListener('abort', onAbort)).catch(() => undefined)
    }),
  ])
}

/** 串联多个 Host Run prepare；各业务 alias 只处理自己的 event，其余透传。 */
export function chainAiHostRunPrepare<THost extends AiHostRunTarget>(
  ...preparers: ReadonlyArray<AiHostRunPrepare<THost>>
): AiHostRunPrepare<THost> {
  return async (event, host): Promise<THost> => {
    let current: THost = host
    for (const prepare of preparers) {
      const next = await prepare(event, current)
      if (!isPreparedHost<THost>(next)) {
        throw new Error('ai-host-run prepare returned an invalid host target.')
      }
      current = next
    }
    return current
  }
}

function isPreparedHost<THost extends AiHostRunTarget>(_host: AiHostRunTarget): _host is THost {
  return true
}
