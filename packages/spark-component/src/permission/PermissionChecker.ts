/**
 * 权限检查器 — 纯函数集
 *
 * 提供模型级、实例级和字段级的权限验证。
 * 脱敏值由服务端直接返回，前端仅消费权限快照并呈现结果。
 *
 * permissionMode 语义：
 * - 'none'      → 不控制：跳过所有权限检查，一切可见/可编辑
 * - 'masked'    → 可见+脱敏：权限数据正常应用，但字段可见性下限为 Masked（Hidden→Masked）
 * - 'invisible' → 后端控制导航可见性，前端权限检查正常执行
 */

import type { IDataRow, IModelPermission } from '@spark-view/spark-data'
import { FieldVisibility } from '@spark-view/spark-data'
import type { NavPermissionMode } from '@spark-view/spark-utils'

// ── 模型级检查 ──

export function canCreate(modelPermission?: IModelPermission, permissionMode?: NavPermissionMode): boolean {
  if (permissionMode === 'none') return true
  return modelPermission?.allowCreate === true
}

export function canImport(modelPermission?: IModelPermission, permissionMode?: NavPermissionMode): boolean {
  if (permissionMode === 'none') return true
  return modelPermission?.allowImport === true
}

export function canExport(modelPermission?: IModelPermission, permissionMode?: NavPermissionMode): boolean {
  if (permissionMode === 'none') return true
  return modelPermission?.allowExport === true
}

// ── 行级检查 ──

export function canDelete(row: IDataRow, permissionMode?: NavPermissionMode): boolean {
  if (permissionMode === 'none') return true
  return row._perm?.allowDelete === true
}

export function canCreateChild(row: IDataRow, permissionMode?: NavPermissionMode): boolean {
  if (permissionMode === 'none') return true
  return row._perm?.allowCreateChild === true
}

export function canEdit(row: IDataRow, permissionMode?: NavPermissionMode): boolean {
  if (permissionMode === 'none') return true
  return (row._perm?.editableFields?.length ?? 0) > 0
}

// ── 字段级检查 ──

export function isFieldVisible(field: string, row: IDataRow, permissionMode?: NavPermissionMode): boolean {
  return getFieldVisibility(field, row, permissionMode) !== FieldVisibility.Hidden
}

export function isFieldEditable(field: string, row: IDataRow, permissionMode?: NavPermissionMode): boolean {
  if (permissionMode === 'none') return true
  return row._perm?.editableFields?.includes(field) ?? false
}

export function getFieldVisibility(field: string, row: IDataRow, permissionMode?: NavPermissionMode): FieldVisibility {
  if (permissionMode === 'none') return FieldVisibility.Visible

  const perm = row._perm
  if (!perm) return FieldVisibility.Visible

  if (perm.hiddenFields?.includes(field)) {
    return permissionMode === 'masked' ? FieldVisibility.Masked : FieldVisibility.Hidden
  }
  if (perm.maskedFields?.includes(field)) return FieldVisibility.Masked
  return FieldVisibility.Visible
}

// ── 工具函数 ──

/**
 * 从 IDataSource 提取模型级权限快照。
 * 权限数据读取收口到 permission 模块，组件层不直接访问 _modelPerm。
 */
export function extractModelPermission(dataSource: { _modelPerm?: IModelPermission } | null | undefined): IModelPermission | undefined {
  return dataSource?._modelPerm
}