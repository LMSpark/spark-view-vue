import type { MonitorContext, SessionMonitor } from '../../core/session/session-contracts'
import { DATASET_VALIDATE_ACTION, DATASET_EXPORT_ACTION } from '../../core/stills/action-names'
import { hasCompletedBlueprintCheckpoints } from './blueprint-state-reader'

const TERMINAL_ACTIONS = new Set([
  DATASET_VALIDATE_ACTION,
  DATASET_EXPORT_ACTION,
])

export function createTerminalActionsMonitor(): SessionMonitor {
  let hasSeenTerminalAction = false
  let nudgeCount = 0
  const MAX_NUDGES = 2

  return {
    name: 'terminal-actions',

    afterStillExecution(ctx: MonitorContext): string[] {
      const action = ctx.currentTurn.toolBlock?.action ?? ''

      if (TERMINAL_ACTIONS.has(action) && ctx.result.ok) {
        hasSeenTerminalAction = true
      }

      if (!hasCompletedBlueprintCheckpoints(ctx.session)) return []

      if (hasSeenTerminalAction) return []
      if (nudgeCount >= MAX_NUDGES) return []

      nudgeCount++
      return [
        `[系统终局提醒]\n`
        + `蓝图所有 checkpoint 已完成，但尚未执行 dataset.validate 和 dataset.export。\n`
        + `建议：先调用 dataset.validate 验证数据一致性，再调用 dataset.export 导出最终 pagedata.json。`,
      ]
    },
  }
}
