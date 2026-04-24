/**
 * Session Orchestrator — 会话级工具循环编排器
 *
 * 职责（纯编排，不含具体 domain 语义）：
 * 1. 从后端获取 LLM 回复 → 提取 toolCalls → 本地执行 still → 向后端追加结果
 * 2. 可插拔监控器（followUp 注入 + 终止判断）
 * 3. warnings → followUp 通用机制（still postValidate 的 warnings 自动注入对话）
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
 *         → dispatcher（still 执行）
 *           → 域 stills（领域实现 + postValidate）
 */

import type { IStillSession, StillResult } from '../stills/types'
import type {
  DialogueTurn,
  StillTurnResult,
  ToolCall,
  SessionBackend,
  MonitorContext,
  SessionMonitor,
  OrchestratorConfig,
  OrchestratorResult,
  FollowUpPolicy,
} from '../session/session-contracts'
import { dispatchToolCall } from '../fc-dispatcher'
import { generateToolDefinitions } from '../fc-schema'

// 后端 appendMessages 所用消息结构。
// 统一为 FC 场景下 assistant/tool 双角色消息体，便于后续复用与维护。
type BackendMessage = {
  role: string
  content: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════


function toTurnResult(result: StillResult): StillTurnResult {
  if (result.ok) {
    return { ok: true, data: result.data, summary: result.summary, warnings: result.warnings }
  }
  return { ok: false, code: result.code, msg: result.msg, fix: result.fix }
}

// ═══════════════════════════════════════════════════════════
// Helpers — FollowUp 构建
// 目标：把 still 执行结果、warnings、监控器建议统一折叠为 _followUp 指令
// ═══════════════════════════════════════════════════════════

/**
 * 针对单次 still 执行构建 followUp 指令列表。
 *
 * 组成来源：
 * 1) 执行失败即时纠错（code/fix）
 * 2) 后置校验 warnings
 * 3) 外部监控器附加指令
 */
function collectFollowUpInstructions(params: {
  action: string
  result: StillResult
  monitorCtx: MonitorContext
  monitors: SessionMonitor[]
  policyFollowUps: string[]
}): string[] {
  const { monitorCtx, monitors, policyFollowUps } = params
  const followUpInstructions: string[] = [...policyFollowUps]

  for (const monitor of monitors) {
    try {
      followUpInstructions.push(...monitor.afterStillExecution(monitorCtx))
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
// Core Loop — Function Calling
// ═══════════════════════════════════════════════════════════

/**
 * Stills 工具循环编排器（Function Calling 模式）。
 *
 * 每轮流程：
 * 1. 调后端 executeTurn → 获取 LLM 回复（含结构化 toolCalls）
 * 2. 逐个调度 toolCalls → 本地执行 still
 * 3. 构建 followUp（错误纠正 + warnings + 监控器）
 * 4. 向后端追加 assistant + tool result 消息
 * 5. 检查终止条件
 *
 * @param userPrompt  - 用户原始需求
 * @param session     - Stills 会话（本地状态）
 * @param backend     - 后端通信层（须实现 SessionBackend）
 * @param config      - 编排配置（含监控器）
 */
export async function runStillsLoop(
  userPrompt: string,
  session: IStillSession,
  backend: SessionBackend,
  config: OrchestratorConfig,
): Promise<OrchestratorResult> {
  // ─────────────────────────────────────────────────────────────────────────
  // 功能分区 A：会话与循环基础初始化
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
      '请通过 createOrchestratorConfig() 或其预设工厂获取完整配置。'
    )
  }
  const followUpPolicy: FollowUpPolicy = config.followUpPolicy

  try {
    // ───────────────────────────────────────────────────────────────────────
    // 功能分区 B：主循环（每次循环对应一次 LLM turn）
    // ───────────────────────────────────────────────────────────────────────
    while (round < config.maxRounds) {
      round++
      config.onRoundStart?.(round)
      const roundStart = Date.now()

      // ── Step 1: 后端 executeTurn → LLM 回复 ──
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

      // ── Step 2: 无 toolCalls → 纯文本回复（终态或需要用户输入） ──
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

      // ── Step 3: 逐个调度 toolCalls ──
      const messages: BackendMessage[] = []

      // 先追加 assistant 消息（含 tool_calls）
      messages.push({
        role: 'assistant',
        content: aiReply || '',
        tool_calls: toolCalls,
      })

      let lastResult: StillResult | undefined
      let lastParams: unknown

      // ─────────────────────────────────────────────────────────────────────
      // 功能分区 C：单轮内 toolCalls 顺序执行
      // 说明：
      // - 当前保持串行执行，确保前一 tool 结果可影响后一 tool 决策；
      // - 每个 tool 执行后都会即时记录 turn、注入 followUp、检查中止条件。
      // ─────────────────────────────────────────────────────────────────────
      for (const tc of toolCalls) {
        const dispatched = dispatch(tc, session)
        const { action, result, toolResult } = dispatched

        lastResult = result
        try { lastParams = JSON.parse(tc.function.arguments) } catch { lastParams = {} }

        // 记录每个 tool call 的执行轮次
        const turn: DialogueTurn = {
          round,
          timestamp: new Date().toISOString(),
          phase: 'stills-execute',
          aiText: aiReply || undefined,
          aiReasoning: reasoning ?? undefined,
          toolBlock: { action, id: tc.id, params: lastParams },
          stillsResult: toTurnResult(result),
          elapsed: Date.now() - roundStart,
        }
        turns.push(turn)
        config.onTurnComplete?.(turn)

        // 添加 tool result 消息。
        // 这里允许对原始 result JSON 做 _followUp 注入，不改变 still 执行结果语义。
        let resultContent = toolResult.content

        const monitorCtx: MonitorContext = {
          session,
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

      // ── Step 4: 向后端追加消息（assistant + tool results） ──
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
