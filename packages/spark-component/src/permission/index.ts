/**
 * 权限系统导出入口
 */

// 类型导出
export type * from '../types/permission'

// 工具类导出
export { PermissionChecker, createPermissionChecker, checkPermission } from './PermissionChecker'
export { PermissionFilter, createPermissionFilter, filterByPermission } from './PermissionFilter'

// 常量导出
export {
  DEFAULT_PERMISSION,
  DEFAULT_FIELD_PERMISSION,
  DEFAULT_INSTANCE_PERMISSION
} from '../types/permission'
