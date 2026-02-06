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
  createPermissionFilter,
  INSTANCE_PERMISSION_FIELD,
  MODEL_PERMISSION_FIELD
} from '@spark-view/spark-utils'
