/**
 * 权限检查器
 *
 * 提供模型级、实例级和字段级的权限验证，含内置脱敏规则
 */

import type { IModelPermission, IDataRow } from '../types'
import { FieldVisibility } from '../types'

export class PermissionChecker {
  // ===== 模型级权限 =====

  /**
   * 检查是否允许创建
   * @param modelPermission 模型权限配置
   * @returns 是否允许创建
   */
  canCreate(modelPermission?: IModelPermission): boolean {
    return modelPermission?.allowCreate !== false
  }

  /**
   * 检查是否允许导入
   * @param modelPermission 模型权限配置
   * @returns 是否允许导入
   */
  canImport(modelPermission?: IModelPermission): boolean {
    return modelPermission?.allowImport !== false
  }

  /**
   * 检查是否允许导出
   * @param modelPermission 模型权限配置
   * @returns 是否允许导出
   */
  canExport(modelPermission?: IModelPermission): boolean {
    return modelPermission?.allowExport !== false
  }

  // ===== 实例级权限 =====

  /**
   * 检查是否允许删除行数据
   * @param row 数据行
   * @returns 是否允许删除
   */
  canDelete(row: IDataRow): boolean {
    return row._perm?.allowDelete !== false
  }

  /**
   * 检查是否允许编辑行数据
   * @param row 数据行
   * @returns 是否允许编辑
   */
  canEdit(row: IDataRow): boolean {
    return (row._perm?.editableFields?.length ?? 0) > 0
  }

  // ===== 字段级权限 =====

  /**
   * 检查字段是否可见
   * @param field 字段名
   * @param row 数据行
   * @returns 字段是否可见
   */
  isFieldVisible(field: string, row: IDataRow): boolean {
    return this.getFieldVisibility(field, row) !== FieldVisibility.Hidden
  }

  /**
   * 检查字段是否可编辑
   * @param field 字段名
   * @param row 数据行
   * @returns 字段是否可编辑
   */
  isFieldEditable(field: string, row: IDataRow): boolean {
    return row._perm?.editableFields?.includes(field) ?? false
  }

  /**
   * 获取字段可见性状态
   * @param field 字段名
   * @param row 数据行
   * @returns 字段可见性
   */
  getFieldVisibility(field: string, row: IDataRow): FieldVisibility {
    const perm = row._perm
    if (!perm) return FieldVisibility.Visible
    if (perm.hiddenFields?.includes(field)) return FieldVisibility.Hidden
    if (perm.maskedFields?.includes(field)) return FieldVisibility.Masked
    return FieldVisibility.Visible
  }

  // ===== 字段脱敏 =====

  /**
   * 对字段值进行脱敏处理
   * @param field 字段名
   * @param value 字段值
   * @param row 数据行
   * @returns 脱敏后的字符串
   */
  maskFieldValue(field: string, value: unknown, row: IDataRow): string {
    if (this.getFieldVisibility(field, row) !== FieldVisibility.Masked) {
      return String(value ?? '')
    }
    return this.defaultMaskRule(field, value)
  }

  /**
   * 默认脱敏规则
   * @param field 字段名
   * @param value 字段值
   * @returns 脱敏后的字符串
   */
  private defaultMaskRule(field: string, value: unknown): string {
    if (value === null || value === undefined) return ''
    const str = String(value)
    const f = field.toLowerCase()

    // 手机号：138****1234
    if ((f.includes('phone') || f.includes('mobile')) && str.length === 11) {
      return `${str.substring(0, 3)  }****${  str.substring(7)}`
    }
    // 身份证：330***********1234
    if ((f.includes('idcard') || f.includes('idno')) && str.length === 18) {
      return `${str.substring(0, 3)  }***********${  str.substring(14)}`
    }
    // 邮箱：abc***@example.com
    if (f.includes('email')) {
      const at = str.indexOf('@')
      if (at > 3) return `${str.substring(0, 3)  }***${  str.substring(at)}`
    }
    // 银行卡：6222 **** **** 1234
    if ((f.includes('bank') || f.includes('card')) && str.length >= 16) {
      return `${str.substring(0, 4)  } **** **** ${  str.substring(str.length - 4)}`
    }
    // 默认
    return str.length > 4
      ? `${str.substring(0, 2)  }***${  str.substring(str.length - 2)}`
      : '***'
  }
}

// ===== 工厂函数 =====

/** 模块级单例（类无状态，无需 reset） */
const _instance = new PermissionChecker()

/**
 * 获取权限检查器实例（无状态单例）
 * @returns 权限检查器实例
 */
export function createPermissionChecker(): PermissionChecker {
  return _instance
}

// ===== 快捷方法 =====

/** 权限检查快捷方法 */
export const checkPermission = {
  canCreate: (modelPermission?: IModelPermission) =>
    createPermissionChecker().canCreate(modelPermission),
  canDelete: (row: IDataRow) =>
    createPermissionChecker().canDelete(row),
  canEdit: (row: IDataRow) =>
    createPermissionChecker().canEdit(row),
  isFieldVisible: (field: string, row: IDataRow) =>
    createPermissionChecker().isFieldVisible(field, row),
  isFieldEditable: (field: string, row: IDataRow) =>
    createPermissionChecker().isFieldEditable(field, row)
}
