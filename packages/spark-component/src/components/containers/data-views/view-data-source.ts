/**
 * @module @spark-appworks/spark-component:components/containers/data-views/view-data-source
 * @spark-appworks/spark-component:components/containers/data-views/view-data-source 模块，属于 SPARK component table-level/data-view-container。
 * 组件目录: containers/data-views。
 * 导出 ClassModel symbol: DataSourceLoggerLike, UseContainerDataSourceOptions, UseContainerDataSourceEffectsOptions, ContainerDataSourceState（共 4 个 symbol）。
 */
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

/** 容器解析 DataView 或派生数据源时使用的统一输入。 */
type UseContainerDataSourceOptions<TSource> = {
  /** 显式 DataView 定位键，格式为 table@viewId 或带作用域的 #scope@table@viewId。 */
  dataViewKey: MaybeRefOrGetter<string | undefined>
  /** 从上级 DataView 上下文读取的成员名，例如 currentRow、rows 或 selectedRows。 */
  contextDataMember?: MaybeRefOrGetter<DataMember | `${DataMember}` | undefined>
  /** 在 contextDataMember 解析结果上继续读取的字段路径。 */
  contextDataField?: MaybeRefOrGetter<string | undefined>
  /** capability 消费入口，用于读取 PAGE_DATASET。 */
  sparkConsume: SparkCapabilityConsumer
  /** 将解析到的 DataView 映射成容器实际消费的数据源形态。 */
  mapView: (view: DataView) => TSource
  /** 外部显式传入的数据源；优先级高于 dataViewKey。 */
  externalDataSource?: MaybeRefOrGetter<TSource | undefined>
  /** 父级容器传入的数据源；显式来源和上下文都缺失时使用。 */
  inheritedDataSource?: MaybeRefOrGetter<TSource | null | undefined>
  /** 将解析出的数据源提供给子级容器或字段。 */
  provideDataSource?: (source: TSource) => void
  /** 容器数据源解析诊断日志。 */
  logger?: DataSourceLoggerLike
  /** 日志前缀，用于区分不同容器实例。 */
  logPrefix?: string
  /** 跳过 provide、autoLoad 和诊断副作用，仅保留解析结果。 */
  skipEffects?: boolean
  /** 跳过向下提供数据源的副作用。 */
  skipProvideEffect?: boolean
  /** 跳过 DataView 自动加载副作用。 */
  skipAutoLoadEffect?: boolean
}

/** 容器数据源解析后的副作用配置。 */
type UseContainerDataSourceEffectsOptions<TSource> = {
  /** 已解析的数据源 ref。 */
  resolvedView: ComputedRef<TSource | null>
  /** dataViewKey 或 dataMember 解析诊断。 */
  diagnostic?: ComputedRef<DataViewKeyDiagnostic | DataViewMemberDiagnostic | null>
  /** 向下游提供数据源的回调。 */
  provideDataSource?: (source: TSource) => void
  /** 副作用阶段使用的诊断日志。 */
  logger: DataSourceLoggerLike
  /** 副作用日志前缀。 */
  logPrefix: string
  /** 是否跳过 provideDataSource 副作用。 */
  skipProvideEffect?: boolean
  /** 是否跳过 DataView requestData 自动加载。 */
  skipAutoLoadEffect?: boolean
}

/** 容器解析后的数据源和行上下文结果。 */
export type ContainerDataSourceState<TSource> = {
  /** 容器最终解析到的数据源；解析失败时为空。 */
  resolvedView: ComputedRef<TSource | null>
  /** 容器最终解析到的行上下文。 */
  resolvedDataRow: ComputedRef<DataRow | null>
}

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
