/**
 * Edit — Lifecycle Stills
 *
 * 编辑会话的生命周期入口。
 * 负责把输入的 4 个文件物化为编辑会话状态。
 */

import type {
  IDataSetMetadata,
  StillResult,
  StillDefinition,
} from '../types'
import type { SparkNode } from '@spark-view/spark-component'
import { EditModel } from './edit-model'
import type { EditDomainState } from './edit-state'
import { getActiveDataSetTool, getActiveNodeTree, getEditState } from './edit-state'
import { EDIT_BOOTSTRAP_ACTION } from '../action-names'

// ── Bootstrap Payload ────────────────────────────────────────

export interface EditBootstrapPayload {
  ruleJson: SparkNode[]
  pageDataJson: IDataSetMetadata
  scriptJs: string
  styleCss: string
}

export type EditInitParams = EditBootstrapPayload

function validateEditBootstrapPayload(params: unknown): string | null {
  const payload = params as Record<string, unknown>
  if (!Array.isArray(payload['ruleJson'])) return '缺少 ruleJson（SparkNode[]）'
  if (typeof payload['pageDataJson'] !== 'object' || payload['pageDataJson'] === null) {
    return '缺少 pageDataJson（IDataSetMetadata）'
  }
  if (typeof payload['scriptJs'] !== 'string') return '缺少 scriptJs'
  if (typeof payload['styleCss'] !== 'string') return '缺少 styleCss'
  return null
}

function bootstrapEditSession(state: EditDomainState, payload: EditBootstrapPayload): void {
  const liveTree = getActiveNodeTree(state)
  if (!liveTree) {
    throw new Error('edit.bootstrap 失败：缺少 live SparkNodeTree，必须先绑定 EditLiveModelAdapter.getNodeTree')
  }

  const liveTool = getActiveDataSetTool(state)
  if (!liveTool) {
    throw new Error('edit.bootstrap 失败：缺少 live DataSetCrudTool，必须先绑定 EditLiveModelAdapter.getDataSetTool')
  }

  const writeScript = state.liveModelAdapter?.writeScript
  const readScript = state.liveModelAdapter?.readScript
  if (!writeScript || !readScript) {
    throw new Error('edit.bootstrap 失败：缺少 live text model（EditLiveModelAdapter.readScript/writeScript）')
  }

  const writeStyle = state.liveModelAdapter?.writeStyle
  const readStyle = state.liveModelAdapter?.readStyle
  if (!writeStyle || !readStyle) {
    throw new Error('edit.bootstrap 失败：缺少 live text model（EditLiveModelAdapter.readStyle/writeStyle）')
  }

  liveTree.loadRoot({ type: 'page', children: payload.ruleJson })
  state.nodeTree = liveTree
  // DataSetTool 必须复用 live adapter 返回的同一实例。
  state.datasetEdit = liveTool
  writeScript(payload.scriptJs)
  writeStyle(payload.styleCss)
  state.script = readScript()
  state.style = readStyle()
  state.baselineSnapshot = new EditModel(
    state.nodeTree,
    liveTool,
    state.script,
    state.style,
  ).snapshot
  state.phase = 'editing'
}

export const editInit: StillDefinition<EditInitParams, undefined> = {
  action: EDIT_BOOTSTRAP_ACTION,
  type: 'request',
  description: '引导编辑会话：将 4 个文件内容同步到 live SparkNodeTree / live DataSetCrudTool 与 script/style',
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
  validate: validateEditBootstrapPayload,
  execute: (session, params): StillResult<undefined> => {
    bootstrapEditSession(getEditState(session), params)
    return { ok: true, data: undefined, summary: '编辑会话已初始化' }
  },
}

export const EDIT_LIFECYCLE_STILLS: StillDefinition[] = [editInit as StillDefinition]