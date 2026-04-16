/**
 * 内置声明式动作系统 — 动作元数据与识别
 *
 * 动作名映射、类型守卫、标签解析。
 */

import type { IDataRow } from '@spark-view/spark-data'
import type { SparkNode } from '../../../internal'
import { readString, getActionProps } from './builtin-action-helpers'

// ── 类型定义 ──────────────────────────────────────────────────────────────

interface BuiltinActionMeta {
  label: string
}

const BUILTIN_ACTION_META = {
  'append-row': { label: '新增' },
  'prompt-append': { label: '新增' },
  'prompt-edit': { label: '编辑' },
  'submit-current-form': { label: '保存当前' },
  'clear-rows': { label: '清空' },
  'move-row': { label: '移动' },
  'move-current': { label: '移动当前' },
  'refresh': { label: '刷新' },
  'delete-row': { label: '删除' },
  'delete-current': { label: '删除当前' },
  'delete-selected': { label: '删除勾选' },
  'patch-row': { label: '更新' },
  'patch-current': { label: '更新当前' },
  'patch-selected': { label: '批量更新' },
  'message-row': { label: '查看' },
  'message-current': { label: '查看当前' },
} as const satisfies Record<string, BuiltinActionMeta>

export type BuiltinActionName = keyof typeof BUILTIN_ACTION_META

const BUILTIN_ACTION_META_RECORD: Record<BuiltinActionName, BuiltinActionMeta> = BUILTIN_ACTION_META

export interface BuiltinActionScope {
  row?: IDataRow
  index?: number
}

// ── 动作名校验 ────────────────────────────────────────────────────────────

function isBuiltinActionName(value: string): value is BuiltinActionName {
  return value in BUILTIN_ACTION_META
}

export function getBuiltinActionName(action: SparkNode): BuiltinActionName | null {
  const propsMap = getActionProps(action)
  const actionName = readString(propsMap['action']) ?? readString(propsMap['builtinAction'])
  if (!actionName) return null
  return isBuiltinActionName(actionName) ? actionName : null
}

export function isBuiltinAction(action: SparkNode): boolean {
  return getBuiltinActionName(action) !== null
}

// ── 标签映射 ──────────────────────────────────────────────────────────────

export function getBuiltinActionLabel(action: SparkNode): string {
  const propsMap = getActionProps(action)
  const explicit = readString(propsMap['label'])
  if (explicit) return explicit

  const actionName = getBuiltinActionName(action)
  if (!actionName) return '执行'
  return BUILTIN_ACTION_META_RECORD[actionName].label
}
