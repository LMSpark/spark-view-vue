import type { MonitorContext, SessionMonitor } from '../../core/session/session-contracts'
import { DATASET_EXPORT_ACTION } from '../../core/stills/action-names'
import { hasPendingBlueprintCheckpoints } from './blueprint-state-reader'

export function createExportCompletionMonitor(): SessionMonitor {
  let exportSeen = false

  return {
    name: 'export-completion',

    afterStillExecution(ctx: MonitorContext): string[] {
      const action = ctx.currentTurn.toolBlock?.action
      if (ctx.result.ok && action === DATASET_EXPORT_ACTION) {
        exportSeen = true
      }
      return []
    },

    shouldAbort(ctx: MonitorContext): { abort: boolean; reason?: string; outcome?: 'completed' | 'aborted' } {
      if (!exportSeen) {
        return { abort: false }
      }

      if (hasPendingBlueprintCheckpoints(ctx.session)) {
        return { abort: false }
      }

      return {
        abort: true,
        reason: 'export completed and blueprint finished',
        outcome: 'completed',
      }
    },
  }
}
