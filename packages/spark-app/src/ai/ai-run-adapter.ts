/**
 * @module @spark-appworks/spark-app:ai/ai-run-adapter
 * 职责：提供 spark-app 应用壳中的 ai run adapter 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * Headless AI run adapter.
 *
 * This file is intentionally UI-free: no Vue imports, no component references,
 * and no browser transport ownership. UI can observe a run by passing an
 * optional trace sink.
 */

import type {
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
  AiAgentHostRunResult,
  AiAgentStreamEvent,
  AiAgentTaskChatOptions,
  AiAgentToolCallRecord,
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
  trace?: AiRunTraceSink
  beforeFunctionCall?: AiRunBeforeFunctionCall
  onAbort?: AiRunAbortHandler
  userMessage?: string
}>

/** Ai Run Adapter State 的运行状态。 */
export type AiRunAdapterState = Readonly<{
  isRunning(): boolean
  abort(reason?: string): void
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

export function formatAiRunError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createAiRunAdapter(
  options: AiRunAdapterOptions = {},
): AiRunAdapterState {
  const formatError = options.formatError ?? formatAiRunError
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

  async function run<TInput extends AiJsonParams>(
    command: AiRunAdapterCommand<TInput>,
  ): Promise<AiRunAdapterRunStatus> {
    if (activeRun !== null) {
      throw new Error('AI run is already in progress.')
    }

    const trace = command.trace ?? noopTraceSink
    const controller = new AbortController()
    const runId = nextRunId + 1
    nextRunId = runId

    const currentRun: ActiveRun = {
      runId,
      controller,
      trace,
      ...(command.onAbort === undefined ? {} : { onAbort: command.onAbort }),
      aborted: false,
    }
    activeRun = currentRun

    trace.reset()
    if (command.userMessage !== undefined) {
      trace.appendUserMessage(command.userMessage)
    }

    try {
      await command.host.run(command.alias, command.input, {
        signal: controller.signal,
        onStreamEvent: (event) => trace.appendEvent(event),
        onDelta: (delta) => trace.appendDelta(delta),
        onReasoning: (reasoning) => trace.appendReasoning(reasoning),
        onToolCall: (record) => trace.appendToolCall(record),
        ...(command.beforeFunctionCall === undefined ? {} : { beforeFunctionCall: command.beforeFunctionCall }),
      })

      if (activeRun !== currentRun || currentRun.aborted) return 'aborted'
      return 'completed'
    } catch (error) {
      if (currentRun.aborted) return 'aborted'
      if (activeRun === currentRun) {
        trace.appendError(formatError(error))
      }
      throw error
    } finally {
      if (activeRun === currentRun) {
        trace.finish()
        activeRun = null
      }
    }
  }

  return {
    isRunning,
    abort,
    run,
  }
}
