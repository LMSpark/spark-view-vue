/**
 * Edit — Diff Stills
 *
 * 编辑会话的差异观察动作。
 * 只负责返回变更统计，不承载导出或模型查询。
 */

import type { StillDefinition, StillResult } from '../../../../core/stills/types'
import {
  getActiveDataSetTool,
  getActiveNodeTree,
  getEditState,
  readActiveScript,
  readActiveStyle,
  type EditDomainState,
} from './edit-state'
import { EditModel } from './edit-model'
import {
  EDIT_CHANGED_LINES_ACTION,
  DATASET_CHANGED_LINES_ACTION,
} from '../../../../core/stills/action-names'

// ── Changed Lines ────────────────────────────────────────────

export interface EditDiffLinesSummary {
  ruleJson: number
  pageDataJson: number
  scriptJs: number
  styleCss: number
  total: number
}

export function collectEditChangedLines(state: EditDomainState): EditDiffLinesSummary {
  if (!state.baselineSnapshot) {
    return { ruleJson: 0, pageDataJson: 0, scriptJs: 0, styleCss: 0, total: 0 }
  }
  const diff = new EditModel(
    getActiveNodeTree(state),
    getActiveDataSetTool(state),
    readActiveScript(state),
    readActiveStyle(state),
  )
    .diffSnapshot(state.baselineSnapshot)
  return {
    ruleJson: diff.rule,
    pageDataJson: diff.pagedata,
    scriptJs: diff.script,
    styleCss: diff.style,
    total: diff.total,
  }
}

const editChangedLines: StillDefinition = {
  action: EDIT_CHANGED_LINES_ACTION,
  type: 'describe',
  description: '统计当前会话相对 edit.bootstrap 基线在 4 个文件上的变更行数',
  validate: () => null,
  execute: (session): StillResult => {
    const data = collectEditChangedLines(getEditState(session))
    return { ok: true, data, summary: `变更行统计完成，总计 ${data.total} 行` }
  },
}

const datasetChangedLines: StillDefinition = {
  action: DATASET_CHANGED_LINES_ACTION,
  type: 'describe',
  description: '统计 pagedata.json 相对 edit.bootstrap 基线的变更行数',
  validate: () => null,
  execute: (session): StillResult => {
    const state = getEditState(session)
    const pagedataJson = collectEditChangedLines(state).pageDataJson
    return {
      ok: true,
      data: { pagedataJson },
      summary: pagedataJson > 0 ? `pagedata.json 变更 ${pagedataJson} 行` : 'pagedata.json 无变更',
    }
  },
}

export const EDIT_DIFF_STILLS: StillDefinition[] = [editChangedLines, datasetChangedLines]