import type { DataSetCrudTool } from '@spark-view/spark-data'
import type { PageDesignNodeTree } from '../node-tree/types'

export type EditPhase = 'idle' | 'editing' | 'saved'

export interface EditToolHost {
  getNodeTree?: () => PageDesignNodeTree | null
  onNodeTreeChanged?: (nodeTree: PageDesignNodeTree) => void
  getDataSetTool?: () => DataSetCrudTool | null
  onDataSetChanged?: (tool: DataSetCrudTool) => void
  readScript?: () => string
  writeScript?: (content: string) => void
  readStyle?: () => string
  writeStyle?: (content: string) => void
}

export interface EditState {
  phase: EditPhase
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

export function createEditState(): EditState {
  return {
    phase: 'idle',
    toolHost: null,
  }
}

export function bindLiveModelAdapter(state: EditState, host: EditToolHost): void {
  state.toolHost = host
}

export function getActiveNodeTree(state: EditState): PageDesignNodeTree | null {
  return state.toolHost?.getNodeTree?.() ?? null
}

export function notifyNodeTreeChanged(state: EditState, nodeTree: PageDesignNodeTree): void {
  state.toolHost?.onNodeTreeChanged?.(nodeTree)
}

export function getActiveDataSetTool(state: EditState): DataSetCrudTool | null {
  return state.toolHost?.getDataSetTool?.() ?? null
}

export function notifyDataSetChanged(state: EditState, tool: DataSetCrudTool): void {
  state.toolHost?.onDataSetChanged?.(tool)
}

function readTextModel(state: EditState, readKey: TextModelReadKey, missingMessage: string): string {
  return assertPresent(state.toolHost?.[readKey], missingMessage)()
}

function writeTextModel(
  state: EditState,
  readKey: TextModelReadKey,
  writeKey: TextModelWriteKey,
  missingMessage: string,
  content: string,
): void {
  const writer = assertPresent(state.toolHost?.[writeKey], missingMessage)
  assertPresent(state.toolHost?.[readKey], missingMessage)
  writer(content)
}

export function readActiveScript(state: EditState): string {
  return readTextModel(
    state,
    'readScript',
    'readActiveScript 失败：缺少 live text model 读取器（EditToolHost.readScript）',
  )
}

export function writeActiveScript(state: EditState, content: string): void {
  writeTextModel(
    state,
    'readScript',
    'writeScript',
    'writeActiveScript 失败：缺少 live text model 读写器（EditToolHost.readScript/writeScript）',
    content,
  )
}

export function readActiveStyle(state: EditState): string {
  return readTextModel(
    state,
    'readStyle',
    'readActiveStyle 失败：缺少 live text model 读取器（EditToolHost.readStyle）',
  )
}

export function writeActiveStyle(state: EditState, content: string): void {
  writeTextModel(
    state,
    'readStyle',
    'writeStyle',
    'writeActiveStyle 失败：缺少 live text model 读写器（EditToolHost.readStyle/writeStyle）',
    content,
  )
}
