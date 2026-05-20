/**
 * AI Host 工具调用循环。
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │                   AiHostToolLoopRunner                        │
 * │                                                              │
 * │  runToolLoop() ─ 主循环                                      │
 * │    ├─ ① 创建初始工具集（渐进式暴露）                           │
 * │    ├─ ② 组装 systemPrompt                                    │
 * │    ├─ ③ 循环（maxToolRounds 轮）：                            │
 * │    │    ├─ a. 编码工具 → AiRuntimeToolCodec                   │
 * │    │    ├─ b. transport.streamTurn() → SSE 流式请求 LLM        │
 * │    │    ├─ c. 如有文本回复 → appendMessage                    │
 * │    │    ├─ d. 如有工具调用 → 逐个执行：                        │
 * │    │    │    ├─ decode action → runtime.executeFunctionCall() │
 * │    │    │    ├─ afterFunctionCall() → 生命周期指令              │
 * │    │    │    └─ 如果 directive != continue → 终止循环           │
 * │    │    └─ e. 无工具调用 → 循环自然结束                         │
 * │    └─ ④ 超过最大轮次 → 输出警告消息                            │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 时序：LLM 回复 → 工具调用 → 执行业务函数 → 生命周期判断 → 继续/终止
 * 核心策略：工具渐进式暴露（超过阈值时仅暴露 knowledge/lifecycle 模块）
 */

import type { AiRuntimeKnowledgeProjection } from '../protocol/runtime-protocol'
import { createAiHostStreamKey, toAiHostRuntimeScope } from './scope'
import { AiRuntimeToolCodec } from '../internal/tool-codec'
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

/** 解析 LLM 工具调用参数字符串为 JSON 对象。 */
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

  /**
   * 执行工具调用循环。
   * 流程阶段：
   * 1. 创建初始工具集（渐进式暴露，超过阈值仅暴露 knowledge/lifecycle）
   * 2. 组装 systemPrompt（runtime + request + projection）
   * 3. 循环：编码工具 → SSE 请求 LLM → 处理文本回复 → 执行工具调用 → 生命周期判断
   * 4. 终止：无工具调用 / 生命周期指令 != continue / 达到最大轮次
   */
  async runToolLoop(
    runtime: AiHostBusinessRuntime,
    scope: AiHostBusinessScope,
    projection: AiRuntimeKnowledgeProjection,
    request: AiHostChatRequest,
    turn: AiHostTurnMeta,
    clearSelected: () => void,
  ): Promise<void> {
    // 阶段 1：创建初始工具集（渐进式暴露策略）
    const enabledActions = createInitialAiToolActionSet(projection)
    // 阶段 2：组装 systemPrompt（按优先级：runtime > request > projection）
    const runtimeContext = toAiHostRuntimeScope(scope)
    const systemPrompt = [
      runtime.getSystemPrompt?.(runtimeContext),
      request.systemPrompt,
      projection.promptSnapshot,
    ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join('\n\n')
    let pendingMessages = toCurrentTurnMessages(request)
    const sessionId = scope.instanceId
    const maxRounds = this.options.maxToolRounds

    // 阶段 3：工具调用主循环
    for (let round = 0; maxRounds === undefined || round < maxRounds; round += 1) {
      if (request.signal?.aborted) return
      const currentRound = round + 1
      // 3a. 编码工具：将投影中的函数曝光为 LLM tool specs
      const codec = new AiRuntimeToolCodec(
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

      // 3c. 处理 LLM 文本回复 → 追加到会话
      if (result.text.trim().length > 0) {
        runtime.appendMessage({
          ...runtimeContext,
          role: 'assistant',
          content: result.text,
          source: 'llm',
        })
      }

      // 3d. 无工具调用 → 循环自然结束
      if (result.toolCalls.length === 0) return

      // 3d. 处理工具调用：逐个执行
      const toolMessages: AiHostTransportMessage[] = []
      const executedToolCalls: AiHostTransportToolCall[] = []
      let lifecycleDirective: AiHostBusinessLifecycleDirective | null = null
      for (const call of result.toolCalls) {
        // 解码 action → 执行业务函数 → 获取生命周期指令
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
      // 3d. 组装本轮消息：assistant 消息 + 所有工具调用结果
      const assistantMessage: AiHostTransportMessage = {
        role: 'assistant',
        content: result.text,
        tool_calls: executedToolCalls,
      }
      const messagesToAppend: AiHostTransportMessage[] = [assistantMessage, ...toolMessages]
      // 3d. 如果生命周期指令要求终止（complete/abort），追加最终消息
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
      // 3d. 生命周期指令 != null → 终止循环：上报消息 → 结束业务实例
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

    // 阶段 4：超过最大轮次 → 警告消息
    request.onDelta?.('工具调用轮次已达上限，请检查当前业务状态后继续。')
  }

  /**
   * 执行单个工具调用。
   * 流程：解码 toolName → runtime.executeFunctionCall() → afterFunctionCall() → 上报事件
   * 返回 null 表示工具无法识别，不应中断循环。
   */
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
    // 解码 toolName → action 字符串
    const action = actionOf(toolName)
    if (action === null) {
      request.onDelta?.(`未识别的工具调用：${toolName}`)
      return null
    }
    const args = parseToolArgs(call.function?.arguments)
    const started = Date.now()
    const runtimeContext = toAiHostRuntimeScope(scope)
    // 执行函数调用
    const result = await runtime.executeFunctionCall({
      ...runtimeContext,
      action,
      args,
      projection,
    })
    const defaultDirective: AiHostBusinessLifecycleDirective = { status: 'continue' }
    // 获取生命周期指令（默认 continue）
    const directive = await runtime.afterFunctionCall?.({
      ...runtimeContext,
      action,
      args,
      result,
    }) ?? defaultDirective
    const durationMs = Date.now() - started
    const eventModuleId = actionModuleId(action)
    // 上报函数调用记录（onFcCall 回调 + SSE 事件）
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
