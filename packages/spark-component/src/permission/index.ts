/**
 * 权限系统模块 — 权限数据的唯一消费者
 *
 * ## 定位
 * 页面权限模型 + 权限解析/渲染 API 统一收口于此。
 * 权限快照类型仍定义在 `@spark-view/spark-data`，但所有权限数据消费、字段/动作权限判断均在本模块内。
 *
 * ## 设计原则
 * - 纯函数优先：所有权限检查/过滤/字段状态计算均为纯函数，无类实例、无单例
 * - usePermission 是唯一的 Vue composable 桥接，内部消费 PAGE_PERMISSION_MODE 能力
 * - 其他 composable 只能通过 usePermission() 访问权限数据，不允许直接 sparkConsume 权限能力
 */

// ── 页面权限模型（能力键，仅 SparkPageRenderer 应 import） ──
export { PAGE_PERMISSION_MODE } from '../core/capability-keys.js'

// ── 权限检查纯函数 ──
export {
  canCreate, canImport, canExport,
  canDelete, canCreateChild, canEdit,
  isFieldVisible, isFieldEditable, getFieldVisibility,
  maskFieldValue,
  extractModelPermission,
} from './PermissionChecker'
export type { ModelPermissionSource } from './PermissionChecker'

// ── 权限过滤纯函数 ──
export {
  filterDeletableRows, filterEditableRows,
  filterFields, getEditableFields, getVisibleFields,
  filterDisplayableFields,
} from './PermissionFilter'

// ── 字段渲染状态 ──
export { computeFieldState } from './FieldRenderHelper'

// ── 动作权限解析 ──
export {
  isPermittedAction, resolveFieldPermissionState,
  isModelScopedPermAction, isRowScopedPermAction,
  isModelActionAllowed, isRowActionAllowed,
} from './PermissionResolver'

// ── Vue composable 桥接 ──
export { usePermission } from './usePermission'

// ── 类型 ──
export type { FieldRenderConfig, FieldRenderState } from './FieldRenderHelper'
export type { PermissionAction, PermissionActionContext, PermissionActionName } from './PermissionResolver'
export type { UsePermissionReturn } from './usePermission'