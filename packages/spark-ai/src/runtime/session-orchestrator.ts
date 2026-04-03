/**
 * Session Orchestrator — 会话级工具循环编排器
 *
 * 职责（纯编排，不含业务域知识）：
 * 1. 从后端获取 LLM 回复 → 提取协议块 → 本地执行 still → 向后端追加结果
 * 2. 可插拔监控器（followUp 注入 + 终止判断）
 * 3. warnings → followUp 通用机制（still postValidate 的 warnings 自动注入对话）
 * 4. 终止条件检测（export 完成 + 蓝图完成）
 *
 * 前后端只传两种东西：
 * - LLM 自然语言回复（后端 → 前端：/stills/turn）
 * - 协议块执行结果（前端 → 后端：/stills/append）
 *
 * 通信层由后端负责（按用户管理会话）：
 * - 对话历史存储（按 userId + sessionId 隔离）
 * - 滑动窗口裁剪
 * - system prompt 注入
 * - LLM 调用
 *
 * 不做的事：
 * - 不持有对话历史（后端负责）
 * - 不了解具体业务域（表名、列名、视图名）
 * - 不重复 still 层已有的 postValidate 校验
 * - 不硬编码场景特有的 followUp 逻辑
 *
 * 分层：
 *   Backend（会话存储 + 滑动窗口 + LLM 调用）
 *     → Orchestrator（本模块，循环 + 终止 + followUp 注入）
 *       → sap-runtime（单块分发 + 响应格式化）
 *         → dispatcher（still 执行）
 *           → 域 stills（业务逻辑 + postValidate）
 */

import type { IStillSession, StillResult, PostValidationWarning } from '../stills/types'
import type { ToolProtocolBlock } from '../protocol'
import type { SapDispatchResult } from '../sap-runtime'
import { extractToolBlocks, stripToolBlocks, parseToolPayload } from '../protocol'
import { dispatchBlock } from '../sap-runtime'

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
  sapBlock?: {
    type: string
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
}

/**
 * 后端会话客户端接口（依赖反转：编排器不知道后端在哪）。
 *
 * 实现者负责 HTTP 调用 /api/sap/stills/* 端点。
 * 编排器只依赖此抽象。
 *
 * ⚠️ 实现者须在本地维护 sessionId 集合：
 * - createSession 成功后追加 sessionId
 * - destroySession 成功后移除 sessionId
 * - 切换用户时调用 destroyAllSessions()，将本地集合发给后端批量销毁
 *   （POST /api/sap/stills/destroy-batch { sessionIds: [...] }）
 */
export interface SessionBackend {
  /** 创建会话，返回 sessionId */
  createSession(systemPrompt: string, userPrompt: string, windowSize: number): Promise<string>
  /** 调用 LLM 获取下一轮回复（后端自动管理对话历史 + 滑动窗口） */
  executeTurn(sessionId: string): Promise<LlmResponse | null>
  /** 向会话追加消息（assistant 原文 + user 工具结果） */
  appendMessages(sessionId: string, messages: Array<{ role: string; content: string }>): Promise<void>
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
  monitors?: SessionMonitor[]
  onRoundStart?: (round: number) => void
  onRoundComplete?: (turn: DialogueTurn) => void
  /** 覆盖块分发函数（测试用，默认 dispatchBlock） */
  dispatch?: (block: ToolProtocolBlock, session: IStillSession) => SapDispatchResult
}

export interface OrchestratorResult {
  turns: DialogueTurn[]
  rounds: number
  aborted: boolean
  abortReason?: string | undefined
  exportCompleted: boolean
  sessionId: string
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

/** 蓝图是否有未完成的 checkpoint */
function hasPendingBlueprintWork(blueprint: IStillSession['blueprint']): boolean {
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

function buildNoBlockReminder(round: number): string {
  return `[系统协议提醒]\n你必须只输出一个 SAP 协议块（@@describe 或 @@request），不要输出自然语言。可直接按以下模板重试：\n@@describe:session.describe#retry-${round}\n{}\n@@end\n或\n@@describe:stills.capabilities#retry-${round}-capabilities\n{}\n@@end`
}

function buildMultiBlockError(round: number): string {
  return `[系统协议错误]\n一次只允许输出 1 个 SAP 协议块。请只输出一个块，并可直接按以下模板重试：\n@@describe:session.describe#retry-${round}\n{}\n@@end`
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
// Core Loop
// ═══════════════════════════════════════════════════════════

/**
 * Stills 工具循环编排器。
 *
 * 每轮流程：
 * 1. 调后端 executeTurn → 获取 LLM 回复（后端自动管理历史 + 窗口 + LLM 调用）
 * 2. 本地提取协议块
 * 3. 本地执行 still
 * 4. 构建 followUp（错误纠正 + warnings + 监控器）
 * 5. 调后端 appendMessages → 追加 assistant 原文 + user 工具结果
 * 6. 检查终止条件
 *
 * @param userPrompt  - 用户原始需求
 * @param session     - Stills 会话（本地状态）
 * @param backend     - 后端通信层（依赖反转）
 * @param config      - 编排配置（含监控器）
 */
export async function runStillsLoop(
  userPrompt: string,
  session: IStillSession,
  backend: SessionBackend,
  config: OrchestratorConfig,
): Promise<OrchestratorResult> {
  // ── 创建后端会话（对话历史 + 窗口 + LLM 均在后端） ──
  const sessionId = await backend.createSession(
    config.systemPrompt, userPrompt, config.slidingWindow,
  )

  const turns: DialogueTurn[] = []
  const dispatch = config.dispatch ?? dispatchBlock
  let round = 0
  let exportCompleted = false
  let aborted = false
  let abortReason = ''

  try {
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

      const { text: aiReply, reasoning } = llmResponse

      // ── Step 2: 提取协议块（仅 request/describe） ──
      const blocks = extractToolBlocks(aiReply, { types: ['request', 'describe'] })

      // 2a. 无协议块 → 提醒（追加 assistant + user 提醒到后端）
      if (blocks.length === 0) {
        await backend.appendMessages(sessionId, [
          { role: 'user', content: buildNoBlockReminder(round) },
        ])
        turns.push({
          round,
          timestamp: new Date().toISOString(),
          phase: 'ai-response',
          aiText: aiReply,
          aiReasoning: reasoning ?? undefined,
          elapsed: Date.now() - roundStart,
        })
        continue
      }

      // 2b. 多个协议块 → 协议错误
      if (blocks.length > 1) {
        await backend.appendMessages(sessionId, [
          { role: 'user', content: buildMultiBlockError(round) },
        ])
        turns.push({
          round,
          timestamp: new Date().toISOString(),
          phase: 'ai-response',
          aiText: aiReply,
          aiReasoning: reasoning ?? undefined,
          elapsed: Date.now() - roundStart,
        })
        continue
      }

      // ── Step 3: 本地单块分发 ──
      const block = blocks[0]
      if (block === undefined) continue
      const params = parseToolPayload<Record<string, unknown>>(block) ?? {}
      const dispatched = dispatch(block, session)
      const { result, responseText } = dispatched

      // ── Step 4: 记录对话轮次 ──
      const turn: DialogueTurn = {
        round,
        timestamp: new Date().toISOString(),
        phase: 'stills-execute',
        aiText: stripToolBlocks(aiReply) || undefined,
        aiReasoning: reasoning ?? undefined,
        sapBlock: { type: block.type, action: block.action, id: block.id, params },
        stillsResult: toTurnResult(result),
        elapsed: Date.now() - roundStart,
      }
      turns.push(turn)

      // ── Step 5: 收集 followUp 指令 ──
      const followUpInstructions: string[] = []

      // 5a. 失败 → 通用纠错 followUp
      if (!result.ok) {
        followUpInstructions.push(buildErrorFollowUp(block.action, result.code, result.fix))
      }

      // 5b. 成功但有 warnings → 通用 warnings→followUp
      if (result.ok && result.warnings !== undefined && result.warnings.length > 0) {
        followUpInstructions.push(formatWarningsAsFollowUp(block.action, result.warnings))
      }

      // 5c. 监控器 afterStillExecution
      const monitorCtx: MonitorContext = {
        session,
        currentTurn: turn,
        allTurns: turns,
        round,
        params,
        result,
      }
      for (const monitor of config.monitors ?? []) {
        followUpInstructions.push(...monitor.afterStillExecution(monitorCtx))
      }

      // ── Step 6: 检查监控器是否要求终止 ──
      for (const monitor of config.monitors ?? []) {
        if (monitor.shouldAbort !== undefined) {
          const abortResult = monitor.shouldAbort(monitorCtx)
          if (abortResult.abort) {
            aborted = true
            abortReason = abortResult.reason ?? monitor.name
            break
          }
        }
      }

      if (aborted) break

      // ── Step 7: 检查 export 完成 ──
      if (result.ok && block.action === 'dataset.export') {
        exportCompleted = true
      }

      // ── Step 8: 向后端追加消息（工具结果 + followUp） ──
      const followUpText = followUpInstructions.length > 0
        ? `\n\n${followUpInstructions.join('\n\n')}`
        : ''
      await backend.appendMessages(sessionId, [
        { role: 'user', content: `[系统工具执行结果]\n${responseText}${followUpText}` },
      ])

      config.onRoundComplete?.(turn)

      // ── Step 9: 终止条件 ──
      if (exportCompleted && !hasPendingBlueprintWork(session.blueprint)) {
        break
      }
    }
  } finally {
    // 会话由调用者决定何时 destroy（可能需要 getConversation 做 self-check）
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
