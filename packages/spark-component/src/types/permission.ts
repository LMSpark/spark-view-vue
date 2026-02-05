// 从 spark-utils 导入所有权限相关类型  
export type * from '@spark-view/spark-utils'
export { 
  FieldVisibility, 
  ComponentLevel, 
  createPermissionChecker, 
  createPermissionFilter
} from '@spark-view/spark-utils'
export type { ComponentDataSource } from '@spark-view/spark-utils'

// 权限字段常量（向后兼容）
export const INSTANCE_PERMISSION_FIELD = '_perm' as const
export const MODEL_PERMISSION_FIELD = '_modelPerm' as const

// 重新导入需要的类型以避免编译错误
import type { ComponentDataSource } from '@spark-view/spark-utils'

// 向后兼容的类型别名
export type { ComponentDataRow as DataRow } from '@spark-view/spark-utils'

// 向后兼容的类型别名（保留以避免破坏性变更）
export type DataSet = ComponentDataSource
