/**
 * Vue 适配层：DataView 事件 → 响应式 snapshot
 *
 * 核心设计：
 * - spark-data 提供事件 + getSnapshot()（框架无关）
 * - 本适配层将事件转换为 Vue shallowRef（Vue 特定）
 * - 组件读 snapshot，不依赖 Vue Proxy 特性
 *
 * 与旧方式的区别：
 *   旧：plugin.ts 全局装 DataView.wrapInstance = shallowReactive
 *       → DataView 被迫依赖 Vue，多框架不可复用
 *   新：useDataViewSnapshot() 只在 Vue 组件层做适配
 *       → spark-data 保持框架无关，其他框架可复用
 *
 * @example
 * ```ts
 * const viewRef = ref<DataView | null>(null)
 * const snapshot = useDataViewSnapshot(viewRef)
 *
 * // 组件读 snapshot（而非直接读 view）
 * const rows = computed(() => snapshot.value.rows)
 * const currentRow = computed(() => snapshot.value.currentRow)
 * ```
 */

import { shallowRef, watchEffect, type ShallowRef } from 'vue'
import { RequestState, type DataView, type DataViewSnapshot } from '@spark-view/spark-data'

interface DataViewRefLike<T> {
  readonly value: T
}

const EMPTY_ROWS = Object.freeze([])
const EMPTY_COLUMNS = Object.freeze([])
const EMPTY_LABELS = Object.freeze([])
const EMPTY_AGGREGATE_RESULT = Object.freeze({})
const EMPTY_SELECTION_AGGREGATE_RESULT = Object.freeze({})

/** 空 snapshot 占位（避免 null/undefined 判断的冗余） */
const EMPTY_SNAPSHOT: DataViewSnapshot = Object.freeze({
  tableName: '',
  viewId: '',
  rows: EMPTY_ROWS,
  columns: EMPTY_COLUMNS,
  currentRow: null,
  selectedRows: EMPTY_ROWS,
  isMultiSelect: false,
  requestState: RequestState.Idle,
  total: 0,
  page: 1,
  pageSize: 20,
  mutating: false,
  mutatingError: null,
  loadingError: null,
  aggregateResult: EMPTY_AGGREGATE_RESULT,
  selectionAggregateResult: EMPTY_SELECTION_AGGREGATE_RESULT,
  primaryKey: undefined,
  treeConfig: undefined,
  value: '',
  label: null,
  labels: EMPTY_LABELS,
  revision: 0,
  rowsRevision: 0,
  selectionRevision: 0,
  requestRevision: 0,
  aggregateRevision: 0,
  mutationRevision: 0,
  configRevision: 0,
})

/**
 * Vue composable：订阅 DataView 事件，维护响应式 snapshot。
 *
 * 职责：
 * - 监听 viewRef 的变化
 * - 当 view 变为非 null 时，初始化 snapshot 并订阅其事件
 * - 当 view 变为 null 时，清理订阅并回到空 snapshot
 * - 事件触发时重新同步 snapshot（via getSnapshot()）
 *
 * 返回：
 *   shallowRef<DataViewSnapshot> — 与 view 生命周期同步的响应式快照
 *
 * 注意：
 * - snapshot 本身是 shallowRef，仅追踪引用变化，不深度观察内容
 * - 内容变化由事件驱动，每次事件后 snapshot.value = view.getSnapshot()
 * - 因此 UI 总是读最新状态，但避免了对 rows 数组的深 Proxy 开销
 */
export function useDataViewSnapshot(viewRef: DataViewRefLike<DataView | null>): ShallowRef<DataViewSnapshot> {
  const snapshot = shallowRef<DataViewSnapshot>(EMPTY_SNAPSHOT)

  watchEffect((onCleanup) => {
    const view = viewRef.value
    if (!view) {
      snapshot.value = EMPTY_SNAPSHOT
      return
    }

    // 首次同步状态快照
    snapshot.value = view.getSnapshot()

    // 订阅 DataView 状态变化事件
    const unsubscribe = view.subscribe(() => {
      snapshot.value = view.getSnapshot()
    })

    // watchEffect cleanup：取消订阅
    onCleanup(unsubscribe)
  })

  return snapshot
}
