/**
 * Builtin Action 元数据（page/actions 真源）
 *
 * 说明：
 * - 这里定义“内建动作名”与默认展示文案；
 * - 组件容器层只做适配与执行，不再重复维护动作名清单。
 */

import type { SparkNode } from '../../core/types'
import { nodeInputProps } from '../../core/types'
import { readString } from './executor-helpers'

interface BuiltinActionMeta {
  label: string
}

export const BUILTIN_ACTION_META = {
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
  'delete-selected': { label: '删除选择' },
  'patch-row': { label: '更新' },
  'patch-current': { label: '更新当前' },
  'patch-selected': { label: '批量更新' },
  'message-row': { label: '查看' },
  'message-current': { label: '查看当前' },
} as const satisfies Record<string, BuiltinActionMeta>

export type BuiltinActionName = keyof typeof BUILTIN_ACTION_META

export function isBuiltinActionName(value: string): value is BuiltinActionName {
  return value in BUILTIN_ACTION_META
}

export function getBuiltinActionLabelByName(name: BuiltinActionName): string {
  return BUILTIN_ACTION_META[name].label
}

export function getBuiltinActionName(action: SparkNode): BuiltinActionName | null {
  const propsMap = nodeInputProps(action)
  const actionName = readString(propsMap['action'])
  if (!actionName) return null
  return isBuiltinActionName(actionName) ? actionName : null
}

export function isBuiltinAction(action: SparkNode): boolean {
  return getBuiltinActionName(action) !== null
}

export function getBuiltinActionLabel(action: SparkNode): string {
  const propsMap = nodeInputProps(action)
  const explicit = readString(propsMap['label'])
  if (explicit) return explicit

  const actionName = getBuiltinActionName(action)
  if (!actionName) return '执行'
  return getBuiltinActionLabelByName(actionName)
}
