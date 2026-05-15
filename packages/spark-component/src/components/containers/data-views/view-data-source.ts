import { computed, toValue, watch } from 'vue'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import {
  diagnoseViewKey,
  resolveDataCapabilitiesFromDataKey,
  resolveViewKey,
  type DataKeyDiagnostic,
  type DataView,
  type IDataRow,
  type ViewKeyDiagnostic,
} from '@spark-view/spark-data'
import { PAGE_DATASET } from '../../internal'
import type { SparkCapabilityConsumer } from '@spark-view/spark-utils'
import type {
  DataViewState,
  ResolvedViewRef,
} from './view-runtime-state.js'
import { useDataViewState } from './view-runtime-state.js'
import { toDataRecord } from './data-row-utils.js'

/** 极简日志接口，仅供 useContainerDataSource 内部使用。 */
interface DataSourceLoggerLike {
  warn(message: string): void
  error(message: string, error?: unknown): void
}

const DEFAULT_DATA_SOURCE_LOGGER: DataSourceLoggerLike = {
  warn: () => {},
  error: () => {},
}

type ContainerDataSourceDiagnostic = ViewKeyDiagnostic | DataKeyDiagnostic

function resolveMaybeValue<T>(source: MaybeRefOrGetter<T> | undefined): T | undefined {
  return source === undefined ? undefined : toValue(source)
}

function pickRowFromSource(source: unknown): IDataRow | null {
  const sourceRecord = toDataRecord(source)
  if (!sourceRecord) return null
  return toDataRecord(sourceRecord['currentRow']) as IDataRow | null
}

interface UseContainerDataSourceOptions<TSource> {
  viewKey: MaybeRefOrGetter<string | undefined>
  contextDataKey?: MaybeRefOrGetter<string | undefined>
  sparkConsume: SparkCapabilityConsumer
  mapView: (view: DataView) => TSource
  externalDataSource?: MaybeRefOrGetter<TSource | undefined>
  inheritedDataSource?: MaybeRefOrGetter<TSource | null | undefined>
  provideDataSource?: (source: TSource) => void
  logger?: DataSourceLoggerLike
  logPrefix?: string
  skipEffects?: boolean
  skipProvideEffect?: boolean
  skipAutoLoadEffect?: boolean
}

interface UseContainerDataSourceEffectsOptions<TSource> {
  resolvedView: ComputedRef<TSource | null>
  diagnostic?: ComputedRef<ContainerDataSourceDiagnostic | null>
  provideDataSource?: (source: TSource) => void
  logger: DataSourceLoggerLike
  logPrefix: string
  skipProvideEffect?: boolean
  skipAutoLoadEffect?: boolean
}

export interface ContainerDataSourceState<TSource> {
  resolvedView: ComputedRef<TSource | null>
  resolvedDataRow: ComputedRef<IDataRow | null>
}

function useContainerDataSourceCore<TSource>(options: UseContainerDataSourceOptions<TSource>): ContainerDataSourceState<TSource> {
  const pageDataSet = options.sparkConsume(PAGE_DATASET)

  const diagnostic = computed(() => {
    const rawKey = toValue(options.viewKey)
    if (typeof rawKey !== 'string' || rawKey.trim().length === 0) return null
    return diagnoseViewKey(rawKey, pageDataSet)
  })

  const contextCapabilities = computed(() =>
    resolveDataCapabilitiesFromDataKey(toValue(options.contextDataKey), pageDataSet),
  )

  const resolvedView = computed<TSource | null>(() => {
    const provided = resolveMaybeValue(options.externalDataSource)
    if (provided !== undefined) return provided

    const view = resolveViewKey(toValue(options.viewKey), pageDataSet)
    if (view) return options.mapView(view)

    if (contextCapabilities.value.dataSource) {
      return options.mapView(contextCapabilities.value.dataSource)
    }

    const inherited = resolveMaybeValue(options.inheritedDataSource)
    if (inherited !== null && inherited !== undefined) return inherited

    return null
  })

  const resolvedDataRow = computed<IDataRow | null>(() => {
    const provided = resolveMaybeValue(options.externalDataSource)
    if (provided !== undefined) return pickRowFromSource(provided)

    if (contextCapabilities.value.dataRow !== null) return contextCapabilities.value.dataRow

    const viewRecord = toDataRecord(resolvedView.value)
    const currentRow = viewRecord ? toDataRecord(viewRecord['currentRow']) : null
    if (currentRow) return currentRow as IDataRow

    const inherited = resolveMaybeValue(options.inheritedDataSource)
    return pickRowFromSource(inherited)
  })

  if (options.skipEffects !== true) {
    useContainerDataSourceEffects({
      resolvedView,
      diagnostic,
      ...(options.provideDataSource ? { provideDataSource: options.provideDataSource } : {}),
      logger: options.logger ?? DEFAULT_DATA_SOURCE_LOGGER,
      logPrefix: options.logPrefix ?? 'useContainerDataSource',
      ...(options.skipProvideEffect !== undefined ? { skipProvideEffect: options.skipProvideEffect } : {}),
      ...(options.skipAutoLoadEffect !== undefined ? { skipAutoLoadEffect: options.skipAutoLoadEffect } : {}),
    })
  }

  return { resolvedView, resolvedDataRow }
}

export function useContainerDataSource(
  options: Omit<UseContainerDataSourceOptions<DataView>, 'mapView'>,
): DataViewState {
  const state = useContainerDataSourceCore<DataView>({
    ...options,
    mapView: (view: DataView) => view,
  })
  return { ...useDataViewState(state.resolvedView as ResolvedViewRef), ...state }
}

function shouldAutoLoad(view: DataView): boolean {
  if (typeof view.requestData !== 'function') return false

  const autoLoadState = view as { autoLoad?: boolean; autoLoadConfigured?: boolean }
  if (autoLoadState.autoLoadConfigured === true && autoLoadState.autoLoad === false) return false

  const table = view.dataTable
  if (table?.resourceType === 'static-data') return false
  return table?.api?.list !== undefined
}

function useContainerDataSourceProvideEffect<TSource>(options: {
  resolvedView: ComputedRef<TSource | null>
  provideDataSource?: (source: TSource) => void
}): void {
  watch(
    options.resolvedView,
    (source) => {
      if (source === null) return
      options.provideDataSource?.(source)
    },
    { immediate: true },
  )
}

function useContainerDataSourceAutoLoadEffect<TSource>(options: {
  resolvedView: ComputedRef<TSource | null>
  logger: DataSourceLoggerLike
  logPrefix: string
}): void {
  watch(
    options.resolvedView,
    (source) => {
      if (source === null) return
      const maybeView = source as unknown as DataView
      if (!shouldAutoLoad(maybeView)) return

      void maybeView.requestData().catch((error: unknown) => {
        options.logger.error(`${options.logPrefix}: requestData() 失败`, error)
      })
    },
    { immediate: true },
  )
}

function useContainerDataSourceDiagnosticEffect(options: {
  diagnostic: ComputedRef<ContainerDataSourceDiagnostic | null>
  logger: DataSourceLoggerLike
  logPrefix: string
}): void {
  watch(
    options.diagnostic,
    (diagnostic) => {
      if (diagnostic === null || diagnostic.ok) return
      if (!shouldLogContainerDiagnostic(diagnostic)) return
      options.logger.warn(`${options.logPrefix}: ${diagnostic.message}`)
    },
    { immediate: true },
  )
}

function shouldLogContainerDiagnostic(diagnostic: ContainerDataSourceDiagnostic): boolean {
  return diagnostic.status !== 'empty-current-row' && diagnostic.status !== 'empty-selection'
}

export function useContainerDataSourceEffects<TSource>(options: UseContainerDataSourceEffectsOptions<TSource>): void {
  if (options.diagnostic !== undefined) {
    useContainerDataSourceDiagnosticEffect({
      diagnostic: options.diagnostic,
      logger: options.logger,
      logPrefix: options.logPrefix,
    })
  }

  if (options.skipProvideEffect !== true) {
    useContainerDataSourceProvideEffect({
      resolvedView: options.resolvedView,
      ...(options.provideDataSource ? { provideDataSource: options.provideDataSource } : {}),
    })
  }

  if (options.skipAutoLoadEffect !== true) {
    useContainerDataSourceAutoLoadEffect({
      resolvedView: options.resolvedView,
      logger: options.logger,
      logPrefix: options.logPrefix,
    })
  }
}
