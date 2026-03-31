import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { SparkNode } from '../../internal'
import type { IDataRow, IDataSource, IModelPermission } from '@spark-view/spark-data'
import { usePermission } from '../../../permission/index.js'
import { isActionDisplayed } from '../action-permission'
import { isBuiltinAction } from '../builtin-actions'
import { mergeNodeBeforeRenderProps, resolveNodeBeforeRender } from '../../support/beforeRender.js'

export type LateralActionPosition = 'left' | 'right'
type ListenerMap = Record<string, unknown>
type ListenerHandler = (...args: unknown[]) => unknown
type ScopedSparkNode = SparkNode

interface UseContainerActionsOptions<TScope> {
  actionConfigs: ComputedRef<SparkNode[] | undefined>
  actionPosition: ComputedRef<LateralActionPosition | undefined>
  actionClass: ComputedRef<string | undefined>
  modelPermission: ComputedRef<IModelPermission | undefined>
  dataSource?: ComputedRef<IDataSource | null | undefined>
  resolveScope: (scope: TScope) => {
    row: IDataRow | undefined
    listenerArgs: unknown[]
    scopedProps: Record<string, unknown>
  }
}

function wrapScopedHandler(handler: unknown, scopedArgs: unknown[]): unknown {
  if (typeof handler === 'function') {
    return (...args: unknown[]) => (handler as ListenerHandler)(...scopedArgs, ...args)
  }
  if (Array.isArray(handler)) {
    return (...args: unknown[]) => {
      for (const item of handler) {
        if (typeof item === 'function') {
          ;(item as ListenerHandler)(...scopedArgs, ...args)
        }
      }
    }
  }
  return handler
}

export function useContainerActions<TScope>(options: UseContainerActionsOptions<TScope>) {
  const perm = usePermission()
  const rawActionConfigs = computed(() => options.actionConfigs.value ?? [])
  const actionPositionValue = computed<LateralActionPosition>(() => options.actionPosition.value ?? 'right')
  const actionClassValue = computed(() => options.actionClass.value ?? '')

  const showActionsLeft = computed(() => rawActionConfigs.value.length > 0 && actionPositionValue.value === 'left')
  const showActionsRight = computed(() => rawActionConfigs.value.length > 0 && actionPositionValue.value === 'right')

  function getScopedActionConfigs(scope: TScope): ScopedSparkNode[] {
    const resolved = options.resolveScope(scope)
    const dataSource = options.dataSource?.value ?? null
    const scopedActions: Array<ScopedSparkNode | null> = rawActionConfigs.value
      .map(action => {
        const patchedAction = isBuiltinAction(action)
          ? (() => {
              const state = resolveNodeBeforeRender(action, {
                row: resolved.row ?? null,
                data: resolved.scopedProps['data'] ?? resolved.row ?? null,
                index: typeof resolved.scopedProps['rowIndex'] === 'number'
                  ? resolved.scopedProps['rowIndex']
                  : (typeof resolved.scopedProps['$index'] === 'number' ? resolved.scopedProps['$index'] : undefined),
                dataSource,
                modelPermission: options.modelPermission.value,
                parentType: null,
              }, (message, error) => {
                if (!import.meta.env.DEV) return
                console.warn(`[useContainerActions] ${message}`, error)
              })

              if (!state.visible) return null

              return mergeNodeBeforeRenderProps(action, state.propsPatch, {
                mirrorDisabledToButtonDisabled: true,
              })
            })()
          : action

        if (patchedAction === null) return null

        if (!(isActionDisplayed(patchedAction)
          && perm.isModelActionAllowed(patchedAction, options.modelPermission.value)
          && perm.isRowActionAllowed(patchedAction, resolved.row))) {
          return null
        }

        const currentOn = patchedAction.props?.['on']
        const legacyOn = (patchedAction as SparkNode & { on?: unknown }).on
        const listenerSource = currentOn ?? legacyOn
        const listenerMap = listenerSource !== null && listenerSource !== undefined && typeof listenerSource === 'object' && !Array.isArray(listenerSource)
          ? listenerSource as ListenerMap
          : undefined

        const wrappedOn = listenerMap
          ? Object.fromEntries(
            Object.entries(listenerMap).map(([eventName, handler]) => [eventName, wrapScopedHandler(handler, resolved.listenerArgs)])
          )
          : undefined

        const scopedAction: ScopedSparkNode = {
          ...patchedAction,
          props: {
            ...(patchedAction.props ?? {}),
            ...resolved.scopedProps,
            ...(wrappedOn ? { on: wrappedOn } : {}),
          },
        }

        return scopedAction
      })

    return scopedActions.filter((action): action is ScopedSparkNode => action !== null)
  }

  return {
    actionPositionValue,
    actionClassValue,
    showActionsLeft,
    showActionsRight,
    getScopedActionConfigs,
  }
}