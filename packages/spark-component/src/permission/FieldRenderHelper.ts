/**
 * 字段渲染状态计算 — 纯函数
 *
 * 结合字段配置和权限，计算字段的最终渲染状态。
 * 内部直接调用 checker 纯函数，调用方无需传入 checker 依赖。
 */

import type { DataRow } from '@spark-view/spark-data'
import { FieldVisibility } from '@spark-view/spark-data'
import type { NavPermissionMode } from '../core/capability-keys.js'
import { canEdit, isFieldEditable, getFieldVisibility } from './PermissionChecker'

export type FieldRenderConfig = {
  field: string
  visible?: boolean
  editable?: boolean
  label?: string
  width?: number | string
}

export type FieldRenderState = {
  field: string
  visibility: FieldVisibility
  readable: boolean
  editable: boolean
  displayValue: string | undefined
  shouldRender: boolean
}

/**
 * 计算单个字段的渲染状态（可见性 + 可编辑性 + 展示值）。
 */
export function computeFieldState(config: FieldRenderConfig, row: DataRow, permissionMode?: NavPermissionMode): FieldRenderState {
  const { field } = config
  const visibility = getFieldVisibility(field, row, permissionMode)
  const readable = visibility !== FieldVisibility.Hidden && (config.visible !== false)
  const editable = canEdit(row, permissionMode)
    && isFieldEditable(field, row, permissionMode)
    && (config.editable !== false)
  const shouldRender = readable

  let displayValue: string | undefined
  if (readable) {
    const value = row[field]
    displayValue = value !== undefined && value !== null ? String(value) : ''
  }

  return { field, visibility, readable, editable, displayValue, shouldRender }
}