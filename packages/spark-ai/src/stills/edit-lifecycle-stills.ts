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
} from './types'
import type { SparkNode } from '@spark-view/spark-component'
import { SparkNodeTree } from '@spark-view/spark-component'
import { DataSetCrudTool } from '@spark-view/spark-data'
import { EditModel } from './edit-model'
import type { EditDomainState } from './edit-state'
import { getEditState } from './edit-state'
import { EDIT_BOOTSTRAP_ACTION } from './action-names'

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
  state.nodeTree = new SparkNodeTree({
    root: { type: 'page', children: payload.ruleJson },
  })
  state.datasetEdit = DataSetCrudTool.fromJson(payload.pageDataJson)
  state.script = payload.scriptJs
  state.style = payload.styleCss
  state.baselineSnapshot = new EditModel(state.nodeTree, state.datasetEdit, state.script, state.style).snapshot
  state.datasetExported = false
  state.phase = 'editing'
}

export const editInit: StillDefinition<EditInitParams, undefined> = {
  action: EDIT_BOOTSTRAP_ACTION,
  type: 'request',
  description: '引导编辑会话：接收 4 个文件内容，构建 SparkNodeTree + DataSetCrudTool + 存储 script/style',
  guard: (session) => {
    const state = getEditState(session)
    if (state.phase === 'editing') {
      return { code: 'ALREADY_EDITING', msg: '编辑会话已初始化，不可重复引导' }
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
  validate: validateEditBootstrapPayload,
  execute: (session, params): StillResult<undefined> => {
    bootstrapEditSession(getEditState(session), params)
    return { ok: true, data: undefined, summary: '编辑会话已初始化' }
  },
}

export const EDIT_LIFECYCLE_STILLS: StillDefinition[] = [editInit as StillDefinition]