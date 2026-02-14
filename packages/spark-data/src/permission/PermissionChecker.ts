/**
 * 权限检查器
 *
 * 提供模型级、实例级和字段级的权限验证，含内置脱敏规则
 */

import type { IModelPermission, IDataRow } from '../types'
import { FieldVisibility } from '../types'

export class PermissionChecker {
  // ── 模型级 ──

  canCreate(modelPermission?: IModelPermission): boolean {
    return modelPermission?.allowCreate !== false
  }

  canImport(modelPermission?: IModelPermission): boolean {
    return modelPermission?.allowImport !== false
  }

  canExport(modelPermission?: IModelPermission): boolean {
    return modelPermission?.allowExport !== false
  }

  // ── 实例级 ──

  canDelete(row: IDataRow): boolean {
    return row._perm?.allowDelete !== false
  }

  canEdit(row: IDataRow): boolean {
    return (row._perm?.editableFields?.length ?? 0) > 0
  }

  // ── 字段级 ──

  isFieldVisible(field: string, row: IDataRow): boolean {
    return this.getFieldVisibility(field, row) !== FieldVisibility.Hidden
  }

  isFieldEditable(field: string, row: IDataRow): boolean {
    return row._perm?.editableFields?.includes(field) ?? false
  }

  getFieldVisibility(field: string, row: IDataRow): FieldVisibility {
    const perm = row._perm
    if (!perm) return FieldVisibility.Visible
    if (perm.hiddenFields?.includes(field)) return FieldVisibility.Hidden
    if (perm.maskedFields?.includes(field)) return FieldVisibility.Masked
    return FieldVisibility.Visible
  }

  // ── 脱敏 ──

  maskFieldValue(field: string, value: unknown, row: IDataRow): string {
    if (this.getFieldVisibility(field, row) !== FieldVisibility.Masked) {
      return String(value ?? '')
    }
    return this.defaultMaskRule(field, value)
  }

  private defaultMaskRule(field: string, value: unknown): string {
    if (value === null || value === undefined) return ''
    const str = String(value)
    const f = field.toLowerCase()

    // 手机号：138****1234
    if ((f.includes('phone') || f.includes('mobile')) && str.length === 11) {
      return str.substring(0, 3) + '****' + str.substring(7)
    }
    // 身份证：330***********1234
    if ((f.includes('idcard') || f.includes('idno')) && str.length === 18) {
      return str.substring(0, 3) + '***********' + str.substring(14)
    }
    // 邮箱：abc***@example.com
    if (f.includes('email')) {
      const at = str.indexOf('@')
      if (at > 3) return str.substring(0, 3) + '***' + str.substring(at)
    }
    // 银行卡：6222 **** **** 1234
    if ((f.includes('bank') || f.includes('card')) && str.length >= 16) {
      return str.substring(0, 4) + ' **** **** ' + str.substring(str.length - 4)
    }
    // 默认
    return str.length > 4
      ? str.substring(0, 2) + '***' + str.substring(str.length - 2)
      : '***'
  }
}

// ── 工厂 ──

let instance: PermissionChecker | null = null

export function createPermissionChecker(): PermissionChecker {
  instance ??= new PermissionChecker()
  return instance
}

export function resetPermissionChecker(): void {
  instance = null
}

/** 快捷方法 */
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
