/**
 * CascadeDelegate — 级联订阅委托
 *
 * 从 DataView 提取的级联职责：
 * - 订阅 view source 独立事件（currentRowChanged / selectedRowsChanged / rowsChanged / cleared）
 * - 订阅 fields source 变化事件
 * - 响应源数据变化：清空 or 重新请求
 * - 可取消的级联请求管理
 *
 * 遵循 SOLID：子订阅父，父不知子。
 */

import { Logger } from '@spark-view/spark-utils'
import type { DataRelation } from '../types'
import { resolveViewKey } from '../core/data-key'
import type { ICascadeHost } from './types'

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
  ) {}

  // ─────────────────────────────────────────────
  // 级联订阅
  // ─────────────────────────────────────────────

  /**
   * 建立级联监听
   *
   * 沿 DataSet 查询以本视图为 target 的关系 →
   * 按 source 类型订阅父视图事件或字段源事件。
   */
  setupCascade(): void {
    this.teardownCascade()

    // DataTable 尚未绑定时 dataSet 为 undefined（如独立创建的 DataView），直接跳过
    const dataSet = this.host.dataSet
    if (!dataSet) return
    const parentRels = dataSet.getParentRelations(this.host.tableName, this.host.viewId)

    for (const rel of parentRels) {
      for (const source of rel.sources ?? []) {
        const handler = () => this.respondToSourceChange(rel)

        if (source.type === 'view') {
          const parentView = resolveViewKey(source.viewKey, dataSet)
          if (!parentView) throw new Error(`父视图 ${source.viewKey} 不存在，请检查 DataSet 关系配置`)

          // rowsChanged + cleared 对所有 dep 类型都相关
          parentView.events.on('rowsChanged', handler)
          parentView.events.on('cleared', handler)
          this.cascadeUnsubscribers.push(
            () => parentView.events.off('rowsChanged', handler),
            () => parentView.events.off('cleared', handler),
          )

          const dep = source.state ?? 'currentRow'
          if (dep === 'currentRow') {
            parentView.events.on('currentRowChanged', handler)
            this.cascadeUnsubscribers.push(() => parentView.events.off('currentRowChanged', handler))
          } else if (dep === 'selectedRows') {
            parentView.events.on('selectedRowsChanged', handler)
            this.cascadeUnsubscribers.push(() => parentView.events.off('selectedRowsChanged', handler))
          }
        } else {
          const fields = source.fields ?? (rel.bindings
            ?.filter(binding => binding.sourceId === source.id)
            .map(binding => binding.sourceField) ?? [])
          for (const field of new Set(fields)) {
            this.cascadeUnsubscribers.push(
              dataSet.subscribeFieldSource(source.viewKey, source.scope ?? 'editContext', field, handler),
            )
          }
        }
      }
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
   * 响应源状态变化
   *
   * 由 setupCascade 中按 source 类型订阅的具体事件触发，
   * 无需再做 changeType 过滤——订阅时已完成过滤。
   */
  private respondToSourceChange(rel: DataRelation): Promise<void> {
    // 取消待处理的级联请求
    if (this.pendingCascadeRequest) {
      this.pendingCascadeRequest.cancel()
      logger.debug(`取消级联请求 ${this.pendingCascadeRequest.requestId} (依赖 ${rel.dependencyId ?? rel.relationName ?? ''} 变化)`)
      this.pendingCascadeRequest = undefined
    }

    const requestId = ++this.nextCascadeRequestId
    let cancelled = false
    const dataSet = this.host.dataSet
    if (!dataSet) return Promise.resolve()

    const run = async (): Promise<void> => {
      const filter = dataSet.resolveDependencyFilter(rel)
      if (filter === null) {
        const emptyPolicy = rel.emptyPolicy ?? 'clearRows'
        if (emptyPolicy === 'clearRows') this.host.clearAll()
        return
      }

      if (rel.autoLoad === false) return

      if (!this.host.crudService) {
        this.host.applyInMemoryCascade(rel, [])
        return
      }

      await this.host.refresh()
    }

    this.pendingCascadeRequest = {
      requestId,
      cancel: () => { cancelled = true }
    }

    return run()
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
