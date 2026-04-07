/**
 * Edit Domain — 编辑模式域定义
 *
 * 提供编辑会话的状态管理、初始化动作和 file stills。
 * nodeTree stills 和 dataset stills 分别在独立文件中定义。
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
  }
}

// ═══════════════════════════════════════════════════════════
// Guard
// ═══════════════════════════════════════════════════════════

export interface EditGuardOptions {
  requireNodeTree?: boolean
  requireDatasetEdit?: boolean
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
  guard: editingGuard,
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
  guard: editingGuard,
  paramsSchema: { content: 'string — 完整的 style.css 内容' },
  validate: (params) => typeof (params as unknown as Record<string, unknown>)['content'] === 'string' ? null : '缺少 content（string）',
  execute: (session, params): StillResult<undefined> => {
    getEditState(session).style = params.content
    return { ok: true, data: undefined, summary: 'style.css 已更新' }
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
    fileReadScript as StillDefinition,
    fileWriteScript as StillDefinition,
    fileReadStyle as StillDefinition,
    fileWriteStyle as StillDefinition,
    ...createNodeTreeStills(),
    ...createDatasetStills(),
  ],
  createState: createEditState,
}
