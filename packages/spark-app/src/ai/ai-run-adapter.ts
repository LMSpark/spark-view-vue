/**
 * @module @spark-appworks/spark-app:ai/ai-run-adapter
 * 职责：提供唯一的 headless AI run adapter，同时产出 trace snapshot 与 AG-UI 事件投影。
 * 边界：负责应用层编排和可观察性投影，不直接调用 LLM、不渲染组件、不替换底层 transport。
 * AI用途：接入页面 AI 运行、审批、trace UI 或 AG-UI timeline 时，从本模块确认 app 层入口。
 */
/**
 * 本模块刻意保持 UI-free：没有 Vue import，没有组件引用，也不拥有浏览器 transport。
 * UI 通过 snapshot/subscribe 读取内置投影；外部 trace sink 只用于兼容已有宿主观测。
 */

import type {
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
  AiAgentHostRunResult,
  AiAgentRunTrace,
  AiAgentRunTraceSnapshot,
  AiAgentStreamEvent,
  AiAgentTaskChatOptions,
  AiAgentToolCallRecord,
  SparkAgUiEvent,
  SparkAgUiRunInput,
} from '@spark-appworks/spark-ai/agent'
import {
  createAiAgentRunTrace,
  createSparkAgUiCustomEvent,
  createSparkAgUiReasoningEndEvent,
  createSparkAgUiReasoningMessageContentEvent,
  createSparkAgUiReasoningMessageEndEvent,
  createSparkAgUiReasoningMessageStartEvent,
  createSparkAgUiReasoningStartEvent,
  createSparkAgUiRunErrorEvent,
  createSparkAgUiRunFinishedEvent,
  createSparkAgUiRunStartedEvent,
  createSparkAgUiStreamCustomEvent,
  createSparkAgUiTextMessageContentEvent,
  createSparkAgUiTextMessageEndEvent,
  createSparkAgUiTextMessageStartEvent,
  createSparkAgUiToolCallEvents,
  toSparkAgUiAssistantMessageId,
  toSparkAgUiReasoningMessageId,
} from '@spark-appworks/spark-ai/agent'
import type { AiJsonParams } from '@spark-appworks/spark-ai/json'

/** Ai Run Trace Sink 的语义模型。 */
export type AiRunTraceSink = Readonly<{
  appendUserMessage(content: string): void
  appendEvent(event: AiAgentStreamEvent): void
  appendDelta(delta: string): void
  appendReasoning(text: string): void
  appendToolCall(record: AiAgentToolCallRecord): void
  appendError(message: string): void
  markAborted(message?: string): void
  finish(): void
  reset(): void
}>

export const noopTraceSink: AiRunTraceSink = Object.freeze({
  appendUserMessage: () => undefined,
  appendEvent: () => undefined,
  appendDelta: () => undefined,
  appendReasoning: () => undefined,
  appendToolCall: () => undefined,
  appendError: () => undefined,
  markAborted: () => undefined,
  finish: () => undefined,
  reset: () => undefined,
})

/** Ai Run Error Formatter 的语义模型。 */
export type AiRunErrorFormatter = (error: unknown) => string
/** Ai Run Before Function Call 的语义模型。 */
export type AiRunBeforeFunctionCall = (
  options: AiAgentBeforeFunctionCallOptions,
) => AiAgentBeforeFunctionCallDirective | Promise<AiAgentBeforeFunctionCallDirective>
/** Ai Run Abort Handler 的回调函数契约。 */
export type AiRunAbortHandler = (reason: string) => void
/** Ai Run Adapter Run Status 的语义模型。 */
export type AiRunAdapterRunStatus = 'completed' | 'aborted'

/** Ai Run Host 的语义模型。 */
export type AiRunHost = Readonly<{
  run<TInput extends AiJsonParams>(
    alias: string,
    input: TInput,
    chat?: AiAgentTaskChatOptions,
  ): Promise<AiAgentHostRunResult>
}>

/** Ai Run Adapter Options 的调用配置。 */
export type AiRunAdapterOptions = Readonly<{
  formatError?: AiRunErrorFormatter
}>

/** Ai Run Adapter Command 的命令参数。 */
export type AiRunAdapterCommand<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  host: AiRunHost
  alias: string
  input: TInput
  runInput?: SparkAgUiRunInput
  threadId?: string
  runId?: string
  trace?: AiRunTraceSink
  beforeFunctionCall?: AiRunBeforeFunctionCall
  onAbort?: AiRunAbortHandler
  onEvent?: (event: SparkAgUiEvent) => void
  userMessage?: string
}>

/** AG-UI timeline 中给组件展示的单条事件摘要。 */
export type AiRunTimelineEvent = Readonly<{
  sequence: number
  type: string
  timestamp: number
  payloadPreview: string
}>

/** headless AI run adapter 暴露给 UI 的完整只读快照。 */
export type AiRunSnapshot = Readonly<{
  trace: AiAgentRunTraceSnapshot
  agUiEvents: readonly SparkAgUiEvent[]
  timeline: readonly AiRunTimelineEvent[]
}>

/** AI run snapshot 变化监听器，订阅者应只读消费快照而不持有可变内部状态。 */
export type AiRunListener = (snapshot: AiRunSnapshot) => void

/** Ai Run Adapter State 的运行状态。 */
export type AiRunAdapterState = Readonly<{
  isRunning(): boolean
  abort(reason?: string): void
  snapshot(): AiRunSnapshot
  subscribe(listener: AiRunListener): () => void
  run<TInput extends AiJsonParams>(
    command: AiRunAdapterCommand<TInput>,
  ): Promise<AiRunAdapterRunStatus>
}>

type ActiveRun = {
  readonly runId: number
  readonly controller: AbortController
  readonly trace: AiRunTraceSink
  readonly onAbort?: AiRunAbortHandler
  aborted: boolean
}

type MutableAiRunProjectionState = {
  agUiEvents: SparkAgUiEvent[]
  timeline: AiRunTimelineEvent[]
  openTextMessageId: string | null
  openReasoningMessageId: string | null
  activeTurnId: string | null
}

const DEFAULT_PREVIEW_LIMIT = 360

export function formatAiRunError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createAiRunAdapter(
  options: AiRunAdapterOptions = {},
): AiRunAdapterState {
  const formatError = options.formatError ?? formatAiRunError
  const trace = createAiAgentRunTrace()
  const listeners = new Set<AiRunListener>()
  const projection = createEmptyProjectionState()
  let activeRun: ActiveRun | null = null
  let nextRunId = 0

  function isRunning(): boolean {
    return activeRun !== null
  }

  function abort(reason?: string): void {
    const current = activeRun
    if (current === null || current.aborted) return
    const abortReason = reason ?? '本地已中断'
    current.aborted = true
    current.controller.abort()
    current.trace.markAborted(abortReason)
    current.onAbort?.(abortReason)
  }

  function snapshot(): AiRunSnapshot {
    return {
      trace: trace.snapshot(),
      agUiEvents: [...projection.agUiEvents],
      timeline: [...projection.timeline],
    }
  }

  function subscribe(listener: AiRunListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  async function run<TInput extends AiJsonParams>(
    command: AiRunAdapterCommand<TInput>,
  ): Promise<AiRunAdapterRunStatus> {
    if (activeRun !== null) {
      throw new Error('AI run is already in progress.')
    }

    resetProjectionState(projection)
    const controller = new AbortController()
    const runId = nextRunId + 1
    nextRunId = runId
    const runRef = resolveRunRef(command, runId)
    const emit = createEventEmitter(projection, listeners, trace, command.onEvent)
    emit(createSparkAgUiRunStartedEvent({
      ...runRef,
      timestamp: Date.now(),
      ...(command.runInput === undefined ? {} : { input: command.runInput }),
    }))
    const traceSink = createCompositeTraceSink({
      trace,
      projection,
      emit,
      notify: () => notifyListeners(listeners, trace, projection),
      ...(command.trace === undefined ? {} : { external: command.trace }),
    })
    const beforeFunctionCall = wrapBeforeFunctionCall(command.beforeFunctionCall, emit)

    const currentRun: ActiveRun = {
      runId,
      controller,
      trace: traceSink,
      ...(command.onAbort === undefined ? {} : { onAbort: command.onAbort }),
      aborted: false,
    }
    activeRun = currentRun

    traceSink.reset()
    if (command.userMessage !== undefined) {
      traceSink.appendUserMessage(command.userMessage)
    }

    try {
      await command.host.run(command.alias, command.input, {
        signal: controller.signal,
        onStreamEvent: (event) => traceSink.appendEvent(event),
        onDelta: (delta) => traceSink.appendDelta(delta),
        onReasoning: (reasoning) => traceSink.appendReasoning(reasoning),
        onToolCall: (record) => traceSink.appendToolCall(record),
        ...(beforeFunctionCall === undefined ? {} : { beforeFunctionCall }),
      })

      if (activeRun !== currentRun || currentRun.aborted) {
        traceSink.finish()
        return 'aborted'
      }
      traceSink.finish()
      emit(createSparkAgUiRunFinishedEvent({
        ...runRef,
        result: { status: 'completed' },
        timestamp: Date.now(),
      }))
      return 'completed'
    } catch (error) {
      if (currentRun.aborted) {
        traceSink.finish()
        return 'aborted'
      }
      if (activeRun === currentRun) {
        const message = formatError(error)
        traceSink.appendError(message)
        traceSink.finish()
        emit(createSparkAgUiRunErrorEvent({
          message,
          timestamp: Date.now(),
          rawEvent: error,
        }))
      }
      throw error
    } finally {
      if (activeRun === currentRun) {
        activeRun = null
      }
    }
  }

  return {
    isRunning,
    abort,
    snapshot,
    subscribe,
    run,
  }
}

function createCompositeTraceSink(input: Readonly<{
  trace: AiAgentRunTrace
  external?: AiRunTraceSink
  projection: MutableAiRunProjectionState
  emit(event: SparkAgUiEvent): void
  notify(): void
}>): AiRunTraceSink {
  const external = input.external ?? noopTraceSink
  return {
    reset: () => {
      input.trace.reset()
      external.reset()
      input.notify()
    },
    appendUserMessage: (content) => {
      input.trace.appendUserMessage(content)
      external.appendUserMessage(content)
      input.notify()
    },
    appendEvent: (event) => {
      input.projection.activeTurnId = event.scope.turnId || input.projection.activeTurnId
      input.trace.appendEvent(event)
      external.appendEvent(event)
      input.emit(createSparkAgUiStreamCustomEvent(event, { timestamp: Date.now() }))
    },
    appendDelta: (delta) => {
      const messageId = ensureTextMessage(input.projection, input.emit)
      input.trace.appendDelta(delta)
      external.appendDelta(delta)
      input.emit(createSparkAgUiTextMessageContentEvent({
        messageId,
        delta,
        timestamp: Date.now(),
      }))
    },
    appendReasoning: (text) => {
      const messageId = ensureReasoningMessage(input.projection, input.emit)
      input.trace.appendReasoning(text)
      external.appendReasoning(text)
      input.emit(createSparkAgUiReasoningMessageContentEvent({
        messageId,
        delta: text,
        timestamp: Date.now(),
      }))
    },
    appendToolCall: (record) => {
      input.trace.appendToolCall(record)
      external.appendToolCall(record)
      for (const event of createSparkAgUiToolCallEvents(record, { timestamp: Date.now() })) {
        input.emit(event)
      }
    },
    appendError: (message) => {
      input.trace.appendError(message)
      external.appendError(message)
      input.notify()
    },
    markAborted: (message) => {
      input.trace.markAborted(message)
      external.markAborted(message)
      closeOpenMessages(input.projection, input.emit)
      input.notify()
    },
    finish: () => {
      input.trace.finish()
      external.finish()
      closeOpenMessages(input.projection, input.emit)
      input.notify()
    },
  }
}

function wrapBeforeFunctionCall(
  beforeFunctionCall: AiRunBeforeFunctionCall | undefined,
  emit: (event: SparkAgUiEvent) => void,
): AiRunBeforeFunctionCall | undefined {
  if (beforeFunctionCall === undefined) return undefined
  return async (options: AiAgentBeforeFunctionCallOptions): Promise<AiAgentBeforeFunctionCallDirective> => {
    emit(createSparkAgUiCustomEvent('spark.toolApproval.requested', toApprovalPayload(options), {
      timestamp: Date.now(),
      rawEvent: options,
    }))
    const directive = await beforeFunctionCall(options)
    emit(createSparkAgUiCustomEvent('spark.toolApproval.resolved', {
      ...toApprovalPayload(options),
      directive,
    }, {
      timestamp: Date.now(),
      rawEvent: directive,
    }))
    return directive
  }
}

function ensureTextMessage(
  projection: MutableAiRunProjectionState,
  emit: (event: SparkAgUiEvent) => void,
): string {
  if (projection.openTextMessageId !== null) return projection.openTextMessageId
  const messageId = toSparkAgUiAssistantMessageId(projection.activeTurnId ?? 'unknown')
  projection.openTextMessageId = messageId
  emit(createSparkAgUiTextMessageStartEvent({ messageId, timestamp: Date.now() }))
  return messageId
}

function ensureReasoningMessage(
  projection: MutableAiRunProjectionState,
  emit: (event: SparkAgUiEvent) => void,
): string {
  if (projection.openReasoningMessageId !== null) return projection.openReasoningMessageId
  const messageId = toSparkAgUiReasoningMessageId(projection.activeTurnId ?? 'unknown')
  projection.openReasoningMessageId = messageId
  emit(createSparkAgUiReasoningStartEvent({ messageId, timestamp: Date.now() }))
  emit(createSparkAgUiReasoningMessageStartEvent({ messageId, timestamp: Date.now() }))
  return messageId
}

function closeOpenMessages(
  projection: MutableAiRunProjectionState,
  emit: (event: SparkAgUiEvent) => void,
): void {
  if (projection.openTextMessageId !== null) {
    emit(createSparkAgUiTextMessageEndEvent({
      messageId: projection.openTextMessageId,
      timestamp: Date.now(),
    }))
    projection.openTextMessageId = null
  }
  if (projection.openReasoningMessageId !== null) {
    const messageId = projection.openReasoningMessageId
    emit(createSparkAgUiReasoningMessageEndEvent({ messageId, timestamp: Date.now() }))
    emit(createSparkAgUiReasoningEndEvent({ messageId, timestamp: Date.now() }))
    projection.openReasoningMessageId = null
  }
}

function createEventEmitter(
  projection: MutableAiRunProjectionState,
  listeners: Set<AiRunListener>,
  trace: AiAgentRunTrace,
  onEvent: ((event: SparkAgUiEvent) => void) | undefined,
): (event: SparkAgUiEvent) => void {
  return (event) => {
    projection.agUiEvents = [...projection.agUiEvents, event]
    projection.timeline = [
      ...projection.timeline,
      toTimelineEvent(event, projection.timeline.length + 1),
    ]
    onEvent?.(event)
    notifyListeners(listeners, trace, projection)
  }
}

function notifyListeners(
  listeners: Set<AiRunListener>,
  trace: AiAgentRunTrace,
  projection: MutableAiRunProjectionState,
): void {
  const snapshot: AiRunSnapshot = {
    trace: trace.snapshot(),
    agUiEvents: [...projection.agUiEvents],
    timeline: [...projection.timeline],
  }
  for (const listener of listeners) {
    listener(snapshot)
  }
}

function toTimelineEvent(event: SparkAgUiEvent, sequence: number): AiRunTimelineEvent {
  const timestamp = typeof event.timestamp === 'number' ? event.timestamp : Date.now()
  return {
    sequence,
    type: event.type,
    timestamp,
    payloadPreview: previewPayload(event),
  }
}

function previewPayload(value: unknown): string {
  let text: string
  try {
    text = JSON.stringify(value)
  } catch {
    text = String(value)
  }
  return text.length > DEFAULT_PREVIEW_LIMIT
    ? `${text.slice(0, DEFAULT_PREVIEW_LIMIT)}...`
    : text
}

function resolveRunRef(
  command: AiRunAdapterCommand,
  sequence: number,
): Readonly<{ threadId: string; runId: string; parentRunId?: string }> {
  const threadId = command.threadId
    ?? command.runInput?.threadId
    ?? `spark-thread:${command.alias}`
  const runId = command.runId
    ?? command.runInput?.runId
    ?? `spark-run:${sequence}`
  return {
    threadId,
    runId,
    ...(command.runInput?.parentRunId === undefined ? {} : { parentRunId: command.runInput.parentRunId }),
  }
}

function toApprovalPayload(options: AiAgentBeforeFunctionCallOptions): Record<string, unknown> {
  return {
    moduleId: options.moduleId,
    moduleInstanceId: options.moduleInstanceId,
    instanceId: options.instanceId,
    toolName: options.toolName,
    args: options.args,
  }
}

function createEmptyProjectionState(): MutableAiRunProjectionState {
  return {
    agUiEvents: [],
    timeline: [],
    openTextMessageId: null,
    openReasoningMessageId: null,
    activeTurnId: null,
  }
}

function resetProjectionState(projection: MutableAiRunProjectionState): void {
  projection.agUiEvents = []
  projection.timeline = []
  projection.openTextMessageId = null
  projection.openReasoningMessageId = null
  projection.activeTurnId = null
}
