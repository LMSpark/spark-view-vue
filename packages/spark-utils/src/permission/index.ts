/**
 * 权限系统模块
 * 
 * 提供统一的权限检查、过滤和管理功能
 */

// 权限检查器  
export { PermissionChecker, createPermissionChecker, checkPermission, resetPermissionChecker } from './PermissionChecker'

// 权限过滤器
export { PermissionFilter, createPermissionFilter, filterByPermission, resetPermissionFilter } from './PermissionFilter'

// 字段渲染助手
export {
  FieldRenderHelper,
  createFieldRenderHelper,
  resetFieldRenderHelper,
  computeFieldState,
  computeFieldStates,
  filterVisibleFields
} from './FieldRenderHelper'

export type {
  IFieldRenderConfig,
  IFieldRenderState,
  IFieldRenderHelper
} from './FieldRenderHelper'

// 权限类型和接口（从 data-types 重新导出）
export {
  FieldVisibility,
  ComponentLevel
} from '../data-types'

export type {
  IPermissionChecker,
  IPermissionFilter,
  IInstancePermission,
  IModelPermission,
  WithInstancePermission,
  WithModelPermission
} from '../data-types'