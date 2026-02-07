/**
 * 权限过滤器实现
 * 
 * 提供数据和字段的权限过滤功能
 */

import type {
  IPermissionFilter,
  IDataRowWithPermission
} from '../data-types'

import { FieldVisibility } from '../data-types'
import { createPermissionChecker } from './PermissionChecker'

/**
 * 默认权限过滤器实现
 */
export class PermissionFilter implements IPermissionFilter {
  private checker = createPermissionChecker()

  /**
   * 过滤出可删除的行
   */
  filterDeletableRows(rows: IDataRowWithPermission[]): IDataRowWithPermission[] {
    return rows.filter(row => this.checker.canDelete(row))
  }

  /**
   * 过滤出可编辑的行
   */
  filterEditableRows(rows: IDataRowWithPermission[]): IDataRowWithPermission[] {
    return rows.filter(row => this.checker.canEdit(row))
  }

  /**
   * 过滤字段（移除隐藏字段）
   */
  filterFields(row: IDataRowWithPermission): Record<string, unknown> {
    const filtered: Record<string, unknown> = {}
    
    for (const [field, value] of Object.entries(row)) {
      // 跳过内部字段
      if (field.startsWith('_')) {
        continue
      }
      
      // 检查可见性
      if (this.checker.isFieldVisible(field, row)) {
        filtered[field] = value
      }
    }
    
    return filtered
  }

  /**
   * 应用字段脱敏
   */
  applyFieldMasking(row: IDataRowWithPermission): IDataRowWithPermission {
    const masked: IDataRowWithPermission = { ...row }
    
    for (const [field, value] of Object.entries(row)) {
      // 跳过内部字段
      if (field.startsWith('_')) {
        continue
      }
      
      const visibility = this.checker.getFieldVisibility(field, row)
      
      if (visibility === FieldVisibility.Hidden) {
        // 隐藏字段：删除
        delete masked[field]
      } else if (visibility === FieldVisibility.Masked) {
        // 脱敏字段：应用脱敏规则
        masked[field] = this.checker.maskFieldValue(field, value, row)
      }
      // Visible：保持原值
    }
    
    return masked
  }

  /**
   * 批量应用脱敏（处理整个数据集）
   */
  applyMaskingToDataSet(rows: IDataRowWithPermission[]): IDataRowWithPermission[] {
    return rows.map(row => this.applyFieldMasking(row))
  }

  /**
   * 获取可编辑字段列表
   */
  getEditableFields(row: IDataRowWithPermission, allFields: string[]): string[] {
    return allFields.filter(field => this.checker.isFieldEditable(field, row))
  }

  /**
   * 获取可见字段列表
   */
  getVisibleFields(row: IDataRowWithPermission, allFields: string[]): string[] {
    return allFields.filter(field => this.checker.isFieldVisible(field, row))
  }
}

/**
 * 创建权限过滤器实例（单例）
 */
let filterInstance: PermissionFilter | null = null

export function createPermissionFilter(): IPermissionFilter {
  filterInstance ??= new PermissionFilter()
  return filterInstance
}

/**
 * 快捷方法：过滤数据
 */
export const filterByPermission = {
  deletableRows: (rows: IDataRowWithPermission[]) => 
    createPermissionFilter().filterDeletableRows(rows),
  
  editableRows: (rows: IDataRowWithPermission[]) => 
    createPermissionFilter().filterEditableRows(rows),
  
  applyMasking: (row: IDataRowWithPermission) => 
    createPermissionFilter().applyFieldMasking(row),
  
  applyMaskingToAll: (rows: IDataRowWithPermission[]) => 
    createPermissionFilter().applyMaskingToDataSet(rows)
}