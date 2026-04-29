import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import type { SparkNode } from '../../internal'
import { wrapPermissionListeners } from '../support/actions/permission-listeners'

interface ActionRuntimeScope {
  row: IDataRow | null
  data: unknown
  index?: number
  listenerArgs?: unknown[]
  propsPatch?: Record<string, unknown>
}

interface UseActionVisibilityOptions<TScope> {
  actionConfigs: ComputedRef<SparkNode[] | undefined>
  resolveScope: (scope: TScope) => ActionRuntimeScope
}

export function useContainerActionVisibility<TScope>(options: UseActionVisibilityOptions<TScope>) {
  const rawActionConfigs = computed(() => options.actionConfigs.value ?? [])

  function getVisibleActionConfigs(scope: TScope): SparkNode[] {
    const runtime = options.resolveScope(scope)

    return rawActionConfigs.value.map(action => {
      const wrappedOn = wrapPermissionListeners(action.props?.['on'], {
        allowed: true,
        ...(runtime.listenerArgs ? { scopedArgs: runtime.listenerArgs } : {}),
      })

      return {
        ...action,
        props: {
          ...(action.props ?? {}),
          ...(runtime.propsPatch ?? {}),
          ...(wrappedOn ? { on: wrappedOn } : {}),
        },
      }
    })
  }

  return {
    rawActionConfigs,
    getVisibleActionConfigs,
  }
}
