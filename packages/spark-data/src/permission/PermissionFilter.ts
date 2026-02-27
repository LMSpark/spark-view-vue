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

  // ===== 行级过滤 =====

  /**
   * 过滤出可删除的行
   * @param rows 数据行数组
   * @returns 可删除的行数组
   */
  filterDeletableRows(rows: IDataRow[]): IDataRow[] {
    return rows.filter(row => this.checker.canDelete(row))
  }

  /**
   * 过滤出可编辑的行
   * @param rows 数据行数组
   * @returns 可编辑的行数组
   */
  filterEditableRows(rows: IDataRow[]): IDataRow[] {
    return rows.filter(row => this.checker.canEdit(row))
  }

  // ===== 字段级过滤 =====

  /**
   * 过滤字段（移除隐藏字段）
   * @param row 数据行
   * @returns 过滤后的字段对象
   */
  filterFields(row: IDataRow): Record<string, unknown> {
    const filtered: Record<string, unknown> = {}
    for (const [field, value] of Object.entries(row)) {
      if (!field.startsWith('_') && this.checker.isFieldVisible(field, row)) {
        filtered[field] = value
      }
    }
    return filtered
  }

  /**
   * 获取可编辑字段列表
   * @param row 数据行
   * @param allFields 所有字段名数组
   * @returns 可编辑字段名数组
   */
  getEditableFields(row: IDataRow, allFields: string[]): string[] {
    return allFields.filter(field => this.checker.isFieldEditable(field, row))
  }

  /**
   * 获取可见字段列表
   * @param row 数据行
   * @param allFields 所有字段名数组
   * @returns 可见字段名数组
   */
  getVisibleFields(row: IDataRow, allFields: string[]): string[] {
    return allFields.filter(field => this.checker.isFieldVisible(field, row))
  }

  // ===== 脱敏处理 =====

  /**
   * 应用字段脱敏
   * @param row 数据行
   * @returns 脱敏后的数据行
   */
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

  /**
   * 批量应用脱敏处理
   * @param rows 数据行数组
   * @returns 脱敏后的数据行数组
   */
  applyMaskingToDataSet(rows: IDataRow[]): IDataRow[] {
    return rows.map(row => this.applyFieldMasking(row))
  }
}

// ===== 工厂函数 =====

/** 模块级单例（类无状态，无需 reset） */
const _instance = new PermissionFilter()

/**
 * 获取权限过滤器实例（无状态单例）
 * @returns 权限过滤器实例
 */
export function createPermissionFilter(): PermissionFilter {
  return _instance
}

// ===== 快捷方法 =====

/** 权限过滤快捷方法 */
export const filterByPermission = {
  deletableRows: (rows: IDataRow[]) => createPermissionFilter().filterDeletableRows(rows),
  editableRows: (rows: IDataRow[]) => createPermissionFilter().filterEditableRows(rows),
  applyMasking: (row: IDataRow) => createPermissionFilter().applyFieldMasking(row),
  applyMaskingToAll: (rows: IDataRow[]) => createPermissionFilter().applyMaskingToDataSet(rows)
}
