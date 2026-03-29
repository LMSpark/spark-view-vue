/**
 * 权限检查器
 *
 * 提供模型级、实例级和字段级的权限验证。
 * 脱敏值由服务端直接返回，前端仅消费权限快照并呈现结果。
 */

import type { IDataRow, IModelPermission } from '@spark-view/spark-data'
import { FieldVisibility } from '@spark-view/spark-data'

export class PermissionChecker {
  canCreate(modelPermission?: IModelPermission): boolean {
    return modelPermission?.allowCreate === true
  }

  canImport(modelPermission?: IModelPermission): boolean {
    return modelPermission?.allowImport === true
  }

  canExport(modelPermission?: IModelPermission): boolean {
    return modelPermission?.allowExport === true
  }

  canDelete(row: IDataRow): boolean {
    return row._perm?.allowDelete === true
  }

  canCreateChild(row: IDataRow): boolean {
    return row._perm?.allowCreateChild === true
  }

  canEdit(row: IDataRow): boolean {
    return (row._perm?.editableFields?.length ?? 0) > 0
  }

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

  getFieldDisplayValue(_field: string, value: unknown, _row: IDataRow): string {
    return String(value ?? '')
  }
}

const _instance = new PermissionChecker()

export function createPermissionChecker(): PermissionChecker {
  return _instance
}

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
    createPermissionChecker().isFieldEditable(field, row),
}