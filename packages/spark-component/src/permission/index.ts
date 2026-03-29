/**
 * 权限系统模块 — 面向渲染层的权限 API
 *
 * ## 定位
 * 这里导出的是 `spark-component` 使用的权限解析与渲染 API。
 * 权限快照类型仍定义在 `@spark-view/spark-data`，但字段/动作权限的聚合与渲染辅助统一收口到组件层。
 */

export { PermissionChecker, createPermissionChecker, checkPermission } from './PermissionChecker'
export { PermissionFilter, createPermissionFilter, filterByPermission } from './PermissionFilter'
export {
  FieldRenderHelper,
  createFieldRenderHelper,
  computeFieldState,
  computeFieldStates,
  filterVisibleFields,
} from './FieldRenderHelper'
export {
  isPermittedAction,
  resolveFieldPermissionState,
  formatPermissionAwareFieldValue,
} from './PermissionResolver'

export type { IFieldRenderConfig, IFieldRenderState, IFieldRenderHelper } from './FieldRenderHelper'
export type { PermissionActionContext } from './PermissionResolver'