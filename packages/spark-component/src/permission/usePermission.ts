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
import type { IDataRow, IModelPermission } from '@spark-view/spark-data'
import type { NavPermissionMode } from '@spark-view/spark-utils'
import type { SparkNode } from '../core/types'
import { useSparkConsume } from '../core/useSparkComponent'
import { PAGE_PERMISSION_MODE } from './page-permission-mode'
import {
  isPermittedAction,
  resolveFieldPermissionState,
  isModelActionAllowed as _isModelActionAllowed,
  isRowActionAllowed as _isRowActionAllowed,
} from './PermissionResolver'
import type { PermissionActionContext } from './PermissionResolver'
import type { IFieldRenderConfig, IFieldRenderState } from './FieldRenderHelper'

export interface UsePermissionReturn {
  /** 当前页面权限模式（后端下发），undefined 表示未提供（等效 'masked'） */
  readonly permissionMode: NavPermissionMode | undefined

  /** 判断动作是否被权限允许 */
  isPermitted(action: string | undefined, context?: Omit<PermissionActionContext, 'permissionMode'>): boolean

  /** 判断模型级动作（create/import/export）是否允许 */
  isModelActionAllowed(action: SparkNode, modelPerm: IModelPermission | undefined): boolean

  /** 判断行级动作（edit/delete/create-child）是否允许 */
  isRowActionAllowed(action: SparkNode, row: IDataRow | undefined): boolean

  /** 解析字段权限状态（可见性 + 可编辑性） */
  resolveFieldState(
    field: string | undefined,
    row: IDataRow | null | undefined,
    config?: Omit<IFieldRenderConfig, 'field'>,
  ): IFieldRenderState | null

  /** 格式化字段显示值（脱敏值由服务端直接返回，本方法仅应用自定义 formatter） */
  formatFieldValue(
    field: string | undefined,
    value: unknown,
    row: IDataRow | null | undefined,
    formatDisplay?: (value: unknown) => string,
  ): string
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
      return _isModelActionAllowed(action, modelPerm, mode)
    },

    isRowActionAllowed(action, row) {
      return _isRowActionAllowed(action, row, mode)
    },

    resolveFieldState(field, row, config) {
      return resolveFieldPermissionState(field, row, config ?? {}, mode)
    },

    formatFieldValue(_field, value, _row, formatDisplay) {
      const formatter = formatDisplay ?? ((v: unknown) => String(v ?? ''))
      return formatter(value)
    },
  }
}
