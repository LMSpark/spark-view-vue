/**
 * Edit — Lifecycle Stills
 *
 * 编辑会话生命周期入口（edit.bootstrap）。
 *
 * 说明：
 * 1) 当前架构下 UI 与 AI 共用同一份 live model；
 * 2) 因此 bootstrap 不再承担“宿主快照 vs live model”二次比对；
 * 3) 当前页面事实由前置文件加载和后续函数调用工具直接向 LLM 汇报。
 * 4) 术语约定：tool = 一个模型实例 + N 个函数入口。
 */

import type {
  IStillSession,
  DomainState,
  StillResult,
  StillDefinition,
} from '../../../../core/stills/types'
import { getDomainState } from '../../../../core/stills/types'
import type { SparkNodeTree } from '@spark-view/spark-component'
import type { DataSetCrudTool } from '@spark-view/spark-data'
import { EDIT_BOOTSTRAP_ACTION } from '../../../../core/stills/action-names'

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

export function readActiveScript(state: EditDomainState): string {
  const reader = assertPresent(
    state.toolHost?.readScript,
    'readActiveScript 失败：缺少 live text model 读取器（EditToolHost.readScript）',
  )
  return reader()
}

export function writeActiveScript(state: EditDomainState, content: string): void {
  const writer = assertPresent(
    state.toolHost?.writeScript,
    'writeActiveScript 失败：缺少 live text model 读写器（EditToolHost.readScript/writeScript）',
  )
  assertPresent(
    state.toolHost?.readScript,
    'writeActiveScript 失败：缺少 live text model 读写器（EditToolHost.readScript/writeScript）',
  )
  writer(content)
}

export function readActiveStyle(state: EditDomainState): string {
  const reader = assertPresent(
    state.toolHost?.readStyle,
    'readActiveStyle 失败：缺少 live text model 读取器（EditToolHost.readStyle）',
  )
  return reader()
}

export function writeActiveStyle(state: EditDomainState, content: string): void {
  const writer = assertPresent(
    state.toolHost?.writeStyle,
    'writeActiveStyle 失败：缺少 live text model 读写器（EditToolHost.readStyle/writeStyle）',
  )
  assertPresent(
    state.toolHost?.readStyle,
    'writeActiveStyle 失败：缺少 live text model 读写器（EditToolHost.readStyle/writeStyle）',
  )
  writer(content)
}

export function bindLiveModelAdapter(state: EditDomainState, host: EditToolHost): void {
  state.toolHost = host
}

// ─────────────────────────────────────────────────────────────────────────────
// 功能分区一：输入校验
// 目标：兼容旧调用方仍传对象，但 bootstrap 本身不再依赖 payload 内容。
// ─────────────────────────────────────────────────────────────────────────────

function validateEditBootstrapPayload(params: unknown): string | null {
  if (params === undefined || params === null) return null
  if (typeof params !== 'object') return 'edit.bootstrap 参数必须是对象或留空'
  return null
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
  // 1) nodeTree tool 必须存在（即模型实例 + 对应函数入口）。
  const nodeTreeTool = assertPresent(
    getActiveNodeTree(state),
    'edit.bootstrap 失败：缺少 nodeTree tool 实例（EditToolHost.getNodeTree）',
  )

  // 2) dataset tool 必须存在（即模型实例 + 对应函数入口）。
  const dataSetTool = assertPresent(
    getActiveDataSetTool(state),
    'edit.bootstrap 失败：缺少 dataset tool 实例（EditToolHost.getDataSetTool）',
  )

  // 3) script/style 读取器必须存在。
  const readScript = assertPresent(
    state.toolHost?.readScript,
    'edit.bootstrap 失败：缺少 script 读取器（EditToolHost.readScript）',
  )

  const readStyle = assertPresent(
    state.toolHost?.readStyle,
    'edit.bootstrap 失败：缺少 style 读取器（EditToolHost.readStyle）',
  )

  // 4) 探测一次函数调用，确保适配器能力可用。
  nodeTreeTool.toJSON()
  dataSetTool.toJson()
  readScript()
  readStyle()

  // 5) 建立编辑会话状态：仅推进 phase。
  state.phase = 'editing'
}

// ─────────────────────────────────────────────────────────────────────────────
// Still 定义导出
// ─────────────────────────────────────────────────────────────────────────────

export const editInit: StillDefinition<EditInitParams, undefined> = {
  action: EDIT_BOOTSTRAP_ACTION,
  type: 'request',
  description: '引导编辑会话：仅校验 tool（模型实例 + N 个函数入口）可用，并进入 editing phase',
  paramsSchema: {},
  example: {},
  validate: validateEditBootstrapPayload,
  execute: (session, _params): StillResult<undefined> => {
    bootstrapEditSession(getEditState(session))
    return { ok: true, data: undefined, summary: '编辑会话已完成 tool 引导（模型实例 + N 个函数入口），进入 editing 状态' }
  },
}

export const EDIT_LIFECYCLE_STILLS: StillDefinition[] = [editInit as StillDefinition]