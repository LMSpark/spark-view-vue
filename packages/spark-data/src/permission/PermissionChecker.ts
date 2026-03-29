/**
 * 权限检查器
 *
 * 提供模型级、实例级和字段级的权限验证。
 * 脱敏值由服务端直接返回，前端仅消费权限快照并呈现结果。
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
    return modelPermission?.allowCreate === true
  }

  /**
   * 检查是否允许导入
   * @param modelPermission 模型权限配置
   * @returns 是否允许导入
   */
  canImport(modelPermission?: IModelPermission): boolean {
    return modelPermission?.allowImport === true
  }

  /**
   * 检查是否允许导出
   * @param modelPermission 模型权限配置
   * @returns 是否允许导出
   */
  canExport(modelPermission?: IModelPermission): boolean {
    return modelPermission?.allowExport === true
  }

  // ===== 实例级权限 =====

  /**
   * 检查是否允许删除行数据
   * @param row 数据行
   * @returns 是否允许删除
   */
  canDelete(row: IDataRow): boolean {
    return row._perm?.allowDelete === true
  }

  /**
   * 检查是否允许在当前记录下新增子记录
   * @param row 数据行
   * @returns 是否允许新增子记录
   */
  canCreateChild(row: IDataRow): boolean {
    return row._perm?.allowCreateChild === true
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

  // ===== 字段显示 =====

  /**
   * 获取字段最终显示值。
   * 当服务端将字段标记为 masked 时，返回值应当已经是服务端处理后的脱敏值。
   * @param field 字段名
   * @param value 字段值
   * @param row 数据行
   * @returns 可直接展示的字符串
   */
  getFieldDisplayValue(_field: string, value: unknown, _row: IDataRow): string {
    return String(value ?? '')
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
  canCreateChild: (row: IDataRow) =>
    createPermissionChecker().canCreateChild(row),
  canDelete: (row: IDataRow) =>
    createPermissionChecker().canDelete(row),
  canEdit: (row: IDataRow) =>
    createPermissionChecker().canEdit(row),
  isFieldVisible: (field: string, row: IDataRow) =>
    createPermissionChecker().isFieldVisible(field, row),
  isFieldEditable: (field: string, row: IDataRow) =>
    createPermissionChecker().isFieldEditable(field, row)
}
