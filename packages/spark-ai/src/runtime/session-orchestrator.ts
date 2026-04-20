/**
 * Session Orchestrator — 会话级工具循环编排器
 *
 * 职责（纯编排，不含业务域知识）：
 * 1. 从后端获取 LLM 回复 → 提取 toolCalls → 本地执行 still → 向后端追加结果
 * 2. 可插拔监控器（followUp 注入 + 终止判断）
 * 3. warnings → followUp 通用机制（still postValidate 的 warnings 自动注入对话）
 * 4. 终止条件检测（export 完成 + 蓝图完成）
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
 *       → tool-calling（FC 调度 + 响应格式化）
 *         → dispatcher（still 执行）
 *           → 域 stills（业务逻辑 + postValidate）
 */

import type { IStillSession, StillResult, PostValidationWarning, ExecutionBlueprint } from '../stills/types'
import { readSessionBlueprint } from '../stills/types'
import { DATASET_EXPORT_ACTION } from '../stills/action-names'
import type { ToolCall, FcDispatchResult, ToolDefinition } from '../tool-calling'
import { dispatchToolCall, generateToolDefinitions } from '../tool-calling'

// ═══════════════════════════════════════════════════════════
// Types — 对话轮次
// ═══════════════════════════════════════════════════════════

/** 单轮对话的结构化记录 */
export interface DialogueTurn {
  round: number
  timestamp: string
  phase: 'ai-response' | 'stills-execute'
  aiText?: string | undefined
  aiReasoning?: string | undefined
  toolBlock?: {
    action: string
    id: string
    params: unknown
  } | undefined
  stillsResult?: StillTurnResult | undefined
  elapsed?: number | undefined
}

/** still 执行结果的平坦记录（非判别联合，纯 DTO） */
export interface StillTurnResult {
  ok: boolean
  data?: unknown
  code?: string | undefined
  msg?: string | undefined
  fix?: string | undefined
  summary?: string | undefined
  warnings?: PostValidationWarning[] | undefined
}

// ═══════════════════════════════════════════════════════════
// Types — 后端通信层
// ═══════════════════════════════════════════════════════════

/** 后端 LLM 回复 */
export interface LlmResponse {
  text: string
  reasoning?: string
  /** Function Calling 模式：LLM 返回的工具调用（与 text 互斥或共存） */
  toolCalls?: ToolCall[]
}

/**
 * 后端会话客户端接口（依赖反转：编排器不知道后端在哪）。
 *
 * 实现者负责 HTTP 调用后端 Stills 会话端点。
 * 编排器只依赖此抽象。
 *
 * ⚠️ 实现者须在本地维护 sessionId 集合：
 * - createSession 成功后追加 sessionId
 * - destroySession 成功后移除 sessionId
 * - 切换用户时调用 destroyAllSessions()，将本地集合发给后端批量销毁
 */
export interface SessionBackend {
  /** 创建会话（附带 tool definitions），返回 sessionId */
  createSession(systemPrompt: string, userPrompt: string, windowSize: number, tools?: ToolDefinition[]): Promise<string>
  /** 调用 LLM 获取下一轮回复（后端自动管理对话历史 + 滑动窗口） */
  executeTurn(sessionId: string): Promise<LlmResponse | null>
  /** 向会话追加消息（assistant + tool results） */
  appendMessages(sessionId: string, messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: ToolCall[] }>): Promise<void>
  /** 获取完整对话记录（供 self-check 等后处理使用） */
  getConversation(sessionId: string): Promise<Array<{ role: string; content: string }>>
  /** 销毁单个会话 */
  destroySession(sessionId: string): Promise<void>
  /** 销毁当前客户端创建的所有会话（切换用户时调用） */
  destroyAllSessions(): Promise<void>
}

// ═══════════════════════════════════════════════════════════
// Types — 监控器
// ═══════════════════════════════════════════════════════════

/** 监控器上下文（每轮 still 执行后传递给监控器） */
export interface MonitorContext {
  session: IStillSession
  currentTurn: DialogueTurn
  allTurns: DialogueTurn[]
  round: number
  params: unknown
  result: StillResult
}

/**
 * 可插拔监控器接口
 *
 * 编排器只依赖此抽象，不依赖具体监控器实现（D 原则）。
 * 新增监控器无需修改编排器（O 原则）。
 * 每个监控器只关心一个编排关注点（S 原则）。
 */
export interface SessionMonitor {
  name: string
  /** 每轮 still 执行后调用，返回需注入对话的 followUp 指令 */
  afterStillExecution(ctx: MonitorContext): string[]
  /** 是否应终止循环（可选） */
  shouldAbort?(ctx: MonitorContext): { abort: boolean; reason?: string }
}

// ═══════════════════════════════════════════════════════════
// Types — 编排器配置与结果
// ═══════════════════════════════════════════════════════════

export interface OrchestratorConfig {
  maxRounds: number
  /** 滑动窗口大小（传给后端 createSession） */
  slidingWindow: number
  systemPrompt: string
  /** 可选：续用后端既有 sessionId，启用多轮连续会话 */
  resumeSessionId?: string
  /** 可选：显式指定本轮允许暴露给 LLM 的 tools；省略时导出全部已注册 stills。 */
  tools?: ToolDefinition[]
  monitors?: SessionMonitor[]
  onRoundStart?: (round: number) => void
  onTurnComplete?: (turn: DialogueTurn) => void
  onRoundComplete?: (turn: DialogueTurn) => void
  /** 覆盖工具分发函数（测试用，默认 dispatchToolCall） */
  dispatchFc?: (toolCall: ToolCall, session: IStillSession) => FcDispatchResult
}

export interface OrchestratorResult {
  turns: DialogueTurn[]
  rounds: number
  aborted: boolean
  abortReason?: string | undefined
  exportCompleted: boolean
  sessionId: string
}

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

/** 蓝图是否有未完成的 checkpoint */
function hasPendingBlueprintWork(blueprint: ExecutionBlueprint | null): boolean {
  if (blueprint === null) return false
  return blueprint.checkpoints.some(cp => cp.status !== 'done')
}

/**
 * 将 postValidate 产出的 warnings 格式化为 followUp 指令。
 *
 * 这是 warnings→followUp 通用机制的核心：
 * still 层产出 warnings（域知识），编排层将其泛化为对话指令（编排关注点）。
 * 编排器不理解 warning 内容——只做格式化转发。
 */
export function formatWarningsAsFollowUp(action: string, warnings: PostValidationWarning[]): string {
  const lines = warnings.map(w => {
    const fix = w.fix ? `\n  建议: ${w.fix}` : ''
    return `- [${w.rule}] ${w.detail}${fix}`
  })
  return `[系统后置校验警告]\n动作 ${action} 执行成功，但存在以下一致性问题：\n${lines.join('\n')}\n请在下一轮优先修复这些问题。`
}

function buildErrorFollowUp(action: string, code: string, fix: string): string {
  return `[系统即时纠错]\n动作 ${action} 执行失败（${code}）。\n修复建议: ${fix}\n请在下一轮按修复建议直接改正，不要重复原错误指令。`
}

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
}): string[] {
  const { action, result, monitorCtx, monitors } = params
  const followUpInstructions: string[] = []

  if (!result.ok) {
    followUpInstructions.push(buildErrorFollowUp(action, result.code, result.fix))
  }

  if (result.ok && result.warnings !== undefined && result.warnings.length > 0) {
    followUpInstructions.push(formatWarningsAsFollowUp(action, result.warnings))
  }

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
} {
  for (const monitor of monitors) {
    if (monitor.shouldAbort === undefined) continue
    try {
      const abortResult = monitor.shouldAbort(monitorCtx)
      if (abortResult.abort) {
        return {
          abort: true,
          reason: abortResult.reason ?? monitor.name,
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
    ?? await backend.createSession(config.systemPrompt, userPrompt, config.slidingWindow, tools)

  // 续用会话时，把当前用户输入补充到既有会话，保留连续上下文。
  if (config.resumeSessionId) {
    await backend.appendMessages(sessionId, [{ role: 'user', content: userPrompt }])
  }

  const turns: DialogueTurn[] = []
  const dispatch = config.dispatchFc ?? dispatchToolCall
  let round = 0
  let exportCompleted = false
  let aborted = false
  let abortReason = ''
  const monitors = config.monitors ?? []

  try {
    // ───────────────────────────────────────────────────────────────────────
    // 功能分区 B：主循环（每次循环对应一次 LLM turn）
    // ───────────────────────────────────────────────────────────────────────
    while (round < config.maxRounds) {
      round++
      config.onRoundStart?.(round)
      const roundStart = Date.now()

      // ── Step 1: 后端 executeTurn → LLM 回复 ──
      const llmResponse = await backend.executeTurn(sessionId)
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
          aborted = true
          abortReason = monitorAbort.reason ?? ''
        }
        if (aborted) break

        // 检查 export 完成
        if (result.ok && action === DATASET_EXPORT_ACTION) {
          exportCompleted = true
        }
      }

      if (aborted) break

      // ── Step 4: 向后端追加消息（assistant + tool results） ──
      await backend.appendMessages(sessionId, messages)

      if (lastResult) {
        const lastTurn = turns[turns.length - 1]
        if (lastTurn) config.onRoundComplete?.(lastTurn)
      }

      // ── Step 5: 终止条件 ──
      // 终止判定为“export 完成 + 蓝图无待办 checkpoint”，避免提前停在半完成状态。
      if (exportCompleted && !hasPendingBlueprintWork(readSessionBlueprint(session))) {
        break
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
    exportCompleted,
    sessionId,
  }
}
