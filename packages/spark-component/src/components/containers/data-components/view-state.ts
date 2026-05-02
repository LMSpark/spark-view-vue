/**
 * data-components/view-state.ts
 *
 * 汇总 RendererList / RendererTable / RendererTree / RendererForm / RendererDetail 五类容器的视图态层，
 * 共享工具类型与纯函数，消除各容器 view-state.ts 中的重复代码。
 */

import { computed, toValue, watch } from 'vue'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import { SparkData, parseDataKey, type DataView, type IDataRow, type IModelPermission, type TreeConfig } from '@spark-view/spark-data'
import type { IDataSource } from '@spark-view/spark-data'
import type { ValueRef } from '../../shared-types.js'
import { PAGE_DATASET } from '../../internal'
import type { TreeNode } from './RendererTree/zero-code'
import { resolveDataCapabilitiesFromDataKey } from '@spark-view/spark-data'
import { extractModelPermission, type ModelPermissionSource } from '../../../permission/index.js'
import type { SparkCapabilityConsumer } from '../../../core/capability-system.js'

// ============================================================
// § 共享类型
// ============================================================

/**
 * DataView(API 视图)在 UI 侧的运行时只读投影。
 *
 * 仅包含可直接映射自 DataView/IDataSource 的数据字段，
 * 不包含容器级解析上下文（resolvedView / resolvedDataRow / modelPermission）。
 */
export interface DataViewIdentityState {
  tableName: ComputedRef<IDataSource['tableName']>
  /** 由 dataKey 反推得到的视图标识；无 dataKey 或非法 dataKey 时为 undefined。 */
  viewId: ComputedRef<string | undefined>
  primaryKey: ComputedRef<string | undefined>
  treeConfig: ComputedRef<TreeConfig | undefined>
}

export interface DataViewRowsState {
  rows: ComputedRef<readonly IDataRow[]>
  /**
   * DataView 自身的当前选中行（来自 DataView 能力线，随 DataView 内部选择变化）。
   * 与 `ContainerDataViewContextState.resolvedDataRow` 语义不同：
   * - view-binding 时两者相等（均为 view.currentRow）
   * - field-binding 时 resolvedDataRow 指向绑定行，currentRow 仍是 view 的选中状态
   * - 容器上下文行优先使用 resolvedDataRow，currentRow 作为最终兜底（见 resolveContextRow）
   */
  currentRow: ComputedRef<IDataRow | null>
  selectedRows: ComputedRef<IDataRow[]>
  isMultiSelect: ComputedRef<boolean>
}

export interface DataViewDisplayState {
  _modelPerm: ComputedRef<IDataSource['_modelPerm']>
  value: ComputedRef<IDataSource['value']>
  label: ComputedRef<IDataSource['label']>
  labels: ComputedRef<IDataSource['labels']>
}

/**
 * 权限投影：
 * - `_modelPerm` 来自 DataView/IDataSource 原始字段
 * - `modelPermission` 为统一权限提取结果（供零代码动作消费）
 */
export interface DataViewPermissionState {
  modelPermission: ComputedRef<IModelPermission | undefined>
}

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

export type DataViewRuntimeState =
  & DataViewIdentityState
  & DataViewRowsState
  & DataViewPermissionState
  & DataViewDisplayState
  & DataViewRequestAndAggregateState

/**
 * 容器级数据解析上下文（不属于 DataView 原始字段）。
 */
export interface ContainerDataViewContextState {
  /** 已解析的 DataView，供子 composable 使用（树形构建、事件桥等）。 */
  resolvedView: ComputedRef<DataView | null>
  /**
   * 容器级有效上下文行，经三级解析：external > dataKey binding > inherited。
   * - view-binding：resolveDataCapabilitiesFromDataKey 返回 view.currentRow，与 DataViewRowsState.currentRow 相等
   * - field-binding：指向 dataKey 绑定的具体行，可与 currentRow 不同
   * - 容器读取上下文行时优先使用本字段，最后回落到 currentRow（见 resolveContextRow）
   */
  resolvedDataRow: ComputedRef<IDataRow | null>
}

/**
 * DataView 投影后的统一视图态（五类容器共享）。
 * 约束：每个容器 dataState 对应“同一 DataSet 下的单一 table + 单一 viewId”。
 * 语义：DataView 对应 API 视图；DataViewState 是该 API 视图在 UI 侧的只读运行时投影。
 */
export type DataViewState = DataViewRuntimeState & ContainerDataViewContextState

type RendererTreeViewState = DataViewState & {
  treeData: ComputedRef<TreeNode[]>
  treeIdField: ComputedRef<string>
}

/**
 * SparkData.createTreeManager 消费的种子节点形状。
 * Table 与 Tree 视图态共用同一类型，此处定义唯一来源。
 */
interface TreeManagerSeedNode extends Record<string, unknown> {
  id: string | number
  name: string
  parentId?: string | number | null
}
type AggregateResultState = Readonly<Record<string, unknown>>
type ResolvedViewRef = ValueRef<DataView | null>


const EMPTY_AGGREGATE_RESULT: AggregateResultState = Object.freeze({})
const EMPTY_SELECTION_AGGREGATE_RESULT: AggregateResultState = Object.freeze({})
const EMPTY_ROWS: readonly IDataRow[] = Object.freeze([]) as readonly IDataRow[]

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function normalizeAggregateResult(value: unknown, emptyValue: AggregateResultState): AggregateResultState {
  return toRecord(value) ?? emptyValue
}

function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function toMutableRows(rows: readonly IDataRow[]): IDataRow[] {
  return rows as IDataRow[]
}

function toTreeRows(rows: readonly IDataRow[]): TreeNode[] {
  return rows as unknown as TreeNode[]
}

function asDataSource(view: DataView | null | undefined): IDataSource | undefined {
  return view as unknown as IDataSource | undefined
}

function buildNestedTreeRows(
  idField: string,
  parentIdField: string,
  textField: string,
  seedNodes: TreeManagerSeedNode[],
): IDataRow[] {
  return SparkData.createTreeManager({
    idField,
    parentIdField,
    textField,
    treeMode: 'nested',
  }, seedNodes).buildNestedTree() as unknown as IDataRow[]
}

// ============================================================
// § DataView API 视图 -> UI 运行时投影（SSOT）
// ============================================================

/**
 * 将 DataView(API 视图)统一投影为容器可消费的 UI 运行时状态。
 */
function useDataViewState(
  resolvedView: ResolvedViewRef,
  dataKey: MaybeRefOrGetter<string | undefined>,
): DataViewRuntimeState & DataViewPermissionState {
  const tableName = computed<IDataSource['tableName']>(() => resolvedView.value?.tableName)
  const viewId = computed<string | undefined>(() => {
    const rawKey = toValue(dataKey)
    if (typeof rawKey !== 'string') return undefined
    const descriptor = parseDataKey(rawKey)
    return descriptor?.viewId
  })
  const rows = computed<readonly IDataRow[]>(() => resolvedView.value?.rows ?? EMPTY_ROWS)
  const currentRow = computed<IDataRow | null>(() => resolvedView.value?.currentRow ?? null)
  const selectedRows = computed<IDataRow[]>(() => resolvedView.value?.selectedRows ?? [])
  const _modelPerm = computed<IDataSource['_modelPerm']>(() => asDataSource(resolvedView.value)?._modelPerm)
  const value = computed<IDataSource['value']>(() => resolvedView.value?.value)
  const label = computed<IDataSource['label']>(() => resolvedView.value?.label)
  const labels = computed<IDataSource['labels']>(() => resolvedView.value?.labels ?? [])
  const primaryKey = computed<string | undefined>(() => resolvedView.value?.primaryKey)
  const isMultiSelect = computed<boolean>(() => resolvedView.value?.isMultiSelect === true)
  const requestState = computed<IDataSource['requestState']>(() => resolvedView.value?.requestState)
  const treeConfig = computed<TreeConfig | undefined>(() => resolvedView.value?.treeConfig)
  const aggregateResult = computed<AggregateResultState>(() => {
    const view = resolvedView.value
    if (!view) return EMPTY_AGGREGATE_RESULT
    return normalizeAggregateResult(view.aggregateResult, EMPTY_AGGREGATE_RESULT)
  })
  const selectionAggregateResult = computed<AggregateResultState>(() => {
    const view = resolvedView.value
    if (!view) return EMPTY_SELECTION_AGGREGATE_RESULT
    return normalizeAggregateResult(view.selectionAggregateResult, EMPTY_SELECTION_AGGREGATE_RESULT)
  })

  const total = computed<number>(() => resolvedView.value?.total ?? 0)
  const page = computed<number>(() => resolvedView.value?.page ?? 1)
  const pageSize = computed<number>(() => resolvedView.value?.pageSize ?? 20)

  const mutating = computed<boolean>(() => resolvedView.value?.mutating ?? false)
  const mutatingError = computed<Error | null>(() => resolvedView.value?.mutatingError ?? null)
  const loadingError = computed<Error | null>(() => resolvedView.value?.loadingError ?? null)

  const modelPermission = computed<IModelPermission | undefined>(() =>
    extractModelPermission(resolvedView.value as ModelPermissionSource | null)
  )

  return {
    tableName,
    viewId,
    rows,
    currentRow,
    selectedRows,
    _modelPerm,
    value,
    label,
    labels,
    primaryKey,
    isMultiSelect,
    requestState,
    treeConfig,
    aggregateResult,
    selectionAggregateResult,
    total,
    page,
    pageSize,
    mutating,
    mutatingError,
    loadingError,
    modelPermission,
  }
}

// ============================================================
// § 共享工具函数（树形构建）
// ============================================================

/**
 * 将原始 parentId 值统一解析为 `string | number | null`。
 * Table 与 Tree 的树形构建逻辑共用此函数。
 */
function resolveParentId(rawParentId: unknown): string | number | null {
  if (typeof rawParentId === 'string' || typeof rawParentId === 'number') return rawParentId
  if (rawParentId === null || rawParentId === undefined) return null
  return String(rawParentId)
}

/**
 * 判断行数据是否已经是嵌套（children 数组）结构，避免重复转换。
 */
function isAlreadyNested(rows: readonly unknown[]): boolean {
  return rows.some(row => {
    const record = toRecord(row)
    if (!record) return false
    return Array.isArray(record['children'])
  })
}

// ============================================================
// § RendererList 视图态
// ============================================================

// ============================================================
// § RendererTable 视图态
// ============================================================

// RendererTable 直接消费 dataState.rows，无需额外表格视图态层。

// ============================================================
// § RendererTable — 树形数据构建
// ============================================================

/**
 * 将平铺行数据按 treeConfig 构建成 el-table 可消费的嵌套 children 结构。
 * 优先复用 DataView 内部已同步的 treeManager；回退到手动组装 seedNodes。
 * 无树配置或数据已是嵌套时原样返回。
 */
export function buildTreeTableRows(
  view: DataView | null | undefined,
  rows: readonly IDataRow[],
  treeConfig: TreeConfig | undefined,
  primaryKey: string | undefined,
): IDataRow[] {
  if (rows.length === 0) return []
  if (isAlreadyNested(rows)) return toMutableRows(rows)
  if (!treeConfig) return toMutableRows(rows)

  // 优先复用 DataView 内部已同步的 TreeManager，直接得到嵌套树
  if (view?.treeManager) {
    return view.treeManager.buildNestedTree() as unknown as IDataRow[]
  }

  const idFieldRaw = treeConfig.idField ?? primaryKey
  if (typeof idFieldRaw !== 'string' || idFieldRaw.length === 0) return toMutableRows(rows)
  const idField = idFieldRaw
  const parentIdField = treeConfig.parentIdField ?? 'parentId'
  const textField = treeConfig.textField ?? 'label'

  const seedNodes: TreeManagerSeedNode[] = []
  let hasParentLink = false

  for (const row of rows) {
    const record = toRecord(row)
    if (!record) continue

    const rawId = record[idField]
    if (typeof rawId !== 'string' && typeof rawId !== 'number') continue

    const parentId = resolveParentId(record[parentIdField])
    if (parentId !== null) hasParentLink = true

    seedNodes.push({
      ...record,
      id: rawId,
      parentId,
      name: readStringField(record, textField) ?? String(record[textField] ?? rawId),
    })
  }

  // 没有有效节点或不存在父子关系时保持平铺
  if (seedNodes.length === 0 || !hasParentLink) return toMutableRows(rows)

  return buildNestedTreeRows(idField, parentIdField, textField, seedNodes)
}

// ============================================================
// § RendererTree 视图态
// ============================================================

type RendererTreeViewStateOptions = {
  dataState: DataViewState
}

export function useRendererTreeViewState(options: RendererTreeViewStateOptions): RendererTreeViewState {
  const { rows, treeConfig } = options.dataState

  /** treeConfig 驱动的 id 字段名称，供 tree 构建和零代码 API 共用 */
  const treeIdField = computed<string>(() => treeConfig.value?.idField ?? 'id')

  const treeData = computed<TreeNode[]>(() => {
    const resolvedRows = toTreeRows(rows.value)
    if (resolvedRows.length === 0) return []
    if (isAlreadyNested(resolvedRows)) return resolvedRows
    if (!treeConfig.value) return resolvedRows

    const view = options.dataState.resolvedView.value
    const idField = treeIdField.value
    const parentIdField = treeConfig.value.parentIdField ?? 'parentId'
    const textField = treeConfig.value.textField ?? 'label'

    // 优先复用 DataView 内部已同步的 TreeManager，直接得到嵌套树
    if (view?.treeManager) {
      return view.treeManager.buildNestedTree() as unknown as TreeNode[]
    }

    const seedNodes: TreeManagerSeedNode[] = resolvedRows.flatMap(row => {
      const rawId = row[idField]
      if (typeof rawId !== 'string' && typeof rawId !== 'number') return []

      const rowRecord = row as Record<string, unknown>
      const displayText = readStringField(rowRecord, textField)
        ?? readStringField(rowRecord, 'label')
        ?? readStringField(rowRecord, 'name')
        ?? readStringField(rowRecord, 'title')
        ?? String(rawId)

      return [{
        ...row,
        id: rawId,
        parentId: resolveParentId(row[parentIdField]),
        name: displayText,
      }]
    })

    return toTreeRows(buildNestedTreeRows(idField, parentIdField, textField, seedNodes))
  })

  return {
    ...options.dataState,
    /** rows 的嵌套树处理版本，直接传给 el-tree :data */
    treeData,
    treeIdField,
  }
}

// ============================================================
// § 容器数据源解析（DataKey -> 单一 DataView）
// ============================================================

interface DataSourceLoggerLike {
  warn(message: string): void
  error(message: string, error?: unknown): void
}

const DEFAULT_DATA_SOURCE_LOGGER: DataSourceLoggerLike = {
  warn: () => {},
  error: () => {},
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function resolveMaybeValue<T>(source: MaybeRefOrGetter<T> | undefined): T | undefined {
  return source === undefined ? undefined : toValue(source)
}

function pickRowFromSource(source: unknown): IDataRow | null {
  if (!isRecordValue(source)) return null
  const currentRow = source['currentRow']
  return isRecordValue(currentRow) ? currentRow as IDataRow : null
}

interface UseContainerDataSourceOptions<TSource> {
  dataKey: MaybeRefOrGetter<string | undefined>
  sparkConsume: SparkCapabilityConsumer
  mapView: (view: DataView) => TSource
  externalDataSource?: MaybeRefOrGetter<TSource | undefined>
  inheritedDataSource?: MaybeRefOrGetter<TSource | null | undefined>
  provideDataSource?: (source: TSource) => void
  logger?: DataSourceLoggerLike
  logPrefix?: string
  /**
   * 设为 true 可跳过全部 effects（provideDataSource + autoLoad）。
   * 当调用方自行管理数据加载生命周期时使用（如 RendererFilter）。
   * @default false
   */
  skipEffects?: boolean
  /**
   * 设为 true 仅跳过 provideDataSource effect。
   * @default false
   */
  skipProvideEffect?: boolean
  /**
   * 设为 true 仅跳过 autoLoad effect。
   * @default false
   */
  skipAutoLoadEffect?: boolean
}

interface UseContainerDataSourceEffectsOptions<TSource> {
  resolvedView: ComputedRef<TSource | null>
  provideDataSource?: (source: TSource) => void
  logger: DataSourceLoggerLike
  logPrefix: string
  skipProvideEffect?: boolean
  skipAutoLoadEffect?: boolean
}

export interface ContainerDataSourceState<TSource> {
  /** 解析到的单一视图实例（当前实现中 DataView 对应单一 table + viewId）。 */
  resolvedView: ComputedRef<TSource | null>
  resolvedDataRow: ComputedRef<IDataRow | null>
}

function useContainerDataSourceCore<TSource>(options: UseContainerDataSourceOptions<TSource>): ContainerDataSourceState<TSource> {
  const pageDataSet = options.sparkConsume(PAGE_DATASET)
  const capabilities = computed(() => resolveDataCapabilitiesFromDataKey(toValue(options.dataKey), pageDataSet))

  const resolvedDataRow = computed<IDataRow | null>(() => {
    const provided = resolveMaybeValue(options.externalDataSource)
    if (provided !== undefined) return pickRowFromSource(provided)

    if (capabilities.value.dataRow !== null) return capabilities.value.dataRow

    const inherited = resolveMaybeValue(options.inheritedDataSource)
    return pickRowFromSource(inherited)
  })

  const resolvedView = computed<TSource | null>(() => {
    const provided = resolveMaybeValue(options.externalDataSource)
    if (provided !== undefined) return provided

    if (capabilities.value.dataSource) return options.mapView(capabilities.value.dataSource)

    const inherited = resolveMaybeValue(options.inheritedDataSource)
    if (inherited !== null && inherited !== undefined) return inherited

    return null
  })

  const skipAllEffects = options.skipEffects === true

  if (!skipAllEffects) {
    useContainerDataSourceEffects({
      resolvedView,
      ...(options.provideDataSource ? { provideDataSource: options.provideDataSource } : {}),
      logger: options.logger ?? DEFAULT_DATA_SOURCE_LOGGER,
      logPrefix: options.logPrefix ?? 'useContainerDataSource',
      ...(options.skipProvideEffect !== undefined ? { skipProvideEffect: options.skipProvideEffect } : {}),
      ...(options.skipAutoLoadEffect !== undefined ? { skipAutoLoadEffect: options.skipAutoLoadEffect } : {}),
    })
  }

  return {
    resolvedView,
    resolvedDataRow,
  }
}

export function useContainerDataSource(
  options: Omit<UseContainerDataSourceOptions<DataView>, 'mapView'>,
): DataViewState {
  const state = useContainerDataSourceCore<DataView>({
    ...options,
    mapView: (view: DataView) => view,
  })
  return { ...useDataViewState(state.resolvedView, options.dataKey), ...state }
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

// ============================================================
// § 容器副作用调度（provide + autoLoad）
// ============================================================

function shouldAutoLoad(view: DataView): boolean {
  if (typeof view.requestData !== 'function') return false

  const autoLoadState = view as { autoLoad?: boolean; autoLoadConfigured?: boolean }
  if (autoLoadState.autoLoadConfigured === true && autoLoadState.autoLoad === false) return false

  const dataTable = view.dataTable
  if (dataTable?.resourceType === 'static-data') return false
  if (!dataTable?.api?.list) return false

  return true
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
      const maybeView = source as DataView
      if (!shouldAutoLoad(maybeView)) return

      void maybeView.requestData().catch((error: unknown) => {
        options.logger.error(`${options.logPrefix}: requestData() 失败`, error)
      })
    },
    { immediate: true },
  )
}

export function useContainerDataSourceEffects<TSource>(options: UseContainerDataSourceEffectsOptions<TSource>): void {
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
