/**
 * data-components/view-state.ts
 *
 * 汇总 RendererList / RendererTable / RendererTree / RendererForm / RendererDetail
 * 五类数据容器的"视图态层"，提供：
 *
 *   1. 共享接口（DataViewState 及其组成部分）
 *   2. DataView -> UI 运行时投影（useDataViewState）
 *   3. 容器数据源解析入口（useContainerDataSource）
 *   4. 容器副作用调度（provide + autoLoad）
 *   5. 树形数据构建工具（buildTreeTableRows / useRendererTreeViewState）
 *
 * 各区段以 "§ 区段名称" 注释分隔，便于快速定位。
 */

import { computed, toValue, watch } from 'vue'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import {
  SparkData,
  parseDataKey,
  resolveDataCapabilitiesFromDataKey,
  type DataView,
  type IDataRow,
  type IDataSource,
  type IModelPermission,
  type TreeConfig,
} from '@spark-view/spark-data'
import type { ValueRef } from '../../shared-types.js'
import { PAGE_DATASET } from '../../internal'
import type { TreeNode } from './RendererTree/zero-code'
import { extractModelPermission, type ModelPermissionSource } from '../../../permission/index.js'
import type { SparkCapabilityConsumer } from '../../../core/capability-system.js'
import { useDataViewSnapshot } from '../../../composables/useDataViewSnapshot.js'

// ============================================================
// § 共享接口
// ============================================================

/**
 * DataView 标识态：来自 dataKey 反推或 DataView 本身的静态元信息。
 */
export interface DataViewIdentityState {
  /** DataView 对应的表名（来自 DataView.tableName）。 */
  tableName: ComputedRef<IDataSource['tableName']>
  /**
   * 由 dataKey 反推得到的视图标识。
   * 无 dataKey 或 dataKey 格式非法时为 undefined。
   */
  viewId: ComputedRef<string | undefined>
  /** 主键字段名（来自 DataView.primaryKey）。 */
  primaryKey: ComputedRef<string | undefined>
  /**
   * 树形配置（来自 DataView.treeConfig）。
   * 仅在后端为该视图配置了树结构时有值，否则为 undefined。
   */
  treeConfig: ComputedRef<TreeConfig | undefined>
}

/**
 * DataView 行数据态：当前视图下的行级数据与选择状态。
 */
export interface DataViewRowsState {
  /** 视图当前行列表（分页加载后的当前页数据）。无数据时为冻结空数组。 */
  rows: ComputedRef<readonly IDataRow[]>
  /**
   * DataView 自身的当前选中行（来自 DataView 内部选择能力线）。
   *
   * 与 `ContainerDataViewContextState.resolvedDataRow` 的区别：
   * - 在 view-binding 场景下两者相等（均为 view.currentRow）。
   * - 在 field-binding 场景下，`resolvedDataRow` 指向绑定行，`currentRow` 仍是 view 的选中态。
   * - 容器消费上下文行时优先用 `resolvedDataRow`，最后才回落到 `currentRow`。
   */
  currentRow: ComputedRef<IDataRow | null>
  /** 当前多选选中行列表（el-table 多选框选中的行）。 */
  selectedRows: ComputedRef<readonly IDataRow[]>
  /** 该视图是否处于多选模式（由 DataView.isMultiSelect 驱动）。 */
  isMultiSelect: ComputedRef<boolean>
}

/**
 * DataView 显示态：用于下拉/选择器等展示场景的 value/label 信息。
 */
export interface DataViewDisplayState {
  /** 原始权限元信息（来自后端 DataView 配置，供 extractModelPermission 消费）。 */
  _modelPerm: ComputedRef<IDataSource['_modelPerm']>
  /** 当前行/选中值（用于 picker 等展示组件）。 */
  value: ComputedRef<IDataSource['value']>
  /** 当前行/选中标签（单值显示文本）。 */
  label: ComputedRef<IDataSource['label']>
  /** 多值标签列表（多选展示文本数组）。 */
  labels: ComputedRef<IDataSource['labels']>
}

/**
 * DataView 权限投影：从 `_modelPerm` 解析后的统一模型权限结构。
 *
 * 零代码动作（如按钮可见性/禁用）应消费 `modelPermission`，
 * 不应直接读取 `_modelPerm`（后者为内部原始字段）。
 */
export interface DataViewPermissionState {
  modelPermission: ComputedRef<IModelPermission | undefined>
}

/**
 * DataView 请求与聚合态：分页、加载状态、聚合结果等运行时动态信息。
 */
export interface DataViewRequestAndAggregateState {
  /** 当前 DataView 的远程请求状态（loading / idle / error 等）。 */
  requestState: ComputedRef<IDataSource['requestState']>
  /** 全量聚合结果（如 sum/avg/count 等后端返回的聚合字段）。 */
  aggregateResult: ComputedRef<AggregateResultState>
  /** 当前多选行的聚合结果（仅选中行参与计算）。 */
  selectionAggregateResult: ComputedRef<AggregateResultState>
  /** 服务端返回的总记录数（用于分页组件）。 */
  total: ComputedRef<number>
  /** 当前页码（1-based）。 */
  page: ComputedRef<number>
  /** 每页条数。 */
  pageSize: ComputedRef<number>
  /** 是否正在提交变更（addRow / removeRow 等写操作执行中）。 */
  mutating: ComputedRef<boolean>
  /** 最近一次写操作产生的错误（无错误时为 null）。 */
  mutatingError: ComputedRef<Error | null>
  /** 最近一次数据加载产生的错误（无错误时为 null）。 */
  loadingError: ComputedRef<Error | null>
}

/**
 * DataView 完整运行时投影（上述五个分片的合集）。
 * 不含容器级解析上下文（resolvedView / resolvedDataRow）。
 */
export type DataViewRuntimeState =
  & DataViewIdentityState
  & DataViewRowsState
  & DataViewPermissionState
  & DataViewDisplayState
  & DataViewRequestAndAggregateState

/**
 * 容器级数据解析上下文（不属于 DataView 原始字段，由容器组件本地计算）。
 */
export interface ContainerDataViewContextState {
  /**
   * 已解析的 DataView 实例，供子 composable 使用（树形构建、事件桥、CRUD 等）。
   * 无 dataKey 或 DataSet 中不存在对应视图时为 null。
   */
  resolvedView: ComputedRef<DataView | null>
  /**
   * 容器级有效上下文行，经三级优先级解析：
   *   1. 外部注入行（externalDataSource 携带的 currentRow）
   *   2. dataKey 绑定行（resolveDataCapabilitiesFromDataKey 返回的 dataRow）
   *   3. 继承上下文行（inheritedDataSource 携带的 currentRow）
   *
   * 容器读取上下文行时优先使用本字段，最后回落到 currentRow。
   */
  resolvedDataRow: ComputedRef<IDataRow | null>
}

/**
 * DataView 完整视图态（五类容器共享的顶层类型）。
 *
 * 约束：每个容器 dataState 对应"同一 DataSet 下的单一 table + 单一 viewId"。
 * 语义：DataView 是 API 视图；DataViewState 是该视图在 UI 侧的只读运行时投影。
 */
export type DataViewState = DataViewRuntimeState & ContainerDataViewContextState

// ============================================================
// § 内部类型（仅本文件使用）
// ============================================================

/** 树形视图态（RendererTree 专用扩展）。 */
type RendererTreeViewState = DataViewState & {
  /** 经过嵌套处理的树形行数据，直接传给 el-tree :data。 */
  treeData: ComputedRef<TreeNode[]>
  /** treeConfig 解析出的 id 字段名（供零代码 API 共用）。 */
  treeIdField: ComputedRef<string>
}

/**
 * SparkData.createTreeManager 消费的种子节点形状。
 * Table 与 Tree 视图态共用同一类型。
 */
interface TreeManagerSeedNode extends Record<string, unknown> {
  id: string | number
  name: string
  parentId?: string | number | null
}

/** 聚合结果的运行时类型（key -> 聚合值）。 */
type AggregateResultState = Readonly<Record<string, unknown>>

/** resolvedView 的标准 ref 形态（ValueRef 来自 shared-types）。 */
type ResolvedViewRef = ValueRef<DataView | null>

// ============================================================
// § 模块级常量
// ============================================================

/** 空聚合结果占位（全量），冻结防止意外修改。 */
const EMPTY_AGGREGATE_RESULT: AggregateResultState = Object.freeze({})

/** 空聚合结果占位（选中行），与全量版本分开以保持引用稳定性。 */
const EMPTY_SELECTION_AGGREGATE_RESULT: AggregateResultState = Object.freeze({})

// ============================================================
// § 内部纯函数工具
// ============================================================

/** 类型保护：判断 value 是否为普通对象（非 null、非数组）。 */
function toRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

/** 将 unknown 转为聚合结果对象；转换失败时返回 emptyValue 占位。 */
function normalizeAggregateResult(value: unknown, emptyValue: AggregateResultState): AggregateResultState {
  return toRecord(value) ?? emptyValue
}

/** 从 Record 中安全读取字符串字段，非字符串时返回 undefined。 */
function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

/** 将只读行数组强转为可变数组（el-table 要求 mutable）。 */
function toMutableRows(rows: readonly IDataRow[]): IDataRow[] {
  return rows as IDataRow[]
}

/** 将 DataRow 数组强转为 TreeNode 数组（RendererTree 内部用）。 */
function toTreeRows(rows: readonly IDataRow[]): TreeNode[] {
  return rows as unknown as TreeNode[]
}

/**
 * 将原始 parentId 值统一规范化为 `string | number | null`。
 * - string / number → 原样返回
 * - null / undefined → null
 * - 其他类型 → toString() 后返回
 */
function resolveParentId(rawParentId: unknown): string | number | null {
  if (typeof rawParentId === 'string' || typeof rawParentId === 'number') return rawParentId
  if (rawParentId === null || rawParentId === undefined) return null
  return String(rawParentId)
}

/**
 * 判断行列表是否已经是嵌套（含 children 数组）结构。
 * 用于避免重复嵌套转换：若数据已来自服务端嵌套返回，则直接透传。
 */
function isAlreadyNested(rows: readonly unknown[]): boolean {
  return rows.some(row => {
    const record = toRecord(row)
    if (!record) return false
    return Array.isArray(record['children'])
  })
}

/**
 * 调用 SparkData.createTreeManager 将 seedNodes 构建为嵌套树结构。
 * idField / parentIdField / textField 均由调用方从 treeConfig 解析后传入。
 */
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
// § DataView -> UI 运行时投影（SSOT）
// ============================================================

/**
 * 将一个 DataView（API 视图）实例统一投影为容器可消费的 UI 运行时只读状态。
 *
 * 这是整个视图态层的核心转换入口，所有五类容器的 dataState 均由此生成。
 * 调用时机：在 `useContainerDataSource` 内部，resolvedView 确定后立即调用。
 *
 * 改进（vs 旧版本）：
 * - 不再直接读 resolvedView.value?.rows（依赖 Vue Proxy）
 * - 改用 DataView.getSnapshot() + 事件订阅驱动（框架适配）
 * - 这样 spark-data 与框架解耦，其他框架也能复用
 *
 * @param resolvedView - 已解析的 DataView 的响应式 ref（可为 null）
 * @param dataKey      - 原始 dataKey prop（用于反推 viewId）
 */
function useDataViewState(
  resolvedView: ResolvedViewRef,
  dataKey: MaybeRefOrGetter<string | undefined>,
): DataViewRuntimeState & DataViewPermissionState {
  // Vue 适配层：DataView 事件 → 响应式 snapshot
  const snapshot = useDataViewSnapshot(resolvedView)

  // —— 标识态 ——
  const tableName = computed<IDataSource['tableName']>(() => snapshot.value.tableName)

  // viewId 不从 DataView 直接读取，而由 dataKey 反推，保证与配置来源一致
  const viewId = computed<string | undefined>(() => {
    const rawKey = toValue(dataKey)
    if (typeof rawKey !== 'string') return undefined
    const descriptor = parseDataKey(rawKey)
    return descriptor?.viewId
  })

  const primaryKey = computed<string | undefined>(() => snapshot.value.primaryKey)
  const treeConfig  = computed<TreeConfig | undefined>(() => snapshot.value.treeConfig)

  // —— 行数据态 ——
  // 直接从 snapshot 读取（由事件订阅驱动更新，无 Vue Proxy 依赖）
  const rows         = computed<readonly IDataRow[]>(() => snapshot.value.rows)
  const currentRow   = computed<IDataRow | null>(() => snapshot.value.currentRow)
  const selectedRows = computed<IDataRow[]>(() => snapshot.value.selectedRows as IDataRow[])
  const isMultiSelect = computed<boolean>(() => snapshot.value.isMultiSelect)

  // —— 显示态 ——
  const _modelPerm = computed<IDataSource['_modelPerm']>(() => snapshot.value._modelPerm)
  const value      = computed<IDataSource['value']>(() => snapshot.value.value)
  const label      = computed<IDataSource['label']>(() => snapshot.value.label)
  const labels     = computed<IDataSource['labels']>(() => snapshot.value.labels)

  // —— 请求与聚合态 ——
  const requestState = computed<IDataSource['requestState']>(() => snapshot.value.requestState)

  const aggregateResult = computed<AggregateResultState>(() =>
    normalizeAggregateResult(snapshot.value.aggregateResult, EMPTY_AGGREGATE_RESULT),
  )

  const selectionAggregateResult = computed<AggregateResultState>(() =>
    normalizeAggregateResult(snapshot.value.selectionAggregateResult, EMPTY_SELECTION_AGGREGATE_RESULT),
  )

  const total     = computed<number>(() => snapshot.value.total)
  const page      = computed<number>(() => snapshot.value.page)
  const pageSize  = computed<number>(() => snapshot.value.pageSize)

  const mutating      = computed<boolean>(() => snapshot.value.mutating)
  const mutatingError = computed<Error | null>(() => snapshot.value.mutatingError)
  const loadingError  = computed<Error | null>(() => snapshot.value.loadingError)

  // —— 权限投影 ——
  // 读 snapshot，确保 _modelPerm 变化也能由 stateChanged 驱动 UI 失效。
  const modelPermission = computed<IModelPermission | undefined>(() =>
    extractModelPermission(snapshot.value as ModelPermissionSource),
  )

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

// ============================================================
// § 树形数据构建（RendererTable / RendererTree 共用）
// ============================================================

/**
 * 将平铺行数据按 treeConfig 配置构建成 el-table 可消费的嵌套 children 结构。
 *
 * 构建优先级：
 *   1. DataView 内部已同步的 treeManager（性能最优，直接调用 buildNestedTree()）
 *   2. 手动从 rows 组装 seedNodes 后调用 SparkData.createTreeManager
 *
 * 边界处理：
 *   - rows 为空 → 返回 []
 *   - 数据已是嵌套结构 → 原样透传（避免双重嵌套）
 *   - 无 treeConfig → 原样透传（普通列表）
 *   - 无有效 idField → 原样透传
 *   - 所有行均无父子关系 → 原样透传（保持平铺）
 *
 * @param view       - 当前 DataView 实例（用于访问内部 treeManager）
 * @param rows       - 当前视图的行数据（已分页）
 * @param treeConfig - 来自 DataView.treeConfig 的树形配置
 * @param primaryKey - DataView.primaryKey，作为 idField 的回退值
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

  // 优先路径：DataView 内部的 treeManager 已与行数据同步，直接调用
  if (view?.treeManager) {
    return view.treeManager.buildNestedTree() as unknown as IDataRow[]
  }

  // 回退路径：手动组装 seedNodes
  const idFieldRaw = treeConfig.idField ?? primaryKey
  if (typeof idFieldRaw !== 'string' || idFieldRaw.length === 0) return toMutableRows(rows)

  const idField       = idFieldRaw
  const parentIdField = treeConfig.parentIdField ?? 'parentId'
  const textField     = treeConfig.textField ?? 'label'

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

  // 无有效节点或不存在父子关系时保持平铺，不做嵌套转换
  if (seedNodes.length === 0 || !hasParentLink) return toMutableRows(rows)

  return buildNestedTreeRows(idField, parentIdField, textField, seedNodes)
}

// ============================================================
// § RendererTable 视图态
// ============================================================

// RendererTable 直接消费 dataState.rows（经 buildTreeTableRows 处理后传给 el-table），
// 无需单独的视图态包装层，保持最小化状态路径。

// ============================================================
// § RendererTree 视图态
// ============================================================

/** useRendererTreeViewState 的入参选项。 */
type RendererTreeViewStateOptions = {
  /** 由 useContainerDataSource 解析出的完整 DataViewState。 */
  dataState: DataViewState
}

/**
 * 在 DataViewState 基础上扩展 RendererTree 专用的树形数据和 id 字段。
 *
 * 职责：
 *   - 计算 treeIdField（供 TreeAPI 能力和零代码动作读取）
 *   - 将平铺 rows 转换为嵌套 TreeNode 列表（treeData）
 *   - 透传所有 DataViewState 字段（...options.dataState）
 *
 * @param options.dataState - 上游 useContainerDataSource 返回的视图态
 */
export function useRendererTreeViewState(options: RendererTreeViewStateOptions): RendererTreeViewState {
  const { rows, treeConfig } = options.dataState

  /** treeConfig 中配置的 id 字段名；无配置时回落到 'id'。 */
  const treeIdField = computed<string>(() => treeConfig.value?.idField ?? 'id')

  const treeData = computed<TreeNode[]>(() => {
    const resolvedRows = toTreeRows(rows.value)
    if (resolvedRows.length === 0) return []
    if (isAlreadyNested(resolvedRows)) return resolvedRows
    if (!treeConfig.value) return resolvedRows

    const view          = options.dataState.resolvedView.value
    const idField       = treeIdField.value
    const parentIdField = treeConfig.value.parentIdField ?? 'parentId'
    const textField     = treeConfig.value.textField ?? 'label'

    // 优先路径：复用 DataView 内部 treeManager
    if (view?.treeManager) {
      return view.treeManager.buildNestedTree() as unknown as TreeNode[]
    }

    // 回退路径：手动组装 seedNodes
    const seedNodes: TreeManagerSeedNode[] = resolvedRows.flatMap(row => {
      const rawId = row[idField]
      if (typeof rawId !== 'string' && typeof rawId !== 'number') return []

      const rowRecord  = row as Record<string, unknown>
      // 依次尝试常见显示字段，均无值时降级为 id 的字符串形式
      const displayText =
        readStringField(rowRecord, textField) ??
        readStringField(rowRecord, 'label') ??
        readStringField(rowRecord, 'name') ??
        readStringField(rowRecord, 'title') ??
        String(rawId)

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
    /** rows 的嵌套树处理版本，直接传给 el-tree :data。 */
    treeData,
    treeIdField,
  }
}

// ============================================================
// § 容器数据源解析（DataKey -> 单一 DataView）
// ============================================================

/** 极简日志接口，仅供 useContainerDataSource 内部使用。 */
interface DataSourceLoggerLike {
  warn(message: string): void
  error(message: string, error?: unknown): void
}

/** 无实现日志（skipEffects 场景下的默认值）。 */
const DEFAULT_DATA_SOURCE_LOGGER: DataSourceLoggerLike = {
  warn: () => {},
  error: () => {},
}

/** 类型保护：value 是否为普通对象（非 null、非数组）。 */
function isRecordValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 安全取值：若 source 为 undefined 则返回 undefined，
 * 否则调用 toValue（支持 ref / getter / 裸值）。
 */
function resolveMaybeValue<T>(source: MaybeRefOrGetter<T> | undefined): T | undefined {
  return source === undefined ? undefined : toValue(source)
}

/**
 * 从数据源对象中提取 currentRow。
 * 数据源（IDataSource / DataView）遵循 { currentRow: IDataRow } 协议。
 */
function pickRowFromSource(source: unknown): IDataRow | null {
  if (!isRecordValue(source)) return null
  const currentRow = source['currentRow']
  return isRecordValue(currentRow) ? currentRow as IDataRow : null
}

/**
 * useContainerDataSource（及其泛型内核 useContainerDataSourceCore）的选项。
 */
interface UseContainerDataSourceOptions<TSource> {
  /** 组件 prop 中的 dataKey（`table@viewId@field` 格式字符串）。 */
  dataKey: MaybeRefOrGetter<string | undefined>
  /** SPARK 能力消费函数（来自容器组件内的 sparkConsume）。 */
  sparkConsume: SparkCapabilityConsumer
  /**
   * 将 DataView 转换为具体视图类型的映射函数。
   * 非泛型版本（useContainerDataSource）固定为 `(view) => view`。
   */
  mapView: (view: DataView) => TSource
  /**
   * 外部注入的数据源（props.dataSource 等上层直接传入的视图）。
   * 优先级最高，有值时跳过 dataKey 解析。
   */
  externalDataSource?: MaybeRefOrGetter<TSource | undefined>
  /**
   * 继承自父容器的数据源（通过 DATA_SOURCE 能力线向下传递）。
   * 优先级最低，仅在 dataKey 和 externalDataSource 均无效时使用。
   */
  inheritedDataSource?: MaybeRefOrGetter<TSource | null | undefined>
  /**
   * 解析成功后将数据源通过能力线向下提供给子组件。
   * 通常为 `(source) => sparkProvide(DATA_SOURCE, source)`。
   */
  provideDataSource?: (source: TSource) => void
  /** 日志实例（可选，默认为空实现）。 */
  logger?: DataSourceLoggerLike
  /** 日志前缀，用于区分不同容器的日志来源（可选）。 */
  logPrefix?: string
  /**
   * 设为 true 可跳过全部副作用（provideDataSource + autoLoad）。
   * 适用于调用方自行管理数据加载生命周期的场景（如 RendererFilter）。
   * @default false
   */
  skipEffects?: boolean
  /**
   * 设为 true 仅跳过 provideDataSource 副作用。
   * @default false
   */
  skipProvideEffect?: boolean
  /**
   * 设为 true 仅跳过 autoLoad 副作用。
   * @default false
   */
  skipAutoLoadEffect?: boolean
}

/** useContainerDataSourceEffects 的参数接口（解耦副作用调度与数据解析）。 */
interface UseContainerDataSourceEffectsOptions<TSource> {
  resolvedView: ComputedRef<TSource | null>
  provideDataSource?: (source: TSource) => void
  logger: DataSourceLoggerLike
  logPrefix: string
  skipProvideEffect?: boolean
  skipAutoLoadEffect?: boolean
}

/** useContainerDataSource 的返回类型（对外暴露的最小接口）。 */
export interface ContainerDataSourceState<TSource> {
  /**
   * 已解析的单一视图实例。
   * 当前实现中一个 dataKey 对应 DataSet 中的单一 table + viewId，
   * 解析失败时为 null。
   */
  resolvedView: ComputedRef<TSource | null>
  /** 容器级有效上下文行（三级优先级解析结果，见 ContainerDataViewContextState）。 */
  resolvedDataRow: ComputedRef<IDataRow | null>
}

/**
 * useContainerDataSource 的泛型内核，支持将 DataView 映射为任意 TSource。
 *
 * 数据源三级优先级（从高到低）：
 *   1. externalDataSource（外部注入）
 *   2. dataKey 解析（通过 PAGE_DATASET）
 *   3. inheritedDataSource（父容器继承）
 */
function useContainerDataSourceCore<TSource>(options: UseContainerDataSourceOptions<TSource>): ContainerDataSourceState<TSource> {
  const pageDataSet = options.sparkConsume(PAGE_DATASET)

  // 每次 dataKey 变化时重新解析能力（dataRow + dataSource）
  const capabilities = computed(() =>
    resolveDataCapabilitiesFromDataKey(toValue(options.dataKey), pageDataSet),
  )

  // resolvedDataRow：提取有效上下文行，按三级优先级依次尝试
  const resolvedDataRow = computed<IDataRow | null>(() => {
    const provided = resolveMaybeValue(options.externalDataSource)
    if (provided !== undefined) return pickRowFromSource(provided)

    if (capabilities.value.dataRow !== null) return capabilities.value.dataRow

    const inherited = resolveMaybeValue(options.inheritedDataSource)
    return pickRowFromSource(inherited)
  })

  // resolvedView：按同一优先级确定最终数据源实例
  const resolvedView = computed<TSource | null>(() => {
    const provided = resolveMaybeValue(options.externalDataSource)
    if (provided !== undefined) return provided

    if (capabilities.value.dataSource) return options.mapView(capabilities.value.dataSource)

    const inherited = resolveMaybeValue(options.inheritedDataSource)
    if (inherited !== null && inherited !== undefined) return inherited

    return null
  })

  // 非 skipEffects 模式下启动副作用（provide + autoLoad）
  if (options.skipEffects !== true) {
    useContainerDataSourceEffects({
      resolvedView,
      ...(options.provideDataSource ? { provideDataSource: options.provideDataSource } : {}),
      logger:    options.logger    ?? DEFAULT_DATA_SOURCE_LOGGER,
      logPrefix: options.logPrefix ?? 'useContainerDataSource',
      ...(options.skipProvideEffect  !== undefined ? { skipProvideEffect:  options.skipProvideEffect  } : {}),
      ...(options.skipAutoLoadEffect !== undefined ? { skipAutoLoadEffect: options.skipAutoLoadEffect } : {}),
    })
  }

  return { resolvedView, resolvedDataRow }
}

/**
 * 容器数据源解析主入口（供五类容器组件调用）。
 *
 * 内部调用 useContainerDataSourceCore（mapView 固定为恒等函数），
 * 并将解析结果与 useDataViewState 的投影合并为完整 DataViewState。
 *
 * @example
 * ```ts
 * const dataState = useContainerDataSource({
 *   dataKey: () => props.dataKey,
 *   sparkConsume,
 *   provideDataSource: (source) => sparkProvide(DATA_SOURCE, source),
 * })
 * ```
 */
export function useContainerDataSource(
  options: Omit<UseContainerDataSourceOptions<DataView>, 'mapView'>,
): DataViewState {
  const state = useContainerDataSourceCore<DataView>({
    ...options,
    mapView: (view: DataView) => view,
  })
  return { ...useDataViewState(state.resolvedView, options.dataKey), ...state }
}

// ============================================================
// § 容器副作用调度（provide + autoLoad）
// ============================================================

/**
 * 判断 DataView 是否应触发自动加载（autoLoad）。
 *
 * 短路条件（任一成立则跳过加载）：
 *   - view 未实现 requestData 方法
 *   - 配置了 autoLoad = false（明确禁用）
 *   - 数据源类型为 static-data（本地静态数据，无需请求）
 *   - DataTable 未配置 api.list（无远程列表接口）
 */
function shouldAutoLoad(view: DataView): boolean {
  if (typeof view.requestData !== 'function') return false

  // 明确配置了 autoLoad: false 时跳过
  const autoLoadState = view as { autoLoad?: boolean; autoLoadConfigured?: boolean }
  if (autoLoadState.autoLoadConfigured === true && autoLoadState.autoLoad === false) return false

  const dataTable = view.dataTable
  if (dataTable?.resourceType === 'static-data') return false
  if (!dataTable?.api?.list) return false

  return true
}

/**
 * provide 副作用：resolvedView 首次变为非 null 时，通过能力线向下提供数据源。
 * 使用 immediate: true 确保挂载时就触发 provide，而非等到视图变化。
 */
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

/**
 * autoLoad 副作用：resolvedView 首次变为非 null 且满足 shouldAutoLoad 条件时，
 * 自动调用 requestData() 触发远程数据加载。
 *
 * 仅适用于有 api.list 且未被明确禁用的 DataView。
 * requestData() 失败时通过 logger.error 记录，不抛出。
 */
function useContainerDataSourceAutoLoadEffect<TSource>(options: {
  resolvedView: ComputedRef<TSource | null>
  logger: DataSourceLoggerLike
  logPrefix: string
}): void {
  watch(
    options.resolvedView,
    (source) => {
      if (source === null) return
      // @ts-expect-error TSource 在编译时无法验证是否为 DataView，但运行时必然是
      const maybeView: DataView = source
      if (!shouldAutoLoad(maybeView)) return

      void maybeView.requestData().catch((error: unknown) => {
        options.logger.error(`${options.logPrefix}: requestData() 失败`, error)
      })
    },
    { immediate: true },
  )
}

/**
 * 组合调度 provide 与 autoLoad 两个副作用。
 * 由 useContainerDataSourceCore 内部调用；也可由容器组件手动调用（当 skipEffects = true 时）。
 *
 * @param options.skipProvideEffect  - 是否跳过 provide 副作用
 * @param options.skipAutoLoadEffect - 是否跳过 autoLoad 副作用
 */
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
      logger:    options.logger,
      logPrefix: options.logPrefix,
    })
  }
}
