import { shallowReactive, watch } from 'vue'
import type { ComputedRef } from 'vue'
import type { IDataRow, IDataSource } from '@spark-view/spark-data'

interface UseContainerContextDataOptions {
  source: ComputedRef<IDataSource | null>
}

export function useContainerContextData(options: UseContainerContextDataOptions) {
  const contextData = shallowReactive<IDataRow>({})

  let _prevRow: unknown = Symbol('initial')

  watch(
    () => options.source.value?.currentRow,
    (row) => {
      if (row === _prevRow) return
      _prevRow = row

      const incoming: IDataRow = row ?? {}
      const incomingKeys = new Set(Object.keys(incoming))

      for (const key of Object.keys(contextData)) {
        if (!incomingKeys.has(key)) {
          contextData[key] = undefined
        }
      }

      for (const key of incomingKeys) {
        if (contextData[key] !== incoming[key]) {
          contextData[key] = incoming[key]
        }
      }
    },
    { immediate: true },
  )

  return {
    contextData,
  }
}