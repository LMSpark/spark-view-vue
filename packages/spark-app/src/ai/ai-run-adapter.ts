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
} from '@spark-view/spark-ai/agent'
import type { AiJsonParams } from '@spark-view/spark-ai/json'

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

export type AiRunErrorFormatter = (error: unknown) => string
export type AiRunBeforeFunctionCall = (
  options: AiAgentBeforeFunctionCallOptions,
) => AiAgentBeforeFunctionCallDirective | Promise<AiAgentBeforeFunctionCallDirective>
export type AiRunAbortHandler = (reason: string) => void
export type AiRunAdapterRunStatus = 'completed' | 'aborted'

export type AiRunHost = Readonly<{
  run<TInput extends AiJsonParams>(
    alias: string,
    input: TInput,
    chat?: AiAgentTaskChatOptions,
  ): Promise<AiAgentHostRunResult>
}>

export type AiRunAdapterOptions = Readonly<{
  formatError?: AiRunErrorFormatter
}>

export type AiRunAdapterCommand<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  host: AiRunHost
  alias: string
  input: TInput
  trace?: AiRunTraceSink
  beforeFunctionCall?: AiRunBeforeFunctionCall
  onAbort?: AiRunAbortHandler
  userMessage?: string
}>

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
