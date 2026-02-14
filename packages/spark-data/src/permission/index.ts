/**
 * 权限系统模块
 *
 * 提供行级 / 字段级权限检查、过滤和渲染辅助
 */

// 权限检查器
export { PermissionChecker, createPermissionChecker, checkPermission, resetPermissionChecker } from './PermissionChecker'

// 权限过滤器
export { PermissionFilter, createPermissionFilter, filterByPermission, resetPermissionFilter } from './PermissionFilter'

// 字段渲染助手
export {
  FieldRenderHelper, createFieldRenderHelper, resetFieldRenderHelper,
  computeFieldState, computeFieldStates, filterVisibleFields
} from './FieldRenderHelper'

export type { IFieldRenderConfig, IFieldRenderState, IFieldRenderHelper } from './FieldRenderHelper'
