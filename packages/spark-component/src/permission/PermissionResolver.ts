/**
 * 权限动作解析器 — 纯函数集
 *
 * 统一的动作级权限判断 + 字段权限状态解析。
 * 合并了动作权限相关的模型/行级判断。
 */

import type { DataRow, ModelPermission } from '@spark-view/spark-data'
import type { NavPermissionMode } from '../core/capability-keys.js'
import type { SparkNode } from '../core/types'
import { nodeInputProp } from '../core/types'
import { canCreate, canImport, canExport, canDelete, canCreateChild, canEdit } from './PermissionChecker'
import { computeFieldState } from './FieldRenderHelper'
import type { FieldRenderConfig, FieldRenderState } from './FieldRenderHelper'

// ── 动作权限上下文 ──

export type PermissionActionContext = {
  modelPermission?: ModelPermission
  row?: DataRow | null
  permissionMode?: NavPermissionMode | undefined}

export type PermissionActionName =
  | 'create'
  | 'import'
  | 'export'
  | 'create-child'
  | 'delete'
  | 'edit'

export type PermissionAction = PermissionActionName | (string & {})

type ResolvedPermAction = {
  action?: PermissionAction}

function resolveNodePermAction(node: SparkNode): ResolvedPermAction {
  const explicitPermAction = nodeInputProp(node, 'permAction')
  if (typeof explicitPermAction === 'string' && explicitPermAction.length > 0) {
    return { action: explicitPermAction }
  }

  const builtinAction = nodeInputProp(node, 'action')
  if (typeof builtinAction !== 'string' || builtinAction.length === 0) return {}

  switch (builtinAction) {
    case 'append-row':
    case 'prompt-append':
      return { action: 'create' }
    case 'delete-row':
    case 'delete-current':
    case 'delete-selected':
      return { action: 'delete' }
    case 'prompt-edit':
    case 'patch-row':
    case 'patch-current':
    case 'patch-selected':
    case 'move-row':
    case 'move-current':
    case 'submit-current-form':
      return { action: 'edit' }
    default:
      return {}
  }
}

// ── 核心动作判断 ──

/**
 * 判断指定动作在权限上下文中是否被允许。
 *
 * 语义：effective = max(基线允许, 权限快照)。缺少快照 = 基线允许。
 * 仅当快照显式禁止（如 _modelPerm.allowCreate === false / _perm.allowDelete === false /
 * editableFields=[]）时才拒绝。
 */
export function isPermittedAction(
  action: PermissionAction | undefined,
  context: PermissionActionContext,
): boolean {
  if (action === undefined) return true

  const mode = context.permissionMode
  if (mode === 'none') return true

  const row = context.row ?? null

  switch (action) {
    case 'create':
      return canCreate(context.modelPermission, mode)
    case 'import':
      return canImport(context.modelPermission, mode)
    case 'export':
      return canExport(context.modelPermission, mode)
    case 'create-child':
      return canCreate(context.modelPermission, mode)
        && (row ? canCreateChild(row, mode) : true)
    case 'delete':
      return row ? canDelete(row, mode) : true
    case 'edit':
      return row ? canEdit(row, mode) : true
    default:
      return true
  }
}

// ── 字段权限状态解析 ──

export function resolveFieldPermissionState(
  field: string | undefined,
  row: DataRow | null | undefined,
  config: Omit<FieldRenderConfig, 'field'> = {},
  permissionMode?: NavPermissionMode,
): FieldRenderState | null {
  if (!field || !row) return null
  return computeFieldState({ field, ...config }, row, permissionMode)
}

// ── SparkNode 动作分类 + 判断 ──

/** 是否为模型级权限动作（create/import/export/create-child） */
export function isModelScopedPermAction(action: PermissionAction | undefined): boolean {
  return action === 'create' || action === 'import' || action === 'export' || action === 'create-child'
}

/** 是否为行级权限动作（edit/delete/create-child） */
export function isRowScopedPermAction(action: PermissionAction | undefined): boolean {
  return action === 'edit' || action === 'delete' || action === 'create-child'
}

/** 判断 SparkNode 的模型级动作（create/import/export）是否被权限允许 */
export function isModelActionAllowed(action: SparkNode, modelPerm: ModelPermission | undefined, permissionMode?: NavPermissionMode): boolean {
  const permAction = resolveNodePermAction(action).action
  if (!isModelScopedPermAction(permAction)) return true
  return isPermittedAction(permAction, modelPerm ? { modelPermission: modelPerm, permissionMode } : { permissionMode })
}

/** 判断 SparkNode 的行级动作（edit/delete/create-child）是否被权限允许 */
export function isRowActionAllowed(action: SparkNode, row: DataRow | undefined, permissionMode?: NavPermissionMode): boolean {
  const permAction = resolveNodePermAction(action).action
  if (!isRowScopedPermAction(permAction)) return true

  return isPermittedAction(permAction, { row: row ?? null, permissionMode })
}