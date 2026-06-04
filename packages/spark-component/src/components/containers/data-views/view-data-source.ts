import { computed, toValue, watch } from 'vue'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import {
  diagnoseDataViewKey,
  resolveDataViewCapabilities,
  resolveDataViewKey,
  type DataMember,
  type DataViewKeyDiagnostic,
  type DataViewMemberDiagnostic,
  type DataView,
  type DataRow,
} from '@spark-appworks/spark-data'
import { PAGE_DATASET } from '../../internal'
import type { SparkCapabilityConsumer } from '@spark-appworks/spark-utils'
import type {
  DataViewState,
} from './view-runtime-state.js'
import { useDataViewState } from './view-runtime-state.js'
import { toDataRecord } from './data-row-utils.js'

/** 极简日志接口，仅供 useContainerDataSource 内部使用。 */
type DataSourceLoggerLike = {
  warn(message: string): void
  error(message: string, error?: unknown): void}

const DEFAULT_DATA_SOURCE_LOGGER: DataSourceLoggerLike = {
  warn: () => {},
  error: () => {},
}

function resolveMaybeValue<T>(source: MaybeRefOrGetter<T> | undefined): T | undefined {
  return source === undefined ? undefined : toValue(source)
}

function pickRowFromSource(source: unknown): DataRow | null {
  const sourceRecord = toDataRecord(source)
  if (!sourceRecord) return null
  return toDataRecord(sourceRecord['currentRow'])
}

function isDataView(value: unknown): value is DataView {
  if (value === null || typeof value !== 'object') return false
  return typeof Reflect.get(value, 'requestData') === 'function'
    && typeof Reflect.get(value, 'dataTable') === 'object'
}

type UseContainerDataSourceOptions<TSource> = {
  dataViewKey: MaybeRefOrGetter<string | undefined>
  contextDataMember?: MaybeRefOrGetter<DataMember | `${DataMember}` | undefined>
  contextDataField?: MaybeRefOrGetter<string | undefined>
  sparkConsume: SparkCapabilityConsumer
  mapView: (view: DataView) => TSource
  externalDataSource?: MaybeRefOrGetter<TSource | undefined>
  inheritedDataSource?: MaybeRefOrGetter<TSource | null | undefined>
  provideDataSource?: (source: TSource) => void
  logger?: DataSourceLoggerLike
  logPrefix?: string
  skipEffects?: boolean
  skipProvideEffect?: boolean
  skipAutoLoadEffect?: boolean}

type UseContainerDataSourceEffectsOptions<TSource> = {
  resolvedView: ComputedRef<TSource | null>
  diagnostic?: ComputedRef<DataViewKeyDiagnostic | DataViewMemberDiagnostic | null>
  provideDataSource?: (source: TSource) => void
  logger: DataSourceLoggerLike
  logPrefix: string
  skipProvideEffect?: boolean
  skipAutoLoadEffect?: boolean}

export type ContainerDataSourceState<TSource> = {
  resolvedView: ComputedRef<TSource | null>
  resolvedDataRow: ComputedRef<DataRow | null>}

function useContainerDataSourceCore<TSource>(options: UseContainerDataSourceOptions<TSource>): ContainerDataSourceState<TSource> {
  const pageDataSet = options.sparkConsume(PAGE_DATASET)

  // 1. 先诊断 dataViewKey。诊断只负责日志提示，不参与 resolvedView 兜底选择。
  const diagnostic = computed(() => {
    const rawKey = toValue(options.dataViewKey)
    if (typeof rawKey !== 'string' || rawKey.trim().length === 0) return null
    return diagnoseDataViewKey(rawKey, pageDataSet)
  })

  // 2. 再解析 DataView 上下文能力，供 dataMember/dataField 绑定和行上下文复用。
  const contextCapabilities = computed(() =>
    resolveDataViewCapabilities({
      dataViewKey: toValue(options.dataViewKey),
      dataMember: toValue(options.contextDataMember),
      dataField: toValue(options.contextDataField),
    }, pageDataSet),
  )

  // 3. 按优先级选择数据源：外部显式传入 > dataViewKey > 上下文能力 > 父级继承。
  const resolvedView = computed<TSource | null>(() => {
    const provided = resolveMaybeValue(options.externalDataSource)
    if (provided !== undefined) return provided

    const view = resolveDataViewKey(toValue(options.dataViewKey), pageDataSet)
    if (view) return options.mapView(view)

    if (contextCapabilities.value.dataSource) {
      return options.mapView(contextCapabilities.value.dataSource)
    }

    const inherited = resolveMaybeValue(options.inheritedDataSource)
    if (inherited !== null && inherited !== undefined) return inherited

    return null
  })

  // 4. 行数据同样按显式来源优先；找不到时尝试从当前视图 currentRow 或继承源读取。
  const resolvedDataRow = computed<DataRow | null>(() => {
    const provided = resolveMaybeValue(options.externalDataSource)
    if (provided !== undefined) return pickRowFromSource(provided)

    if (contextCapabilities.value.dataRow !== null) return contextCapabilities.value.dataRow

    const viewRecord = toDataRecord(resolvedView.value)
    const currentRow = viewRecord ? toDataRecord(viewRecord['currentRow']) : null
    if (currentRow) return currentRow

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
  return { ...useDataViewState(state.resolvedView), ...state }
}

function shouldAutoLoad(view: DataView): boolean {
  if (typeof view.requestData !== 'function') return false

  const autoLoadConfigured = Reflect.get(view, 'autoLoadConfigured')
  const autoLoad = Reflect.get(view, 'autoLoad')
  if (autoLoadConfigured === true && autoLoad === false) return false

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
      if (!isDataView(source) || !shouldAutoLoad(source)) return

      void source.requestData().catch((error: unknown) => {
        options.logger.error(`${options.logPrefix}: requestData() 失败`, error)
      })
    },
    { immediate: true },
  )
}

function useContainerDataSourceDiagnosticEffect(options: {
  diagnostic: ComputedRef<DataViewKeyDiagnostic | DataViewMemberDiagnostic | null>
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

function shouldLogContainerDiagnostic(diagnostic: DataViewKeyDiagnostic | DataViewMemberDiagnostic): boolean {
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
