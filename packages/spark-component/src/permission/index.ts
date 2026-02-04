/**
 * 权限系统导出入口
 */

// 类型导出
export type * from '../types/permission'

// 工具类导出
export { PermissionChecker, createPermissionChecker, checkPermission } from './PermissionChecker'
export { PermissionFilter, createPermissionFilter, filterByPermission } from './PermissionFilter'
export { 
  FieldRenderHelper, 
  createFieldRenderHelper, 
  computeFieldState,
  computeFieldStates,
  filterVisibleFields
} from './FieldRenderHelper'

// 常量导出
export {
  DEFAULT_PERMISSION
} from '../types/permission'
