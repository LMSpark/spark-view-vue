/**
 * 权限系统模块 — 前端权限渲染（基于服务端统一验证架构）
 *
 * ## 架构说明
 * SPARK 采用统一后端验证，前端不做权限判定：
 * 1. 服务端在数据响应中下发权限快照（IModelPermission / IInstancePermission）+ 权限 Token
 * 2. 前端根据权限快照自动渲染 UI（字段可见性、可编辑性，以及服务端已处理值的展示）
 * 3. 数据回写时回传权限 Token，服务端校验有效性
 *
 * ## 模块组成
 * - PermissionChecker — 模型级 / 实例级 / 字段级权限检查 + 字段显示值透传
 * - PermissionFilter  — 批量行过滤（可删除行/可编辑行/可见字段）+ 可展示字段过滤
 * - FieldRenderHelper — 结合字段配置 + 权限快照计算字段读态/写态
 *
 * ⚠️ 当前模块未被业务代码消费，属于已规划的核心架构，后续开发接入。禁止删除。
 */

// 权限检查器
export { PermissionChecker, createPermissionChecker, checkPermission } from './PermissionChecker'

// 权限过滤器
export { PermissionFilter, createPermissionFilter, filterByPermission } from './PermissionFilter'

// 字段渲染助手
export {
  FieldRenderHelper, createFieldRenderHelper,
  computeFieldState, computeFieldStates, filterVisibleFields
} from './FieldRenderHelper'

export {
  isPermittedAction,
  resolveFieldPermissionState,
  formatPermissionAwareFieldValue,
} from './PermissionResolver'

export type { IFieldRenderConfig, IFieldRenderState, IFieldRenderHelper } from './FieldRenderHelper'
export type { PermissionActionContext } from './PermissionResolver'
