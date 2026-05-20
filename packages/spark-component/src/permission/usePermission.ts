/**
 * usePermission — 权限 API composable
 *
 * 统一封装 PAGE_PERMISSION_MODE 能力消费 + 权限判断/字段状态。
 * 消费方只需调用本 composable 返回的方法，无需自行 sparkConsume 权限模式。
 *
 * 设计原则：
 * - permissionMode 由后端随导航配置下发，PageRenderer 通过 sparkProvide 注入
 * - 前端权限仅为渲染层表现，真正安全由后端控制
 * - 所有权限判断收口到本模块，方便统一维护
 */
import type { DataRow, ModelPermission } from '@spark-view/spark-data'
import type { NavPermissionMode } from '../core/capability-keys.js'
import type { SparkNode } from '../core/types'
import { useSparkConsume } from '../core/useSparkComponent'
import { PAGE_PERMISSION_MODE } from '../core/capability-keys.js'
import {
  isPermittedAction,
  resolveFieldPermissionState,
  isModelActionAllowed,
  isRowActionAllowed,
} from './PermissionResolver'
import type { PermissionAction, PermissionActionContext } from './PermissionResolver'
import type { FieldRenderConfig, FieldRenderState } from './FieldRenderHelper'

export type UsePermissionReturn = {
  /** 当前页面权限模式（后端下发），undefined 表示能力未注入；渲染器默认提供 'masked'。 */
  readonly permissionMode: NavPermissionMode | undefined

  /** 判断动作是否被权限允许 */
  isPermitted(action: PermissionAction | undefined, context?: Omit<PermissionActionContext, 'permissionMode'>): boolean

  /** 判断模型级动作（create/import/export）是否允许 */
  isModelActionAllowed(action: SparkNode, modelPerm: ModelPermission | undefined): boolean

  /** 判断行级动作（edit/delete/create-child）是否允许 */
  isRowActionAllowed(action: SparkNode, row: DataRow | undefined): boolean

  /** 解析字段权限状态（可见性 + 可编辑性） */
  resolveFieldState(
    field: string | undefined,
    row: DataRow | null | undefined,
    config?: Omit<FieldRenderConfig, 'field'>,
  ): FieldRenderState | null

}

/**
 * 权限 API composable — 在 Vue 组件 setup 中调用。
 *
 * 内部自动消费 PAGE_PERMISSION_MODE 能力，返回绑定了当前模式的权限 API。
 */
export function usePermission(): UsePermissionReturn {
  const { sparkConsume } = useSparkConsume()
  const mode = sparkConsume(PAGE_PERMISSION_MODE) ?? undefined

  return {
    get permissionMode() { return mode },

    isPermitted(action, context) {
      return isPermittedAction(action, { ...context, permissionMode: mode })
    },

    isModelActionAllowed(action, modelPerm) {
      return isModelActionAllowed(action, modelPerm, mode)
    },

    isRowActionAllowed(action, row) {
      return isRowActionAllowed(action, row, mode)
    },

    resolveFieldState(field, row, config) {
      return resolveFieldPermissionState(field, row, config ?? {}, mode)
    },
  }
}
