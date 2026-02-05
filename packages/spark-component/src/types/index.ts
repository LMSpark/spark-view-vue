import type { UnwrapRef } from 'vue'

export interface AsyncState<T = unknown> {
  data?: UnwrapRef<Awaited<T>>
  loading: boolean
  error?: Error
}

export * from './spark-component.js'
export * from './common.js'
export * from './interfaces.js'

// 权限类型（从 spark-utils 选择性导出，避免冲突）
export type {
  DataRow, 
  ComponentDataSource,
  DataSet, // 向后兼容别名
  ComponentDataRow,
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
