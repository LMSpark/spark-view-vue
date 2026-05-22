import { toAiHostRuntimeScope } from '../business/business-scope'
import type {
  AiHostBusinessLifecycleDirective,
  AiHostBusinessRegistration,
  AiHostBusinessScope,
} from '../business/business-types'
import type { AiHostChatRequest, AiHostTurnMeta } from '../chat/chat-types'
import type { AiHostSessionStore } from '../session/session-types'
import type {
  AiHostTransportMessage,
  AiHostTransportToolCall,
} from '../transport/transport-types'
import {
  emitToolResultEvent,
  eventModuleIdFromProtocolCall,
} from './diagnostic-events'
import { parseToolArgs, stringifyAiHostPayload } from './payload-codec'
import {
  failureFromCallResult,
  toFunctionCallResult,
} from './result-mapper'

const CONTINUE_DIRECTIVE: AiHostBusinessLifecycleDirective = { status: 'continue' }

export type AiHostToolCallActionResolver = (toolName: string) => string | null

export type AiHostToolCallExecutionInput = Readonly<{
  registration: AiHostBusinessRegistration
  scope: AiHostBusinessScope
  turn: AiHostTurnMeta
  round: number
  actionOf: AiHostToolCallActionResolver
  call: AiHostTransportToolCall
  request: AiHostChatRequest
  sessionStore: AiHostSessionStore
}>

export type AiHostToolCallExecutionOutput = Readonly<{
  toolMessage: AiHostTransportMessage
  directive: AiHostBusinessLifecycleDirective
}>

export class AiHostToolCallExecutor {
  public async execute(input: AiHostToolCallExecutionInput): Promise<AiHostToolCallExecutionOutput | null> {
    const toolName = input.call.function?.name ?? ''
    const protocolToolName = input.actionOf(toolName)
    if (protocolToolName === null) {
      input.request.onDelta?.(`未识别的工具调用：${toolName}`)
      return null
    }

    const args = parseToolArgs(input.call.function?.arguments)
    const started = Date.now()
    const runtimeContext = toAiHostRuntimeScope(input.scope)

    const operationResult = await input.registration.runtime.executeTool(protocolToolName, args, {
      moduleId: runtimeContext.moduleId,
      moduleInstanceId: runtimeContext.moduleInstanceId,
      instanceId: runtimeContext.instanceId,
    })
    const callResult = toFunctionCallResult(operationResult)

    input.sessionStore.appendFunctionCall({
      moduleId: runtimeContext.moduleId,
      moduleInstanceId: runtimeContext.moduleInstanceId,
      instanceId: runtimeContext.instanceId,
      runtimeInstanceId: runtimeContext.instanceId,
      toolName: protocolToolName,
      args,
      status: callResult.ok ? 'completed' : 'failed',
      ...(callResult.ok ? { result: callResult.data } : { error: failureFromCallResult(callResult) }),
    })

    const directive = await input.registration.afterFunctionCall?.({
      ...runtimeContext,
      toolName: protocolToolName,
      args,
      result: callResult,
    }) ?? CONTINUE_DIRECTIVE

    const durationMs = Date.now() - started
    input.request.onFcCall?.({
      toolName: protocolToolName,
      args,
      turnId: input.turn.turnId,
      round: input.round,
      ...(input.call.id === undefined ? {} : { callId: input.call.id }),
      status: callResult.ok ? 'success' : 'error',
      result: callResult,
      durationMs,
    })

    emitToolResultEvent(
      input.request,
      input.scope,
      input.turn,
      eventModuleIdFromProtocolCall(protocolToolName, args),
      callResult,
    )

    return {
      toolMessage: {
        role: 'tool',
        content: stringifyAiHostPayload(callResult),
        ...(input.call.id === undefined ? {} : { tool_call_id: input.call.id }),
      },
      directive,
    }
  }
}
