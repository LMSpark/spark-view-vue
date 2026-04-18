import { computed } from 'vue'
import type { ComputedRef, Slots } from 'vue'
import type { SparkNode } from '../../internal'
import type { IDataSource, IModelPermission } from '@spark-view/spark-data'
import { usePermission } from '../../../permission/index.js'
import { isActionDisplayed } from '../support/actions/action-visibility'
import { isBuiltinAction } from '../support/actions/builtin-action-meta'
import { mergeNodeBeforeRenderProps, resolveNodeBeforeRender } from '../../support/beforeRender.js'

type ListenerMap = Record<string, unknown>

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
    options.toolbarClass.value ?? 'renderer-toolbar-default'
  )

  function wrapPermissionGuardedHandler(handler: unknown, allowed: boolean): unknown {
    if (allowed) return handler
    return (..._args: unknown[]) => undefined
  }

  function readListenerMap(action: SparkNode): ListenerMap | undefined {
    const listenerSource = action.props?.['on']
    return listenerSource !== null && listenerSource !== undefined && typeof listenerSource === 'object' && !Array.isArray(listenerSource)
      ? listenerSource as ListenerMap
      : undefined
  }

  function applyPermissionDisabledState(action: SparkNode, allowed: boolean): SparkNode {
    const patchedAction = allowed
      ? action
      : mergeNodeBeforeRenderProps(action, {
      disabled: true,
      buttonDisabled: true,
      })

    const listenerMap = readListenerMap(patchedAction)
    if (!listenerMap) return patchedAction

    return {
      ...patchedAction,
      props: {
        ...(patchedAction.props ?? {}),
        on: Object.fromEntries(
          Object.entries(listenerMap).map(([eventName, handler]) => [
            eventName,
            wrapPermissionGuardedHandler(handler, allowed),
          ])
        ),
      },
    }
  }

  const visibleToolbarConfigs = computed(() =>
    toolbarConfigs.value
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