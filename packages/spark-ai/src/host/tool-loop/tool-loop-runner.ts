/**
 * ═══════════════════════════════════════════════════════════════
 * host/tool-loop/tool-loop-runner.ts — 协议工具循环执行器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Host 层的核心编排引擎。负责"AI 推理 → 工具调用 → 结果反馈"
 *   的循环执行，直到 AI 不再请求工具或达到轮次上限。
 *
 * 【执行流程（runToolLoop）】
 *   1. 构造 systemPrompt（registration.systemPrompt + request.systemPrompt + registration.description）
 *   2. 提取当前轮用户消息 → pendingMessages
 *   3. 进入循环（每轮）：
 *      a. 创建 ModuleSemanticToolCodec（基于当前注册表快照）
 *      b. 发送 llm-request 诊断事件
 *      c. transport.streamTurn() → AI 推理 → 返回文本 + toolCalls
 *      d. AI 文本非空 → appendMessage('assistant')
 *      e. 无 toolCalls → 返回（对话结束）
 *      f. 遍历 toolCalls → executeToolCall() 逐个执行
 *         - actionOf() 校验工具名（非协议工具跳过）
 *         - runtime.executeTool() 路由到协议方法
 *         - sessionStore.appendFunctionCall() 记录调用
 *         - registration.afterFunctionCall() 生命周期回调
 *         - 返回 toolMessage + directive
 *      g. 按 directive.status 判断：
 *         - continue → pendingMessages = 本轮消息，进入下一轮
 *         - complete/abort → appendMessages + stopSession + onEndBusinessInstance → 返回
 *   4. 达到 maxRounds → 提示用户检查状态
 *
 * 【关键设计】
 *   - 每轮创建新的 ModuleSemanticToolCodec（反映最新的 kind 注册表）
 *   - 工具调用结果通过 toFunctionCallResult 投影为 AiHostFunctionCallResult
 *   - BigInt 通过 JSON.stringify replacer 转为字符串（安全序列化）
 *   - eventModuleIdFromProtocolCall 推导事件归属模块（describeKind → kind 名，其它 → path 尾段 kind）
 *
 * 【消费方】business-session（AiHostMessageSender）
 * ═══════════════════════════════════════════════════════════════
 */

import type { LlmJsonValue } from '../../schema'
import { ModuleSemanticToolCodec } from '../../module-semantic/host/module-semantic-tool-codec'
import { ModuleKind } from '../../module-semantic/protocol/module-kind'
import { createAiHostStreamKey, latestUserInput, toAiHostRuntimeScope } from '../business/business-scope'
import type {
  AiHostBusinessLifecycleDirective,
  AiHostBusinessRegistration,
  AiHostBusinessScope,
  AiHostOptions,
} from '../business/business-types'
import type { AiHostChatRequest, AiHostTurnMeta } from '../chat/chat-types'
import type {
  AiHostFunctionCallFailure,
  AiHostFunctionCallResult,
  AiHostSessionStore,
} from '../session/session-types'
import type {
  AiHostTransportMessage,
  AiHostTransportToolCall,
} from '../transport/transport-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 常量
// ═══════════════════════════════════════════════════════════════

/** 默认生命周期指令：继续（afterFunctionCall 未定义时使用） */
const CONTINUE_DIRECTIVE: AiHostBusinessLifecycleDirective = { status: 'continue' }

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 工具参数解析
// ═══════════════════════════════════════════════════════════════

/**
 * 解析 LLM 返回的工具参数（JSON 字符串 → Record）。
 * 解析失败或为空时返回 {}。
 * 解析成功后通过 toProtocolArgs 将值投影为 LlmJsonValue。
 */
function parseToolArgs(raw: string | undefined): Readonly<Record<string, LlmJsonValue>> {
  if (raw === undefined || raw.trim() === '') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return toProtocolArgs(parsed)
  } catch {
    return {}
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 消息构造
// ═══════════════════════════════════════════════════════════════

/** 从请求中提取当前轮用户消息（作为 transport 消息） */
function toCurrentTurnMessages(request: AiHostChatRequest): AiHostTransportMessage[] {
  const latestUser = latestUserInput(request)
  return latestUser === ''
    ? []
    : [{ role: 'user', content: latestUser }]
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 事件模块推导
// ═══════════════════════════════════════════════════════════════

/**
 * 从协议工具调用推导事件归属模块 ID。
 * - describeKind → 使用 args.kind 作为模块 ID
 * - 其他工具 → 从 args.path 尾段提取 kind 名称
 * - 兜底 → 使用 toolName 本身
 */
function eventModuleIdFromProtocolCall(
  toolName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
): string {
  if (toolName === 'describeKind' && typeof args['kind'] === 'string' && args['kind'].trim().length > 0) {
    return args['kind']
  }
  const path = typeof args['path'] === 'string' ? args['path'] : ''
  const tailKind = kindFromPathTail(path)
  return tailKind ?? toolName
}

// ═══════════════════════════════════════════════════════════════
// 第 5 节 · 诊断事件发射
// ═══════════════════════════════════════════════════════════════

/** 发射 LLM 诊断事件（用于前端调试面板） */
function emitLlmDiagnosticEvent(
  request: AiHostChatRequest,
  scope: AiHostBusinessScope,
  turn: AiHostTurnMeta,
  type: 'llm-request' | 'llm-append',
  data: unknown,
): void {
  request.onSseEvent?.({
    type,
    data: stringifyAiHostPayload(data),
    streamKey: createAiHostStreamKey(scope, 'llm', turn.turnId),
    scope: {
      businessRegistrationId: scope.businessRegistrationId,
      businessInstanceId: scope.businessInstanceId,
      eventModuleId: 'llm',
      turnId: turn.turnId,
    },
  })
}

/** 安全序列化（别名） */
function stringifyAiHostPayload(data: unknown): string {
  return safeJsonStringify(data)
}

// ═══════════════════════════════════════════════════════════════
// 第 6 节 · 路径尾段 kind 提取
// ═══════════════════════════════════════════════════════════════

/**
 * 从模块路径尾段提取 kind 名称。
 * 路径格式：/<kind>[<id>]/<kind>[<id>]/...
 * 尾段示例："school[1]" → "school"
 */
function kindFromPathTail(path: string): string | null {
  const trimmed = path.trim()
  if (trimmed === '' || trimmed === '/') return null
  const tail = trimmed.split('/').filter(Boolean).at(-1)
  if (tail === undefined) return null
  const bracketIndex = tail.indexOf('[')
  const kind = bracketIndex < 0 ? tail : tail.slice(0, bracketIndex)
  return kind.trim().length > 0 ? kind : null
}

// ═══════════════════════════════════════════════════════════════
// 第 7 节 · 安全 JSON 序列化
// ═══════════════════════════════════════════════════════════════

/**
 * 安全 JSON 序列化。
 * - BigInt → 字符串（JSON 原生不支持 BigInt）
 * - 循环引用 → "[Circular]"（防止栈溢出）
 * - 其他值 → 标准 JSON.stringify 行为
 */
function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  const text = JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'bigint') return item.toString()
    if (typeof item === 'object' && item !== null) {
      if (seen.has(item)) return '[Circular]'
      seen.add(item)
    }
    return item
  })
  return text
}

// ═══════════════════════════════════════════════════════════════
// 第 8 节 · AiHostToolLoopRunner class
// ═══════════════════════════════════════════════════════════════

export class AiHostToolLoopRunner {
  public constructor(private readonly options: AiHostOptions) {}

  /**
   * 执行工具循环。
   *
   * @param registration — 业务注册项
   * @param scope        — 业务作用域
   * @param request      — 聊天请求
   * @param turn         — 轮次元数据
   * @param clearSelected — 清除选中业务的回调
   */
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

    // 拼接 systemPrompt：registration 自定义 + request 传入 + registration 描述
    const systemPrompt = [
      registration.systemPrompt?.(runtimeContext),
      request.systemPrompt,
      registration.description,
    ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join('\n\n')

    let pendingMessages = toCurrentTurnMessages(request)

    // 循环执行（最多 maxRounds 轮）
    for (let round = 0; maxRounds === undefined || round < maxRounds; round += 1) {
      if (request.signal?.aborted) return

      const currentRound = round + 1
      // 每轮基于当前注册表快照创建编解码器
      const codec = new ModuleSemanticToolCodec(registration.runtime.getLlmTools())

      // 发射诊断事件
      emitLlmDiagnosticEvent(request, scope, turn, 'llm-request', {
        kind: 'streamTurn',
        round: currentRound,
        sessionId,
        turnId: turn.turnId,
        systemPrompt,
        tools: codec.tools,
        messages: pendingMessages,
      })

      // 调用 AI 推理
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

      // 记录 AI 文本回复
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
      const toolMessages: AiHostTransportMessage[] = []
      const executedToolCalls: AiHostTransportToolCall[] = []
      let lifecycleDirective: AiHostBusinessLifecycleDirective | null = null

      for (const call of result.toolCalls) {
        const output = await this.executeToolCall(registration, scope, turn, currentRound, codec.actionOf.bind(codec), call, request)
        if (output === null) continue
        executedToolCalls.push(call)
        toolMessages.push(output.toolMessage)
        // 生命周期非 continue → 中断本轮剩余工具调用
        if (output.directive.status !== 'continue') {
          lifecycleDirective = output.directive
          break
        }
      }

      // 构造本轮 assistant 消息（含 tool_calls）
      const assistantMessage: AiHostTransportMessage = {
        role: 'assistant',
        content: result.text,
        tool_calls: executedToolCalls,
      }
      const messagesToAppend: AiHostTransportMessage[] = [assistantMessage, ...toolMessages]

      // 生命周期结束处理
      if (lifecycleDirective !== null) {
        // 最终消息（如 "操作已完成"）
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

        // 追加消息到服务端
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

        // 停止会话 + 生命周期回调
        sessionStore.stopSession(runtimeContext, lifecycleDirective.reason ?? lifecycleDirective.status)
        await registration.onEndBusinessInstance?.(runtimeContext, lifecycleDirective)
        if (lifecycleDirective.releaseInstance === true) {
          registration.releaseModuleInstance?.(runtimeContext.moduleInstanceId)
        }
        clearSelected()
        return
      }

      // continue → 本轮消息成为下一轮的 pendingMessages
      pendingMessages = messagesToAppend
    }

    // 达到最大轮次
    request.onDelta?.('工具调用轮次已达上限，请检查当前业务状态后继续。')
  }

  // ── 单个工具调用执行 ──────────────────────────────────────

  /**
   * 执行单个工具调用。
   *
   * 步骤：
   * 1. actionOf() 校验工具名（非协议工具 → 跳过并提示）
   * 2. parseToolArgs() 解析参数
   * 3. runtime.executeTool() 执行协议工具
   * 4. sessionStore.appendFunctionCall() 记录调用
   * 5. registration.afterFunctionCall() 生命周期回调
   * 6. 发射 onFcCall + onSseEvent('tool-result')
   * 7. 返回 toolMessage + directive
   */
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

    // 执行协议工具
    const operationResult = await registration.runtime.executeTool(protocolToolName, args, {
      moduleId: runtimeContext.moduleId,
      moduleInstanceId: runtimeContext.moduleInstanceId,
      instanceId: runtimeContext.instanceId,
    })
    const callResult = toFunctionCallResult(operationResult)

    // 记录工具调用历史
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

    // 生命周期回调
    const directive = await registration.afterFunctionCall?.({
      ...runtimeContext,
      toolName: protocolToolName,
      args,
      result: callResult,
    }) ?? CONTINUE_DIRECTIVE

    const durationMs = Date.now() - started
    const eventModuleId = eventModuleIdFromProtocolCall(protocolToolName, args)

    // 发射工具调用记录
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

    // 发射工具结果 SSE 事件
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

// ═══════════════════════════════════════════════════════════════
// 第 9 节 · 内部辅助函数
// ═══════════════════════════════════════════════════════════════

/** 获取 sessionStore，未提供则抛异常 */
function requireSessionStore(registration: AiHostBusinessRegistration): AiHostSessionStore {
  if (registration.sessionStore === undefined) {
    throw new Error(`AI host business registration missing sessionStore: ${registration.moduleId}`)
  }
  return registration.sessionStore
}

/** 将未知值投影为 LlmJsonValue Record（通过 ModuleKind.coerceJsonValue 逐字段转换） */
function toProtocolArgs(value: unknown): Readonly<Record<string, LlmJsonValue>> {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, LlmJsonValue> = {}
  for (const [key, raw] of Object.entries(value)) {
    const coerced = ModuleKind.coerceJsonValue(raw)
    if (coerced !== undefined) out[key] = coerced
  }
  return out
}

// ═══════════════════════════════════════════════════════════════
// 第 10 节 · OperationResult → FunctionCallResult 投影
// ═══════════════════════════════════════════════════════════════

/**
 * 将 ModuleKind.OperationResult<LlmJsonValue> 投影为
 * AiHostFunctionCallResult<unknown>。
 *
 * 成功时：提取第一条 info/warn 级 check 的 message 作为 summary。
 * 失败时：提取第一条 error 级 check → { code, msg, fix }。
 *         若无 error 级 check → 返回 PROTOCOL_FAILURE 兜底错误。
 */
function toFunctionCallResult(result: ModuleKind.OperationResult<LlmJsonValue>): AiHostFunctionCallResult<unknown> {
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
      fix: '请检查 ModuleKind.OperationResult.checks 是否正确填充',
    }
  }
  return {
    ok: false,
    code: failure.code,
    msg: failure.message,
    fix: failure.hint ?? '请根据 message 调整调用方式或参数',
  }
}

/** 从 checks 中提取第一条 info 或 warn 级 check 的 message */
function firstInfoOrWarnSummary(checks: readonly ModuleKind.CheckEntry[] | undefined): string | undefined {
  return checks?.find((check) => check.level === 'info' || check.level === 'warn')?.message
}

/** 从 checks 中提取第一条 error 级 check */
function pickFirstErrorCheck(checks: readonly ModuleKind.CheckEntry[] | undefined): ModuleKind.CheckEntry | undefined {
  return checks?.find((check) => check.level === 'error')
}

/** 从失败的 FunctionCallResult 中提取 AiHostFunctionCallFailure */
function failureFromCallResult(result: AiHostFunctionCallResult<unknown>): AiHostFunctionCallFailure {
  if (result.ok) throw new Error('[AiHostToolLoopRunner] failureFromCallResult called with success result')
  return { ok: false, code: result.code, msg: result.msg, fix: result.fix }
}
