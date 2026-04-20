/**
 * Edit — Guard
 *
 * 编辑域准入规则与共享预设。
 * 各 FC 模块只声明自身行为，不重复拼装准入条件。
 */

import type { StillGuard } from './types'
import { EDIT_BOOTSTRAP_ACTION } from './action-names'
import { getEditState } from './edit-state'

// ── Guard Factory ────────────────────────────────────────────

export interface EditGuardOptions {
  requireNodeTree?: boolean
  requireDatasetEdit?: boolean
  requireDatasetExported?: boolean
}

export function editGuard(checks: EditGuardOptions = {}): StillGuard {
  return (session): { code: string; msg: string } | null => {
    const state = getEditState(session)
    if (state.phase !== 'editing') {
      return { code: 'NOT_EDITING', msg: `编辑会话未初始化，请先执行 ${EDIT_BOOTSTRAP_ACTION}` }
    }
    if (checks.requireNodeTree && state.nodeTree === null) {
      return { code: 'NO_NODE_TREE', msg: 'nodeTree 未初始化' }
    }
    if (checks.requireDatasetEdit && state.datasetEdit === null) {
      return { code: 'NO_DATASET_EDIT', msg: 'datasetEdit 未初始化' }
    }
    if (checks.requireDatasetExported && !state.datasetExported) {
      return { code: 'DATA_PHASE_REQUIRED', msg: '数据阶段未完成，请先执行 dataset.export 后再进行页面/脚本细粒度编辑' }
    }
    return null
  }
}

// ── Presets ───────────────────────────────────────────────────

export const editingGuard = editGuard()
export const datasetGuard = editGuard({ requireDatasetEdit: true })
export const datasetExportedGuard = editGuard({ requireDatasetExported: true })
export const treeGuard = editGuard({ requireNodeTree: true, requireDatasetExported: true })