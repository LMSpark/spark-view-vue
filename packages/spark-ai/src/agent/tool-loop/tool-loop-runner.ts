/**
 * ═══════════════════════════════════════════════════════════════
 * agent/tool-loop/tool-loop-runner.ts — AI Host 工具循环执行器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Agent 层的核心编排引擎。负责"用户消息 → AI 推理 →
 *   工具调用 → AI 再推理"的完整闭环。每个 turn 内可执行多轮（round）
 *   工具调用，直到 LLM 自然结束、业务终止或达到上限。
 *
 * 【核心类】
 *   AiAgentToolLoopRunner — 工具循环执行器
 *     ├─ runToolLoop()              — 主循环入口
 *     ├─ completeLifecycleDirective  — 生命周期终止流程
 *     └─ appendMessagesToTransport   — 消息同步到传输层
 *
 * 【单轮执行流程】
 *   1. 构建系统提示词（业务 systemPrompt + 请求 systemPrompt + 知识快照）
 *   2. 提取最新用户消息 → 发送给 LLM（turnCallbacks.executeTurn）
 *   3. LLM 返回文本 + 工具调用列表
 *   4. 依次执行工具调用（toolCallExecutor.execute）
 *   5. 将 assistant(tool_calls) + tool 结果 append 到后端会话
 *   6. 检查生命周期指令：continue → 下一轮；complete/abort → 结束
 *   7. 结束时：发送最终消息 → appendMessages → stopSession → 释放实例
 *
 * 【终止条件】
 *   · LLM 不再返回工具调用（自然结束）
 *   · 业务生命周期回调返回 complete/abort（业务主动终止）
 *   · 达到 maxToolRounds 上限（安全阀）
 *
 * 【消费方】business-session.ts（AiAgentMessageSender.send）
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiJsonParams } from '../../json'
import { createAiAgentSessionId, toAiAgentRuntimeScope } from '../business/business-scope'
import type { AiAgentLifecycleDirective } from '../business/lifecycle-types'
import type { AiAgentRegistration } from '../business/registration-types'
import type { AiAgentScope } from '../business/scope-types'
import type { AiAgentChatRequest, AiAgentTurnMeta } from '../chat/chat-types'
import type { AiAgentSessionStore } from '../session/session-types'
import type { AiModuleToolSpec } from '../../modules/internal/protocol-tool-generator'
import type {
  AiAgentTurnCallbacks,
  AiAgentTransportMessage,
  AiAgentTransportToolCall,
  AiAgentTransportToolSpec,
} from '../transport/transport-types'
import { emitAiAgentDiagnosticEvent } from './diagnostic-events'
import { toCurrentTurnMessages } from './payload-codec'
import { AiAgentToolCallExecutor } from './tool-call-executor'

function toAiAgentTransportTools(
  tools: readonly AiModuleToolSpec[],
): readonly AiAgentTransportToolSpec[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
      ...(tool.function.strict === undefined ? {} : { strict: tool.function.strict }),
    },
  }))
}

/* ── 输入/输出类型 ──────────────────────────────────────────── */

/** 工具循环的输入参数 */
type AiAgentToolLoopInput<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  registration: AiAgentRegistration<TInput>
  scope: AiAgentScope
  request: AiAgentChatRequest
  turn: AiAgentTurnMeta
  /** 清除 session 选中缓存（业务切换时由 session 层传入） */
  clearSelected: () => void
}>

/* ── 工具循环执行器 ────────────────────────────────────────── */

export class AiAgentToolLoopRunner {
  private readonly toolCallExecutor = new AiAgentToolCallExecutor()

  public constructor(
    private readonly callbacks: AiAgentTurnCallbacks,
    private readonly maxToolRounds: number | undefined,
  ) {}

  /**
   * 执行工具循环主流程。
   *
   * 每轮（round）：
   *   1. 读取 AiModuleRuntime 固定协议工具规约
   *   2. 发送 LLM 诊断事件（llm-request）
   *   3. 调用 turnCallbacks.executeTurn 获取 AI 响应
   *   4. 将 AI 文本回复写入 sessionStore
   *   5. 若无工具调用 → 自然结束
   *   6. 依次执行每个工具调用，收集 toolMessage 和 lifecycleDirective
   *   7. 若 lifecycleDirective ≠ 'continue' → 进入生命周期终止流程
   *   8. 否则把本轮消息 append 到 V4 后端会话，下一轮用空 messages 续写 session 历史
   */
  // AI_AGENT_TRACE[host-tool-loop]: LLM round、tool call 和工具结果回填在这里完成通用 Agent 闭环。
  // AI_AGENT_REFACTOR_SOURCE[tool-result-feedback]: ok:false 参数校验回灌属于内核闭环；业务工具只返回结构化结果。
  public async runToolLoop<TInput extends AiJsonParams>(input: AiAgentToolLoopInput<TInput>): Promise<void> {
    const { registration, scope, request, turn, clearSelected } = input
    const runtimeContext = toAiAgentRuntimeScope(scope)
    const sessionId = createAiAgentSessionId(scope.businessRegistrationId, scope.businessInstanceId)
    const maxRounds = this.maxToolRounds
    const sessionStore = requireSessionStore(registration)

    // 拼接系统提示词：业务自定义 + 请求编排 + AiModule 知识快照
    const systemPrompt = [
      registration.systemPrompt?.(runtimeContext),
      request.systemPrompt,
      registration.runtime.projectKnowledge().promptSnapshot,
    ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join('\n\n')

    const initialTools = registration.runtime.getTools()
    const initialTransportTools = toAiAgentTransportTools(initialTools)
    const initialToolNames = new Set(initialTools.map((tool) => tool.function.name))
    await this.callbacks.prepareSession?.({
      sessionId,
      scope,
      systemPrompt,
      tools: initialTransportTools,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    })

    // 首轮消息：仅包含最新用户输入
    let pendingMessages = toCurrentTurnMessages(request)

    for (let round = 0; maxRounds === undefined || round < maxRounds; round += 1) {
      // AbortSignal 检查：外部取消信号触发时立即退出
      if (request.signal?.aborted) return

      const currentRound = round + 1
      const tools = round === 0 ? initialTransportTools : toAiAgentTransportTools(registration.runtime.getTools())
      const toolNames = round === 0 ? initialToolNames : new Set(tools.map((tool) => tool.function.name))

      // 发送 LLM 请求诊断事件（前端可据此展示"AI 正在思考"）
      emitAiAgentDiagnosticEvent({
        request,
        scope,
        turn,
        type: 'llm-request',
        data: {
          kind: 'streamTurn',
          round: currentRound,
          sessionId,
          turnId: turn.turnId,
          systemPrompt,
          tools,
          messages: pendingMessages,
        },
      })

      // 调用 AI 后端流式接口
      const result = await this.callbacks.executeTurn({
        sessionId,
        scope,
        turn,
        systemPrompt,
        tools,
        messages: pendingMessages,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        ...(request.onDelta === undefined ? {} : { onDelta: request.onDelta }),
        ...(request.onReasoning === undefined ? {} : { onReasoning: request.onReasoning }),
        ...(request.onUsage === undefined ? {} : { onUsage: request.onUsage }),
        ...(request.onStreamEvent === undefined ? {} : { onStreamEvent: request.onStreamEvent }),
      })

      // 将 AI 文本回复写入会话历史
      if (result.text.trim().length > 0) {
        sessionStore.appendMessage({
          ...runtimeContext,
          role: 'assistant',
          content: result.text,
          source: 'llm',
        })
      }

      // 无工具调用 → 对话自然结束
      if (result.toolCalls.length === 0) return

      // 逐个执行工具调用
      const toolMessages: AiAgentTransportMessage[] = []
      const executedToolCalls: AiAgentTransportToolCall[] = []
      let lifecycleDirective: AiAgentLifecycleDirective | null = null

      for (const call of result.toolCalls) {
        const output = await this.toolCallExecutor.execute({
          registration,
          scope,
          turn,
          round: currentRound,
          resolveToolName: (toolName) => toolNames.has(toolName) ? toolName : null,
          call,
          request,
          sessionStore,
        })
        // 未识别的工具调用 → 跳过（错误信息已通过 onDelta 通知前端）
        if (output === null) continue
        executedToolCalls.push(call)
        toolMessages.push(output.toolMessage)
        // 业务生命周期指示非 continue → 终止当前 turn
        if (output.directive.status !== 'continue') {
          lifecycleDirective = output.directive
          break
        }
      }

      // 构造本轮的 assistant 消息（含 tool_calls 数组）
      const assistantMessage: AiAgentTransportMessage = {
        role: 'assistant',
        content: result.text,
        tool_calls: executedToolCalls,
      }
      const messagesToAppend: AiAgentTransportMessage[] = [assistantMessage, ...toolMessages]

      await this.appendMessagesToTransport({
        scope,
        request,
        turn,
        sessionId,
        messages: messagesToAppend,
      })

      // 生命周期终止：发送最终消息、停止会话、释放资源
      if (lifecycleDirective !== null) {
        await this.completeLifecycleDirective({
          registration,
          lifecycleDirective,
          runtimeContext,
          scope,
          request,
          turn,
          sessionId,
          messagesToAppend: [],
          sessionStore,
          clearSelected,
        })
        return
      }

      // V4 后端已通过 appendMessages 持久化本轮 assistant(tool_calls)+tool 结果；
      // 下一轮只需让后端基于 session.conversation 继续，避免重复发送同一批消息。
      pendingMessages = []
    }

    // 达到 maxToolRounds 上限：通知前端并退出
    request.onDelta?.('工具调用轮次已达上限，请检查当前业务状态后继续。')
  }

  /* ── 生命周期终止流程 ───────────────────────────────────── */

  /**
   * 完成生命周期指令。
   *
   * 执行顺序：
   *   1. 若有 finalAssistantMessage → 写入 sessionStore + 追加到消息列表
   *   2. 发送 llm-append 诊断事件
   *   3. 调用 turnCallbacks.appendMessages 同步消息到服务端
   *   4. sessionStore.stopSession 标记会话结束
   *   5. 调用业务方 onEndBusinessInstance 回调
   *   6. 若 releaseInstance=true → 调用 releaseModuleInstance 释放外部资源
   *   7. clearSelected 清除 session 缓存
   */
  private async completeLifecycleDirective<TInput extends AiJsonParams>(
    input: CompleteLifecycleDirectiveInput<TInput>,
  ): Promise<void> {
    const {
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
    } = input

    // 追加最终助手消息（业务方可自定义告别语）
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

    // 发送诊断事件 + 同步消息到服务端；若没有最终消息则只做本地生命周期收尾。
    await this.appendMessagesToTransport({
      scope,
      request,
      turn,
      sessionId,
      messages: messagesToAppend,
    })

    // 停止会话 + 业务生命周期回调
    sessionStore.stopSession(runtimeContext, lifecycleDirective.reason ?? lifecycleDirective.status)
    await registration.onEndBusinessInstance?.(runtimeContext, lifecycleDirective)

    // 释放模块实例（如关闭 WebSocket、清理临时文件）
    if (lifecycleDirective.releaseInstance === true) {
      registration.releaseModuleInstance?.(runtimeContext.moduleInstanceId)
    }

    // 清除 session 层缓存
    clearSelected()
  }

  private async appendMessagesToTransport(input: AppendMessagesToTransportInput): Promise<void> {
    if (input.messages.length === 0) return
    emitAiAgentDiagnosticEvent({
      request: input.request,
      scope: input.scope,
      turn: input.turn,
      type: 'llm-append',
      data: {
        kind: 'appendMessages',
        sessionId: input.sessionId,
        turnId: input.turn.turnId,
        messages: input.messages,
      },
    })
    await this.callbacks.appendMessages({
      sessionId: input.sessionId,
      scope: input.scope,
      turn: input.turn,
      messages: input.messages,
    })
  }
}

/* ── 内部辅助类型 ──────────────────────────────────────────── */

/** completeLifecycleDirective 方法的输入参数 */
type CompleteLifecycleDirectiveInput<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  registration: AiAgentRegistration<TInput>
  lifecycleDirective: AiAgentLifecycleDirective
  runtimeContext: ReturnType<typeof toAiAgentRuntimeScope>
  scope: AiAgentScope
  request: AiAgentChatRequest
  turn: AiAgentTurnMeta
  sessionId: string
  messagesToAppend: AiAgentTransportMessage[]
  sessionStore: AiAgentSessionStore
  clearSelected: () => void
}>

type AppendMessagesToTransportInput = Readonly<{
  scope: AiAgentScope
  request: AiAgentChatRequest
  turn: AiAgentTurnMeta
  sessionId: string
  messages: readonly AiAgentTransportMessage[]
}>

/** 获取 sessionStore，若未配置则抛异常 */
function requireSessionStore<TInput extends AiJsonParams>(
  registration: AiAgentRegistration<TInput>,
): AiAgentSessionStore {
  return registration.sessionStore
}
