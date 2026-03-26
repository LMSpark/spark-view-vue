import { computed } from 'vue'
import type { ComputedRef, Slots } from 'vue'
import type { SparkNode } from '../../internal'
import type { IModelPermission } from '@spark-view/spark-data'
import { isActionDisplayed, isModelActionAllowed } from '../action-permission'

export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right'

interface UseContainerToolbarOptions {
  toolbar: ComputedRef<SparkNode[] | undefined>
  toolbarPosition: ComputedRef<ToolbarPosition | undefined>
  toolbarClass: ComputedRef<string | undefined>
  modelPermission: ComputedRef<IModelPermission | undefined>
  slots?: Slots
}

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

  const visibleToolbarConfigs = computed(() =>
    toolbarConfigs.value.filter(action => isActionDisplayed(action) && isModelActionAllowed(action, options.modelPermission.value))
  )

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