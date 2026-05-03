import { computed, shallowRef, toValue, watchEffect } from 'vue'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import {
  RequestState,
  parseDataKey,
  type DataView,
  type IDataRow,
  type IDataSource,
  type IModelPermission,
  type TreeConfig,
} from '@spark-view/spark-data'
import type { ValueRef } from '../../shared-types.js'
import { extractModelPermission } from '../../../permission/index.js'
import { toDataRecord } from './data-row-utils.js'

/**
 * DataView 标识态：来自 dataKey 反推或 DataView 本身的静态元信息。
 */
export interface DataViewIdentityState {
  tableName: ComputedRef<IDataSource['tableName']>
  viewId: ComputedRef<string | undefined>
  primaryKey: ComputedRef<string | undefined>
  treeConfig: ComputedRef<TreeConfig | undefined>
}

/** DataView 行数据态：当前视图下的行级数据与选择状态。 */
export interface DataViewRowsState {
  rows: ComputedRef<readonly IDataRow[]>
  currentRow: ComputedRef<IDataRow | null>
  selectedRows: ComputedRef<readonly IDataRow[]>
  isMultiSelect: ComputedRef<boolean>
}

/** DataView 显示态：用于下拉/选择器等展示场景的 value/label 信息。 */
export interface DataViewDisplayState {
  _modelPerm: ComputedRef<IDataSource['_modelPerm']>
  value: ComputedRef<IDataSource['value']>
  label: ComputedRef<IDataSource['label']>
  labels: ComputedRef<IDataSource['labels']>
}

/** DataView 权限投影：从 _modelPerm 解析后的统一模型权限结构。 */
export interface DataViewPermissionState {
  modelPermission: ComputedRef<IModelPermission | undefined>
}

/** DataView 请求与聚合态：分页、加载状态、聚合结果等运行时动态信息。 */
export interface DataViewRequestAndAggregateState {
  requestState: ComputedRef<IDataSource['requestState']>
  aggregateResult: ComputedRef<AggregateResultState>
  selectionAggregateResult: ComputedRef<AggregateResultState>
  total: ComputedRef<number>
  page: ComputedRef<number>
  pageSize: ComputedRef<number>
  mutating: ComputedRef<boolean>
  mutatingError: ComputedRef<Error | null>
  loadingError: ComputedRef<Error | null>
}

/** DataView 完整运行时投影（不含容器级解析上下文）。 */
export type DataViewRuntimeState =
  & DataViewIdentityState
  & DataViewRowsState
  & DataViewPermissionState
  & DataViewDisplayState
  & DataViewRequestAndAggregateState

/** 容器级数据解析上下文（不属于 DataView 原始字段）。 */
export interface ContainerDataViewContextState {
  resolvedView: ComputedRef<DataView | null>
  resolvedDataRow: ComputedRef<IDataRow | null>
}

/** 五类容器共享顶层视图态。 */
export type DataViewState = DataViewRuntimeState & ContainerDataViewContextState

/** 聚合结果运行时类型（key -> 聚合值）。 */
export type AggregateResultState = Readonly<Record<string, unknown>>

/** resolvedView 的标准 ref 形态。 */
export type ResolvedViewRef = ValueRef<DataView | null>

/** DataView revision 引用。 */
type ViewRevisionRef = ValueRef<number>

const EMPTY_AGGREGATE_RESULT: AggregateResultState = Object.freeze({})
const EMPTY_SELECTION_AGGREGATE_RESULT: AggregateResultState = Object.freeze({})
const EMPTY_ROWS: readonly IDataRow[] = Object.freeze([])
const EMPTY_LABELS: readonly string[] = Object.freeze([])

function normalizeAggregateResult(value: unknown, emptyValue: AggregateResultState): AggregateResultState {
  return toDataRecord(value) ?? emptyValue
}

function useResolvedViewRevision(resolvedView: ResolvedViewRef): ViewRevisionRef {
  const viewRevision = shallowRef(0)
  watchEffect((onCleanup) => {
    const view = resolvedView.value
    viewRevision.value += 1
    if (!view) return
    const unsubscribe = view.subscribe(() => {
      viewRevision.value += 1
    })
    onCleanup(unsubscribe)
  })
  return viewRevision
}

/**
 * 将 DataView 实例统一投影为容器可消费的 UI 只读状态。
 *
 * 当前实现不依赖 snapshot，而是直接读取 view 字段并用 subscribe 驱动失效。
 */
export function useDataViewState(
  resolvedView: ResolvedViewRef,
  dataKey: MaybeRefOrGetter<string | undefined>,
): DataViewRuntimeState & DataViewPermissionState {
  const viewRevision = useResolvedViewRevision(resolvedView)

  const tableName = computed<IDataSource['tableName']>(() => {
    viewRevision.value
    return resolvedView.value?.tableName ?? ''
  })

  const viewId = computed<string | undefined>(() => {
    const rawKey = toValue(dataKey)
    if (typeof rawKey !== 'string') return undefined
    const descriptor = parseDataKey(rawKey)
    return descriptor?.viewId
  })

  const primaryKey = computed<string | undefined>(() => {
    viewRevision.value
    return resolvedView.value?.primaryKey
  })
  const treeConfig = computed<TreeConfig | undefined>(() => {
    viewRevision.value
    return resolvedView.value?.treeConfig
  })

  const rows = computed<readonly IDataRow[]>(() => {
    viewRevision.value
    return resolvedView.value?.rows ?? EMPTY_ROWS
  })
  const currentRow = computed<IDataRow | null>(() => {
    viewRevision.value
    return resolvedView.value?.currentRow ?? null
  })
  const selectedRows = computed<readonly IDataRow[]>(() => {
    viewRevision.value
    return resolvedView.value?.selectedRows ?? EMPTY_ROWS
  })
  const isMultiSelect = computed<boolean>(() => {
    viewRevision.value
    return resolvedView.value?.isMultiSelect ?? false
  })

  const _modelPerm = computed<IDataSource['_modelPerm']>(() => {
    viewRevision.value
    const source = resolvedView.value as IDataSource | null
    return source?._modelPerm
  })
  const value = computed<IDataSource['value']>(() => {
    viewRevision.value
    return resolvedView.value?.value ?? ''
  })
  const label = computed<IDataSource['label']>(() => {
    viewRevision.value
    return resolvedView.value?.label ?? null
  })
  const labels = computed<IDataSource['labels']>(() => {
    viewRevision.value
    return resolvedView.value?.labels ?? EMPTY_LABELS
  })

  const requestState = computed<IDataSource['requestState']>(() => {
    viewRevision.value
    return resolvedView.value?.requestState ?? RequestState.Idle
  })

  const aggregateResult = computed<AggregateResultState>(() => {
    viewRevision.value
    return normalizeAggregateResult(resolvedView.value?.aggregateResult, EMPTY_AGGREGATE_RESULT)
  })

  const selectionAggregateResult = computed<AggregateResultState>(() => {
    viewRevision.value
    return normalizeAggregateResult(resolvedView.value?.selectionAggregateResult, EMPTY_SELECTION_AGGREGATE_RESULT)
  })

  const total = computed<number>(() => {
    viewRevision.value
    return resolvedView.value?.total ?? 0
  })
  const page = computed<number>(() => {
    viewRevision.value
    return resolvedView.value?.page ?? 1
  })
  const pageSize = computed<number>(() => {
    viewRevision.value
    return resolvedView.value?.pageSize ?? 20
  })

  const mutating = computed<boolean>(() => {
    viewRevision.value
    return resolvedView.value?.mutating ?? false
  })
  const mutatingError = computed<Error | null>(() => {
    viewRevision.value
    return resolvedView.value?.mutatingError ?? null
  })
  const loadingError = computed<Error | null>(() => {
    viewRevision.value
    return resolvedView.value?.loadingError ?? null
  })

  const modelPermission = computed<IModelPermission | undefined>(() => {
    viewRevision.value
    return extractModelPermission(resolvedView.value as IDataSource | null)
  })

  return {
    tableName, viewId, primaryKey, treeConfig,
    rows, currentRow, selectedRows, isMultiSelect,
    _modelPerm, value, label, labels,
    requestState, aggregateResult, selectionAggregateResult,
    total, page, pageSize,
    mutating, mutatingError, loadingError,
    modelPermission,
  }
}
