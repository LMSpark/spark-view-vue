import type { MonitorContext, SessionMonitor } from '../../session-contracts'
import { DATASET_EXPORT_ACTION } from '../../stills/action-names'
import { readSessionBlueprint } from '../../stills/types'

export function createExportCompletionMonitor(): SessionMonitor {
  let exportCompleted = false

  return {
    name: 'export-completion',

    afterStillExecution(ctx: MonitorContext): string[] {
      const action = ctx.currentTurn.toolBlock?.action
      if (ctx.result.ok && action === DATASET_EXPORT_ACTION) {
        exportCompleted = true
      }
      return []
    },

    shouldAbort(ctx: MonitorContext): { abort: boolean; reason?: string } {
      if (!exportCompleted) {
        return { abort: false }
      }

      const blueprint = readSessionBlueprint(ctx.session)
      const hasPending = blueprint?.checkpoints.some(checkpoint => checkpoint.status !== 'done') ?? false
      if (hasPending) {
        return { abort: false }
      }

      return {
        abort: true,
        reason: 'export completed and blueprint finished',
      }
    },
  }
}
