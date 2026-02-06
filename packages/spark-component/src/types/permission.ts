// 从 spark-utils 重新导出权限相关类型和工具
export type { 
  IDataRow,
  IDataRowWithPermission,
  IDataSource,
  IModelPermission,
  IInstancePermission,
  WithInstancePermission,
  WithModelPermission,
  IPermissionChecker,
  IPermissionFilter,
  IFieldRenderConfig,
  IFieldRenderState,
  IFieldRenderHelper
} from '@spark-view/spark-utils'

export { 
  FieldVisibility, 
  ComponentLevel, 
  createPermissionChecker, 
  createPermissionFilter
} from '@spark-view/spark-utils'

// 权限字段常量（向后兼容）
export const INSTANCE_PERMISSION_FIELD = '_perm' as const
export const MODEL_PERMISSION_FIELD = '_modelPerm' as const
