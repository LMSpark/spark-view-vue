/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  AI HOST · 工具调用执行器                                                     │
 * │  Tool Call Executor                                                          │
 * │                                                                              │
 * │  本模块负责执行单次 OpenAI-style tool_call：将 transport 层 function.name       │
 * │  与 function.arguments 路由到 module-semantic，执行后返回 tool output。          │
 * │                                                                              │
 * │  执行流程：                                                                   │
 * │    1. 从 transport tool_call 中提取 function.name                            │
 * │    2. 通过 actionOf 校验对应 toolName（如 "node-tree_getNode"）                 │
 * │    3. 解析 JSON 参数字符串 → Record<string, LlmJsonValue>                     │
 * │    4. 调用 registration.runtime.executeTool 执行 query/navigation 或 function tool│
 * │    5. 将 ModuleOperationResult 转换为 AiHostFunctionCallResult                │
 * │    6. 写入 sessionStore（appendFunctionCall）                                 │
 * │    7. 调用业务方 afterFunctionCall 生命周期钩子                                │
 * │    8. 发送诊断事件（emitToolResultEvent）+ 业务回调（onFcCall）                 │
 * │    9. 返回 toolMessage（role: 'tool'）和生命周期指令                            │
 * │                                                                              │
 * │  调用方：tool-loop-runner.ts（runToolLoop 内每个 tool_call 循环）              │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import type { LlmJsonParams } from '../../schema'
import { toAiHostRuntimeScope } from '../business/business-scope'
import type {
  AiHostBusinessLifecycleDirective,
  AiHostBusinessRegistration,
  AiHostBusinessScope,
} from '../business/business-types'
import type { AiHostChatRequest, AiHostTurnMeta } from '../chat/chat-types'
import type {
  AiHostFunctionCallResult,
  AiHostSessionStore,
} from '../session/session-types'
import type {
  AiHostTransportMessage,
  AiHostTransportToolCall,
} from '../transport/transport-types'
import {
  emitToolResultEvent,
  eventModuleIdFromProtocolCall,
} from './diagnostic-events'
import { parseToolArgs, stringifyAiHostPayload, ToolArgsParseError } from './payload-codec'
import {
  failureFromCallResult,
  toFunctionCallResult,
} from './result-mapper'

/* -------------------------------------------------------------------------------
 * 一、类型定义
 * ----------------------------------------------------------------------------- */

/**
 * 从 transport toolName 回查可执行 toolName 的解析器。
 *
 * 【DEFERRED】当前为恒等映射（已知→自身，未知→null），与 ModuleSemanticToolCodec.actionOf 一致。
 * 保留此类型作为 Host 层的工具名解析边界，便于未来注入别名、版本兼容等映射逻辑。
 */
export type AiHostToolCallActionResolver = (toolName: string) => string | null

/** 工具调用执行的输入参数 */
export type AiHostToolCallExecutionInput<TInput extends LlmJsonParams = LlmJsonParams> = Readonly<{
  registration: AiHostBusinessRegistration<TInput>
  scope: AiHostBusinessScope
  turn: AiHostTurnMeta
  round: number
  /** transport toolName → runtime toolName 的解析函数 */
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

type ParsedToolArgs = Readonly<{
  ok: true
  args: LlmJsonParams
}> | Readonly<{
  ok: false
  args: LlmJsonParams
  result: AiHostFunctionCallResult<unknown>
}>

type CompleteToolCallExecutionInput<TInput extends LlmJsonParams = LlmJsonParams> = Readonly<{
  source: AiHostToolCallExecutionInput<TInput>
  runtimeContext: ReturnType<typeof toAiHostRuntimeScope>
  protocolToolName: string
  args: LlmJsonParams
  callResult: AiHostFunctionCallResult<unknown>
  started: number
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
  public async execute<TInput extends LlmJsonParams>(
    input: AiHostToolCallExecutionInput<TInput>,
  ): Promise<AiHostToolCallExecutionOutput | null> {
    // 步骤 1-2：提取 toolName 并校验是否在当前 tools 集合中
    const toolName = input.call.function.name
    const protocolToolName = input.actionOf(toolName)
    if (protocolToolName === null) {
      input.request.onDelta?.(`未识别的工具调用：${toolName}`)
      return null
    }

    const started = Date.now()
    const runtimeContext = toAiHostRuntimeScope(input.scope)
    const parsedArgs = readToolArgs(input.call.function.arguments)
    if (!parsedArgs.ok) {
      return this.completeExecution({
        source: input,
        runtimeContext,
        protocolToolName,
        args: parsedArgs.args,
        callResult: parsedArgs.result,
        started,
      })
    }

    // 步骤 3：解析 JSON 参数字符串
    const args = parsedArgs.args

    // 步骤 4：委托 runtime 执行 query/navigation 或 business function tool
    const operationResult = await input.registration.runtime.executeTool(protocolToolName, args, {
      moduleId: runtimeContext.moduleId,
      moduleInstanceId: runtimeContext.moduleInstanceId,
      instanceId: runtimeContext.instanceId,
    })

    // 步骤 5：转换操作结果为 function call result 格式
    const callResult = toFunctionCallResult(operationResult)

    return this.completeExecution({
      source: input,
      runtimeContext,
      protocolToolName,
      args,
      callResult,
      started,
    })
  }

  private async completeExecution<TInput extends LlmJsonParams>(
    input: CompleteToolCallExecutionInput<TInput>,
  ): Promise<AiHostToolCallExecutionOutput> {
    const { source, runtimeContext, protocolToolName, args, callResult, started } = input

    // 步骤 6：写入 sessionStore 历史
    source.sessionStore.appendFunctionCall({
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
    const directive = await source.registration.afterFunctionCall?.({
      ...runtimeContext,
      toolName: protocolToolName,
      args,
      result: callResult,
    }) ?? CONTINUE_DIRECTIVE

    const durationMs = Date.now() - started

    // 步骤 8a：通知业务方工具调用记录（用于前端展示/调试）
    source.request.onFcCall?.({
      toolName: protocolToolName,
      args,
      turnId: source.turn.turnId,
      round: source.round,
      callId: source.call.id,
      status: callResult.ok ? 'success' : 'error',
      result: callResult,
      durationMs,
    })

    // 步骤 8b：发送诊断 stream 事件
    emitToolResultEvent({
      request: source.request,
      scope: source.scope,
      turn: source.turn,
      eventModuleId: eventModuleIdFromProtocolCall(protocolToolName, args),
      data: callResult,
    })

    // 步骤 9：返回 toolMessage + 生命周期指令
    return {
      toolMessage: {
        role: 'tool',
        content: stringifyAiHostPayload(callResult),
        tool_call_id: source.call.id,
      },
      directive,
    }
  }
}

function readToolArgs(raw: string | undefined): ParsedToolArgs {
  try {
    return {
      ok: true,
      args: parseToolArgs(raw),
    }
  } catch (error) {
    if (!(error instanceof ToolArgsParseError)) throw error
    return {
      ok: false,
      args: {},
      result: toolArgsFailureResult(error),
    }
  }
}

function toolArgsFailureResult(error: ToolArgsParseError): AiHostFunctionCallResult<unknown> {
  const fix = '请重新发起该工具调用，function.arguments 必须是 JSON object 字符串。'
  return {
    ok: false,
    code: error.code,
    msg: error.message,
    fix,
    checks: [
      {
        level: 'error',
        code: error.code,
        message: error.message,
        hint: fix,
      },
    ],
  }
}
