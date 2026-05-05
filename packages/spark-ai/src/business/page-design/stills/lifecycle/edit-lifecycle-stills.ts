import type {
  IStillSession,
  DomainState,
  StillResult,
  StillDefinition,
} from '../../../../core/stills/types'
import { getDomainState } from '../../../../core/stills/types'
import type { SparkNodeTree } from '@spark-view/spark-component'
import type { DataSetCrudTool } from '@spark-view/spark-data'
import {
  EDIT_LIFECYCLE_STILL_PARAMETER_TABLE,
  validateEditLifecycleStillParams,
} from './tool-catalog'

const PAGE_DESIGN_LIFECYCLE_MODULE_PROMPT = 'pageDesign@lifecycle 只负责绑定宿主提供的 live adapter 并验证 nodeTree、dataset、script、style 能力齐全；bootstrap 不复制第二份页面事实，也不修改页面内容。'

function getEditBootstrapStillRow() {
  const row = EDIT_LIFECYCLE_STILL_PARAMETER_TABLE[0]
  if (row === undefined) {
    throw new Error('lifecycle/tool-catalog.ts 必须至少包含一条 bootstrap Still 定义')
  }
  return row
}

const EDIT_BOOTSTRAP_STILL_ROW = getEditBootstrapStillRow()

export type EditInitParams = unknown

export type EditPhase = 'idle' | 'editing' | 'saved'

export interface EditToolHost {
  getNodeTree?: () => SparkNodeTree | null
  onNodeTreeChanged?: (nodeTree: SparkNodeTree) => void
  getDataSetTool?: () => DataSetCrudTool | null
  onDataSetChanged?: (tool: DataSetCrudTool) => void
  readScript?: () => string
  writeScript?: (content: string) => void
  readStyle?: () => string
  writeStyle?: (content: string) => void
}

export interface EditDomainState extends DomainState<null, EditPhase> {
  toolHost: EditToolHost | null
}

type TextModelReadKey = 'readScript' | 'readStyle'
type TextModelWriteKey = 'writeScript' | 'writeStyle'

function assertPresent<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message)
  }
  return value
}

export function getEditState(session: IStillSession): EditDomainState {
  return getDomainState<EditDomainState>(session, 'edit')
}

export function createEditState(): EditDomainState {
  return {
    data: null,
    phase: 'idle',
    toolHost: null,
  }
}

export function getActiveNodeTree(state: EditDomainState): SparkNodeTree | null {
  return state.toolHost?.getNodeTree?.() ?? null
}

export function notifyNodeTreeChanged(state: EditDomainState, nodeTree: SparkNodeTree): void {
  state.toolHost?.onNodeTreeChanged?.(nodeTree)
}

export function getActiveDataSetTool(state: EditDomainState): DataSetCrudTool | null {
  return state.toolHost?.getDataSetTool?.() ?? null
}

export function notifyDataSetChanged(state: EditDomainState, tool: DataSetCrudTool): void {
  state.toolHost?.onDataSetChanged?.(tool)
}

function readTextModel(state: EditDomainState, readKey: TextModelReadKey, missingMessage: string): string {
  return assertPresent(state.toolHost?.[readKey], missingMessage)()
}

function writeTextModel(
  state: EditDomainState,
  readKey: TextModelReadKey,
  writeKey: TextModelWriteKey,
  missingMessage: string,
  content: string,
): void {
  const writer = assertPresent(state.toolHost?.[writeKey], missingMessage)
  assertPresent(state.toolHost?.[readKey], missingMessage)
  writer(content)
}

export function readActiveScript(state: EditDomainState): string {
  return readTextModel(
    state,
    'readScript',
    'readActiveScript 失败：缺少 live text model 读取器（EditToolHost.readScript）',
  )
}

export function writeActiveScript(state: EditDomainState, content: string): void {
  writeTextModel(
    state,
    'readScript',
    'writeScript',
    'writeActiveScript 失败：缺少 live text model 读写器（EditToolHost.readScript/writeScript）',
    content,
  )
}

export function readActiveStyle(state: EditDomainState): string {
  return readTextModel(
    state,
    'readStyle',
    'readActiveStyle 失败：缺少 live text model 读取器（EditToolHost.readStyle）',
  )
}

export function writeActiveStyle(state: EditDomainState, content: string): void {
  writeTextModel(
    state,
    'readStyle',
    'writeStyle',
    'writeActiveStyle 失败：缺少 live text model 读写器（EditToolHost.readStyle/writeStyle）',
    content,
  )
}

export function bindLiveModelAdapter(state: EditDomainState, host: EditToolHost): void {
  state.toolHost = host
}

// ─────────────────────────────────────────────────────────────────────────────
// 功能分区二：会话引导（bootstrap 主流程）
// 目标：
// 1) 校验 live adapter 能力齐全；
// 2) 确认当前页面 4 文件都可从 live adapter 读取；
// 3) 进入 editing phase。
// 注意：
// - 不修改 live tree/data/script/style 内容；
// - 不在 bootstrap 内重复构造“第二份事实快照”。
// ─────────────────────────────────────────────────────────────────────────────

function bootstrapEditSession(state: EditDomainState): void {
  assertPresent(
    getActiveNodeTree(state),
    `${EDIT_BOOTSTRAP_STILL_ROW.action} 失败：缺少 nodeTree tool 实例（EditToolHost.getNodeTree）`,
  ).toJSON()

  assertPresent(
    getActiveDataSetTool(state),
    `${EDIT_BOOTSTRAP_STILL_ROW.action} 失败：缺少 dataset tool 实例（EditToolHost.getDataSetTool）`,
  ).toJson()

  assertPresent(
    state.toolHost?.readScript,
    `${EDIT_BOOTSTRAP_STILL_ROW.action} 失败：缺少 script 读取器（EditToolHost.readScript）`,
  )()

  assertPresent(
    state.toolHost?.readStyle,
    `${EDIT_BOOTSTRAP_STILL_ROW.action} 失败：缺少 style 读取器（EditToolHost.readStyle）`,
  )()

  state.phase = 'editing'
}

// ─────────────────────────────────────────────────────────────────────────────
// Still 定义导出（由 lifecycle/tool-catalog.ts 驱动）
// ─────────────────────────────────────────────────────────────────────────────

export const editInit: StillDefinition<EditInitParams, undefined> = {
  action: EDIT_BOOTSTRAP_STILL_ROW.action,
  type: EDIT_BOOTSTRAP_STILL_ROW.type,
  description: EDIT_BOOTSTRAP_STILL_ROW.description,
  modulePrompt: PAGE_DESIGN_LIFECYCLE_MODULE_PROMPT,
  paramsSchema: EDIT_BOOTSTRAP_STILL_ROW.paramsSchema,
  resultSchema: EDIT_BOOTSTRAP_STILL_ROW.resultSchema,
  example: EDIT_BOOTSTRAP_STILL_ROW.example,
  usageRules: EDIT_BOOTSTRAP_STILL_ROW.usageRules,
  failureModes: EDIT_BOOTSTRAP_STILL_ROW.failureModes,
  validate: (params) => validateEditLifecycleStillParams(EDIT_BOOTSTRAP_STILL_ROW.action, params),
  execute: (session, _params): StillResult<undefined> => {
    bootstrapEditSession(getEditState(session))
    return { ok: true, data: undefined, summary: '编辑会话已完成 tool 引导（模型实例 + N 个函数入口），进入 editing 状态' }
  },
}

export const EDIT_LIFECYCLE_STILLS: StillDefinition[] = [editInit]
