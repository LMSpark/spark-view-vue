/**
 * 权限过滤器 — 纯函数集
 *
 * 批量过滤行、字段，并保留服务端已经处理好的显示值
 */

import type { DataRow } from '@spark-appworks/spark-data'
import { FieldVisibility } from '@spark-appworks/spark-data'
import type { NavPermissionMode } from '../core/capability-keys.js'
import { canDelete, canEdit, isFieldEditable, isFieldVisible, getFieldVisibility } from './PermissionChecker'

export function filterDeletableRows(rows: DataRow[], permissionMode?: NavPermissionMode): DataRow[] {
  return rows.filter(row => canDelete(row, permissionMode))
}

export function filterEditableRows(rows: DataRow[], permissionMode?: NavPermissionMode): DataRow[] {
  return rows.filter(row => canEdit(row, permissionMode))
}

export function filterFields(row: DataRow, permissionMode?: NavPermissionMode): Record<string, unknown> {
  const filtered: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(row)) {
    if (!field.startsWith('_') && isFieldVisible(field, row, permissionMode)) {
      filtered[field] = value
    }
  }
  return filtered
}

export function getEditableFields(row: DataRow, allFields: string[], permissionMode?: NavPermissionMode): string[] {
  return allFields.filter(field => isFieldEditable(field, row, permissionMode))
}

export function getVisibleFields(row: DataRow, allFields: string[], permissionMode?: NavPermissionMode): string[] {
  return allFields.filter(field => isFieldVisible(field, row, permissionMode))
}

export function filterDisplayableFields(row: DataRow, permissionMode?: NavPermissionMode): DataRow {
  const filtered: DataRow = {}
  for (const [field, value] of Object.entries(row)) {
    if (field.startsWith('_')) {
      filtered[field] = value
      continue
    }

    const visibility = getFieldVisibility(field, row, permissionMode)
    if (visibility === FieldVisibility.Hidden) continue
    filtered[field] = value
  }
  return filtered
}