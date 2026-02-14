/**
 * 权限过滤器
 *
 * 批量过滤行、字段，应用脱敏处理
 */

import type { IDataRow } from '../types'
import { FieldVisibility } from '../types'
import { createPermissionChecker } from './PermissionChecker'

export class PermissionFilter {
  private checker = createPermissionChecker()

  /** 过滤出可删除行 */
  filterDeletableRows(rows: IDataRow[]): IDataRow[] {
    return rows.filter(row => this.checker.canDelete(row))
  }

  /** 过滤出可编辑行 */
  filterEditableRows(rows: IDataRow[]): IDataRow[] {
    return rows.filter(row => this.checker.canEdit(row))
  }

  /** 过滤字段（移除隐藏字段） */
  filterFields(row: IDataRow): Record<string, unknown> {
    const filtered: Record<string, unknown> = {}
    for (const [field, value] of Object.entries(row)) {
      if (!field.startsWith('_') && this.checker.isFieldVisible(field, row)) {
        filtered[field] = value
      }
    }
    return filtered
  }

  /** 应用字段脱敏 */
  applyFieldMasking(row: IDataRow): IDataRow {
    const masked: IDataRow = { ...row }
    for (const [field, value] of Object.entries(row)) {
      if (field.startsWith('_')) continue
      const vis = this.checker.getFieldVisibility(field, row)
      if (vis === FieldVisibility.Hidden) delete masked[field]
      else if (vis === FieldVisibility.Masked) masked[field] = this.checker.maskFieldValue(field, value, row)
    }
    return masked
  }

  /** 批量脱敏 */
  applyMaskingToDataSet(rows: IDataRow[]): IDataRow[] {
    return rows.map(row => this.applyFieldMasking(row))
  }

  /** 获取可编辑字段 */
  getEditableFields(row: IDataRow, allFields: string[]): string[] {
    return allFields.filter(field => this.checker.isFieldEditable(field, row))
  }

  /** 获取可见字段 */
  getVisibleFields(row: IDataRow, allFields: string[]): string[] {
    return allFields.filter(field => this.checker.isFieldVisible(field, row))
  }
}

// ── 工厂 ──

let instance: PermissionFilter | null = null

export function createPermissionFilter(): PermissionFilter {
  instance ??= new PermissionFilter()
  return instance
}

export function resetPermissionFilter(): void {
  instance = null
}

/** 快捷方法 */
export const filterByPermission = {
  deletableRows: (rows: IDataRow[]) => createPermissionFilter().filterDeletableRows(rows),
  editableRows: (rows: IDataRow[]) => createPermissionFilter().filterEditableRows(rows),
  applyMasking: (row: IDataRow) => createPermissionFilter().applyFieldMasking(row),
  applyMaskingToAll: (rows: IDataRow[]) => createPermissionFilter().applyMaskingToDataSet(rows)
}
