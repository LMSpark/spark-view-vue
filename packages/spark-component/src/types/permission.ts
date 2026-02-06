// 从 spark-utils 导入所有权限相关类型  
export type * from '@spark-view/spark-utils'
export { 
  FieldVisibility, 
  ComponentLevel, 
  createPermissionChecker, 
  createPermissionFilter
} from '@spark-view/spark-utils'
export type { IDataSource, IDataRow, IDataRowWithPermission } from '@spark-view/spark-utils'

// 权限字段常量（向后兼容）
export const INSTANCE_PERMISSION_FIELD = '_perm' as const
export const MODEL_PERMISSION_FIELD = '_modelPerm' as const
