import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { ComponentConfig } from '@spark-view/spark-component'
import type { IDataRow, IModelPermission } from '@spark-view/spark-data'
import { isActionDisplayed, isModelActionAllowed, isRowActionAllowed } from './action-permission'

export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right'
export type LateralActionPosition = 'left' | 'right'
type ListenerMap = Record<string, unknown>
type ListenerHandler = (...args: unknown[]) => unknown
export type ScopedComponentConfig = ComponentConfig & { on?: ListenerMap }

interface UseContainerActionsOptions<TScope> {
  config: ComputedRef<ComponentConfig | undefined>
  toolbar: ComputedRef<ComponentConfig[] | undefined>
  toolbarPosition: ComputedRef<ToolbarPosition | undefined>
  toolbarClass: ComputedRef<string | undefined>
  actionConfigs: ComputedRef<ComponentConfig[] | undefined>
  actionPosition: ComputedRef<LateralActionPosition | undefined>
  actionClass: ComputedRef<string | undefined>
  actionPropKey: string
  actionPositionPropKey: string
  actionClassPropKey: string
  modelPermission: ComputedRef<IModelPermission | undefined>
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
  const toolbarConfigs = computed(() =>
    options.toolbar.value ?? (options.config.value?.props?.['toolbar'] as ComponentConfig[] | undefined) ?? []
  )
  const rawActionConfigs = computed(() =>
    options.actionConfigs.value ?? (options.config.value?.props?.[options.actionPropKey] as ComponentConfig[] | undefined) ?? []
  )
  const toolbarPositionValue = computed<ToolbarPosition>(() =>
    (options.config.value?.props?.['toolbarPosition'] as ToolbarPosition | undefined) ?? options.toolbarPosition.value ?? 'top'
  )
  const toolbarClassValue = computed(() =>
    (options.config.value?.props?.['toolbarClass'] as string | undefined) ?? options.toolbarClass.value ?? ''
  )
  const actionPositionValue = computed<LateralActionPosition>(() =>
    (options.config.value?.props?.[options.actionPositionPropKey] as LateralActionPosition | undefined) ?? options.actionPosition.value ?? 'right'
  )
  const actionClassValue = computed(() =>
    (options.config.value?.props?.[options.actionClassPropKey] as string | undefined) ?? options.actionClass.value ?? ''
  )
  const visibleToolbarConfigs = computed(() =>
    toolbarConfigs.value.filter(action => isActionDisplayed(action) && isModelActionAllowed(action, options.modelPermission.value))
  )
  const hasToolbar = computed(() => visibleToolbarConfigs.value.length > 0)
  const showActionsLeft = computed(() => rawActionConfigs.value.length > 0 && actionPositionValue.value === 'left')
  const showActionsRight = computed(() => rawActionConfigs.value.length > 0 && actionPositionValue.value === 'right')

  function getScopedActionConfigs(scope: TScope): ScopedComponentConfig[] {
    const resolved = options.resolveScope(scope)
    return rawActionConfigs.value
      .filter(action =>
        isActionDisplayed(action)
        && isModelActionAllowed(action, options.modelPermission.value)
        && isRowActionAllowed(action, resolved.row)
      )
      .map(action => {
        const withListeners = action as ScopedComponentConfig
        const wrappedOn = withListeners.on
          ? Object.fromEntries(
            Object.entries(withListeners.on).map(([eventName, handler]) => [eventName, wrapScopedHandler(handler, resolved.listenerArgs)])
          )
          : undefined

        return {
          ...action,
          props: {
            ...(action.props ?? {}),
            ...resolved.scopedProps,
          },
          ...(wrappedOn ? { on: wrappedOn } : {}),
        }
      })
  }

  return {
    toolbarPositionValue,
    toolbarClassValue,
    actionPositionValue,
    actionClassValue,
    visibleToolbarConfigs,
    hasToolbar,
    showActionsLeft,
    showActionsRight,
    getScopedActionConfigs,
  }
}