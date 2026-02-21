/**
 * CascadeDelegate — 级联订阅委托
 *
 * 从 DataView 提取的级联职责：
 * - 订阅父视图 stateChanged 事件
 * - 按 dependencyType 过滤不相关事件
 * - 响应父数据变化：清空 or 重新请求
 * - 可取消的级联请求管理
 *
 * 遵循 SOLID：子订阅父，父不知子。
 */

import { Logger } from '@spark-view/spark-utils'
import type { DataRelation, ViewStateEvent, IDataRow } from '../types'
import type { DataView } from '../data-view'
import { getParentRows } from '../core/utils'
import type { ICascadeHost, EmitStateChangedFn } from './types'

const logger = Logger('DataView:Cascade')

export class CascadeDelegate {
  /** 级联取消订阅句柄 */
  private cascadeUnsubscribers: (() => void)[] = []
  /** 待处理的级联请求 */
  private pendingCascadeRequest?: {
    requestId: number
    cancel: () => void
  } | undefined
  /** 级联请求 ID 计数器 */
  private nextCascadeRequestId = 0

  constructor(
    private host: ICascadeHost,
    private emit: EmitStateChangedFn,
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
  setupCascade(): void {
    this.teardownCascade()

    const dataSet = this.host.dataSet
    const parentRels = dataSet.getParentRelations(this.host.tableName, this.host.viewId) ?? []

    for (const rel of parentRels) {
      const parentView = dataSet.getView(rel.parentTable, rel.parentViewId ?? 'default')
      if (!parentView) throw new Error(`父视图 ${rel.parentTable}:${rel.parentViewId ?? 'default'} 不存在，请检查 DataSet 关系配置`)

      const handler = (evt: ViewStateEvent) => this.respondToParentChange(rel, parentView, evt)
      parentView.events.on('stateChanged', handler)
      this.cascadeUnsubscribers.push(() => parentView.events.off('stateChanged', handler))
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
   * 事件过滤规则（dependencyType 与 changeType 对应关系）:
   *   dep=currentRow   → 响应 ['rows','cleared','currentRow']
   *   dep=selectedRows → 响应 ['rows','cleared','selectedRows']
   *   dep=allRows      → 响应 ['rows','cleared']
   *   dep=pagedRows    → 响应 ['rows','cleared']
   *   dep=unknown      → fallback：同 currentRow 规则
   */
  private respondToParentChange(rel: DataRelation, parentView: DataView, evt: ViewStateEvent): void {
    if (evt.changeType === 'requestState') return
    if (!this.isRelevantChangeType(rel.dependencyType, evt.changeType)) return

    // 取消待处理的级联请求
    if (this.pendingCascadeRequest) {
      this.pendingCascadeRequest.cancel()
      logger.debug(`取消级联请求 ${this.pendingCascadeRequest.requestId} (父视图 ${rel.parentTable}:${rel.parentViewId ?? 'default'} 变化)`)
      this.pendingCascadeRequest = undefined
    }

    const parentRows: IDataRow[] = getParentRows(parentView, rel.dependencyType)

    if (!parentRows.length) {
      this.host.resetState()
      this.emit('cleared')
      return
    }

    if (rel.autoLoad !== false) {
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
        .catch(err => {
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

  /**
   * 判断 changeType 是否与 dependencyType 相关
   */
  private isRelevantChangeType(dep: string, changeType: ViewStateEvent['changeType']): boolean {
    if (changeType === 'rows' || changeType === 'cleared') return true
    switch (dep) {
      case 'currentRow':   return changeType === 'currentRow'
      case 'selectedRows': return changeType === 'selectedRows'
      case 'allRows':
      case 'pagedRows':    return false
      default:             return changeType === 'currentRow'
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
