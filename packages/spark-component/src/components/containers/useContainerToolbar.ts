import { computed } from 'vue'
import type { ComputedRef, Slots } from 'vue'
import type { SparkNode } from '../internal'
import type { IModelPermission } from '@spark-view/spark-data'
import { isActionDisplayed, isModelActionAllowed } from './action-permission'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right'
// 注意：工具栏的展示权限通常只受模型权限控制，不涉及行权限，因为它们一般不直接作用于某一行数据。
interface UseContainerToolbarOptions {
  toolbar: ComputedRef<SparkNode[] | undefined>
  toolbarPosition: ComputedRef<ToolbarPosition | undefined>
  toolbarClass: ComputedRef<string | undefined>
  modelPermission: ComputedRef<IModelPermission | undefined>
  slots?: Slots
}

// ── 组合式函数 ───────────────────────────────────────────────────────────────

export function useContainerToolbar(options: UseContainerToolbarOptions) {
  const toolbarConfigs = computed(() =>
    options.toolbar.value ?? []
  )
  const toolbarPositionValue = computed<ToolbarPosition>(() =>
    options.toolbarPosition.value ?? 'top'
  )
  const toolbarClassValue = computed(() =>
    options.toolbarClass.value ?? ''
  )

  // 仅保留“显示上可见”且“模型权限允许”的工具栏动作。
  const visibleToolbarConfigs = computed(() =>
    toolbarConfigs.value.filter(action => isActionDisplayed(action) && isModelActionAllowed(action, options.modelPermission.value))
  )

  // 即使没有配置动作，只要存在 toolbar 插槽，也应视为工具栏可见。
  const hasToolbar = computed(() => visibleToolbarConfigs.value.length > 0)
  const hasToolbarSlot = computed(() => options.slots?.['toolbar'] !== undefined)
  const showToolbar = computed(() => hasToolbar.value || hasToolbarSlot.value)

  return {
    toolbarPositionValue,
    toolbarClassValue,
    visibleToolbarConfigs,
    hasToolbar,
    showToolbar,
  }
}