/**
 * 权限过滤器 — 纯函数集
 *
 * 批量过滤行、字段，并保留服务端已经处理好的显示值
 */

import type { IDataRow } from '@spark-view/spark-data'
import { FieldVisibility } from '@spark-view/spark-data'
import type { NavPermissionMode } from '@spark-view/spark-utils'
import { canDelete, canEdit, isFieldEditable, isFieldVisible, getFieldVisibility } from './PermissionChecker'

export function filterDeletableRows(rows: IDataRow[], permissionMode?: NavPermissionMode): IDataRow[] {
  return rows.filter(row => canDelete(row, permissionMode))
}

export function filterEditableRows(rows: IDataRow[], permissionMode?: NavPermissionMode): IDataRow[] {
  return rows.filter(row => canEdit(row, permissionMode))
}

export function filterFields(row: IDataRow, permissionMode?: NavPermissionMode): Record<string, unknown> {
  const filtered: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(row)) {
    if (!field.startsWith('_') && isFieldVisible(field, row, permissionMode)) {
      filtered[field] = value
    }
  }
  return filtered
}

export function getEditableFields(row: IDataRow, allFields: string[], permissionMode?: NavPermissionMode): string[] {
  return allFields.filter(field => isFieldEditable(field, row, permissionMode))
}

export function getVisibleFields(row: IDataRow, allFields: string[], permissionMode?: NavPermissionMode): string[] {
  return allFields.filter(field => isFieldVisible(field, row, permissionMode))
}

export function filterDisplayableFields(row: IDataRow, permissionMode?: NavPermissionMode): IDataRow {
  const filtered: IDataRow = {}
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