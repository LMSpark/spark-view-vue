/**
 * AI Host 工具调用循环。
 *
 * Host 直接调度 module-semantic 的 6 个协议工具,不再经过旧 projection /
 * AiRuntimeToolCodec / action path。
 */

import type { LlmJsonValue } from '../schema'
import { ModuleSemanticToolCodec } from '../module-semantic/host/module-semantic-tool-codec'
import type { CheckEntry, OperationResult } from '../module-semantic/protocol/operation-result'
import { createAiHostStreamKey, toAiHostRuntimeScope } from './scope'
import { emitLlmDiagnosticEvent, eventModuleIdFromProtocolCall, stringifyAiHostPayload } from './diagnostics'
import { toCurrentTurnMessages } from './turn-utils'
import type {
  AiHostBusinessLifecycleDirective,
  AiHostBusinessRegistration,
  AiHostBusinessScope,
  AiHostChatRequest,
  AiHostFunctionCallFailure,
  AiHostFunctionCallResult,
  AiHostOptions,
  AiHostTransportMessage,
  AiHostTransportToolCall,
  AiHostTurnMeta,
} from './types'

function parseToolArgs(raw: string | undefined): Readonly<Record<string, LlmJsonValue>> {
  if (raw === undefined || raw.trim() === '') return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return toProtocolArgs(parsed)
  } catch {
    return {}
  }
}

export class AiHostToolLoopRunner {
  public constructor(private readonly options: AiHostOptions) {}

  public async runToolLoop(
    registration: AiHostBusinessRegistration,
    scope: AiHostBusinessScope,
    request: AiHostChatRequest,
    turn: AiHostTurnMeta,
    clearSelected: () => void,
  ): Promise<void> {
    const runtimeContext = toAiHostRuntimeScope(scope)
    const sessionId = scope.instanceId
    const maxRounds = this.options.maxToolRounds
    const sessionStore = requireSessionStore(registration)
    const systemPrompt = [
      registration.systemPrompt?.(runtimeContext),
      request.systemPrompt,
      registration.description,
    ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join('\n\n')

    let pendingMessages = toCurrentTurnMessages(request)

    for (let round = 0; maxRounds === undefined || round < maxRounds; round += 1) {
      if (request.signal?.aborted) return

      const currentRound = round + 1
      const codec = new ModuleSemanticToolCodec(registration.runtime.getLlmTools())

      emitLlmDiagnosticEvent(request, scope, turn, 'llm-request', {
        kind: 'streamTurn',
        round: currentRound,
        sessionId,
        turnId: turn.turnId,
        systemPrompt,
        tools: codec.tools,
        messages: pendingMessages,
      })

      const result = await this.options.transport.streamTurn({
        sessionId,
        scope,
        turn,
        systemPrompt,
        tools: codec.tools,
        messages: pendingMessages,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        onDelta: request.onDelta,
        onReasoning: request.onReasoning,
        onUsage: request.onUsage,
        onSseEvent: request.onSseEvent,
      })

      if (result.text.trim().length > 0) {
        sessionStore.appendMessage({
          ...runtimeContext,
          role: 'assistant',
          content: result.text,
          source: 'llm',
        })
      }

      if (result.toolCalls.length === 0) return

      const toolMessages: AiHostTransportMessage[] = []
      const executedToolCalls: AiHostTransportToolCall[] = []
      let lifecycleDirective: AiHostBusinessLifecycleDirective | null = null

      for (const call of result.toolCalls) {
        const output = await this.executeToolCall(registration, scope, turn, currentRound, codec.actionOf.bind(codec), call, request)
        if (output === null) continue
        executedToolCalls.push(call)
        toolMessages.push(output.toolMessage)
        if (output.directive.status !== 'continue') {
          lifecycleDirective = output.directive
          break
        }
      }

      const assistantMessage: AiHostTransportMessage = {
        role: 'assistant',
        content: result.text,
        tool_calls: executedToolCalls,
      }
      const messagesToAppend: AiHostTransportMessage[] = [assistantMessage, ...toolMessages]

      if (lifecycleDirective?.finalAssistantMessage !== undefined && lifecycleDirective.finalAssistantMessage.trim().length > 0) {
        request.onDelta?.(lifecycleDirective.finalAssistantMessage)
        sessionStore.appendMessage({
          ...runtimeContext,
          role: 'assistant',
          content: lifecycleDirective.finalAssistantMessage,
          source: 'system',
          metadata: {
            lifecycleStatus: lifecycleDirective.status,
            ...(lifecycleDirective.reason === undefined ? {} : { reason: lifecycleDirective.reason }),
          },
        })
        messagesToAppend.push({
          role: 'assistant',
          content: lifecycleDirective.finalAssistantMessage,
        })
      }

      if (lifecycleDirective !== null) {
        emitLlmDiagnosticEvent(request, scope, turn, 'llm-append', {
          kind: 'appendMessages',
          sessionId,
          turnId: turn.turnId,
          messages: messagesToAppend,
        })
        await this.options.transport.appendMessages({
          sessionId,
          scope,
          turn,
          messages: messagesToAppend,
        })
        sessionStore.stopSession(runtimeContext, lifecycleDirective.reason ?? lifecycleDirective.status)
        await registration.onEndBusinessInstance?.(runtimeContext, lifecycleDirective)
        if (lifecycleDirective.releaseInstance === true) {
          registration.releaseModuleInstance?.(runtimeContext.moduleInstanceId)
        }
        clearSelected()
        return
      }

      pendingMessages = messagesToAppend
    }

    request.onDelta?.('工具调用轮次已达上限，请检查当前业务状态后继续。')
  }

  private async executeToolCall(
    registration: AiHostBusinessRegistration,
    scope: AiHostBusinessScope,
    turn: AiHostTurnMeta,
    round: number,
    actionOf: (toolName: string) => string | null,
    call: AiHostTransportToolCall,
    request: AiHostChatRequest,
  ): Promise<{
    readonly toolMessage: AiHostTransportMessage
    readonly directive: AiHostBusinessLifecycleDirective
  } | null> {
    const toolName = call.function?.name ?? ''
    const protocolToolName = actionOf(toolName)
    if (protocolToolName === null) {
      request.onDelta?.(`未识别的工具调用：${toolName}`)
      return null
    }

    const args = parseToolArgs(call.function?.arguments)
    const started = Date.now()
    const runtimeContext = toAiHostRuntimeScope(scope)
    const sessionStore = requireSessionStore(registration)
    const operationResult = await registration.runtime.executeTool(protocolToolName, args, {
      moduleId: runtimeContext.moduleId,
      moduleInstanceId: runtimeContext.moduleInstanceId,
      instanceId: runtimeContext.instanceId,
    })
    const callResult = toFunctionCallResult(operationResult)

    sessionStore.appendFunctionCall({
      moduleId: runtimeContext.moduleId,
      moduleInstanceId: runtimeContext.moduleInstanceId,
      instanceId: runtimeContext.instanceId,
      runtimeInstanceId: runtimeContext.instanceId,
      toolName: protocolToolName,
      args,
      status: callResult.ok ? 'completed' : 'failed',
      ...(callResult.ok ? { result: callResult.data } : { error: failureFromCallResult(callResult) }),
    })

    const directive = await registration.afterFunctionCall?.({
      ...runtimeContext,
      toolName: protocolToolName,
      args,
      result: callResult,
    }) ?? { status: 'continue' as const }

    const durationMs = Date.now() - started
    const eventModuleId = eventModuleIdFromProtocolCall(protocolToolName, args)

    request.onFcCall?.({
      toolName: protocolToolName,
      args,
      turnId: turn.turnId,
      round,
      ...(call.id === undefined ? {} : { callId: call.id }),
      status: callResult.ok ? 'success' : 'error',
      result: callResult,
      durationMs,
    })

    request.onSseEvent?.({
      type: 'tool-result',
      data: stringifyAiHostPayload(callResult),
      streamKey: createAiHostStreamKey(scope, eventModuleId, turn.turnId),
      scope: {
        businessRegistrationId: scope.businessRegistrationId,
        businessInstanceId: scope.businessInstanceId,
        eventModuleId,
        turnId: turn.turnId,
      },
    })

    return {
      toolMessage: {
        role: 'tool',
        content: stringifyAiHostPayload(callResult),
        ...(call.id === undefined ? {} : { tool_call_id: call.id }),
      },
      directive,
    }
  }
}

function requireSessionStore(registration: AiHostBusinessRegistration) {
  if (registration.sessionStore === undefined) {
    throw new Error(`AI host business registration missing sessionStore: ${registration.moduleId}`)
  }
  return registration.sessionStore
}

function toProtocolArgs(value: unknown): Readonly<Record<string, LlmJsonValue>> {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, LlmJsonValue> = {}
  for (const [key, raw] of Object.entries(value)) {
    const coerced = coerceLlmJsonValue(raw)
    if (coerced !== undefined) out[key] = coerced
  }
  return out
}

function coerceLlmJsonValue(value: unknown): LlmJsonValue | undefined {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    const out: LlmJsonValue[] = []
    for (const item of value) {
      const coerced = coerceLlmJsonValue(item)
      if (coerced !== undefined) out.push(coerced)
    }
    return out
  }
  if (typeof value === 'object') {
    const out: Record<string, LlmJsonValue> = {}
    for (const [key, raw] of Object.entries(value)) {
      const coerced = coerceLlmJsonValue(raw)
      if (coerced !== undefined) out[key] = coerced
    }
    return out
  }
  return undefined
}

function toFunctionCallResult(result: OperationResult<LlmJsonValue>): AiHostFunctionCallResult<unknown> {
  if (result.ok) {
    const summary = firstInfoOrWarnSummary(result.checks)
    return {
      ok: true,
      ...(result.data === undefined ? {} : { data: result.data }),
      ...(summary === undefined ? {} : { summary }),
    }
  }
  const failure = pickFirstErrorCheck(result.checks)
  if (failure === undefined) {
    return {
      ok: false,
      code: 'PROTOCOL_FAILURE',
      msg: '协议层返回失败但未携带 error 级 check',
      fix: '请检查 OperationResult.checks 是否正确填充',
    }
  }
  return {
    ok: false,
    code: failure.code,
    msg: failure.message,
    fix: failure.hint ?? '请根据 message 调整调用方式或参数',
  }
}

function firstInfoOrWarnSummary(checks: readonly CheckEntry[] | undefined): string | undefined {
  return checks?.find((check) => check.level === 'info' || check.level === 'warn')?.message
}

function pickFirstErrorCheck(checks: readonly CheckEntry[] | undefined): CheckEntry | undefined {
  return checks?.find((check) => check.level === 'error')
}

function failureFromCallResult(result: AiHostFunctionCallResult<unknown>): AiHostFunctionCallFailure {
  if (result.ok) throw new Error('[AiHostToolLoopRunner] failureFromCallResult called with success result')
  return { ok: false, code: result.code, msg: result.msg, fix: result.fix }
}
