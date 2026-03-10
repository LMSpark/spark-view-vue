import { computed } from 'vue'
import type { ComputedRef, Slots } from 'vue'
import type { ComponentConfig } from '@spark-view/spark-component'
import type { IModelPermission } from '@spark-view/spark-data'
import { isActionDisplayed, isModelActionAllowed } from './action-permission'

export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right'

interface UseContainerToolbarOptions {
  config: ComputedRef<ComponentConfig | undefined>
  toolbar: ComputedRef<ComponentConfig[] | undefined>
  toolbarPosition: ComputedRef<ToolbarPosition | undefined>
  toolbarClass: ComputedRef<string | undefined>
  modelPermission: ComputedRef<IModelPermission | undefined>
  slots?: Slots
}

export function useContainerToolbar(options: UseContainerToolbarOptions) {
  const toolbarConfigs = computed(() =>
    options.toolbar.value ?? (options.config.value?.props?.['toolbar'] as ComponentConfig[] | undefined) ?? []
  )
  const toolbarPositionValue = computed<ToolbarPosition>(() =>
    (options.config.value?.props?.['toolbarPosition'] as ToolbarPosition | undefined) ?? options.toolbarPosition.value ?? 'top'
  )
  const toolbarClassValue = computed(() =>
    (options.config.value?.props?.['toolbarClass'] as string | undefined) ?? options.toolbarClass.value ?? ''
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