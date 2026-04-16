/**
 * CascadeDelegate — 级联订阅委托
 *
 * 从 DataView 提取的级联职责：
 * - 订阅父视图独立事件（currentRowChanged / selectedRowsChanged / rowsChanged / cleared）
 * - 按 dependencyType 选择订阅哪些事件
 * - 响应父数据变化：清空 or 重新请求
 * - 可取消的级联请求管理
 *
 * 遵循 SOLID：子订阅父，父不知子。
 */

import { Logger } from '@spark-view/spark-utils'
import type { DataRelation, IDataSource, IEventEmitter } from '../types'
import { getParentRows } from '../core/utils'
import type { ICascadeHost, EmitClearedFn } from './types'

const logger = Logger('DataView:Cascade')

export class CascadeDelegate {
  /** 级联取消订阅句柄 */
  private cascadeUnsubscribers: Array<() => void> = []
  /** 待处理的级联请求 */
  private pendingCascadeRequest?: {
    requestId: number
    cancel: () => void
  } | undefined
  /** 级联请求 ID 计数器 */
  private nextCascadeRequestId = 0

  constructor(
    private host: ICascadeHost,
    private emitCleared: EmitClearedFn,
  ) {}

  // ─────────────────────────────────────────────
  // 级联订阅
  // ─────────────────────────────────────────────

  /**
   * 建立级联监听
   *
   * 沿 parent 链找到 DataSet → 查询以本视图为 child 的关系 →
   * 订阅每个父视图的 stateChanged 事件。
   */
  /**
   * 建立级联监听
   *
   * 沿 parent 链找到 DataSet → 查询以本视图为 child 的关系 →
   * 按 dependencyType 订阅对应的父视图独立事件。
   */
  setupCascade(): void {
    this.teardownCascade()

    // DataTable 尚未绑定时 dataSet 为 undefined（如独立创建的 DataView），直接跳过
    const dataSet = this.host.dataSet
    if (!dataSet) return
    const parentRels = dataSet.getParentRelations(this.host.tableName, this.host.viewId)

    for (const rel of parentRels) {
      const parentView = dataSet.getView(rel.parentTable, rel.parentViewId ?? 'default')
      if (!parentView) throw new Error(`父视图 ${rel.parentTable}:${rel.parentViewId ?? 'default'} 不存在，请检查 DataSet 关系配置`)

      const handler = () => this.respondToParentChange(rel, parentView)

      // 根据 dependencyType 订阅对应事件
      // rowsChanged + cleared 对所有 dep 类型都相关
      parentView.events.on('rowsChanged', handler)
      parentView.events.on('cleared', handler)
      this.cascadeUnsubscribers.push(
        () => parentView.events.off('rowsChanged', handler),
        () => parentView.events.off('cleared', handler),
      )

      // 按 dep 类型额外订阅具体选中事件
      const dep = rel.dependencyType ?? 'currentRow'
      if (dep === 'currentRow') {
        parentView.events.on('currentRowChanged', handler)
        this.cascadeUnsubscribers.push(() => parentView.events.off('currentRowChanged', handler))
      } else if (dep === 'selectedRows') {
        parentView.events.on('selectedRowsChanged', handler)
        this.cascadeUnsubscribers.push(() => parentView.events.off('selectedRowsChanged', handler))
      }
      // allRows / pagedRows: 只响应 rowsChanged + cleared（已订阅）
    }
  }

  /** 清理全部级联订阅 */
  teardownCascade(): void {
    for (const unsub of this.cascadeUnsubscribers) unsub()
    this.cascadeUnsubscribers = []
  }

  /** 取消待处理的级联请求 */
  cancelPendingRequest(): void {
    if (this.pendingCascadeRequest) {
      this.pendingCascadeRequest.cancel()
      this.pendingCascadeRequest = undefined
    }
  }

  // ─────────────────────────────────────────────
  // 级联响应
  // ─────────────────────────────────────────────

  /**
   * 响应父视图状态变化
   *
   * 由 setupCascade 中按 dependencyType 订阅的具体事件触发，
   * 无需再做 changeType 过滤——订阅时已完成了过滤。
   */
  private respondToParentChange(rel: DataRelation, parentView: IDataSource & { events: IEventEmitter }): void {
    // 取消待处理的级联请求
    if (this.pendingCascadeRequest) {
      this.pendingCascadeRequest.cancel()
      logger.debug(`取消级联请求 ${this.pendingCascadeRequest.requestId} (父视图 ${rel.parentTable}:${rel.parentViewId ?? 'default'} 变化)`)
      this.pendingCascadeRequest = undefined
    }

    const parentRows = getParentRows(parentView, rel.dependencyType ?? 'currentRow')

    if (!parentRows.length) {
      this.host.resetState()
      this.emitCleared()
      return
    }

    if (rel.autoLoad !== false) {
      // 无 API 配置（内联静态数据）→ 内存级联过滤，无需发起网络请求
      if (!this.host.crudService) {
        logger.debug(`内存级联过滤 ${this.host.tableName}:${this.host.viewId}（无 API 配置）`)
        this.host.applyInMemoryCascade(rel, parentRows)
        return
      }

      // 使用 refresh()（下行刷新）而非 requestData()（上行请求）：
      // 父数据变化时子视图可能已处于 Loaded，必须强制重新请求
      // refresh() = resetState() + requestData()，无需此处手动修改 requestState
      const requestId = ++this.nextCascadeRequestId
      let cancelled = false

      void this.host.refresh()
        .then(() => {
          if (!cancelled && this.pendingCascadeRequest?.requestId === requestId) {
            this.pendingCascadeRequest = undefined
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            logger.error(`级联加载 ${this.host.tableName}:${this.host.viewId} 失败 [${requestId}]`, err)
          }
        })

      this.pendingCascadeRequest = {
        requestId,
        cancel: () => { cancelled = true }
      }
    }
  }

  // ─────────────────────────────────────────────
  // 生命周期
  // ─────────────────────────────────────────────

  /** 销毁 — 清理订阅 + 取消待处理请求 */
  destroy(): void {
    this.teardownCascade()
    this.cancelPendingRequest()
  }
}
