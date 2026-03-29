/**
 * 权限过滤器
 *
 * 批量过滤行、字段，并保留服务端已经处理好的显示值
 */

import type { IDataRow } from '@spark-view/spark-data'
import { FieldVisibility } from '@spark-view/spark-data'
import { createPermissionChecker } from './PermissionChecker'

export class PermissionFilter {
  private checker = createPermissionChecker()

  filterDeletableRows(rows: IDataRow[]): IDataRow[] {
    return rows.filter(row => this.checker.canDelete(row))
  }

  filterEditableRows(rows: IDataRow[]): IDataRow[] {
    return rows.filter(row => this.checker.canEdit(row))
  }

  filterFields(row: IDataRow): Record<string, unknown> {
    const filtered: Record<string, unknown> = {}
    for (const [field, value] of Object.entries(row)) {
      if (!field.startsWith('_') && this.checker.isFieldVisible(field, row)) {
        filtered[field] = value
      }
    }
    return filtered
  }

  getEditableFields(row: IDataRow, allFields: string[]): string[] {
    return allFields.filter(field => this.checker.isFieldEditable(field, row))
  }

  getVisibleFields(row: IDataRow, allFields: string[]): string[] {
    return allFields.filter(field => this.checker.isFieldVisible(field, row))
  }

  filterDisplayableFields(row: IDataRow): IDataRow {
    const filtered: IDataRow = {}
    for (const [field, value] of Object.entries(row)) {
      if (field.startsWith('_')) {
        filtered[field] = value
        continue
      }

      const visibility = this.checker.getFieldVisibility(field, row)
      if (visibility === FieldVisibility.Hidden) continue
      filtered[field] = value
    }
    return filtered
  }

  filterDisplayableFieldsInDataSet(rows: IDataRow[]): IDataRow[] {
    return rows.map(row => this.filterDisplayableFields(row))
  }
}

const _instance = new PermissionFilter()

export function createPermissionFilter(): PermissionFilter {
  return _instance
}

export const filterByPermission = {
  deletableRows: (rows: IDataRow[]) => createPermissionFilter().filterDeletableRows(rows),
  editableRows: (rows: IDataRow[]) => createPermissionFilter().filterEditableRows(rows),
  displayableFields: (row: IDataRow) => createPermissionFilter().filterDisplayableFields(row),
  displayableFieldsInRows: (rows: IDataRow[]) => createPermissionFilter().filterDisplayableFieldsInDataSet(rows),
}