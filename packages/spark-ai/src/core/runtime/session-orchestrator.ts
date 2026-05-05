/**
 * Session Orchestrator — 会话级函数循环编排器
 *
 * 职责（纯编排，不含具体业务状态语义）：
 * 1. 从后端获取 LLM 回复 → 提取 toolCalls → 本地执行函数 → 向后端追加结果
 * 2. 可插拔监控器（followUp 注入 + 终止判断）
 * 3. warnings → followUp 通用机制（函数 postValidate 的 warnings 自动注入对话）
 * 4. 终止条件检测（由 monitor 协议统一定义）
 *
 * 通信层由后端负责（按用户管理会话）：
 * - 对话历史存储（按 userId + sessionId 隔离）
 * - 滑动窗口裁剪
 * - system prompt 注入
 * - LLM 调用（Function Calling 模式，传递 tool definitions）
 *
 * 分层：
 *   Backend（会话存储 + 滑动窗口 + LLM 调用）
 *     → Orchestrator（本模块，循环 + 终止 + followUp 注入）
 *       → fc-schema/fc-dispatcher（FC schema 生成 + 调度 + 响应格式化）
 *         → function-dispatcher（函数执行）
 */

import type { FunctionResult, FunctionRuntimeContext } from '../protocol/function-contracts'
import type {
  DialogueTurn,
  FunctionTurnResult,
  ToolCall,
  SessionBackend,
  MonitorContext,
  SessionMonitor,
  OrchestratorConfig,
  OrchestratorResult,
  FollowUpPolicy,
} from '../protocol/session-contracts'
import { dispatchToolCall } from './fc-dispatcher'
import { generateToolDefinitions } from '../protocol/fc-schema'

// 后端 appendMessages 所用消息结构。
// 统一为 FC 场景下 assistant/tool 双角色消息体，便于后续复用与维护。
type BackendMessage = {
  role: string
  content: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

// ═══════════════════════════════════════════════════════════
// 【功能分区 1】辅助函数定义
// ═══════════════════════════════════════════════════════════

/**
 * 将函数执行结果转换为轮次结果格式
 */
function toTurnResult(result: FunctionResult): FunctionTurnResult {
  if (result.ok) {
    return { ok: true, data: result.data, summary: result.summary, warnings: result.warnings }
  }
  return { ok: false, code: result.code, msg: result.msg, fix: result.fix }
}

// ═══════════════════════════════════════════════════════════
// 【功能分区 2】FollowUp 指令构建
// 目标：把函数执行结果、warnings、监控器建议统一折叠为 _followUp 指令
// ═══════════════════════════════════════════════════════════

/**
 * 针对单次函数执行构建 followUp 指令列表。
 *
 * 组成来源：
 * 1) 执行失败即时纠错（code/fix）
 * 2) 后置校验 warnings
 * 3) 外部监控器附加指令
 */
function collectFollowUpInstructions(params: {
  action: string
  result: FunctionResult
  monitorCtx: MonitorContext
  monitors: SessionMonitor[]
  policyFollowUps: string[]
}): string[] {
  const { monitorCtx, monitors, policyFollowUps } = params
  const followUpInstructions: string[] = [...policyFollowUps]

  for (const monitor of monitors) {
    try {
      followUpInstructions.push(...monitor.afterFunctionExecution(monitorCtx))
    } catch { /* monitor failure must not break the loop */ }
  }

  return followUpInstructions
}

/**
 * 将 followUp 指令注入到 tool result JSON 中。
 *
 * 约定：
 * - 注入字段名固定为 _followUp；
 * - 仅在存在指令时注入，避免污染常规成功结果。
 */
function injectFollowUpIntoToolResult(content: string, followUpInstructions: string[]): string {
  if (followUpInstructions.length === 0) return content
  const original = JSON.parse(content) as Record<string, unknown>
  original['_followUp'] = followUpInstructions
  return JSON.stringify(original)
}

/**
 * 统一检查监控器终止条件。
 *
 * 返回值语义：
 * - abort=true  表示本轮应立即中止；
 * - reason      优先使用监控器返回 reason，否则回落为监控器名称。
 */
function checkAbortByMonitors(monitors: SessionMonitor[], monitorCtx: MonitorContext): {
  abort: boolean
  reason?: string
  outcome?: 'completed' | 'aborted'
} {
  for (const monitor of monitors) {
    if (monitor.shouldAbort === undefined) continue
    try {
      const abortResult = monitor.shouldAbort(monitorCtx)
      if (abortResult.abort) {
        return {
          abort: true,
          reason: abortResult.reason ?? monitor.name,
          outcome: abortResult.outcome ?? 'aborted',
        }
      }
    } catch { /* monitor failure must not break the loop */ }
  }
  return { abort: false }
}

// ═══════════════════════════════════════════════════════════
// 【功能分区 3】主循环实现 - 函数调用模式
// 时序：初始化 → 主循环 → 单轮内toolCalls顺序执行 → 清理资源
// ═══════════════════════════════════════════════════════════

/**
 * 函数循环编排器（Function Calling 模式）。
 *
 * 每轮流程：
 * 1. 调后端 executeTurn → 获取 LLM 回复（含结构化 toolCalls）
 * 2. 逐个调度 toolCalls → 本地执行函数
 * 3. 构建 followUp（错误纠正 + warnings + 监控器）
 * 4. 向后端追加 assistant + tool result 消息
 * 5. 检查终止条件
 *
 * @param userPrompt  - 用户原始需求
 * @param context     - 函数运行时上下文（仅执行轨迹，不含业务状态）
 * @param backend     - 后端通信层（须实现 SessionBackend）
 * @param config      - 编排配置（含监控器）
 */
export async function runFunctionLoop(
  userPrompt: string,
  context: FunctionRuntimeContext,
  backend: SessionBackend,
  config: OrchestratorConfig,
): Promise<OrchestratorResult> {
  // ─────────────────────────────────────────────────────────────────────────
  // 初始化阶段：会话与循环基础设置
  // ─────────────────────────────────────────────────────────────────────────

  // ── 生成 tool definitions ──
  const tools = config.tools ?? generateToolDefinitions()

  // ── 创建后端会话（附带 tools） ──
  const sessionId = config.resumeSessionId
    ?? await backend.createSession(config.systemPrompt, userPrompt, config.slidingWindow, tools, config.signal)

  // 续用会话时，把当前用户输入补充到既有会话，保留连续上下文。
  if (config.resumeSessionId) {
    await backend.appendMessages(sessionId, [{ role: 'user', content: userPrompt }], config.signal)
  }

  const turns: DialogueTurn[] = []
  const dispatch = config.dispatchFc ?? dispatchToolCall
  let round = 0
  let completed = false
  let aborted = false
  let abortReason = ''
  const monitors = config.monitors ?? []
  
  // followUpPolicy 必须由调用方注入（外层装配职责）。
  // 核心层不提供默认实现 — fail-fast 原则。
  if (config.followUpPolicy === undefined) {
    throw new Error(
      '[spark-ai] OrchestratorConfig.followUpPolicy 必须提供。' +
      '请由业务层装配明确的 FollowUpPolicy 后再启动函数循环。'
    )
  }
  const followUpPolicy: FollowUpPolicy = config.followUpPolicy

  try {
    // ───────────────────────────────────────────────────────────────────────
    // 主循环阶段：每轮对应一次 LLM turn
    // ───────────────────────────────────────────────────────────────────────
    while (round < config.maxRounds) {
      round++
      config.onRoundStart?.(round)
      const roundStart = Date.now()

      // ── 步骤 1: 后端 executeTurn → LLM 回复 ──
      const llmResponse = await backend.executeTurn(sessionId, {
        ...(config.signal ? { signal: config.signal } : {}),
        ...(config.onSseEvent ? { onSseEvent: config.onSseEvent } : {}),
      })
      if (llmResponse === null) {
        aborted = true
        abortReason = 'LLM 调用失败或会话不存在'
        break
      }

      const { text: aiReply, reasoning, toolCalls } = llmResponse

      // ── 步骤 2: 无 toolCalls → 纯文本回复（终态或需要用户输入） ──
      if (!toolCalls || toolCalls.length === 0) {
        const turn: DialogueTurn = {
          round,
          timestamp: new Date().toISOString(),
          phase: 'ai-response',
          aiText: aiReply,
          aiReasoning: reasoning ?? undefined,
          elapsed: Date.now() - roundStart,
        }
        turns.push(turn)
        config.onTurnComplete?.(turn)
        // FC 模式下纯文本回复通常是对话结束或等用户输入，不需要提醒
        break
      }

      // ── 步骤 3: 逐个调度 toolCalls ──
      const messages: BackendMessage[] = []

      // 先追加 assistant 消息（含 tool_calls）
      messages.push({
        role: 'assistant',
        content: aiReply || '',
        tool_calls: toolCalls,
      })

      let lastResult: FunctionResult | undefined
      let lastParams: unknown

      // ─────────────────────────────────────────────────────────────────────
      // 单轮内执行阶段：toolCalls 顺序执行
      // 说明：
      // - 当前保持串行执行，确保前一 tool 结果可影响后一 tool 决策；
      // - 每个 tool 执行后都会即时记录 turn、注入 followUp、检查中止条件。
      // ─────────────────────────────────────────────────────────────────────
      for (const tc of toolCalls) {
        const dispatched = dispatch(tc, context)
        const { action, result, toolResult } = dispatched

        lastResult = result
        // fail-fast：tool 参数 JSON 解析失败 = LLM 协议层错误，必须暴露给上层处理。
        // 旧实现 catch 后回填空对象会让畸形参数继续流入下游 monitors / followUp 计算，掩盖根因。
        try {
          lastParams = JSON.parse(tc.function.arguments)
        } catch (err) {
          throw new Error(
            `tool arguments JSON 解析失败 (action=${dispatched.action}, toolCallId=${tc.id}): ${(err as Error).message}`,
          )
        }

        // 记录每个 tool call 的执行轮次
        const turn: DialogueTurn = {
          round,
          timestamp: new Date().toISOString(),
          phase: 'function-execute',
          aiText: aiReply || undefined,
          aiReasoning: reasoning ?? undefined,
          toolBlock: { action, id: tc.id, params: lastParams },
          functionResult: toTurnResult(result),
          elapsed: Date.now() - roundStart,
        }
        turns.push(turn)
        config.onTurnComplete?.(turn)

        // 添加 tool result 消息。
        // 这里允许对原始 result JSON 做 _followUp 注入，不改变函数执行结果语义。
        let resultContent = toolResult.content

        const monitorCtx: MonitorContext = {
          context,
          currentTurn: turn,
          allTurns: turns,
          round,
          params: lastParams,
          result,
        }

        const followUpInstructions = collectFollowUpInstructions({
          action,
          result,
          monitorCtx,
          monitors,
          policyFollowUps: followUpPolicy.buildFollowUps({
            action,
            result,
            monitorCtx,
          }),
        })
        resultContent = injectFollowUpIntoToolResult(resultContent, followUpInstructions)

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: resultContent,
        })

        // 检查监控器终止（每个 tool 执行后即时检查）。
        const monitorAbort = checkAbortByMonitors(monitors, monitorCtx)
        if (monitorAbort.abort) {
          if (monitorAbort.outcome === 'completed') {
            completed = true
          } else {
            aborted = true
            abortReason = monitorAbort.reason ?? ''
          }
        }
        if (aborted || completed) break

      }

      if (aborted || completed) break

      // ── 步骤 4: 向后端追加消息（assistant + tool results） ──
      await backend.appendMessages(sessionId, messages, config.signal)

      if (lastResult) {
        const lastTurn = turns[turns.length - 1]
        if (lastTurn) config.onRoundComplete?.(lastTurn)
      }

    }
  } finally {
    // 会话由调用者决定何时 destroy
  }

  return {
    turns,
    rounds: round,
    aborted,
    abortReason: abortReason || undefined,
    completed,
    sessionId,
  }
}