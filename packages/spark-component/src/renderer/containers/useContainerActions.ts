import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { SparkNode } from '../_pkg'
import type { IDataRow, IModelPermission } from '@spark-view/spark-data'
import { isActionDisplayed, isModelActionAllowed, isRowActionAllowed } from './action-permission'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export type LateralActionPosition = 'left' | 'right'
type ListenerMap = Record<string, unknown>
type ListenerHandler = (...args: unknown[]) => unknown
type ScopedSparkNode = SparkNode & { on?: ListenerMap }

interface UseContainerActionsOptions<TScope> {
  actionConfigs: ComputedRef<SparkNode[] | undefined>
  actionPosition: ComputedRef<LateralActionPosition | undefined>
  actionClass: ComputedRef<string | undefined>
  modelPermission: ComputedRef<IModelPermission | undefined>
  resolveScope: (scope: TScope) => {
    row: IDataRow | undefined
    listenerArgs: unknown[]
    scopedProps: Record<string, unknown>
  }
}

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

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

// ── 组合式函数 ───────────────────────────────────────────────────────────────

export function useContainerActions<TScope>(options: UseContainerActionsOptions<TScope>) {
  const rawActionConfigs = computed(() => options.actionConfigs.value ?? [])
  const actionPositionValue = computed<LateralActionPosition>(() => options.actionPosition.value ?? 'right')
  const actionClassValue = computed(() => options.actionClass.value ?? '')

  // 预先判断动作区应该显示在左侧还是右侧。
  const showActionsLeft = computed(() => rawActionConfigs.value.length > 0 && actionPositionValue.value === 'left')
  const showActionsRight = computed(() => rawActionConfigs.value.length > 0 && actionPositionValue.value === 'right')

  // 结合权限过滤动作，并注入作用域 props 与带上下文参数的事件处理器。
  function getScopedActionConfigs(scope: TScope): ScopedSparkNode[] {
    const resolved = options.resolveScope(scope)
    return rawActionConfigs.value
      .filter(action =>
        isActionDisplayed(action)
        && isModelActionAllowed(action, options.modelPermission.value)
        && isRowActionAllowed(action, resolved.row)
      )
      .map(action => {
        const withListeners = action as ScopedSparkNode
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
    actionPositionValue,
    actionClassValue,
    showActionsLeft,
    showActionsRight,
    getScopedActionConfigs,
  }
}