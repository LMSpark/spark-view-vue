// 核心类型导出
export * from './spark-component.js'
export * from './common.js'

// 权限类型（从 spark-utils 选择性导出，避免冲突）
export type {
  IDataRow,
  IDataRowWithPermission,
  IDataSource,
  IPermissionChecker,
  IPermissionFilter
} from './permission.js'

export {
  FieldVisibility,
  ComponentLevel,
  createPermissionChecker,
  createPermissionFilter,
  INSTANCE_PERMISSION_FIELD,
  MODEL_PERMISSION_FIELD
} from './permission.js'
