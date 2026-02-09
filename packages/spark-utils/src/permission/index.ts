/**
 * 权限系统模块
 *
 * 提供统一的权限检查、过滤和管理功能
 * 支持实例级、模型级和字段级的权限控制
 *
 * @packageDocumentation
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 权限检查器
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 权限检查器：检查单个数据项的权限 */
export { PermissionChecker, createPermissionChecker, checkPermission, resetPermissionChecker } from './PermissionChecker'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 权限过滤器
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 权限过滤器：批量过滤和处理数据 */
export { PermissionFilter, createPermissionFilter, filterByPermission, resetPermissionFilter } from './PermissionFilter'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 字段渲染助手
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 字段渲染助手：处理字段的可见性、编辑性和脱敏 */
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 权限类型和接口
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 权限枚举类型 */
export {
  FieldVisibility,
  ComponentLevel
} from '../data-types'

/** 权限相关类型定义 */
export type {
  IPermissionChecker,
  IPermissionFilter,
  IInstancePermission,
  IModelPermission,
  WithInstancePermission,
  WithModelPermission
} from '../data-types'