/**
 * Edit State — 编辑会话的状态定义与访问器
 *
 * 独立模块，不依赖任何 stills 子模块，避免循环依赖。
 * 仅负责状态类型、session 访问器和初始 state 工厂。
 */

import type { IStillSession, DomainState } from '../../../../core/stills/types'
import { getDomainState } from '../../../../core/stills/types'
import type { SparkNodeTree } from '@spark-view/spark-component'
import type { DataSetCrudTool } from '@spark-view/spark-data'
import type { EditModelSnapshot } from './edit-model'
import { EditModel } from './edit-model'

// ═══════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════

export type EditPhase = 'idle' | 'editing' | 'saved'

export interface EditLiveModelAdapter {
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
  baselineSnapshot: EditModelSnapshot | null
  liveModelAdapter: EditLiveModelAdapter | null
}

// ═══════════════════════════════════════════════════════════
// 状态访问
// ═══════════════════════════════════════════════════════════

export function getEditState(session: IStillSession): EditDomainState {
  return getDomainState<EditDomainState>(session, 'edit')
}

export function createEditState(): EditDomainState {
  return {
    data: null,
    phase: 'idle',
    baselineSnapshot: null,
    liveModelAdapter: null,
  }
}

export function getActiveNodeTree(state: EditDomainState): SparkNodeTree | null {
  return state.liveModelAdapter?.getNodeTree?.() ?? null
}

export function notifyNodeTreeChanged(state: EditDomainState, nodeTree: SparkNodeTree): void {
  state.liveModelAdapter?.onNodeTreeChanged?.(nodeTree)
}

export function getActiveDataSetTool(state: EditDomainState): DataSetCrudTool | null {
  return state.liveModelAdapter?.getDataSetTool?.() ?? null
}

export function notifyDataSetChanged(state: EditDomainState, tool: DataSetCrudTool): void {
  state.liveModelAdapter?.onDataSetChanged?.(tool)
}

export function readActiveScript(state: EditDomainState): string {
  const reader = state.liveModelAdapter?.readScript
  if (!reader) {
    throw new Error('readActiveScript 失败：缺少 live text model 读取器（EditLiveModelAdapter.readScript）')
  }
  return reader()
}

export function writeActiveScript(state: EditDomainState, content: string): void {
  const writer = state.liveModelAdapter?.writeScript
  const reader = state.liveModelAdapter?.readScript
  if (!writer || !reader) {
    throw new Error('writeActiveScript 失败：缺少 live text model 读写器（EditLiveModelAdapter.readScript/writeScript）')
  }
  writer(content)
}

export function readActiveStyle(state: EditDomainState): string {
  const reader = state.liveModelAdapter?.readStyle
  if (!reader) {
    throw new Error('readActiveStyle 失败：缺少 live text model 读取器（EditLiveModelAdapter.readStyle）')
  }
  return reader()
}

export function writeActiveStyle(state: EditDomainState, content: string): void {
  const writer = state.liveModelAdapter?.writeStyle
  const reader = state.liveModelAdapter?.readStyle
  if (!writer || !reader) {
    throw new Error('writeActiveStyle 失败：缺少 live text model 读写器（EditLiveModelAdapter.readStyle/writeStyle）')
  }
  writer(content)
}

export function bindLiveModelAdapter(state: EditDomainState, adapter: EditLiveModelAdapter): void {
  state.liveModelAdapter = adapter
}

export function createCurrentEditModel(state: EditDomainState): EditModel {
  return new EditModel(
    getActiveNodeTree(state),
    getActiveDataSetTool(state),
    readActiveScript(state),
    readActiveStyle(state),
  )
}

export function captureBaselineSnapshot(state: EditDomainState): EditModelSnapshot {
  const snapshot = createCurrentEditModel(state).snapshot
  state.baselineSnapshot = snapshot
  state.phase = 'editing'
  return snapshot
}
