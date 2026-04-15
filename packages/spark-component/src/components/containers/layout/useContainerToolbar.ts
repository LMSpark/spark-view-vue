import { computed } from 'vue'
import type { ComputedRef, Slots } from 'vue'
import type { SparkNode } from '../../internal'
import type { IDataSource, IModelPermission } from '@spark-view/spark-data'
import { usePermission } from '../../../permission/index.js'
import { isActionDisplayed } from '../action-permission'
import { isBuiltinAction } from '../builtin-action-meta'
import { mergeNodeBeforeRenderProps, resolveNodeBeforeRender } from '../../support/beforeRender.js'

export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right'

interface UseContainerToolbarOptions {
  toolbar: ComputedRef<SparkNode[] | undefined>
  toolbarPosition: ComputedRef<ToolbarPosition | undefined>
  toolbarClass: ComputedRef<string | undefined>
  modelPermission: ComputedRef<IModelPermission | undefined>
  dataSource?: ComputedRef<IDataSource | null | undefined>
  slots?: Slots
}

export function useContainerToolbar(options: UseContainerToolbarOptions) {
  const perm = usePermission()
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
    toolbarConfigs.value
      .map(action => {
        const patched = isBuiltinAction(action)
          ? (() => {
              const dataSource = options.dataSource?.value ?? null
              const state = resolveNodeBeforeRender(action, {
                row: dataSource?.currentRow ?? null,
                data: dataSource?.currentRow ?? null,
                dataSource,
                modelPermission: options.modelPermission.value,
                parentType: null,
              }, (message, error) => {
                if (!import.meta.env.DEV) return
                console.warn(`[useContainerToolbar] ${message}`, error)
              })

              if (!state.visible) return null

              return mergeNodeBeforeRenderProps(action, state.propsPatch, {
                mirrorDisabledToButtonDisabled: true,
              })
            })()
          : action

        if (patched === null) return null

        return isActionDisplayed(patched) && perm.isModelActionAllowed(patched, options.modelPermission.value)
          ? patched
          : null
      })
      .filter((action): action is SparkNode => action !== null)
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