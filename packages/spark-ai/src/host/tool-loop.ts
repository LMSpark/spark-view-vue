/**
 * AI Host 工具调用循环。
 *
 * 职责：管理 LLM 与业务工具之间的多轮交互循环。
 * 核心策略：工具渐进式暴露（超过阈值时仅暴露 knowledge/lifecycle 模块）。
 *
 * 主循环时序：
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ 阶段 1：创建初始工具集                                            │
 * │   └─ createInitialAiToolActionSet()                              │
 * │      → 检查函数数量是否超过阈值（默认 24）                         │
 * │      → 超过则仅暴露 knowledge/lifecycle 模块的 action              │
 * │                                                                   │
 * │ 阶段 2：组装 systemPrompt                                         │
 * │   └─ 按优先级拼接：runtime.getSystemPrompt() > request.systemPrompt│
 * │                        > projection.promptSnapshot                │
 * │                                                                   │
 * │ 阶段 3：工具调用主循环（maxToolRounds 轮）                         │
 * │   ├─ 3a. 检查 abort signal → 已中止则直接返回                      │
 * │   ├─ 3b. 编码工具：AiRuntimeToolCodec → 将投影函数转为 LLM specs   │
 * │   ├─ 3c. 上报 llm-request 诊断事件                                │
 * │   ├─ 3d. transport.streamTurn() → SSE 流式请求 LLM                │
 * │   ├─ 3e. 如有文本回复 → runtime.appendMessage('assistant')        │
 * │   ├─ 3f. 无工具调用 → 循环自然结束（return）                       │
 * │   ├─ 3g. 有工具调用 → 逐个执行：                                   │
 * │   │    ├─ actionOf(toolName) → 解码 toolName 为 action 字符串      │
 * │   │    ├─ runtime.executeFunctionCall() → 执行业务函数             │
 * │   │    ├─ runtime.afterFunctionCall() → 获取生命周期指令           │
 * │   │    ├─ directive != continue → 记录指令，中断工具遍历           │
 * │   │    └─ addGuidedAiToolAction() → 渐进式解锁工具                 │
 * │   ├─ 3h. 组装本轮消息：assistant 消息 + 所有 tool 结果             │
 * │   ├─ 3i. 如果 directive.finalAssistantMessage 存在 → 追加消息      │
 * │   ├─ 3j. 如果 directive != null → 上报消息 → endBusinessInstance   │
 * │   │                        → clearSelected → return               │
 * │   └─ 3k. pendingMessages = 本轮消息 → 进入下一轮循环               │
 * │                                                                   │
 * │ 阶段 4：超过最大轮次 → 输出警告消息                                 │
 * └──────────────────────────────────────────────────────────────────┘
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

// ═══════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════

/**
 * 解析 LLM 工具调用参数字符串为 JSON 对象。
 * LLM 返回的 arguments 是 JSON 字符串，需要解析为对象。
 * 空字符串或解析失败时返回空对象 {}。
 */
function parseToolArgs(raw: string | undefined): unknown {
  if (raw === undefined || raw.trim() === '') return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

// ═══════════════════════════════════════════════════════
// 工具调用循环
// ═══════════════════════════════════════════════════════

export class AiHostToolLoopRunner {
  constructor(private readonly options: AiHostOptions) {}

  /**
   * 执行工具调用循环。
   *
   * 参数说明：
   * - runtime: 业务运行时实例，提供 executeFunctionCall 等方法
   * - scope: 业务作用域，标识当前会话上下文
   * - projection: 知识投影快照，包含可用函数和模块树
   * - request: 聊天请求，包含历史消息和回调
   * - turn: Turn 轮次元信息
   * - clearSelected: 清除已选中业务运行时的回调
   *
   * 循环终止条件（任一满足即退出）：
   * 1. abort signal 被触发
   * 2. LLM 没有返回工具调用（自然结束）
   * 3. 生命周期指令要求 complete 或 abort
   * 4. 达到 maxToolRounds 最大轮次
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
      // 3a. 检查取消信号
      if (request.signal?.aborted) return

      const currentRound = round + 1

      // 3b. 编码工具：将投影中的函数曝光为 LLM tool specs
      const codec = new AiRuntimeToolCodec(
        projection,
        enabledActions === null ? {} : { includeActions: enabledActions },
      )

      // 3c. 上报 llm-request 诊断事件（记录当前轮的工具列表和消息）
      emitLlmDiagnosticEvent(request, scope, turn, 'llm-request', {
        kind: 'streamTurn',
        round: currentRound,
        sessionId,
        turnId: turn.turnId,
        systemPrompt,
        tools: codec.tools,
        messages: pendingMessages,
      })

      // 3d. SSE 流式请求 LLM
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

      // 3e. 处理 LLM 文本回复 → 追加到会话历史
      if (result.text.trim().length > 0) {
        runtime.appendMessage({
          ...runtimeContext,
          role: 'assistant',
          content: result.text,
          source: 'llm',
        })
      }

      // 3f. 无工具调用 → 循环自然结束
      if (result.toolCalls.length === 0) return

      // 3g. 处理工具调用：逐个执行
      const toolMessages: AiHostTransportMessage[] = []
      const executedToolCalls: AiHostTransportToolCall[] = []
      let lifecycleDirective: AiHostBusinessLifecycleDirective | null = null

      for (const call of result.toolCalls) {
        // 解码 action → 执行业务函数 → 获取生命周期指令
        const output = await this.executeToolCall(
          runtime, scope, projection, turn, currentRound,
          codec.actionOf.bind(codec), call, request,
        )
        if (output !== null) {
          executedToolCalls.push(call)
          toolMessages.push(output.toolMessage)
          // 渐进式解锁工具：如果 LLM 调用了 guideFunction，解锁其返回的工具
          addGuidedAiToolAction(projection, enabledActions, output.action, output.args, output.result)
          // 生命周期指令不是 continue → 记录并终止工具遍历
          if (output.directive.status !== 'continue') {
            lifecycleDirective = output.directive
            break
          }
        }
      }

      // 3h. 组装本轮消息：assistant 消息 + 所有工具调用结果
      const assistantMessage: AiHostTransportMessage = {
        role: 'assistant',
        content: result.text,
        tool_calls: executedToolCalls,
      }
      const messagesToAppend: AiHostTransportMessage[] = [assistantMessage, ...toolMessages]

      // 3i. 如果生命周期指令要求附带最终回复消息 → 追加
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

      // 3j. 生命周期指令 != null → 终止循环
      // 上报消息 → appendMessages → endBusinessInstance → clearSelected
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

      // 3k. 将本轮消息作为下一轮的 pendingMessages
      pendingMessages = messagesToAppend
    }

    // 阶段 4：超过最大轮次 → 警告消息
    request.onDelta?.('工具调用轮次已达上限，请检查当前业务状态后继续。')
  }

  /**
   * 执行单个工具调用。
   *
   * 流程：
   * 1. 解码 toolName → action 字符串（通过 codec.actionOf）
   * 2. 解析参数 → runtime.executeFunctionCall() → 执行业务函数
   * 3. runtime.afterFunctionCall() → 获取生命周期指令（默认 continue）
   * 4. 上报函数调用记录（onFcCall 回调 + SSE tool-result 事件）
   * 5. 构建 tool 结果消息 → 返回
   *
   * 返回 null 表示 toolName 无法解码为有效 action，不应中断循环。
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

    // 上报函数调用记录（onFcCall 回调）
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

    // 上报 SSE tool-result 事件
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
