import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { SparkNode } from '../../internal'
import type { IDataRow, IDataSource, IModelPermission } from '@spark-view/spark-data'
import { usePermission } from '../../../permission/index.js'
import { isBuiltinAction } from '../../../page/actions'
import { isActionDisplayed } from '../support/actions/action-visibility'
import { mergeNodeBeforeRenderProps, resolveNodeBeforeRender } from '../../support/beforeRender.js'
import { resolveCurrentRowPath } from '../../support/row-selection-path'
import type { PermissionDeniedBehavior } from '../support/RendererActions.types'

export type LateralActionPosition = 'left' | 'right'
type ListenerMap = Record<string, unknown>
type ListenerHandler = (...args: unknown[]) => unknown
type ScopedSparkNode = SparkNode

interface UseContainerActionsOptions<TScope> {
  actionConfigs: ComputedRef<SparkNode[] | undefined>
  actionPosition: ComputedRef<LateralActionPosition | undefined>
  actionClass: ComputedRef<string | undefined>
  permissionDeniedBehavior?: ComputedRef<PermissionDeniedBehavior | undefined>
  modelPermission: ComputedRef<IModelPermission | undefined>
  dataSource?: ComputedRef<IDataSource | null | undefined>
  resolveScope: (scope: TScope) => {
    row: IDataRow | undefined
    listenerArgs: unknown[]
    scopedProps: Record<string, unknown>
  }
}

function wrapScopedHandler(handler: unknown, scopedArgs: unknown[], allowed: boolean): unknown {
  if (!allowed) {
    return (..._args: unknown[]) => undefined
  }

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
  const permissionDeniedBehaviorValue = computed<PermissionDeniedBehavior>(() => options.permissionDeniedBehavior?.value ?? 'disable')

  const showActionsLeft = computed(() => rawActionConfigs.value.length > 0 && actionPositionValue.value === 'left')
  const showActionsRight = computed(() => rawActionConfigs.value.length > 0 && actionPositionValue.value === 'right')

  function applyPermissionDisabledState(action: SparkNode, allowed: boolean): SparkNode {
    if (allowed || permissionDeniedBehaviorValue.value !== 'disable') return action
    return mergeNodeBeforeRenderProps(action, {
      disabled: true,
      buttonDisabled: true,
    })
  }

  function getScopedActionConfigs(scope: TScope): ScopedSparkNode[] {
    const resolved = options.resolveScope(scope)
    const dataSource = options.dataSource?.value ?? null
    const activeRow = resolveCurrentRowPath(resolved.row ?? null, dataSource)
    const scopedActions: Array<ScopedSparkNode | null> = rawActionConfigs.value
      .map(action => {
        const patchedAction = isBuiltinAction(action)
          ? (() => {
              const state = resolveNodeBeforeRender(action, {
                row: activeRow,
                data: resolved.scopedProps['data'] ?? activeRow,
                index: typeof resolved.scopedProps['rowIndex'] === 'number'
                  ? resolved.scopedProps['rowIndex']
                  : undefined,
                dataSource,
                modelPermission: options.modelPermission.value,
                host: {
                  type: null,
                },
              }, (message, error) => {
                if (!import.meta.env.DEV) return
                console.warn(`[useContainerActions] ${message}`, error)
              })

              if (!state.visible) return null

              return mergeNodeBeforeRenderProps(action, state.propsPatch)
            })()
          : action

        if (patchedAction === null) return null

        if (!isActionDisplayed(patchedAction)) return null

        const permissionRow = activeRow ?? undefined
        const permissionAllowed = perm.isModelActionAllowed(patchedAction, options.modelPermission.value)
          && perm.isRowActionAllowed(patchedAction, permissionRow)

        if (!permissionAllowed && permissionDeniedBehaviorValue.value === 'hide') {
          return null
        }

        const permissionPatchedAction = applyPermissionDisabledState(patchedAction, permissionAllowed)

        const listenerSource = permissionPatchedAction.props?.['on']
        const listenerMap = listenerSource !== null && listenerSource !== undefined && typeof listenerSource === 'object' && !Array.isArray(listenerSource)
          ? listenerSource as ListenerMap
          : undefined

        const wrappedOn = listenerMap
          ? Object.fromEntries(
            Object.entries(listenerMap).map(([eventName, handler]) => [eventName, wrapScopedHandler(handler, resolved.listenerArgs, permissionAllowed)])
          )
          : undefined

        const scopedAction: ScopedSparkNode = {
          ...permissionPatchedAction,
          props: {
            ...(permissionPatchedAction.props ?? {}),
            ...resolved.scopedProps,
            ...(wrappedOn ? { on: wrappedOn } : {}),
          },
        }

        return scopedAction
      })

    return scopedActions
      .filter((action): action is ScopedSparkNode => action !== null)
  }

  return {
    actionPositionValue,
    actionClassValue,
    showActionsLeft,
    showActionsRight,
    getScopedActionConfigs,
  }
}