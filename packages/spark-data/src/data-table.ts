/**
 * DataTable — 数据表（结构 + 多视图管理）
 *
 * 继承 DataView 作为默认视图，管理额外的命名视图
 */

import { DataView } from './data-view'
import { FIELD_METADATA } from '@spark-view/spark-utils'
import type { Provider as CapabilityProvider, CapabilityKey } from '@spark-view/spark-utils'
import type { IDataRow, DataColumn, CrudApi, ITableMetadata } from './types'

export class DataTable extends DataView {
  // 表特有属性
  tableName: string
  columns: DataColumn[]
  api?: CrudApi
  contexts: Record<string, DataView> = {}

  constructor(tableName: string, columns: DataColumn[] = []) {
    super(tableName, 'default')
    this.tableName = tableName
    this.columns = columns
  }

  // ===== 能力注册（供 CapabilityManager 调用） =====

  getCapabilities(): Map<CapabilityKey<unknown>, CapabilityProvider> {
    const caps = new Map<CapabilityKey<unknown>, CapabilityProvider>()

    // 字段元数据
    const meta: Record<string, Record<string, unknown>> = {}
    for (const col of this.columns) {
      meta[col.name] = {
        label: col.label ?? col.name,
        type: col.type,
        isPrimaryKey: col.isPrimaryKey,
        allowDBNull: col.allowDBNull,
        defaultValue: col.defaultValue,
      }
    }
    caps.set(FIELD_METADATA as CapabilityKey<unknown>, {
      name: FIELD_METADATA,
      implementation: meta,
    })

    return caps
  }

  // ===== 上下文管理 =====

  getOrCreateContext(contextId: string): DataView {
    if (contextId === 'default') return this
    this.contexts[contextId] ??= new DataView(this.tableName, contextId, this.dataSet)
    return this.contexts[contextId] as DataView
  }

  /** 把原始数据重新分发到所有子上下文 */
  refreshAllContexts(): void {
    const src = this.originalRows ?? this.rows ?? []
    for (const ctx of Object.values(this.contexts)) {
      // 子上下文的数据来源是表的原始数据
      // 实际过滤由后端完成，这里只做同步
      if (ctx.originalRows) {
        ctx.rows.splice(0, ctx.rows.length, ...ctx.originalRows)
      } else {
        ctx.rows.splice(0, ctx.rows.length, ...src)
      }
    }
  }

  // ===== 序列化 =====

  override toData(): ITableMetadata {
    const ctxData: Record<string, import('./types').IViewMetadata> = {}
    for (const [id, ctx] of Object.entries(this.contexts)) {
      ctxData[id] = ctx.toData()
    }
    const result: ITableMetadata = {
      tableName: this.tableName,
      columns: this.columns,
      hostTable: this.hostTable,
      contextId: this.contextId,
      contexts: ctxData,
      api: this.api,
      loading: this.isLoading,
      error: this.loadingError?.message,
      rows: this.rows,
      filterExpression: this.filterExpression,
      sortExpression: this.sortExpression,
      autoSelectFirst: this.autoSelectFirst,
      page: this.page,
      pageSize: this.pageSize,
    }
    
    if (this.api !== undefined) result.api = this.api
    if (this.filterExpression !== undefined) result.filterExpression = this.filterExpression
    if (this.sortExpression !== undefined) result.sortExpression = this.sortExpression
    if (this.autoSelectFirst !== undefined) result.autoSelectFirst = this.autoSelectFirst
    if (this.page !== undefined) result.page = this.page
    if (this.pageSize !== undefined) result.pageSize = this.pageSize
    
    return result
  }

  // ===== 工厂方法 =====

  static fromTableData(data: ITableMetadata): DataTable {
    const t = new DataTable(data.tableName, data.columns ?? [])
    if (data.api !== undefined) t.api = data.api
    if (data.rows) {
      t.rows = data.rows.map(r => ({ ...r, __permissions: {} } as IDataRow))
    }
    if (data.filterExpression !== undefined) t.filterExpression = data.filterExpression
    if (data.sortExpression !== undefined) t.sortExpression = data.sortExpression
    if (data.autoSelectFirst !== undefined) t.autoSelectFirst = data.autoSelectFirst
    t.page = data.page ?? 1
    t.pageSize = data.pageSize ?? 20

    if (data.contexts) {
      for (const [cid, cd] of Object.entries(data.contexts)) {
        t.contexts[cid] = DataView.fromData(cd, t.tableName, cid)
      }
    }
    return t
  }
}
