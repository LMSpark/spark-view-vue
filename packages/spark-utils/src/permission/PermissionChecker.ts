/**
 * 权限检查器实现
 * 
 * 提供统一的权限检查逻辑
 */

import type {
  IPermissionChecker,
  IModelPermission,
  ComponentDataRow
} from '../data-types'

import { FieldVisibility } from '../data-types'

/**
 * 默认权限检查器实现
 */
export class PermissionChecker implements IPermissionChecker {
  /**
   * 检查是否允许新增
   */
  canCreate(modelPermission?: IModelPermission): boolean {
    return modelPermission?.allowCreate !== false
  }

  /**
   * 检查是否允许导入
   */
  canImport(modelPermission?: IModelPermission): boolean {
    return modelPermission?.allowImport !== false
  }

  /**
   * 检查是否允许导出
   */
  canExport(modelPermission?: IModelPermission): boolean {
    return modelPermission?.allowExport !== false
  }

  /**
   * 检查是否允许删除指定行
   */
  canDelete(row: ComponentDataRow): boolean {
    const perm = row._perm
    return perm?.allowDelete !== false
  }

  /**
   * 检查是否允许编辑指定行
   * 
   * 判断逻辑：editableFields 有值即表示可编辑
   */
  canEdit(row: ComponentDataRow): boolean {
    const perm = row._perm
    return (perm?.editableFields?.length ?? 0) > 0
  }

  /**
   * 检查字段是否可见
   */
  isFieldVisible(field: string, row: ComponentDataRow): boolean {
    const visibility = this.getFieldVisibility(field, row)
    return visibility !== FieldVisibility.Hidden
  }

  /**
   * 检查字段是否可编辑
   */
  isFieldEditable(field: string, row: ComponentDataRow): boolean {
    const perm = row._perm
    if (!perm) return false // 默认只读

    // 只有在 editableFields 中才可编辑
    return perm.editableFields?.includes(field) ?? false
  }

  /**
   * 获取字段可见性
   */
  getFieldVisibility(field: string, row: ComponentDataRow): FieldVisibility {
    const perm = row._perm
    if (!perm) return FieldVisibility.Visible

    // 检查隐藏字段列表
    if (perm.hiddenFields?.includes(field)) {
      return FieldVisibility.Hidden
    }

    // 检查脱敏字段列表
    if (perm.maskedFields?.includes(field)) {
      return FieldVisibility.Masked
    }

    return FieldVisibility.Visible
  }

  /**
   * 应用字段脱敏规则
   */
  maskFieldValue(field: string, value: unknown, row: ComponentDataRow): string {
    const visibility = this.getFieldVisibility(field, row)
    
    if (visibility !== FieldVisibility.Masked) {
      return String(value ?? '')
    }

    // 默认脱敏规则
    return this.defaultMaskRule(field, value)
  }

  /**
   * 默认脱敏规则
   */
  private defaultMaskRule(field: string, value: unknown): string {
    if (value === null || value === undefined) return ''
    
    const str = String(value)
    
    // 手机号脱敏：138****1234
    if (field.toLowerCase().includes('phone') || field.toLowerCase().includes('mobile')) {
      if (str.length === 11) {
        return str.substring(0, 3) + '****' + str.substring(7)
      }
    }
    
    // 身份证脱敏：330***********1234
    if (field.toLowerCase().includes('idcard') || field.toLowerCase().includes('idno')) {
      if (str.length === 18) {
        return str.substring(0, 3) + '***********' + str.substring(14)
      }
    }
    
    // 邮箱脱敏：abc***@example.com
    if (field.toLowerCase().includes('email')) {
      const atIndex = str.indexOf('@')
      if (atIndex > 3) {
        return str.substring(0, 3) + '***' + str.substring(atIndex)
      }
    }
    
    // 银行卡脱敏：6222 **** **** 1234
    if (field.toLowerCase().includes('bank') || field.toLowerCase().includes('card')) {
      if (str.length >= 16) {
        return str.substring(0, 4) + ' **** **** ' + str.substring(str.length - 4)
      }
    }
    
    // 默认脱敏：只显示前后各2个字符
    if (str.length > 4) {
      return str.substring(0, 2) + '***' + str.substring(str.length - 2)
    }
    
    return '***'
  }
}

/**
 * 创建权限检查器实例（单例）
 */
let checkerInstance: PermissionChecker | null = null

export function createPermissionChecker(): IPermissionChecker {
  checkerInstance ??= new PermissionChecker()
  return checkerInstance
}

/**
 * 快捷方法：检查权限
 */
export const checkPermission = {
  canCreate: (modelPermission?: IModelPermission) => 
    createPermissionChecker().canCreate(modelPermission),
  
  canDelete: (row: ComponentDataRow) => 
    createPermissionChecker().canDelete(row),
  
  canEdit: (row: ComponentDataRow) => 
    createPermissionChecker().canEdit(row),
  
  isFieldVisible: (field: string, row: ComponentDataRow) => 
    createPermissionChecker().isFieldVisible(field, row),
  
  isFieldEditable: (field: string, row: ComponentDataRow) => 
    createPermissionChecker().isFieldEditable(field, row)
}