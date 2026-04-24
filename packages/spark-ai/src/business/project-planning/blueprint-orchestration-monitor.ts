import type { MonitorContext, SessionMonitor } from '../../core/session/session-contracts'
import {
  DATATABLE_CREATE_ACTION,
  DATATABLE_ADD_COLUMNS_ACTION,
  DATATABLE_UPDATE_COLUMN_ACTION,
  DATATABLE_REMOVE_COLUMN_ACTION,
  DATATABLE_SET_API_ACTION,
  DATATABLE_ADD_ROWS_ACTION,
  RELATION_ADD_ACTION,
  RELATION_REMOVE_ACTION,
  DATAVIEW_CREATE_ACTION,
  DATAVIEW_CONFIGURE_ACTION,
  DATAVIEW_SET_AGGREGATES_ACTION,
  DATAVIEW_SET_TREE_CONFIG_ACTION,
  DEPENDENCY_ADD_ACTION,
  DEPENDENCY_REMOVE_ACTION,
  BLUEPRINT_DESCRIBE_ACTION,
  BLUEPRINT_REVISE_ACTION,
  BLUEPRINT_SELF_CHECK_ACTION,
  BLUEPRINT_VALIDATE_COVERAGE_ACTION,
} from '../../core/stills/action-names'

const WRITE_ACTIONS = new Set([
  DATATABLE_CREATE_ACTION,
  DATATABLE_ADD_COLUMNS_ACTION,
  DATATABLE_UPDATE_COLUMN_ACTION,
  DATATABLE_REMOVE_COLUMN_ACTION,
  DATATABLE_SET_API_ACTION,
  DATATABLE_ADD_ROWS_ACTION,
  RELATION_ADD_ACTION,
  RELATION_REMOVE_ACTION,
  DATAVIEW_CREATE_ACTION,
  DATAVIEW_CONFIGURE_ACTION,
  DATAVIEW_SET_AGGREGATES_ACTION,
  DATAVIEW_SET_TREE_CONFIG_ACTION,
  DEPENDENCY_ADD_ACTION,
  DEPENDENCY_REMOVE_ACTION,
])

const REVIEW_ACTIONS = new Set([
  BLUEPRINT_DESCRIBE_ACTION,
  BLUEPRINT_REVISE_ACTION,
  BLUEPRINT_SELF_CHECK_ACTION,
  BLUEPRINT_VALIDATE_COVERAGE_ACTION,
])

export function createBlueprintOrchestrationMonitor(): SessionMonitor {
  let blueprintCreated = false
  let blueprintReviewed = false

  return {
    name: 'blueprint-orchestration',

    afterStillExecution(ctx: MonitorContext): string[] {
      const action = ctx.currentTurn.toolBlock?.action ?? ''

      if (action === 'blueprint.create' && ctx.result.ok) {
        blueprintCreated = true
        blueprintReviewed = false
      }

      if (REVIEW_ACTIONS.has(action) && ctx.result.ok) {
        blueprintReviewed = true
      }

      if (
        blueprintCreated
        && !blueprintReviewed
        && WRITE_ACTIONS.has(action)
        && ctx.result.ok
      ) {
        return [
          `[系统蓝图编排提醒]\n`
          + `动作 ${action} 已执行成功，但你在创建蓝图后尚未执行 blueprint.describe 或 blueprint.revise 来审查蓝图。\n`
          + `建议：在继续修改数据结构前，先调用 blueprint.describe 确认当前蓝图状态，确保执行计划与用户目标一致。`,
        ]
      }

      return []
    },
  }
}
