/**
 * 权限系统模块
 * 
 * 提供统一的权限检查、过滤和管理功能
 */

// 权限检查器  
export { PermissionChecker, createPermissionChecker, checkPermission } from './PermissionChecker'

// 权限过滤器
export { PermissionFilter, createPermissionFilter, filterByPermission } from './PermissionFilter'

// 字段渲染助手
export {
  FieldRenderHelper,
  createFieldRenderHelper,
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
export type {
  FieldVisibility,
  ComponentLevel,
  IPermissionChecker,
  IPermissionFilter,
  IInstancePermission,
  IModelPermission,
  WithInstancePermission,
  WithModelPermission
} from '../data-types'