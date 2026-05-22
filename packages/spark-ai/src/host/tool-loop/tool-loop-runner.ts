/**
 * host/tool-loop/tool-loop-runner.ts
 *
 * AiHostToolLoopRunner owns the round loop: ask transport for a turn, execute
 * tool calls, append messages, and honor business lifecycle directives.
 */

import { ModuleSemanticToolCodec } from '../../module-semantic/host/module-semantic-tool-codec'
import { toAiHostRuntimeScope } from '../business/business-scope'
import type {
  AiHostBusinessLifecycleDirective,
  AiHostBusinessRegistration,
  AiHostBusinessScope,
  AiHostOptions,
} from '../business/business-types'
import type { AiHostChatRequest, AiHostTurnMeta } from '../chat/chat-types'
import type { AiHostSessionStore } from '../session/session-types'
import type {
  AiHostTransportMessage,
  AiHostTransportToolCall,
} from '../transport/transport-types'
import { emitLlmDiagnosticEvent } from './diagnostic-events'
import { toCurrentTurnMessages } from './payload-codec'
import { AiHostToolCallExecutor } from './tool-call-executor'

export class AiHostToolLoopRunner {
  private readonly toolCallExecutor = new AiHostToolCallExecutor()

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
        const output = await this.toolCallExecutor.execute({
          registration,
          scope,
          turn,
          round: currentRound,
          actionOf: codec.actionOf.bind(codec),
          call,
          request,
          sessionStore,
        })
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

      if (lifecycleDirective !== null) {
        await this.completeLifecycleDirective(
          registration,
          lifecycleDirective,
          runtimeContext,
          scope,
          request,
          turn,
          sessionId,
          messagesToAppend,
          sessionStore,
          clearSelected,
        )
        return
      }

      pendingMessages = messagesToAppend
    }

    request.onDelta?.('工具调用轮次已达上限，请检查当前业务状态后继续。')
  }

  private async completeLifecycleDirective(
    registration: AiHostBusinessRegistration,
    lifecycleDirective: AiHostBusinessLifecycleDirective,
    runtimeContext: ReturnType<typeof toAiHostRuntimeScope>,
    scope: AiHostBusinessScope,
    request: AiHostChatRequest,
    turn: AiHostTurnMeta,
    sessionId: string,
    messagesToAppend: AiHostTransportMessage[],
    sessionStore: AiHostSessionStore,
    clearSelected: () => void,
  ): Promise<void> {
    if (lifecycleDirective.finalAssistantMessage !== undefined && lifecycleDirective.finalAssistantMessage.trim().length > 0) {
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
  }
}

function requireSessionStore(registration: AiHostBusinessRegistration): AiHostSessionStore {
  if (registration.sessionStore === undefined) {
    throw new Error(`AI host business registration missing sessionStore: ${registration.moduleId}`)
  }
  return registration.sessionStore
}
