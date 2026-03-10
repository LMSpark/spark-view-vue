import { computed, reactive, watch } from 'vue'
import type { ComputedRef } from 'vue'
import type { IDataSource, IModelPermission } from '@spark-view/spark-data'

interface UseContainerContextDataOptions {
  source: ComputedRef<IDataSource | null>
}

export function useContainerContextData(options: UseContainerContextDataOptions) {
  const contextData = reactive<Record<string, unknown>>({})

  watch(
    () => options.source.value?.currentRow,
    (row) => {
      for (const key of Object.keys(contextData)) {
        contextData[key] = undefined
      }
      if (row) Object.assign(contextData, row)
    },
    { immediate: true },
  )

  const modelPermission = computed<IModelPermission | undefined>(() => options.source.value?._modelPerm)

  return {
    contextData,
    modelPermission,
  }
}