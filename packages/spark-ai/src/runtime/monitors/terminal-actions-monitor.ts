/**
 * Terminal Actions Monitor — 终局动作推动监控器
 *
 * 编排关注点：
 * 当蓝图所有 checkpoint 已 done，但循环中未见 dataset.validate / dataset.export，
 * 注入 followUp 推动 LLM 走向终局（验证 + 导出）。
 *
 * 不了解数据表是否"真的准备好了"——那是域 still 的 postValidate 职责。
 * 本监控器只看编排信号：蓝图完成 + 缺少终局动作 → 提醒。
 */

import type { MonitorContext, SessionMonitor } from '../session-orchestrator'

const TERMINAL_ACTIONS = new Set([
  'dataset.validate',
  'dataset.export',
])

export function createTerminalActionsMonitor(): SessionMonitor {
  let hasSeenTerminalAction = false
  let nudgeCount = 0
  const MAX_NUDGES = 2 // 最多提醒 2 次，避免死循环式唠叨

  return {
    name: 'terminal-actions',

    afterStillExecution(ctx: MonitorContext): string[] {
      const action = ctx.currentTurn.sapBlock?.action ?? ''

      // ── 记录是否已执行过终局动作 ──
      if (TERMINAL_ACTIONS.has(action) && ctx.result.ok) {
        hasSeenTerminalAction = true
      }

      // ── 蓝图全部完成，但未执行终局动作 → 推动 ──
      const blueprint = ctx.session.blueprint
      if (blueprint === null) return [] // 无蓝图，不推动

      const allDone = blueprint.checkpoints.every(cp => cp.status === 'done')
      if (!allDone) return [] // 蓝图未完成，不推动

      if (hasSeenTerminalAction) return [] // 已执行过终局动作
      if (nudgeCount >= MAX_NUDGES) return [] // 已提醒足够多次

      nudgeCount++
      return [
        `[系统终局提醒]\n` +
        `蓝图所有 checkpoint 已完成，但尚未执行 dataset.validate 和 dataset.export。\n` +
        `建议：先调用 dataset.validate 验证数据一致性，再调用 dataset.export 导出最终 pagedata.json。`,
      ]
    },
  }
}
