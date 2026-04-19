/**
 * Edit Domain — 编辑模式域定义
 *
 * 提供编辑会话的状态管理、初始化动作和 file stills。
 * nodeTree stills 和 dataset stills 分别在独立文件中定义。
 *
 * SSoT（Single Source of Truth）：
 * - DatasetModel 是所有数据集模型操作的唯一真实源
 * - 所有快照、摘要、差异计算都通过 DatasetModel 提供的接口
 */

import type {
  IStillSession,
  StillGuard,
  StillResult,
  StillDefinition,
  DomainState,
  DomainProvider,
  IDataSetMetadata,
} from './types'
import { getDomainState } from './types'
import type { SparkNode } from '@spark-view/spark-component'
import { SparkNodeTree } from '@spark-view/spark-component'
import { DataSetCrudTool } from '@spark-view/spark-data'
import { DatasetModel, type DatasetModelSnapshot, type DatasetModelSummary, type DatasetModelDelta } from './dataset-model'
import { EditModel, type EditModelSnapshot } from './edit-model'
import { createNodeTreeStills } from './edit-nodeTree-stills'
import { createDatasetStills } from './edit-dataset-stills'

// ═══════════════════════════════════════════════════════════
// 域状态
// ═══════════════════════════════════════════════════════════

export type EditPhase = 'idle' | 'editing' | 'saved'

export interface EditDomainState extends DomainState<null, EditPhase> {
  nodeTree: SparkNodeTree | null
  datasetEdit: DataSetCrudTool | null
  script: string
  style: string
  baselineSnapshot: EditModelSnapshot | null  // 编辑会话的冻结基线（初始化时）
  datasetExported: boolean
}

// 重新导出 DatasetModel 的类型（SSoT 在 dataset-model.ts 中定义）
export type { DatasetModelSnapshot, DatasetModelSummary, DatasetModelDelta } from './dataset-model'
export { DatasetModel } from './dataset-model'

export interface EditChangedLines {
  ruleJson: number
  pageDataJson: number
  scriptJs: number
  styleCss: number
  total: number
}

export interface EditExportFiles {
  files: {
    'rule.json': string
    'pagedata.json': string
    'script.js': string
    'style.css': string
  }
  changedLines: EditChangedLines
}

export interface DatasetChangedLines {
  pagedataJson: number
}

export interface DatasetExportResult {
  file: {
    'pagedata.json': string
  }
  changedLines: DatasetChangedLines
  tables: string[]
}

export function getEditState(session: IStillSession): EditDomainState {
  return getDomainState<EditDomainState>(session, 'edit')
}

function createEditState(): EditDomainState {
  return {
    data: null,
    phase: 'idle',
    nodeTree: null,
    datasetEdit: null,
    script: '',
    style: '',
    baselineSnapshot: null,
    datasetExported: false,
  }
}

function collectChangedLines(state: EditDomainState): EditChangedLines {
  if (!state.baselineSnapshot) {
    return { ruleJson: 0, pageDataJson: 0, scriptJs: 0, styleCss: 0, total: 0 }
  }
  const model = new EditModel(state.nodeTree, state.datasetEdit, state.script, state.style)
  const diff = model.diffSnapshot(state.baselineSnapshot)
  return {
    ruleJson: diff.rule,
    pageDataJson: diff.pagedata,
    scriptJs: diff.script,
    styleCss: diff.style,
    total: diff.total,
  }
}

function collectDatasetChangedLines(state: EditDomainState): DatasetChangedLines {
  if (!state.baselineSnapshot) {
    return { pagedataJson: 0 }
  }
  const model = new EditModel(state.nodeTree, state.datasetEdit, state.script, state.style)
  const diff = model.diffSnapshot(state.baselineSnapshot)
  return { pagedataJson: diff.pagedata }
}

function getDatasetTableNames(state: EditDomainState): string[] {
  if (!state.datasetEdit) return []
  const metadata = state.datasetEdit.toJson()
  return Object.keys(metadata.tables).sort()
}

// ═══════════════════════════════════════════════════════════
// Guard
// ═══════════════════════════════════════════════════════════

export interface EditGuardOptions {
  requireNodeTree?: boolean
  requireDatasetEdit?: boolean
  requireDatasetExported?: boolean
}

export function editGuard(checks: EditGuardOptions = {}): StillGuard {
  return (session): { code: string; msg: string } | null => {
    const state = getEditState(session)
    if (state.phase !== 'editing') {
      return { code: 'NOT_EDITING', msg: '编辑会话未初始化，请先执行 edit.init' }
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

const editingGuard = editGuard()

// ═══════════════════════════════════════════════════════════
// edit.init
// ═══════════════════════════════════════════════════════════

interface EditInitParams {
  ruleJson: SparkNode[]
  pageDataJson: IDataSetMetadata
  scriptJs: string
  styleCss: string
}

export const editInit: StillDefinition<EditInitParams, undefined> = {
  action: 'edit.init',
  type: 'request',
  description: '初始化编辑会话：接收 4 个文件内容，构建 SparkNodeTree + DataSetCrudTool + 存储 script/style',
  guard: (session) => {
    const state = getEditState(session)
    if (state.phase === 'editing') {
      return { code: 'ALREADY_EDITING', msg: '编辑会话已初始化，不可重复调用' }
    }
    return null
  },
  paramsSchema: {
    ruleJson: 'SparkNode[] — 解析后的规则数组',
    pageDataJson: 'IDataSetMetadata — 解析后的 DataSet 元数据',
    scriptJs: 'string — script.js 原始文本',
    styleCss: 'string — style.css 原始文本',
  },
  example: {
    ruleJson: [{ type: 'el-table', props: { dataKey: 'Users@rows' } }],
    pageDataJson: { dataSetName: 'DS', tables: {} },
    scriptJs: '',
    styleCss: '',
  },
  validate: (params) => {
    const p = params as unknown as Record<string, unknown>
    if (!Array.isArray(p['ruleJson'])) return '缺少 ruleJson（SparkNode[]）'
    if (typeof p['pageDataJson'] !== 'object' || p['pageDataJson'] === null) return '缺少 pageDataJson（IDataSetMetadata）'
    if (typeof p['scriptJs'] !== 'string') return '缺少 scriptJs'
    if (typeof p['styleCss'] !== 'string') return '缺少 styleCss'
    return null
  },
  execute: (session, params): StillResult<undefined> => {
    const state = getEditState(session)
    state.nodeTree = new SparkNodeTree({
      root: { type: 'page', children: params.ruleJson },
    })
    state.datasetEdit = DataSetCrudTool.fromJson(params.pageDataJson)
    state.script = params.scriptJs
    state.style = params.styleCss
    // 冻结初始快照作为基线（供后续对比）
    state.baselineSnapshot = new EditModel(state.nodeTree, state.datasetEdit, state.script, state.style).snapshot
    state.datasetExported = false
    state.phase = 'editing'
    return { ok: true, data: undefined, summary: '编辑会话已初始化' }
  },
}

// ═══════════════════════════════════════════════════════════
// file stills（4 个）
// ═══════════════════════════════════════════════════════════

export const fileReadScript: StillDefinition<Record<string, never>, { content: string }> = {
  action: 'file.readScript',
  type: 'describe',
  description: '返回 script.js 当前内容',
  guard: editingGuard,
  validate: () => null,
  execute: (session): StillResult<{ content: string }> => {
    return { ok: true, data: { content: getEditState(session).script }, summary: 'script.js 内容已返回' }
  },
}

export const fileWriteScript: StillDefinition<{ content: string }, undefined> = {
  action: 'file.writeScript',
  type: 'request',
  description: '写入 script.js 全文',
  guard: editGuard({ requireDatasetExported: true }),
  paramsSchema: { content: 'string — 完整的 script.js 内容' },
  validate: (params) => typeof (params as unknown as Record<string, unknown>)['content'] === 'string' ? null : '缺少 content（string）',
  execute: (session, params): StillResult<undefined> => {
    getEditState(session).script = params.content
    return { ok: true, data: undefined, summary: 'script.js 已更新' }
  },
}

export const fileReadStyle: StillDefinition<Record<string, never>, { content: string }> = {
  action: 'file.readStyle',
  type: 'describe',
  description: '返回 style.css 当前内容',
  guard: editingGuard,
  validate: () => null,
  execute: (session): StillResult<{ content: string }> => {
    return { ok: true, data: { content: getEditState(session).style }, summary: 'style.css 内容已返回' }
  },
}

export const fileWriteStyle: StillDefinition<{ content: string }, undefined> = {
  action: 'file.writeStyle',
  type: 'request',
  description: '写入 style.css 全文',
  guard: editGuard({ requireDatasetExported: true }),
  paramsSchema: { content: 'string — 完整的 style.css 内容' },
  validate: (params) => typeof (params as unknown as Record<string, unknown>)['content'] === 'string' ? null : '缺少 content（string）',
  execute: (session, params): StillResult<undefined> => {
    getEditState(session).style = params.content
    return { ok: true, data: undefined, summary: 'style.css 已更新' }
  },
}

export const editChangedLines: StillDefinition<Record<string, never>, EditChangedLines> = {
  action: 'edit.changedLines',
  type: 'describe',
  description: '统计当前会话相对 edit.init 基线在 4 个文件上的变更行数',
  guard: editingGuard,
  validate: () => null,
  execute: (session): StillResult<EditChangedLines> => {
    const state = getEditState(session)
    const data = collectChangedLines(state)
    return { ok: true, data, summary: `变更行统计完成，总计 ${data.total} 行` }
  },
}

export const editExportFiles: StillDefinition<Record<string, never>, EditExportFiles> = {
  action: 'edit.exportFiles',
  type: 'request',
  description: '导出当前编辑结果（rule.json/pagedata.json/script.js/style.css）及变更行统计',
  guard: editGuard({ requireDatasetExported: true }),
  validate: () => null,
  execute: (session): StillResult<EditExportFiles> => {
    const state = getEditState(session)
    const model = new EditModel(state.nodeTree, state.datasetEdit, state.script, state.style)
    const files = model.exportFiles()
    const changedLines = collectChangedLines(state)
    state.phase = 'saved'
    return { ok: true, data: { files, changedLines }, summary: `导出完成，总计变更 ${changedLines.total} 行` }
  },
}

export const datasetChangedLines: StillDefinition<Record<string, never>, DatasetChangedLines> = {
  action: 'dataset.changedLines',
  type: 'describe',
  description: '统计 pagedata.json 相对 edit.init 基线的变更行数',
  guard: editGuard({ requireDatasetEdit: true }),
  validate: () => null,
  execute: (session): StillResult<DatasetChangedLines> => {
    const state = getEditState(session)
    const data = collectDatasetChangedLines(state)
    return { ok: true, data, summary: `pagedata.json 变更 ${data.pagedataJson} 行` }
  },
}

export const datasetExport: StillDefinition<Record<string, never>, DatasetExportResult> = {
  action: 'dataset.export',
  type: 'request',
  description: '仅导出 pagedata.json 及数据域变更统计，适用于先数据后布局的细粒度流程',
  guard: editGuard({ requireDatasetEdit: true }),
  validate: () => null,
  execute: (session): StillResult<DatasetExportResult> => {
    const state = getEditState(session)
    const model = new EditModel(state.nodeTree, state.datasetEdit, state.script, state.style)
    const pagedata = model.snapshot.pagedata
    const changedLines = state.baselineSnapshot
      ? { pagedataJson: model.diffSnapshot(state.baselineSnapshot).pagedata }
      : { pagedataJson: 0 }
    const tables = getDatasetTableNames(state)
    state.datasetExported = true
    return {
      ok: true,
      data: {
        file: { 'pagedata.json': pagedata },
        changedLines,
        tables,
      },
      summary: `dataset 导出完成，${tables.length} 张表，变更 ${changedLines.pagedataJson} 行`,
    }
  },
}

export const datasetModelSummary: StillDefinition<Record<string, never>, DatasetModelSummary> = {
  action: 'dataset.modelSummary',
  type: 'describe',
  description: '返回当前 DataSet 模型摘要（表/列/关系/依赖/视图数量）',
  guard: editGuard({ requireDatasetEdit: true }),
  validate: () => null,
  execute: (session): StillResult<DatasetModelSummary> => {
    const state = getEditState(session)
    const tool = state.datasetEdit
    if (!tool) {
      return { ok: false, code: 'NO_TOOL', msg: '工具未初始化', fix: '请先执行 edit.init' }
    }
    const model = new DatasetModel(tool)
    const data = model.getSummary()
    return { ok: true, data, summary: `模型摘要：${data.tables} 表 / ${data.columns} 列 / ${data.relations} 关系` }
  },
}

export const datasetModelDelta: StillDefinition<Record<string, never>, DatasetModelDelta> = {
  action: 'dataset.modelDelta',
  type: 'describe',
  description: '返回当前 DataSet 相对 edit.init 基线的模型级差异（表/列/关系/依赖）',
  guard: editGuard({ requireDatasetEdit: true }),
  validate: () => null,
  execute: (session): StillResult<DatasetModelDelta> => {
    const state = getEditState(session)
    const tool = state.datasetEdit
    if (!tool) {
      return { ok: false, code: 'NO_TOOL', msg: '工具未初始化', fix: '请先执行 edit.init' }
    }
    if (!state.baselineSnapshot) {
      return { ok: false, code: 'NO_BASELINE', msg: '基线未初始化', fix: '请先执行 edit.init' }
    }
    try {
      // 从 baselineSnapshot.pagedata 重新解析基线
      const baselineJson = JSON.parse(state.baselineSnapshot.pagedata) as IDataSetMetadata
      const baselineModel = new DatasetModel(DataSetCrudTool.fromJson(baselineJson))
      const currentModel = new DatasetModel(tool)
      const data = currentModel.diffSnapshot(baselineModel.snapshot)
      const changedTables = data.addedTables.length + data.removedTables.length + data.changedTables.length
      const changedEdges = data.addedRelations.length + data.removedRelations.length + data.addedDependencies.length + data.removedDependencies.length
      return { ok: true, data, summary: `模型变更：${changedTables} 个表变更 / ${changedEdges} 条关系-依赖变更` }
    } catch (err) {
      return { ok: false, code: 'PARSE_ERROR', msg: err instanceof Error ? err.message : '解析失败', fix: '基线 pagedata 可能损坏' }
    }
  },
}

export const datasetCurrentModel: StillDefinition<Record<string, never>, DatasetModelSnapshot> = {
  action: 'dataset.currentModel',
  type: 'describe',
  description: '返回当前 DataSet 的完整模型快照（所有表名、列名、关系、依赖、视图）',
  guard: editGuard({ requireDatasetEdit: true }),
  validate: () => null,
  execute: (session): StillResult<DatasetModelSnapshot> => {
    const state = getEditState(session)
    const tool = state.datasetEdit
    if (!tool) {
      return { ok: false, code: 'NO_TOOL', msg: '工具未初始化', fix: '请先执行 edit.init' }
    }
    const model = new DatasetModel(tool)
    const data = model.snapshot
    const summary = model.getSummary()
    return { ok: true, data, summary: `模型快照：${summary.tables} 表 / ${summary.columns} 列` }
  },
}

export const datasetBaselineModel: StillDefinition<Record<string, never>, DatasetModelSnapshot> = {
  action: 'dataset.baselineModel',
  type: 'describe',
  description: '返回 edit.init 时的 DataSet 基线模型快照（用于对比）',
  guard: editGuard({ requireDatasetEdit: true }),
  validate: () => null,
  execute: (session): StillResult<DatasetModelSnapshot> => {
    const state = getEditState(session)
    if (!state.baselineSnapshot) {
      return { ok: false, code: 'NO_BASELINE', msg: '基线未初始化', fix: '请先执行 edit.init' }
    }
    try {
      const baselineJson = JSON.parse(state.baselineSnapshot.pagedata) as IDataSetMetadata
      const baselineModel = new DatasetModel(DataSetCrudTool.fromJson(baselineJson))
      return { ok: true, data: baselineModel.snapshot, summary: '基线模型已返回' }
    } catch (err) {
      return { ok: false, code: 'PARSE_ERROR', msg: err instanceof Error ? err.message : '解析失败', fix: '检查 baselineSnapshot.pagedata' }
    }
  },
}

// ═══════════════════════════════════════════════════════════
// Domain Provider
// ═══════════════════════════════════════════════════════════

export const editDomain: DomainProvider<EditDomainState> = {
  name: 'edit',
  roleHint: '编辑模式：对已有页面的 rule.json / pagedata.json / script.js / style.css 进行增量修改',
  stills: [
    editInit as StillDefinition,
    datasetChangedLines as StillDefinition,
    datasetExport as StillDefinition,
    datasetModelSummary as StillDefinition,
    datasetModelDelta as StillDefinition,
    datasetCurrentModel as StillDefinition,
    datasetBaselineModel as StillDefinition,
    editChangedLines as StillDefinition,
    editExportFiles as StillDefinition,
    fileReadScript as StillDefinition,
    fileWriteScript as StillDefinition,
    fileReadStyle as StillDefinition,
    fileWriteStyle as StillDefinition,
    ...createNodeTreeStills(),
    ...createDatasetStills(),
  ],
  createState: createEditState,
}

