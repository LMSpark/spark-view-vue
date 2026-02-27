/**
 * @spark-view/spark-data/permission — 权限系统子路径导出
 */
export {
  PermissionChecker, createPermissionChecker, checkPermission,
  PermissionFilter, createPermissionFilter, filterByPermission,
  FieldRenderHelper, createFieldRenderHelper,
  computeFieldState, computeFieldStates, filterVisibleFields
} from './permission/index'

export type {
  IFieldRenderConfig, IFieldRenderState, IFieldRenderHelper
} from './permission/index'

export {
  INSTANCE_PERMISSION_FIELD,
  MODEL_PERMISSION_FIELD,
  FieldVisibility,
  ComponentLevel
} from './types'

export type {
  IInstancePermission,
  IModelPermission,
} from './types'
