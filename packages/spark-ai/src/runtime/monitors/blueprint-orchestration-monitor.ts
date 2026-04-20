/**
 * Blueprint Orchestration Monitor — 蓝图编排监控器
 *
 * 编排关注点：
 * 当蓝图已创建后，LLM 若直接执行数据写入动作而未先 describe/revise 蓝图，
 * 注入 followUp 提醒"先看蓝图再动手"。
 *
 * 这是编排层的"节奏守卫"——确保 LLM 不跳过蓝图审查直接改数据。
 * 不关心蓝图内容或数据表结构（域知识由 still 层负责）。
 */

import type { MonitorContext, SessionMonitor } from '../session-orchestrator'
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
} from '../../stills/action-names'

/** 需要蓝图审查后才能执行的写入动作集合 */
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

/** 蓝图审查动作：执行过任意一个即表示 LLM 已审查蓝图 */
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

      // ── 追踪蓝图生命周期 ──
      if (action === 'blueprint.create' && ctx.result.ok) {
        blueprintCreated = true
        blueprintReviewed = false // 新蓝图需要重新审查
      }

      if (REVIEW_ACTIONS.has(action) && ctx.result.ok) {
        blueprintReviewed = true
      }

      // ── 守卫：蓝图已创建但未审查，不应执行写入 ──
      if (
        blueprintCreated &&
        !blueprintReviewed &&
        WRITE_ACTIONS.has(action) &&
        ctx.result.ok
      ) {
        return [
          `[系统蓝图编排提醒]\n` +
          `动作 ${action} 已执行成功，但你在创建蓝图后尚未执行 blueprint.describe 或 blueprint.revise 来审查蓝图。\n` +
          `建议：在继续修改数据结构前，先调用 blueprint.describe 确认当前蓝图状态，确保执行计划与用户目标一致。`,
        ]
      }

      return []
    },
  }
}
