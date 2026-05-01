/**
 * useDataViewState — DataView 与全部 UI 容器的统一对接层。
 *
 * 将 DataView 的响应式属性投影为 Vue computed ref，是所有容器 view-state 的唯一基础。
 *
 * 设计原则：
 * - 各容器 view-state 必须通过本层访问 DataView 属性，不得直接读取 `resolvedView.value?.xxx`。
 * - 本层仅做投影（纯 computed），不含状态、事件处理或组件逻辑。
 * - 与 DataView 是镜像关系：DataView 是数据层统一入口，本层是 UI 层统一入口。
 */
import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { DataView, IDataRow, TreeConfig, RequestState } from '@spark-view/spark-data'
import type { ValueRef } from '../../shared-types.js'

// ==============================
// 公共类型
// ==============================

/**
 * useDataViewState 返回的统一视图态（所有容器共享的 DataView 投影）。
 */
export interface DataViewState {
  /** 当前视图所有行（响应式，随 DataView.rows 变化） */
  rows: ComputedRef<IDataRow[]>
  /** 当前选中行，无选中时为 null */
  currentRow: ComputedRef<IDataRow | null>
  /** 多选行数组 */
  selectedRows: ComputedRef<IDataRow[]>
  /** 主键字段名 */
  primaryKey: ComputedRef<string | undefined>
  /** 是否多选模式 */
  isMultiSelect: ComputedRef<boolean>
  /** 请求状态（Idle / Preparing / Loading / Loaded / Error） */
  requestState: ComputedRef<RequestState | undefined>
  /** 树形配置（非树形视图时为 undefined） */
  treeConfig: ComputedRef<TreeConfig | undefined>
  // ─── 分页 ───────────────────────────────────
  /** 服务端总条数（静态视图为行数，分页查询时为服务端返回值） */
  total: ComputedRef<number>
  /** 当前页码（1-based） */
  page: ComputedRef<number>
  /** 每页条数 */
  pageSize: ComputedRef<number>
  // ─── 加载 / 提交状态 ─────────────────────────
  /** 增删改批操作进行中（与 requestState 独立，可同时为 true） */
  mutating: ComputedRef<boolean>
  /** 最近一次增删改批操作的错误；成功或未发起时为 null */
  mutatingError: ComputedRef<Error | null>
  /** 最近一次查询加载的错误；成功或未发起时为 null */
  loadingError: ComputedRef<Error | null>
}

// ==============================
// 核心函数
// ==============================

/**
 * 将 DataView 的属性统一投影为 Vue computed ref。
 *
 * 所有容器 view-state 必须以此为基础，不得绕过本层直接访问 resolvedView。
 *
 * @example
 * ```ts
 * const { rows, isMultiSelect, primaryKey, treeConfig } = useDataViewState(resolvedView)
 * ```
 */
export function useDataViewState(resolvedView: ValueRef<DataView | null | undefined>): DataViewState {
  const rows = computed<IDataRow[]>(() => resolvedView.value?.rows ?? [])
  const currentRow = computed<IDataRow | null>(() => resolvedView.value?.currentRow ?? null)
  const selectedRows = computed<IDataRow[]>(() => resolvedView.value?.selectedRows ?? [])
  const primaryKey = computed<string | undefined>(() => resolvedView.value?.primaryKey)
  const isMultiSelect = computed<boolean>(() => resolvedView.value?.isMultiSelect === true)
  const requestState = computed<RequestState | undefined>(() => resolvedView.value?.requestState)
  const treeConfig = computed<TreeConfig | undefined>(() => resolvedView.value?.treeConfig)

  // 分页
  const total = computed<number>(() => resolvedView.value?.total ?? 0)
  const page = computed<number>(() => resolvedView.value?.page ?? 1)
  const pageSize = computed<number>(() => resolvedView.value?.pageSize ?? 20)

  // 加载 / 提交状态
  const mutating = computed<boolean>(() => resolvedView.value?.mutating ?? false)
  const mutatingError = computed<Error | null>(() => resolvedView.value?.mutatingError ?? null)
  const loadingError = computed<Error | null>(() => resolvedView.value?.loadingError ?? null)

  return {
    rows,
    currentRow,
    selectedRows,
    primaryKey,
    isMultiSelect,
    requestState,
    treeConfig,
    total,
    page,
    pageSize,
    mutating,
    mutatingError,
    loadingError,
  }
}
