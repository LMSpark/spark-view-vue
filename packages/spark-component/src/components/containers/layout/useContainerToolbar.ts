import { computed, ref, watch } from 'vue'
import type { ComputedRef, Slots } from 'vue'
import type { SparkNode } from '../../internal'
import type { IDataSource, IModelPermission } from '@spark-view/spark-data'
import { usePermission } from '../../../permission/index.js'
import { isBuiltinAction } from '../../../page/actions'
import { isActionDisplayed } from '../support/actions/action-visibility'
import { wrapPermissionListeners } from '../support/actions/permission-listeners'
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

type DataSourceEventName = 'currentRowChanged' | 'selectedRowsChanged' | 'rowsChanged'

interface DataSourceEventBus {
  on(event: DataSourceEventName, handler: () => void): void
  off(event: DataSourceEventName, handler: () => void): void
}

function resolveDataSourceEventBus(dataSource: IDataSource | null | undefined): DataSourceEventBus | null {
  const candidate = dataSource as { events?: unknown } | null | undefined
  const events = candidate?.events
  if (events === null || events === undefined || typeof events !== 'object') return null

  const on = (events as { on?: unknown }).on
  const off = (events as { off?: unknown }).off
  if (typeof on !== 'function' || typeof off !== 'function') return null

  return events as DataSourceEventBus
}

export function useContainerToolbar(options: UseContainerToolbarOptions) {
  const perm = usePermission()
  const dataSourceChangeVersion = ref(0)
  const toolbarConfigs = computed(() =>
    options.toolbar.value ?? []
  )
  const toolbarPositionValue = computed<ToolbarPosition>(() =>
    options.toolbarPosition.value ?? 'top'
  )
  const toolbarClassValue = computed(() =>
    options.toolbarClass.value ?? 'renderer-toolbar-default'
  )

  watch(
    () => options.dataSource?.value,
    (dataSource, _prev, onCleanup) => {
      const events = resolveDataSourceEventBus(dataSource ?? null)
      if (!events) return

      const handleDataSourceChange = () => {
        dataSourceChangeVersion.value += 1
      }

      events.on('currentRowChanged', handleDataSourceChange)
      events.on('selectedRowsChanged', handleDataSourceChange)
      events.on('rowsChanged', handleDataSourceChange)

      onCleanup(() => {
        events.off('currentRowChanged', handleDataSourceChange)
        events.off('selectedRowsChanged', handleDataSourceChange)
        events.off('rowsChanged', handleDataSourceChange)
      })
    },
    { immediate: true },
  )

  function applyPermissionDisabledState(action: SparkNode, allowed: boolean): SparkNode {
    const patchedAction = allowed
      ? action
      : mergeNodeBeforeRenderProps(action, {
      disabled: true,
      buttonDisabled: true,
      })

    const wrappedOn = wrapPermissionListeners(patchedAction.props?.['on'], { allowed })
    if (!wrappedOn) return patchedAction

    return {
      ...patchedAction,
      props: {
        ...(patchedAction.props ?? {}),
        on: wrappedOn,
      },
    }
  }

  const visibleToolbarConfigs = computed(() =>
    {
      return toolbarConfigs.value
      .map(action => {
        const dataSource = options.dataSource?.value ?? null
        const patched = isBuiltinAction(action)
          ? (() => {
              const state = resolveNodeBeforeRender(action, {
                row: dataSource?.currentRow ?? null,
                data: dataSource?.currentRow ?? null,
                dataSource,
                modelPermission: options.modelPermission.value,
                host: {
                  type: null,
                },
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

        if (!isActionDisplayed(patched)) return null

        const currentRow = dataSource?.currentRow ?? undefined
        const allowed = perm.isModelActionAllowed(patched, options.modelPermission.value)
          && perm.isRowActionAllowed(patched, currentRow)

        return applyPermissionDisabledState(
          patched,
          allowed,
        )
      })
      .filter((action): action is SparkNode => action !== null)
    }
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