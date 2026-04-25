/**
 * 权限动作解析器 — 纯函数集
 *
 * 统一的动作级权限判断 + 字段权限状态解析。
 * 合并了动作权限相关的模型/行级判断。
 */

import type { IDataRow, IModelPermission } from '@spark-view/spark-data'
import type { NavPermissionMode } from '@spark-view/spark-utils'
import type { SparkNode } from '../core/types'
import { nodeInputProp } from '../core/types'
import { canCreate, canImport, canExport, canDelete, canCreateChild, canEdit } from './PermissionChecker'
import { computeFieldState } from './FieldRenderHelper'
import type { IFieldRenderConfig, IFieldRenderState } from './FieldRenderHelper'

// ── 动作权限上下文 ──

export interface PermissionActionContext {
  modelPermission?: IModelPermission
  row?: IDataRow | null
  permissionMode?: NavPermissionMode | undefined
}

export type PermissionActionName =
  | 'create'
  | 'import'
  | 'export'
  | 'create-child'
  | 'delete'
  | 'edit'

export type PermissionAction = PermissionActionName | (string & {})

interface ResolvedPermAction {
  action?: PermissionAction
  inferred: boolean
}

function resolveNodePermAction(node: SparkNode): ResolvedPermAction {
  const explicitPermAction = nodeInputProp(node, 'permAction')
  if (typeof explicitPermAction === 'string' && explicitPermAction.length > 0) {
    return { action: explicitPermAction, inferred: false }
  }

  const builtinAction = nodeInputProp(node, 'action') ?? nodeInputProp(node, 'builtinAction')
  if (typeof builtinAction !== 'string' || builtinAction.length === 0) return { inferred: false }

  switch (builtinAction) {
    case 'append-row':
    case 'prompt-append':
      return { action: 'create', inferred: true }
    case 'delete-row':
    case 'delete-current':
    case 'delete-selected':
      return { action: 'delete', inferred: true }
    case 'prompt-edit':
    case 'patch-row':
    case 'patch-current':
    case 'patch-selected':
    case 'move-row':
    case 'move-current':
    case 'submit-current-form':
      return { action: 'edit', inferred: true }
    default:
      return { inferred: false }
  }
}

// ── 核心动作判断 ──

function hasOwnContext<T extends object, K extends PropertyKey>(value: T, key: K): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key)
}

/**
 * 判断指定动作在权限上下文中是否被允许。
 *
 * 支持 model 级（create/import/export）和 row 级（edit/delete/create-child）动作。
 * 未注册的自定义动作默认放行。
 */
export function isPermittedAction(
  action: string | undefined,
  context: PermissionActionContext,
): boolean {
  if (action === undefined) return true

  const mode = context.permissionMode
  if (mode === 'none') return true

  const hasModelPermission = hasOwnContext(context, 'modelPermission')
  const hasRow = hasOwnContext(context, 'row')

  switch (action) {
    case 'create':
      return hasModelPermission && canCreate(context.modelPermission, mode)
    case 'import':
      return hasModelPermission && canImport(context.modelPermission, mode)
    case 'export':
      return hasModelPermission && canExport(context.modelPermission, mode)
    case 'create-child':
      return (hasModelPermission ? canCreate(context.modelPermission, mode) : true)
        && (hasRow ? !!context.row && canCreateChild(context.row, mode) : true)
    case 'delete':
      return hasRow && !!context.row && canDelete(context.row, mode)
    case 'edit':
      return hasRow && !!context.row && canEdit(context.row, mode)
    default:
      return true
  }
}

// ── 字段权限状态解析 ──

export function resolveFieldPermissionState(
  field: string | undefined,
  row: IDataRow | null | undefined,
  config: Omit<IFieldRenderConfig, 'field'> = {},
  permissionMode?: NavPermissionMode,
): IFieldRenderState | null {
  if (!field || !row) return null
  return computeFieldState({ field, ...config }, row, permissionMode)
}

// ── SparkNode 动作分类 + 判断 ──

/** 是否为模型级权限动作（create/import/export/create-child） */
export function isModelScopedPermAction(action: string | undefined): boolean {
  return action === 'create' || action === 'import' || action === 'export' || action === 'create-child'
}

/** 是否为行级权限动作（edit/delete/create-child） */
export function isRowScopedPermAction(action: string | undefined): boolean {
  return action === 'edit' || action === 'delete' || action === 'create-child'
}

/** 判断 SparkNode 的模型级动作（create/import/export）是否被权限允许 */
export function isModelActionAllowed(action: SparkNode, modelPerm: IModelPermission | undefined, permissionMode?: NavPermissionMode): boolean {
  const permAction = resolveNodePermAction(action).action
  if (!isModelScopedPermAction(permAction)) return true
  return isPermittedAction(permAction, modelPerm ? { modelPermission: modelPerm, permissionMode } : { permissionMode })
}

/** 判断 SparkNode 的行级动作（edit/delete/create-child）是否被权限允许 */
export function isRowActionAllowed(action: SparkNode, row: IDataRow | undefined, permissionMode?: NavPermissionMode): boolean {
  const resolvedPermAction = resolveNodePermAction(action)
  const permAction = resolvedPermAction.action
  if (!isRowScopedPermAction(permAction)) return true

  // 对“推断得到的”行权限动作做宽松处理：
  // 如果后端没有返回 row._perm 快照，则不强制禁用，避免把无权限数据模型的旧页面全部锁死。
  if (resolvedPermAction.inferred && row?._perm === undefined) return true

  return isPermittedAction(permAction, { row: row ?? null, permissionMode })
}