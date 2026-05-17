import { computed, shallowRef } from 'vue'
import type { ComputedRef } from 'vue'
import {
  RequestState,
  type DataView,
  type DataColumn,
  type IDataRow,
  type IDataSource,
  type IModelPermission,
  type TreeConfig,
} from '@spark-view/spark-data'
import type { ValueRef } from '../../shared-types.js'
import { extractModelPermission } from '../../../permission/index.js'
import { toDataRecord } from './data-row-utils.js'
import { useDataViewEventBridge } from '../runtime/useDataViewEventBridge.js'

/**
 * DataView 标识态：来自 DataView 快照的静态元信息。
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
  columns: ComputedRef<readonly DataColumn[]>
  currentRow: ComputedRef<IDataRow | null>
  selectedRows: ComputedRef<readonly IDataRow[]>
  editingRows: ComputedRef<readonly IDataRow[]>
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

const EMPTY_AGGREGATE_RESULT: AggregateResultState = Object.freeze({})
const EMPTY_SELECTION_AGGREGATE_RESULT: AggregateResultState = Object.freeze({})
const EMPTY_ROWS: readonly IDataRow[] = Object.freeze([])
const EMPTY_COLUMNS: readonly DataColumn[] = Object.freeze([])
const EMPTY_LABELS: readonly string[] = Object.freeze([])

interface DataViewRuntimeRevisions {
  rowsRevision: ValueRef<number>
  selectionRevision: ValueRef<number>
  requestRevision: ValueRef<number>
  aggregateRevision: ValueRef<number>
  mutationRevision: ValueRef<number>
  configRevision: ValueRef<number>
  editingRevision: ValueRef<number>
}

function normalizeAggregateResult(value: unknown, emptyValue: AggregateResultState): AggregateResultState {
  return toDataRecord(value) ?? emptyValue
}

function bumpRevision(revision: ValueRef<number>): void {
  revision.value += 1
}

function useDataViewRuntimeRevisions(resolvedView: ResolvedViewRef): DataViewRuntimeRevisions {
  const rowsRevision = shallowRef(0)
  const selectionRevision = shallowRef(0)
  const requestRevision = shallowRef(0)
  const aggregateRevision = shallowRef(0)
  const mutationRevision = shallowRef(0)
  const configRevision = shallowRef(0)
  const editingRevision = shallowRef(0)

  function bumpAll(): void {
    bumpRevision(rowsRevision)
    bumpRevision(selectionRevision)
    bumpRevision(requestRevision)
    bumpRevision(aggregateRevision)
    bumpRevision(mutationRevision)
    bumpRevision(configRevision)
    bumpRevision(editingRevision)
  }

  const handleRowsChanged = () => {
    bumpRevision(rowsRevision)
    // currentRow/selectedRows are row-derived getters; refresh them when row objects are replaced.
    bumpRevision(selectionRevision)
    bumpRevision(aggregateRevision)
  }

  useDataViewEventBridge({
    resolvedView,
    onDetached: bumpAll,
    onAttached: bumpAll,
    onRowsChanged: handleRowsChanged,
    onCurrentRowChanged: () => bumpRevision(selectionRevision),
    onSelectedRowsChanged: () => bumpRevision(selectionRevision),
    onRequestStateChanged: () => bumpRevision(requestRevision),
    onMutatingChanged: () => bumpRevision(mutationRevision),
    onSummaryChanged: () => bumpRevision(aggregateRevision),
    onSelectionSummaryChanged: () => bumpRevision(aggregateRevision),
    onConfigChanged: () => bumpRevision(configRevision),
    onEditingChanged: () => bumpRevision(editingRevision),
    onCleared: bumpAll,
  })

  return {
    rowsRevision,
    selectionRevision,
    requestRevision,
    aggregateRevision,
    mutationRevision,
    configRevision,
    editingRevision,
  }
}

/**
 * 将 DataView 实例统一投影为容器可消费的 UI 只读状态。
 */
export function useDataViewState(
  resolvedView: ResolvedViewRef,
): DataViewRuntimeState & DataViewPermissionState {
  const revisions = useDataViewRuntimeRevisions(resolvedView)

  const tableName = computed<IDataSource['tableName']>(() => {
    revisions.configRevision.value
    return resolvedView.value?.tableName ?? ''
  })

  const viewId = computed<string | undefined>(() => {
    revisions.configRevision.value
    return resolvedView.value?.viewId
  })

  const primaryKey = computed<string | undefined>(() => {
    revisions.configRevision.value
    return resolvedView.value?.primaryKey
  })
  const treeConfig = computed<TreeConfig | undefined>(() => {
    revisions.configRevision.value
    return resolvedView.value?.treeConfig
  })

  const rows = computed<readonly IDataRow[]>(() => {
    revisions.rowsRevision.value
    return resolvedView.value?.rows ?? EMPTY_ROWS
  })
  const columns = computed<readonly DataColumn[]>(() => {
    revisions.configRevision.value
    return resolvedView.value?.columns ?? EMPTY_COLUMNS
  })
  const currentRow = computed<IDataRow | null>(() => {
    revisions.selectionRevision.value
    revisions.rowsRevision.value
    return resolvedView.value?.currentRow ?? null
  })
  const selectedRows = computed<readonly IDataRow[]>(() => {
    revisions.selectionRevision.value
    revisions.rowsRevision.value
    return resolvedView.value?.selectedRows ?? EMPTY_ROWS
  })
  const editingRows = computed<readonly IDataRow[]>(() => {
    revisions.editingRevision.value
    revisions.rowsRevision.value
    return resolvedView.value?.editingRows ?? EMPTY_ROWS
  })
  const isMultiSelect = computed<boolean>(() => {
    revisions.configRevision.value
    return resolvedView.value?.isMultiSelect ?? false
  })

  const _modelPerm = computed<IDataSource['_modelPerm']>(() => {
    revisions.configRevision.value
    return (resolvedView.value as IDataSource | null)?._modelPerm
  })
  const value = computed<IDataSource['value']>(() => {
    revisions.selectionRevision.value
    revisions.rowsRevision.value
    revisions.configRevision.value
    return resolvedView.value?.value ?? ''
  })
  const label = computed<IDataSource['label']>(() => {
    revisions.selectionRevision.value
    revisions.rowsRevision.value
    revisions.configRevision.value
    return resolvedView.value?.label ?? null
  })
  const labels = computed<IDataSource['labels']>(() => {
    revisions.selectionRevision.value
    revisions.rowsRevision.value
    revisions.configRevision.value
    return resolvedView.value?.labels ?? EMPTY_LABELS
  })

  const requestState = computed<IDataSource['requestState']>(() => {
    revisions.requestRevision.value
    return resolvedView.value?.requestState ?? RequestState.Idle
  })

  const aggregateResult = computed<AggregateResultState>(() => {
    revisions.aggregateRevision.value
    return normalizeAggregateResult(resolvedView.value?.aggregateResult, EMPTY_AGGREGATE_RESULT)
  })

  const selectionAggregateResult = computed<AggregateResultState>(() => {
    revisions.aggregateRevision.value
    return normalizeAggregateResult(resolvedView.value?.selectionAggregateResult, EMPTY_SELECTION_AGGREGATE_RESULT)
  })

  const total = computed<number>(() => {
    revisions.rowsRevision.value
    revisions.configRevision.value
    return resolvedView.value?.total ?? 0
  })
  const page = computed<number>(() => {
    revisions.rowsRevision.value
    revisions.configRevision.value
    return resolvedView.value?.page ?? 1
  })
  const pageSize = computed<number>(() => {
    revisions.rowsRevision.value
    revisions.configRevision.value
    return resolvedView.value?.pageSize ?? 20
  })

  const mutating = computed<boolean>(() => {
    revisions.mutationRevision.value
    return resolvedView.value?.mutating ?? false
  })
  const mutatingError = computed<Error | null>(() => {
    revisions.mutationRevision.value
    return resolvedView.value?.mutatingError ?? null
  })
  const loadingError = computed<Error | null>(() => {
    revisions.requestRevision.value
    return resolvedView.value?.loadingError ?? null
  })

  const modelPermission = computed<IModelPermission | undefined>(() => {
    revisions.configRevision.value
    return extractModelPermission(resolvedView.value as IDataSource | null)
  })

  return {
    tableName, viewId, primaryKey, treeConfig,
    rows, columns, currentRow, selectedRows, editingRows, isMultiSelect,
    _modelPerm, value, label, labels,
    requestState, aggregateResult, selectionAggregateResult,
    total, page, pageSize,
    mutating, mutatingError, loadingError,
    modelPermission,
  }
}
