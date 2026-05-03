/**
 * 权限检查器 — 纯函数集
 *
 * 提供模型级、实例级和字段级的权限验证。
 * 字段脱敏规则也统一收口于此，避免权限判断分散在 data 层与组件层。
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

// 语义：基线允许，仅在权限快照显式禁止时才拒绝（与 spark-data PermissionChecker 一致）。
// 即 effective = max(baseline=true, snapshot)；缺省/未声明 = 允许。

export function canCreate(modelPermission?: IModelPermission, permissionMode?: NavPermissionMode): boolean {
  if (permissionMode === 'none') return true
  return modelPermission?.allowCreate !== false
}

export function canImport(modelPermission?: IModelPermission, permissionMode?: NavPermissionMode): boolean {
  if (permissionMode === 'none') return true
  return modelPermission?.allowImport !== false
}

export function canExport(modelPermission?: IModelPermission, permissionMode?: NavPermissionMode): boolean {
  if (permissionMode === 'none') return true
  return modelPermission?.allowExport !== false
}

// ── 行级检查 ──

export function canDelete(row: IDataRow, permissionMode?: NavPermissionMode): boolean {
  if (permissionMode === 'none') return true
  return row._perm?.allowDelete !== false
}

export function canCreateChild(row: IDataRow, permissionMode?: NavPermissionMode): boolean {
  if (permissionMode === 'none') return true
  return row._perm?.allowCreateChild !== false
}

export function canEdit(row: IDataRow, permissionMode?: NavPermissionMode): boolean {
  if (permissionMode === 'none') return true
  // 未声明 editableFields → 基线允许；声明了空数组 → 显式禁止。
  if (!row._perm?.editableFields) return true
  return row._perm.editableFields.length > 0
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

export function maskFieldValue(
  field: string,
  value: unknown,
  row: IDataRow,
  permissionMode?: NavPermissionMode,
): string {
  if (permissionMode === 'none') {
    return String(value ?? '')
  }
  if (getFieldVisibility(field, row, permissionMode) !== FieldVisibility.Masked) {
    return String(value ?? '')
  }
  return defaultMaskRule(field, value)
}

function defaultMaskRule(field: string, value: unknown): string {
  if (value === null || value === undefined) return ''

  const text = String(value)
  const normalizedField = field.toLowerCase()

  if ((normalizedField.includes('phone') || normalizedField.includes('mobile')) && text.length === 11) {
    return `${text.substring(0, 3)}****${text.substring(7)}`
  }

  if ((normalizedField.includes('idcard') || normalizedField.includes('idno')) && text.length === 18) {
    return `${text.substring(0, 3)}***********${text.substring(14)}`
  }

  if (normalizedField.includes('email')) {
    const atIndex = text.indexOf('@')
    if (atIndex > 3) {
      return `${text.substring(0, 3)}***${text.substring(atIndex)}`
    }
  }

  if ((normalizedField.includes('bank') || normalizedField.includes('card')) && text.length >= 16) {
    return `${text.substring(0, 4)} **** **** ${text.substring(text.length - 4)}`
  }

  return text.length > 4
    ? `${text.substring(0, 2)}***${text.substring(text.length - 2)}`
    : '***'
}

// ── 工具函数 ──

/**
 * 任何携带模型级权限快照的数据源形状。
 * DataView / IDataSource 均满足此约束。
 */
export interface ModelPermissionSource {
  _modelPerm?: IModelPermission
}

/**
 * 从数据源提取模型级权限快照。
 * 权限数据读取收口到 permission 模块，组件层不直接访问 _modelPerm。
 */
export function extractModelPermission(dataSource: ModelPermissionSource | null | undefined): IModelPermission | undefined {
  return dataSource?._modelPerm
}