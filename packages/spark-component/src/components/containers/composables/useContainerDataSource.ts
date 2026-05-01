import { computed, watch } from 'vue'
import type { ComputedRef } from 'vue'
import type { DataView, IDataRow, IModelPermission } from '@spark-view/spark-data'
import type { ValueRef } from '../../shared-types.js'
import { resolveDataCapabilitiesFromDataKey } from '../../../core/data-key-resolver.js'
import { extractModelPermission, type ModelPermissionSource } from '../../../permission/index.js'
import type { SparkCapabilityConsumer } from '../../../core/capability-system.js'
import { PAGE_DATASET } from '../../internal.js'

interface LoggerLike {
  warn(message: string): void
  error(message: string, error?: unknown): void
}

interface UseContainerDataSourceOptions<TSource> {
  dataKey: ValueRef<string | undefined>
  sparkConsume: SparkCapabilityConsumer
  mapView: (view: DataView) => TSource
  externalDataSource?: ValueRef<TSource | undefined>
  inheritedDataSource?: ValueRef<TSource | null | undefined>
  provideDataSource?: (source: TSource) => void
  logger?: LoggerLike
  logPrefix?: string
}

interface UseContainerDataSourceEffectsOptions<TSource> {
  resolvedDataSource: ComputedRef<TSource | null>
  provideDataSource?: (source: TSource) => void
  logger: LoggerLike
  logPrefix: string
}

export function useContainerDataSource<TSource>(options: UseContainerDataSourceOptions<TSource>) {
  const pageDataSet = options.sparkConsume(PAGE_DATASET)

  function pickRowFromSource(source: unknown): IDataRow | null {
    if (source === null || source === undefined || typeof source !== 'object') return null
    const currentRow = (source as { currentRow?: unknown }).currentRow
    if (currentRow === null || currentRow === undefined || typeof currentRow !== 'object' || Array.isArray(currentRow)) return null
    return currentRow as IDataRow
  }

  const resolvedDataRow = computed<IDataRow | null>(() => {
    const provided = options.externalDataSource?.value
    if (provided !== undefined) return pickRowFromSource(provided)

    const capabilities = resolveDataCapabilitiesFromDataKey(options.dataKey.value, pageDataSet)
    if (capabilities.dataRow !== null) return capabilities.dataRow

    const inherited = options.inheritedDataSource?.value
    return pickRowFromSource(inherited)
  })

  const resolvedDataSource = computed<TSource | null>(() => {
    const provided = options.externalDataSource?.value
    if (provided !== undefined) return provided

    const capabilities = resolveDataCapabilitiesFromDataKey(options.dataKey.value, pageDataSet)
    if (capabilities.dataSource) return options.mapView(capabilities.dataSource)

    const inherited = options.inheritedDataSource?.value
    if (inherited !== null && inherited !== undefined) return inherited

    return null
  })

  const modelPermission = computed<IModelPermission | undefined>(() =>
    extractModelPermission(resolvedDataSource.value as ModelPermissionSource | null)
  )

  if (options.provideDataSource || (options.logger && options.logPrefix)) {
    useContainerDataSourceEffects({
      resolvedDataSource,
      ...(options.provideDataSource ? { provideDataSource: options.provideDataSource } : {}),
      logger: options.logger ?? {
        warn: () => {},
        error: () => {},
      },
      logPrefix: options.logPrefix ?? 'useContainerDataSource',
    })
  }

  return {
    resolvedDataSource,
    resolvedDataRow,
    modelPermission,
  }
}

export function useContainerDataSourceEffects<TSource>(options: UseContainerDataSourceEffectsOptions<TSource>) {
  function shouldAutoLoad(view: DataView): boolean {
    if (typeof view.requestData !== 'function') return false

    const autoLoadState = view as { autoLoad?: boolean; autoLoadConfigured?: boolean }
    if (autoLoadState.autoLoadConfigured === true && autoLoadState.autoLoad === false) return false

    const dataTable = view.dataTable
    if (dataTable?.resourceType === 'static-data') return false
    if (!dataTable?.api?.list) return false

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