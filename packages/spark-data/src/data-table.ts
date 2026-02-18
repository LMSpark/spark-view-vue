/**
 * DataTable — 数据表（表结构定义、配置管理、视图容器）
 *
 * 职责（按功能分区）：
 *  - 能力暴露：作为 ICapabilityContext 并通过 `DATA_TABLE` 提供表级能力（仅结构/配置）
 *  - 表元数据：管理 tableName、columns、api、crudConfig（不含具体数据）
 *  - 视图容器：维护 default 与命名视图的集合（不遍历、不协调、不关心运行时状态）
 *  - 单视图委托：notifySubscribers(viewId) 仅做单视图通知委托
 *  - 配置中心：提供 api 和 crudConfig 给 DataView 使用
 *  - 序列化：提供 toData()/fromTableData 用于持久化与恢复
 *
 * 设计要点：
 *  - 纯结构定义，不包含任何数据操作（数据操作在 DataView）
 *  - 不遍历视图、不执行跨视图协调、不关心视图运行时状态（协调逻辑在 DataSet）
 *  - `default` 视图为主数据源，命名视图保存独立的过滤/排序/分页状态
 *  - CrudOperationConfig 作为表级属性，所有视图共享同一配置
 *  - 符合 SOLID：单一职责（结构定义）、依赖倒置（不依赖运行时状态）
 */

import { DataView } from './data-view'
import { reactive } from 'vue'
import { DATA_TABLE, provide as setCapability } from '@spark-view/spark-utils'
import type { CapabilityName, ICapabilityContext } from '@spark-view/spark-utils'
import type { DataColumn, CrudApi, ITableMetadata, IViewMetadata, CrudOperationConfig } from './types'
import type { TreeManager } from './tree-manager'

// ===== 能力接口（与类共同定义，避免循环引用） =====

/** DataTable 向能力系统暴露的能力（仅表结构，不含 UI 状态） */
export interface IDataTableCapability {
  readonly dataTable: DataTable
}

/**
 * DataTable - 管理单表的结构定义与配置
 *
 * 说明：管理表结构（columns）、视图集合（DataView）、CRUD 配置（api, crudConfig）；
 * 将自身以 `DATA_TABLE` 能力注入能力系统（仅结构/配置，不含数据）；
 * 数据操作由 DataView 负责。
 */
export class DataTable implements ICapabilityContext {
  // ===== ICapabilityContext =====

  /** 唯一标识 */
  id: string

  /** 上下文类型 */
  readonly type = 'datatable'

  /** 父级上下文（DataSet），由 DataSet 在构建时设置 */
  parent?: ICapabilityContext

  /** 能力 Map */
  capabilities = new Map<CapabilityName, unknown>()

  // ===== 表元数据 =====

  /** 表名 */
  tableName: string

  /** 列定义 */
  columns: DataColumn[]

  /** CRUD API配置 */
  api?: CrudApi

  /** CRUD 操作配置（全局默认配置） */
  crudConfig?: CrudOperationConfig

  // ===== 视图容器 =====

  /** 视图集合（包含 'default'） */
  views: Record<string, DataView> = {}

  // ===== 构造函数 =====

  /**
   * 创建 DataTable 实例
   * - 自动创建 `default` DataView
   * - 将 DataTable 以 `DATA_TABLE` 能力注册到能力系统
   */
  constructor(tableName: string, columns: DataColumn[] = []) {
    this.tableName = tableName
    this.id = `dt:${tableName}`
    this.columns = columns
    this.views['default'] = reactive(new DataView(tableName, 'default')) as DataView

    // 注册 DATA_TABLE 能力
    const table = this
    setCapability(this, DATA_TABLE, {
      get dataTable() { return table }
    } satisfies IDataTableCapability)
  }

  // ===== DataSet 关联（设置 parent 链） =====

  /**
   * 将 DataTable 绑定到 DataSet（设置 parent 链）
   * @param ds - DataSet 的 ICapabilityContext，用于建立能力链（parent）
   * @remarks 为每个 DataView 设置 parent 并调用 setupCascade，使视图能响应父级变化
   */
  setDataSet(ds: ICapabilityContext): void {
    this.parent = ds
    // 统一设置所有视图的 parent 链并建立级联订阅
    for (const view of Object.values(this.views)) {
      view.parent = this
      view.setupCascade()
    }
  }

  getDataSet(): ICapabilityContext | undefined {
    return this.parent
  }

  // ===== 视图管理 =====

  /**
   * 获取或创建视图
   * @param viewId - 视图 ID（'default' 为主视图）
   * @returns 对应的 DataView 实例
   * @behavior 若表已关联 DataSet，会为新视图设置 parent 并触发 setupCascade
   */
  getOrCreateView(viewId: string): DataView {
    if (!this.views[viewId]) {
      const view = reactive(new DataView(this.tableName, viewId)) as DataView
      // 视图管理职责：设置 parent 链并触发级联
      if (this.parent) {
        view.parent = this
        view.setupCascade()
      }
      this.views[viewId] = view
    }
    return this.views[viewId]
  }

  /**
   * 通知指定视图的订阅者（DataSet 的委托入口，仅单视图）
   * @param viewId - 视图 ID（必须指定）
   * @remarks 广播逻辑由 DataSet 负责（协调层），DataTable 只做单视图委托（结构层）
   */
  notifySubscribers(viewId: string): void {
    const view = this.getOrCreateView(viewId)
    view.notifySubscribers()
  }

  /**
   * 将 TreeManager 委托给 `default` 视图（常用于自引用树场景）
   * @param tm - TreeManager 实例
   */
  setTreeManager(tm: TreeManager): void { this.getOrCreateView('default').setTreeManager(tm) }
  /**
   * 返回绑定到 `default` 视图的 TreeManager（如有）
   */
  getTreeManager(): TreeManager | undefined { return this.getOrCreateView('default').getTreeManager() }

  // ===== 配置管理 =====

  /**
   * 设置 CRUD API 配置
   * @param api - CRUD 端点配置
   */
  setApi(api: CrudApi): void { this.api = api }

  /**
   * 设置 CRUD 操作配置（权限、超时、重试等）
   * @param config - CRUD 操作配置
   */
  setCrudConfig(config: CrudOperationConfig): void { this.crudConfig = config }

  // ===== 序列化 / 反序列化 =====

  /**
   * 将 DataTable 序列化为 ITableMetadata（主要序列化 `default` 视图状态及命名视图的元数据）
   */
  toData(): ITableMetadata {
    const viewsData: Record<string, IViewMetadata> = {}
    for (const [id, view] of Object.entries(this.views)) {
      if (id === 'default') continue
      viewsData[id] = view.toData()
    }

    const dv = this.getOrCreateView('default')
    const def = dv.toData()
    const result: ITableMetadata = {
      tableName: this.tableName,
      columns: this.columns,
      viewId: def.viewId ?? 'default',
      views: viewsData,
      api: this.api,
      loading: dv.isLoading || undefined,
      error: dv.loadingError?.message,
    }
    if (def.rows !== undefined) result.rows = def.rows
    if (def.filterExpression !== undefined) result.filterExpression = def.filterExpression
    if (def.sortExpression !== undefined) result.sortExpression = def.sortExpression
    if (def.autoSelectFirst !== undefined) result.autoSelectFirst = def.autoSelectFirst
    if (def.page !== undefined) result.page = def.page
    if (def.pageSize !== undefined) result.pageSize = def.pageSize
    return result
  }

  // ===== 工厂方法 =====

  /**
   * 从 ITableMetadata 恢复 DataTable（重建 default 视图状态和命名视图）
   */
  static fromTableData(data: ITableMetadata): DataTable {
    const t = new DataTable(data.tableName, data.columns ?? [])
    if (data.api !== undefined) t.api = data.api

    const def = t.getOrCreateView('default')
    if (data.rows) def.rows = [...data.rows]
    if (data.filterExpression !== undefined) def.filterExpression = data.filterExpression
    if (data.sortExpression !== undefined) def.sortExpression = data.sortExpression
    if (data.autoSelectFirst !== undefined) def.autoSelectFirst = data.autoSelectFirst
    def.page = data.page ?? 1
    def.pageSize = data.pageSize ?? 20

    if (data.views) {
      for (const [cid, cd] of Object.entries(data.views)) {
        if (cid === 'default') continue
        t.views[cid] = reactive(DataView.fromData(cd, t.tableName, cid)) as DataView
      }
    }
    return t
  }
}
