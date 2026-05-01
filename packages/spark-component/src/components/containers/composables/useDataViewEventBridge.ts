import { watchEffect } from 'vue'
import type { DataView, IDataRow, RequestState } from '@spark-view/spark-data'
import type { ValueRef } from '../../shared-types.js'

/** DataView 事件名（桥接层内部统一使用）。 */
export type DataViewBridgeEventName =
  | 'currentRowChanged'
  | 'selectedRowsChanged'
  | 'rowsChanged'
  | 'cleared'
  | 'requestStateChanged'
  | 'summaryChanged'
  | 'selectionSummaryChanged'
  | 'mutatingChanged'

/** 桥接层基础上下文：用于统一错误处理、诊断与日志。 */
export interface DataViewBridgeBaseContext {
  /** 事件来源 DataView。 */
  view: DataView
  /** 事件名。 */
  eventName: DataViewBridgeEventName
}

/** currentRowChanged 事件上下文。 */
export interface CurrentRowChangedContext {
  /** 当前行（可为 null，表示清空）。 */
  row: IDataRow | null
  /** 操作来源实例 ID（可选）。 */
  originatorId?: string
  /** 事件来源 DataView。 */
  view: DataView
  /** 固定事件名。 */
  eventName: 'currentRowChanged'
}

/** selectedRowsChanged 事件上下文。 */
export interface SelectedRowsChangedContext {
  /** 当前选中行快照。 */
  rows: IDataRow[]
  /** 操作来源实例 ID（可选）。 */
  originatorId?: string
  /** 事件来源 DataView。 */
  view: DataView
  /** 固定事件名。 */
  eventName: 'selectedRowsChanged'
}

/** rowsChanged 事件上下文。 */
export interface RowsChangedContext {
  /** 事件来源 DataView。 */
  view: DataView
  /** 固定事件名。 */
  eventName: 'rowsChanged'
}

/** cleared 事件上下文（rows/currentRow/selectedRows 已全部清空）。 */
export interface ClearedContext {
  /** 事件来源 DataView。 */
  view: DataView
  /** 固定事件名。 */
  eventName: 'cleared'
}

/** requestStateChanged 事件上下文（Idle/Preparing/Loading/Loaded/Failed）。 */
export interface RequestStateChangedContext {
  /** 新的请求状态。 */
  state: RequestState
  /** 事件来源 DataView。 */
  view: DataView
  /** 固定事件名。 */
  eventName: 'requestStateChanged'
}

/** summaryChanged 事件上下文（aggregateResult 已重算）。 */
export interface SummaryChangedContext {
  /** 事件来源 DataView。 */
  view: DataView
  /** 固定事件名。 */
  eventName: 'summaryChanged'
}

/** selectionSummaryChanged 事件上下文（selectionAggregateResult 已重算）。 */
export interface SelectionSummaryChangedContext {
  /** 事件来源 DataView。 */
  view: DataView
  /** 固定事件名。 */
  eventName: 'selectionSummaryChanged'
}

/** mutatingChanged 事件上下文（CRUD 提交中状态变化）。 */
export interface MutatingChangedContext {
  /** 当前是否正在提交。 */
  mutating: boolean
  /** 事件来源 DataView。 */
  view: DataView
  /** 固定事件名。 */
  eventName: 'mutatingChanged'
}

/** 来源过滤上下文（rowsChanged 不适用，因为无 originatorId）。 */
export interface OriginatorFilterContext {
  /** 操作来源实例 ID；未提供时为 undefined。 */
  originatorId: string | undefined
  /** 事件来源 DataView。 */
  view: DataView
  /** 仅针对携带来源 ID 的事件。 */
  eventName: 'currentRowChanged' | 'selectedRowsChanged'
}

export interface DataViewEventBridgeOptions {
  /** 待桥接的 DataView 引用。 */
  resolvedView: ValueRef<DataView | null | undefined>

  /**
   * 默认来源过滤：
   * - 当事件携带的 originatorId 与该值一致时，直接忽略。
   * - 适用于“组件写入 DataView，再收到同源事件回推”的破循环场景。
   */
  ignoreOriginatorId?: string

  /**
   * 高级来源过滤（可选）：
   * - 返回 true: 允许继续分发事件
   * - 返回 false: 阻止本次分发
   * - 与 ignoreOriginatorId 并存时，任一判定为忽略都不分发
   */
  shouldDispatchByOriginatorId?: (context: OriginatorFilterContext) => boolean

  /**
   * 是否启用桥接。
   * - false: 不订阅任何事件，并触发 onDetached
   * - true/undefined: 正常桥接
   */
  enabled?: boolean

  /** DataView 从有到无，或 enabled=false 时触发。 */
  onDetached?: () => void

  /** DataView 挂载完成后触发（订阅建立前调用）。 */
  onAttached?: (view: DataView) => void

  /** currentRowChanged 事件回调。 */
  onCurrentRowChanged?: (context: CurrentRowChangedContext) => void | Promise<void>

  /** selectedRowsChanged 事件回调。 */
  onSelectedRowsChanged?: (context: SelectedRowsChangedContext) => void | Promise<void>

  /** rowsChanged 事件回调。 */
  onRowsChanged?: (context: RowsChangedContext) => void | Promise<void>

  /** cleared 事件回调（rows/currentRow/selectedRows 已清空）。 */
  onCleared?: (context: ClearedContext) => void | Promise<void>

  /**
   * requestStateChanged 事件回调。
   * 投影到 IDataSource.requestState（Idle/Preparing/Loading/Loaded/Failed）。
   */
  onRequestStateChanged?: (context: RequestStateChangedContext) => void | Promise<void>

  /**
   * summaryChanged 事件回调。
   * aggregateResult（全量行聚合）已重算，通常跟在 rowsChanged 之后。
   */
  onSummaryChanged?: (context: SummaryChangedContext) => void | Promise<void>

  /**
   * selectionSummaryChanged 事件回调。
   * selectionAggregateResult（选中行聚合）已重算，通常跟在 selectedRowsChanged 之后。
   */
  onSelectionSummaryChanged?: (context: SelectionSummaryChangedContext) => void | Promise<void>

  /**
   * mutatingChanged 事件回调。
   * CRUD 提交中（mutating=true）或提交完成（mutating=false）。
   */
  onMutatingChanged?: (context: MutatingChangedContext) => void | Promise<void>

  /**
   * 当事件因来源过滤被忽略时触发。
   * 用于诊断“为什么没有进入业务回调”。
   */
  onIgnoredByOriginatorId?: (context: OriginatorFilterContext) => void

  /**
   * 回调异常统一处理出口：
   * - 提供时交由调用方处理
   * - 未提供时默认 fail-fast（直接抛出）
   */
  onError?: (error: unknown, context: DataViewBridgeBaseContext) => void
}

/**
 * DataView UI 事件桥接中间层。
 *
 * 目标：
 * 1) 统一订阅/解绑，避免容器重复样板代码。
 * 2) 统一 originatorId 过滤语义，消除同源回环。
 * 3) 统一错误边界，避免 Promise 回调静默失败。
 */
export function useDataViewEventBridge(options: DataViewEventBridgeOptions) {
  const handleError = (error: unknown, context: DataViewBridgeBaseContext) => {
    if (options.onError) {
      options.onError(error, context)
      return
    }
    throw error
  }

  const runWithErrorBoundary = (
    eventName: DataViewBridgeEventName,
    view: DataView,
    runner: () => void | Promise<void>,
  ) => {
    try {
      const result = runner()
      if (result && typeof result.catch === 'function') {
        void result.catch((error) => {
          handleError(error, { view, eventName })
        })
      }
    } catch (error) {
      handleError(error, { view, eventName })
    }
  }

  const shouldDispatchByOriginator = (
    originatorId: string | undefined,
    view: DataView,
    eventName: 'currentRowChanged' | 'selectedRowsChanged',
  ): boolean => {
    if (options.ignoreOriginatorId && originatorId === options.ignoreOriginatorId) {
      options.onIgnoredByOriginatorId?.({ originatorId, view, eventName })
      return false
    }

    if (options.shouldDispatchByOriginatorId && !options.shouldDispatchByOriginatorId({ originatorId, view, eventName })) {
      options.onIgnoredByOriginatorId?.({ originatorId, view, eventName })
      return false
    }

    return true
  }

  watchEffect((onCleanup) => {
    if (options.enabled === false) {
      options.onDetached?.()
      return
    }

    const view = options.resolvedView.value
    if (!view) {
      options.onDetached?.()
      return
    }

    options.onAttached?.(view)

    const handleCurrentRowChanged = (row: IDataRow | null, originatorId?: string) => {
      if (!shouldDispatchByOriginator(originatorId, view, 'currentRowChanged')) return
      runWithErrorBoundary('currentRowChanged', view, () =>
        options.onCurrentRowChanged?.({
          row,
          ...(originatorId !== undefined ? { originatorId } : {}),
          view,
          eventName: 'currentRowChanged',
        })
      )
    }

    const handleSelectedRowsChanged = (rows: IDataRow[], originatorId?: string) => {
      if (!shouldDispatchByOriginator(originatorId, view, 'selectedRowsChanged')) return
      runWithErrorBoundary('selectedRowsChanged', view, () =>
        options.onSelectedRowsChanged?.({
          rows,
          ...(originatorId !== undefined ? { originatorId } : {}),
          view,
          eventName: 'selectedRowsChanged',
        })
      )
    }

    const handleRowsChanged = () => {
      runWithErrorBoundary('rowsChanged', view, () =>
        options.onRowsChanged?.({
          view,
          eventName: 'rowsChanged',
        })
      )
    }

    const handleCleared = () => {
      runWithErrorBoundary('cleared', view, () =>
        options.onCleared?.({
          view,
          eventName: 'cleared',
        })
      )
    }

    const handleRequestStateChanged = (state: RequestState) => {
      runWithErrorBoundary('requestStateChanged', view, () =>
        options.onRequestStateChanged?.({
          state,
          view,
          eventName: 'requestStateChanged',
        })
      )
    }

    const handleSummaryChanged = () => {
      runWithErrorBoundary('summaryChanged', view, () =>
        options.onSummaryChanged?.({
          view,
          eventName: 'summaryChanged',
        })
      )
    }

    const handleSelectionSummaryChanged = () => {
      runWithErrorBoundary('selectionSummaryChanged', view, () =>
        options.onSelectionSummaryChanged?.({
          view,
          eventName: 'selectionSummaryChanged',
        })
      )
    }

    const handleMutatingChanged = (mutating: boolean) => {
      runWithErrorBoundary('mutatingChanged', view, () =>
        options.onMutatingChanged?.({
          mutating,
          view,
          eventName: 'mutatingChanged',
        })
      )
    }

    if (options.onCurrentRowChanged) {
      view.events.on('currentRowChanged', handleCurrentRowChanged)
    }
    if (options.onSelectedRowsChanged) {
      view.events.on('selectedRowsChanged', handleSelectedRowsChanged)
    }
    if (options.onRowsChanged) {
      view.events.on('rowsChanged', handleRowsChanged)
    }
    if (options.onCleared) {
      view.events.on('cleared', handleCleared)
    }
    if (options.onRequestStateChanged) {
      view.events.on('requestStateChanged', handleRequestStateChanged)
    }
    if (options.onSummaryChanged) {
      view.events.on('summaryChanged', handleSummaryChanged)
    }
    if (options.onSelectionSummaryChanged) {
      view.events.on('selectionSummaryChanged', handleSelectionSummaryChanged)
    }
    if (options.onMutatingChanged) {
      view.events.on('mutatingChanged', handleMutatingChanged)
    }

    onCleanup(() => {
      if (options.onCurrentRowChanged) {
        view.events.off('currentRowChanged', handleCurrentRowChanged)
      }
      if (options.onSelectedRowsChanged) {
        view.events.off('selectedRowsChanged', handleSelectedRowsChanged)
      }
      if (options.onRowsChanged) {
        view.events.off('rowsChanged', handleRowsChanged)
      }
      if (options.onCleared) {
        view.events.off('cleared', handleCleared)
      }
      if (options.onRequestStateChanged) {
        view.events.off('requestStateChanged', handleRequestStateChanged)
      }
      if (options.onSummaryChanged) {
        view.events.off('summaryChanged', handleSummaryChanged)
      }
      if (options.onSelectionSummaryChanged) {
        view.events.off('selectionSummaryChanged', handleSelectionSummaryChanged)
      }
      if (options.onMutatingChanged) {
        view.events.off('mutatingChanged', handleMutatingChanged)
      }
    })
  })
}

/**
 * DataView -> UI 同步锁：
 * - 用于包裹“由 DataView 事件驱动的 UI 写操作”
 * - 防止 UI 组件反向发出 change 事件后再次回写 DataView 形成回路
 *
 * 说明：与 useDataViewEventBridge 放在同一文件，减少中间层文件数量。
 */
export function useDataViewSyncGuard() {
  /**
   * 嵌套计数锁：
   * - 0: 当前不在“DataView 驱动的 UI 同步阶段”
   * - >0: 正在同步（支持嵌套调用）
   */
  let syncDepth = 0

  function enterViewSync(): void {
    syncDepth += 1
  }

  function leaveViewSync(): void {
    syncDepth = Math.max(0, syncDepth - 1)
  }

  function runWithViewSync<T>(action: () => T): T {
    enterViewSync()
    try {
      return action()
    } finally {
      leaveViewSync()
    }
  }

  async function runWithViewSyncAsync<T>(action: () => Promise<T>): Promise<T> {
    enterViewSync()
    try {
      return await action()
    } finally {
      leaveViewSync()
    }
  }

  function isViewSyncing(): boolean {
    return syncDepth > 0
  }

  /** 当前同步嵌套深度（仅用于调试/诊断）。 */
  function getSyncDepth(): number {
    return syncDepth
  }

  return {
    runWithViewSync,
    runWithViewSyncAsync,
    isViewSyncing,
    getSyncDepth,
  }
}
