import { computed, watch } from 'vue'
import type { ComputedRef } from 'vue'
import type { DataView, IDataSet, IModelPermission } from '@spark-view/spark-data'
import { resolveViewFromDataKey } from '../../../core/data-key-resolver.js'
import { extractModelPermission, type ModelPermissionSource } from '../../../permission/index.js'

interface LoggerLike {
  warn(message: string): void
  error(message: string, error?: unknown): void
}

interface UseContainerDataSourceOptions<TSource> {
  dataKey: ComputedRef<string | undefined>
  pageDataSet: IDataSet | null
  mapView: (view: DataView) => TSource
  externalDataSource?: ComputedRef<TSource | undefined>
}

interface UseContainerDataSourceEffectsOptions<TSource> {
  resolvedDataSource: ComputedRef<TSource | null>
  provideDataSource?: (source: TSource) => void
  logger: LoggerLike
  logPrefix: string
}

export function useContainerDataSource<TSource>(options: UseContainerDataSourceOptions<TSource>) {
  const resolvedDataSource = computed<TSource | null>(() => {
    const provided = options.externalDataSource?.value
    if (provided !== undefined) return provided

    const view = resolveViewFromDataKey(options.dataKey.value, options.pageDataSet)
    if (view) return options.mapView(view)
    return null
  })

  const modelPermission = computed<IModelPermission | undefined>(() =>
    extractModelPermission(resolvedDataSource.value as ModelPermissionSource | null)
  )

  return {
    resolvedDataSource,
    modelPermission,
  }
}

export function useContainerDataSourceEffects<TSource>(options: UseContainerDataSourceEffectsOptions<TSource>) {
  function shouldAutoLoad(view: DataView): boolean {
    if (typeof view.requestData !== 'function') return false
    if (view.autoLoad === false) return false

    const dataTable = view.dataTable
    if (!dataTable?.api?.list) return false
    if (dataTable.resourceType === 'static-data') return false

    return true
  }

  function tryAutoLoad(source: TSource | null): void {
    if (source === null) return
    const maybeView = source as DataView
    if (!shouldAutoLoad(maybeView)) return

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