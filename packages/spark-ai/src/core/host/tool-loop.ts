/**
 * AI Host 工具调用循环。
 */

import type { AiRuntimeKnowledgeProjection } from '../protocol/runtime-protocol'
import { createAiHostStreamKey, toAiHostRuntimeScope } from './scope'
import { createAiRuntimeToolCodec } from '../internal/tool-codec'
import { addGuidedAiToolAction, createInitialAiToolActionSet } from '../internal/tool-exposure-policy'
import { actionModuleId, emitLlmDiagnosticEvent, stringifyAiHostPayload } from './diagnostics'
import { toCurrentTurnMessages } from './turn-utils'
import type {
  AiHostBusinessLifecycleDirective,
  AiHostBusinessRuntime,
  AiHostBusinessScope,
  AiHostChatRequest,
  AiHostOptions,
  AiHostTransportMessage,
  AiHostTransportToolCall,
  AiHostTurnMeta,
} from './types'

function parseToolArgs(raw: string | undefined): unknown {
  if (raw === undefined || raw.trim() === '') return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export class AiHostToolLoopRunner {
  constructor(private readonly options: AiHostOptions) {}

  async runToolLoop(
    runtime: AiHostBusinessRuntime,
    scope: AiHostBusinessScope,
    projection: AiRuntimeKnowledgeProjection,
    request: AiHostChatRequest,
    turn: AiHostTurnMeta,
    clearSelected: () => void,
  ): Promise<void> {
    const enabledActions = createInitialAiToolActionSet(projection)
    const runtimeContext = toAiHostRuntimeScope(scope)
    const systemPrompt = [
      runtime.getSystemPrompt?.(runtimeContext),
      request.systemPrompt,
      projection.promptSnapshot,
    ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join('\n\n')
    let pendingMessages = toCurrentTurnMessages(request)
    const sessionId = scope.instanceId
    const maxRounds = this.options.maxToolRounds

    for (let round = 0; maxRounds === undefined || round < maxRounds; round += 1) {
      if (request.signal?.aborted) return
      const currentRound = round + 1
      const codec = createAiRuntimeToolCodec(
        projection,
        enabledActions === null ? {} : { includeActions: enabledActions },
      )
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
        runtime.appendMessage({
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
        const output = await this.executeToolCall(runtime, scope, projection, turn, currentRound, codec.actionOf.bind(codec), call, request)
        if (output !== null) {
          executedToolCalls.push(call)
          toolMessages.push(output.toolMessage)
          addGuidedAiToolAction(projection, enabledActions, output.action, output.args, output.result)
          if (output.directive.status !== 'continue') {
            lifecycleDirective = output.directive
            break
          }
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
        runtime.appendMessage({
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
        await runtime.endBusinessInstance?.(runtimeContext, lifecycleDirective)
        clearSelected()
        return
      }
      pendingMessages = messagesToAppend
    }

    request.onDelta?.('工具调用轮次已达上限，请检查当前业务状态后继续。')
  }

  private async executeToolCall(
    runtime: AiHostBusinessRuntime,
    scope: AiHostBusinessScope,
    projection: AiRuntimeKnowledgeProjection,
    turn: AiHostTurnMeta,
    round: number,
    actionOf: (toolName: string) => string | null,
    call: AiHostTransportToolCall,
    request: AiHostChatRequest,
  ): Promise<{
    toolMessage: AiHostTransportMessage
    directive: AiHostBusinessLifecycleDirective
    action: string
    args: unknown
    result: Awaited<ReturnType<AiHostBusinessRuntime['executeFunctionCall']>>
  } | null> {
    const toolName = call.function?.name ?? ''
    const action = actionOf(toolName)
    if (action === null) {
      request.onDelta?.(`未识别的工具调用：${toolName}`)
      return null
    }
    const args = parseToolArgs(call.function?.arguments)
    const started = Date.now()
    const runtimeContext = toAiHostRuntimeScope(scope)
    const result = await runtime.executeFunctionCall({
      ...runtimeContext,
      action,
      args,
      projection,
    })
    const defaultDirective: AiHostBusinessLifecycleDirective = { status: 'continue' }
    const directive = await runtime.afterFunctionCall?.({
      ...runtimeContext,
      action,
      args,
      result,
    }) ?? defaultDirective
    const durationMs = Date.now() - started
    const eventModuleId = actionModuleId(action)
    request.onFcCall?.({
      toolName: action,
      args,
      turnId: turn.turnId,
      round,
      ...(call.id === undefined ? {} : { callId: call.id }),
      status: result.ok ? 'success' : 'error',
      result,
      durationMs,
    })
    request.onSseEvent?.({
      type: 'tool-result',
      data: stringifyAiHostPayload(result),
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
        content: stringifyAiHostPayload(result),
        ...(call.id === undefined ? {} : { tool_call_id: call.id }),
      },
      directive,
      action,
      args,
      result,
    }
  }
}
