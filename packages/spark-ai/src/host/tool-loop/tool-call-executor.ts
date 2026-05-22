/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  AI HOST · 工具调用执行器                                                     │
 * │  Tool Call Executor                                                          │
 * │                                                                              │
 * │  本模块负责执行单次协议工具调用：将 LLM 返回的 transport 层 tool_call           │
 * │  翻译为 module-semantic 层的协议工具调用，执行后返回结果。                      │
 * │                                                                              │
 * │  执行流程：                                                                   │
 * │    1. 从 transport tool_call 中提取 function.name                            │
 * │    2. 通过 actionOf 回查对应的协议工具名（如 "invokeAction"）                   │
 * │    3. 解析 JSON 参数字符串 → Record<string, LlmJsonValue>                     │
 * │    4. 调用 registration.runtime.executeTool 执行协议工具                       │
 * │    5. 将 ModuleOperationResult 转换为 AiHostFunctionCallResult                │
 * │    6. 写入 sessionStore（appendFunctionCall）                                 │
 * │    7. 调用业务方 afterFunctionCall 生命周期钩子                                │
 * │    8. 发送诊断事件（emitToolResultEvent）+ 业务回调（onFcCall）                 │
 * │    9. 返回 toolMessage（role: 'tool'）和生命周期指令                            │
 * │                                                                              │
 * │  调用方：tool-loop-runner.ts（runToolLoop 内每个 tool_call 循环）              │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

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

/* -------------------------------------------------------------------------------
 * 一、类型定义
 * ----------------------------------------------------------------------------- */

/** 从 transport 工具名回查协议工具名的解析器 */
export type AiHostToolCallActionResolver = (toolName: string) => string | null

/** 工具调用执行的输入参数 */
export type AiHostToolCallExecutionInput = Readonly<{
  registration: AiHostBusinessRegistration
  scope: AiHostBusinessScope
  turn: AiHostTurnMeta
  round: number
  /** transport 工具名 → 协议工具名 的解析函数 */
  actionOf: AiHostToolCallActionResolver
  /** LLM 返回的原始 transport tool_call */
  call: AiHostTransportToolCall
  request: AiHostChatRequest
  sessionStore: AiHostSessionStore
}>

/** 工具调用执行的输出 */
export type AiHostToolCallExecutionOutput = Readonly<{
  /** 发回 LLM 的工具消息（role: 'tool'） */
  toolMessage: AiHostTransportMessage
  /** 业务生命周期指令（continue / complete / abort） */
  directive: AiHostBusinessLifecycleDirective
}>

/* -------------------------------------------------------------------------------
 * 二、常量
 * ----------------------------------------------------------------------------- */

/** 默认 continue 指令（无业务方钩子时使用） */
const CONTINUE_DIRECTIVE: AiHostBusinessLifecycleDirective = { status: 'continue' }

/* -------------------------------------------------------------------------------
 * 三、工具调用执行器
 * ----------------------------------------------------------------------------- */

export class AiHostToolCallExecutor {
  /**
   * 执行单次工具调用。
   *
   * 返回 null 表示工具无法识别（actionOf 返回 null），
   * 此时错误信息已通过 onDelta 推送给前端，调用方应跳过该调用。
   */
  public async execute(input: AiHostToolCallExecutionInput): Promise<AiHostToolCallExecutionOutput | null> {
    // 步骤 1-2：提取工具名并回查协议工具名
    const toolName = input.call.function?.name ?? ''
    const protocolToolName = input.actionOf(toolName)
    if (protocolToolName === null) {
      input.request.onDelta?.(`未识别的工具调用：${toolName}`)
      return null
    }

    // 步骤 3：解析 JSON 参数字符串
    const args = parseToolArgs(input.call.function?.arguments)
    const started = Date.now()
    const runtimeContext = toAiHostRuntimeScope(input.scope)

    // 步骤 4：委托 runtime 执行协议工具
    const operationResult = await input.registration.runtime.executeTool(protocolToolName, args, {
      moduleId: runtimeContext.moduleId,
      moduleInstanceId: runtimeContext.moduleInstanceId,
      instanceId: runtimeContext.instanceId,
    })

    // 步骤 5：转换操作结果为 function call result 格式
    const callResult = toFunctionCallResult(operationResult)

    // 步骤 6：写入 sessionStore 历史
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

    // 步骤 7：调用业务方 afterFunctionCall 钩子（未提供则默认 continue）
    const directive = await input.registration.afterFunctionCall?.({
      ...runtimeContext,
      toolName: protocolToolName,
      args,
      result: callResult,
    }) ?? CONTINUE_DIRECTIVE

    const durationMs = Date.now() - started

    // 步骤 8a：通知业务方工具调用记录（用于前端展示/调试）
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

    // 步骤 8b：发送诊断 SSE 事件
    emitToolResultEvent({
      request: input.request,
      scope: input.scope,
      turn: input.turn,
      eventModuleId: eventModuleIdFromProtocolCall(protocolToolName, args),
      data: callResult,
    })

    // 步骤 9：返回 toolMessage + 生命周期指令
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
