import type { AiRuntimeKnowledgeProjection } from '@spark-view/spark-ai'
import type { AiChatSendRequest } from '@spark-view/spark-component'
import { createAppAiStreamKey, toRuntimeScope } from './scope'
import { createAppAiToolCodec } from './tool-codec'
import {
  addGuidedToolAction,
  createInitialToolActionSet,
} from './tool-exposure-policy'
import {
  actionModuleId,
  emitLlmDiagnosticEvent,
  stringifyAiHostPayload,
} from './diagnostics'
import { toCurrentTurnMessages } from './turn-utils'
import type {
  AppAiBusinessLifecycleDirective,
  AppAiBusinessRuntime,
  AppAiBusinessScope,
  AppAiHostOptions,
  AppAiTransportMessage,
  AppAiTransportToolCall,
  AppAiTurnMeta,
} from './types'

function parseToolArgs(raw: string | undefined): unknown {
  if (raw === undefined || raw.trim() === '') return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export class AppAiToolLoopRunner {
  constructor(private readonly options: AppAiHostOptions) {}

  async runToolLoop(
    runtime: AppAiBusinessRuntime,
    scope: AppAiBusinessScope,
    projection: AiRuntimeKnowledgeProjection,
    request: AiChatSendRequest,
    turn: AppAiTurnMeta,
    clearSelected: () => void,
  ): Promise<void> {
    const enabledActions = createInitialToolActionSet(projection)
    const runtimeContext = toRuntimeScope(scope)
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
      const codec = createAppAiToolCodec(
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

      const toolMessages: AppAiTransportMessage[] = []
      const executedToolCalls: AppAiTransportToolCall[] = []
      let lifecycleDirective: AppAiBusinessLifecycleDirective | null = null
      for (const call of result.toolCalls) {
        const output = await this.executeToolCall(runtime, scope, projection, turn, currentRound, codec.actionOf.bind(codec), call, request)
        if (output !== null) {
          executedToolCalls.push(call)
          toolMessages.push(output.toolMessage)
          addGuidedToolAction(projection, enabledActions, output.action, output.args, output.result)
          if (output.directive.status !== 'continue') {
            lifecycleDirective = output.directive
            break
          }
        }
      }
      const assistantMessage: AppAiTransportMessage = {
        role: 'assistant',
        content: result.text,
        tool_calls: executedToolCalls,
      }
      const messagesToAppend: AppAiTransportMessage[] = [assistantMessage, ...toolMessages]
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
    runtime: AppAiBusinessRuntime,
    scope: AppAiBusinessScope,
    projection: AiRuntimeKnowledgeProjection,
    turn: AppAiTurnMeta,
    round: number,
    actionOf: (toolName: string) => string | null,
    call: AppAiTransportToolCall,
    request: AiChatSendRequest,
  ): Promise<{
    toolMessage: AppAiTransportMessage
    directive: AppAiBusinessLifecycleDirective
    action: string
    args: unknown
    result: Awaited<ReturnType<AppAiBusinessRuntime['executeFunctionCall']>>
  } | null> {
    const toolName = call.function?.name ?? ''
    const action = actionOf(toolName)
    if (action === null) {
      request.onDelta?.(`未识别的工具调用：${toolName}`)
      return null
    }
    const args = parseToolArgs(call.function?.arguments)
    const started = Date.now()
    const runtimeContext = toRuntimeScope(scope)
    const result = await runtime.executeFunctionCall({
      ...runtimeContext,
      action,
      args,
      projection,
    })
    const directive = await runtime.afterFunctionCall?.({
      ...runtimeContext,
      action,
      args,
      result,
    }) ?? { status: 'continue' as const }
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
      streamKey: createAppAiStreamKey(scope, eventModuleId, turn.turnId),
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
