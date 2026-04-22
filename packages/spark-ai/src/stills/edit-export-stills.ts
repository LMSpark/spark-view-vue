/**
 * Edit — Export Stills
 *
 * 编辑会话的导出检查点。
 * 只负责导出与阶段推进，不承载差异统计定义或模型查询目录。
 */

import type { StillDefinition, StillResult } from './types'
import {
  getActiveDataSetTool,
  getActiveNodeTree,
  getEditState,
  readActiveScript,
  readActiveStyle,
  type EditDomainState,
} from './edit-state'
import { EditModel, type EditFilesExport } from './edit-model'
import { collectEditChangedLines } from './edit-diff-stills'
import {
  EDIT_EXPORT_FILES_ACTION,
  DATASET_EXPORT_ACTION,
} from './action-names'

// ── Export Result Types ──────────────────────────────────────

interface EditFilesExportResult {
  files: EditFilesExport
  changedLines: ReturnType<typeof collectEditChangedLines>
}

interface DatasetFileExportResult {
  file: { 'pagedata.json': string }
  changedLines: { pagedataJson: number }
  tables: string[]
}

// ── Export Logic ─────────────────────────────────────────────

function finalizeEditFilesExport(state: EditDomainState): {
  data: EditFilesExportResult
  summary: string
} {
  const model = new EditModel(
    getActiveNodeTree(state),
    getActiveDataSetTool(state),
    readActiveScript(state),
    readActiveStyle(state),
  )
  const files = model.exportFiles()
  const changedLines = collectEditChangedLines(state)
  state.phase = 'saved'
  return {
    data: { files, changedLines },
    summary: `导出完成，总计变更 ${changedLines.total} 行`,
  }
}

function finalizeDatasetFileExport(state: EditDomainState): {
  data: DatasetFileExportResult
  summary: string
} {
  const activeDataSetTool = getActiveDataSetTool(state)
  const model = new EditModel(
    getActiveNodeTree(state),
    activeDataSetTool,
    readActiveScript(state),
    readActiveStyle(state),
  )
  const pagedata = model.snapshot.pagedata
  const changedLines = state.baselineSnapshot
    ? { pagedataJson: model.diffSnapshot(state.baselineSnapshot).pagedata }
    : { pagedataJson: 0 }
  const tables = activeDataSetTool
    ? Object.keys(activeDataSetTool.toJson().tables).sort()
    : []
  return {
    data: { file: { 'pagedata.json': pagedata }, changedLines, tables },
    summary: `dataset 导出完成，${tables.length} 张表，变更 ${changedLines.pagedataJson} 行`,
  }
}

const editExportFiles: StillDefinition = {
  action: EDIT_EXPORT_FILES_ACTION,
  type: 'request',
  description: '导出当前编辑结果（rule.json/pagedata.json/script.js/style.css）及变更行统计',
  validate: () => null,
  execute: (session): StillResult => {
    const result = finalizeEditFilesExport(getEditState(session))
    return { ok: true, data: result.data, summary: result.summary }
  },
}

const datasetExport: StillDefinition = {
  action: DATASET_EXPORT_ACTION,
  type: 'request',
  description: '仅导出 pagedata.json 及数据域变更统计，适用于页面模型里的数据优先增量编辑流程',
  validate: () => null,
  execute: (session): StillResult => {
    const result = finalizeDatasetFileExport(getEditState(session))
    return { ok: true, data: result.data, summary: result.summary }
  },
}

export const EDIT_EXPORT_STILLS: StillDefinition[] = [editExportFiles, datasetExport]