import { computed, onMounted, watch } from 'vue'
import type { ComputedRef } from 'vue'
import { parseDataKey } from '@spark-view/spark-data'
import type { DataView, IDataSet } from '@spark-view/spark-data'

interface LoggerLike {
  error(message: string, error?: unknown): void
}

interface UseContainerDataSourceOptions<TSource> {
  dataKey: ComputedRef<string | undefined>
  pageDataSet: IDataSet | null
  fallbackSource: ComputedRef<TSource | null | undefined>
  mapView: (view: DataView) => TSource
  provideDataSource?: (source: TSource) => void
  logger: LoggerLike
  logPrefix: string
}

export function useContainerDataSource<TSource>(options: UseContainerDataSourceOptions<TSource>) {
  const resolvedDataSource = computed<TSource | null>(() => {
    if (options.dataKey.value !== undefined && options.pageDataSet !== null) {
      const descriptor = parseDataKey(options.dataKey.value)
      if (descriptor) {
        const view = options.pageDataSet.getView(descriptor.tableName, descriptor.viewId) as DataView | null
        if (view) return options.mapView(view)
      }
    }
    return options.fallbackSource.value ?? null
  })

  function tryAutoLoad(source: TSource | null): void {
    if (source === null) return
    const maybeView = source as DataView
    if (typeof maybeView.requestData !== 'function') return
    if (!maybeView.dataTable?.api) return

    void maybeView.requestData().catch((error: unknown) => {
      options.logger.error(`${options.logPrefix}: requestData() 失败`, error)
    })
  }

  watch(resolvedDataSource, (source) => {
    if (source === null) return
    options.provideDataSource?.(source)
    tryAutoLoad(source)
  }, { immediate: true })

  onMounted(() => tryAutoLoad(resolvedDataSource.value))

  return {
    resolvedDataSource,
  }
}