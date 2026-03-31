import { computed, watch } from 'vue'
import type { ComputedRef } from 'vue'
import type { DataView, IDataSet, IModelPermission } from '@spark-view/spark-data'
import { resolveViewFromDataKey } from '../../../shared/data-key-resolver.js'
import { extractModelPermission } from '../../../permission/index.js'

interface LoggerLike {
  warn(message: string): void
  error(message: string, error?: unknown): void
}

interface UseContainerDataSourceOptions<TSource> {
  dataKey: ComputedRef<string | undefined>
  pageDataSet: IDataSet | null
  mapView: (view: DataView) => TSource
}

interface UseContainerDataSourceEffectsOptions<TSource> {
  resolvedDataSource: ComputedRef<TSource | null>
  provideDataSource?: (source: TSource) => void
  logger: LoggerLike
  logPrefix: string
}

export function useContainerDataSource<TSource>(options: UseContainerDataSourceOptions<TSource>) {
  const resolvedDataSource = computed<TSource | null>(() => {
    const view = resolveViewFromDataKey(options.dataKey.value, options.pageDataSet)
    if (view) return options.mapView(view)
    return null
  })

  const modelPermission = computed<IModelPermission | undefined>(() =>
    extractModelPermission(resolvedDataSource.value as { _modelPerm?: IModelPermission } | null | undefined)
  )

  return {
    resolvedDataSource,
    modelPermission,
  }
}

export function useContainerDataSourceEffects<TSource>(options: UseContainerDataSourceEffectsOptions<TSource>) {
  function tryAutoLoad(source: TSource | null): void {
    if (source === null) return
    const maybeView = source as DataView
    if (typeof maybeView.requestData !== 'function') return
    if (!maybeView.dataTable?.api) return

    void maybeView.requestData().catch((error: unknown) => {
      options.logger.error(`${options.logPrefix}: requestData() 失败`, error)
    })
  }

  watch(options.resolvedDataSource, (source) => {
    if (source === null) return
    options.provideDataSource?.(source)
    tryAutoLoad(source)
  }, { immediate: true })
}