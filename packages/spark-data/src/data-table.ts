/**
 * DataTable — 数据表（表结构定义、配置管理、视图容器）
 *
 * 职责（按功能分区）：
 *  - 表元数据：管理 tableName、columns、api、crudConfig（不含具体数据）
 *  - 视图容器：维护 default 与命名视图的集合（不遍历、不协调、不关心运行时状态）
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
import { RequestState, createEventContext } from './types'
import { reactive } from 'vue'
import type { DataColumn, CrudApi, ITableMetadata, IViewMetadata, CrudOperationConfig } from './types'
import type { TreeManager } from './tree-manager'
import type { DataSet } from './dataset'
import { DataValidator, createValidator, createSchema } from './validation'
import { CrudService, createCrudService } from './crud-service'

/**
 * DataTable - 管理单表的结构定义与配置
 *
 * 说明：管理表结构（columns）、视图集合（DataView）、CRUD 配置（api, crudConfig）；
 * 数据操作由 DataView 负责。
 */
export class DataTable {
  // ===== DataSet 引用 =====

  /** 所属 DataSet（由 DataSet 在构建时设置） */
  dataSet!: DataSet

  // ===== 表元数据 =====

  /** 表名 */
  tableName: string

  /** 列定义 */
  columns: DataColumn[]

  /** CRUD API配置 */
  api?: CrudApi

  /** CRUD 操作配置（全局默认配置） */
  crudConfig?: CrudOperationConfig

  // ===== CrudService 缓存 =====

  /** CrudService 实例缓存（懒初始化，模型级共享） */
  private _crudService?: CrudService | undefined

  /**
   * 获取或创建 CrudService（懒初始化，配置变更时自动清除缓存）
   *
   * CrudService 属于模型层（DataTable），多个 DataView 共享同一实例。
   */
  get crudService(): CrudService | undefined {
    if (!this._crudService && this.api) {
      this._crudService = createCrudService(this.api)
    }
    return this._crudService
  }

  // ===== 数据校验 =====

  /** 数据校验器（基于列定义创建） */
  validator?: DataValidator

  // ===== 视图容器 =====

  /** 视图集合（包含 'default'） */
  views: Record<string, DataView> = {}

  // ===== 构造函数 =====

  /**
   * 创建 DataTable 实例
   * - 自动创建 `default` DataView
   */
  constructor(tableName: string, columns: DataColumn[] = []) {
    this.tableName = tableName
    this.columns = columns
    this.views['default'] = reactive(new DataView(tableName, 'default')) as DataView
    // 初始化数据校验器
    if (columns.length > 0) {
      this.validator = createValidator(createSchema(columns))
    }
  }

  // ===== DataSet 关联（设置引用链） =====

  /**
   * 将 DataTable 绑定到 DataSet（设置引用链）
   * @param ds - DataSet 实例
   * @remarks 为每个 DataView 设置 dataTable 引用并调用 setupCascade，使视图能响应父级变化
   */
  setDataSet(ds: DataSet): void {
    this.dataSet = ds
    // 统一设置所有视图的引用链并建立级联订阅
    for (const view of Object.values(this.views)) {
      view.dataTable = this
      view.setupCascade()
    }
  }

  // ===== 视图管理 =====

  /**
   * 获取或创建视图
   * @param viewId - 视图 ID（'default' 为主视图）
   * @returns 对应的 DataView 实例
   * @behavior 若表已关联 DataSet，会为新视图设置 dataTable 引用并触发 setupCascade
   */
  getOrCreateView(viewId: string): DataView {
    if (!this.views[viewId]) {
      const view = reactive(new DataView(this.tableName, viewId)) as DataView
      // 视图管理职责：设置引用链并触发级联
      if (this.dataSet) {
        view.dataTable = this
        view.setupCascade()
      }
      this.views[viewId] = view
    }
    return this.views[viewId]
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
   * @remarks 配置变更时自动清除 CrudService 缓存，下次访问时重建
   */
  setApi(api: CrudApi): void {
    this.api = api
    this._crudService = undefined
  }

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
      loading: (dv.requestState === RequestState.Loading) || undefined,
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

  // ===== 销毁与内存管理 =====

  /**
   * 销毁指定视图
   * @param viewId - 视图ID
   * @remarks 调用视图的 destroy() 方法并从视图集合中移除
   */
  destroyView(viewId: string): void {
    const view = this.views[viewId]
    if (view) {
      view.destroy()
      delete this.views[viewId]
    }
  }

  /**
   * 销毁所有视图（包括 default 视图）
   * @remarks 应在 DataTable 不再使用时调用，防止内存泄漏
   */
  destroy(): void {
    for (const view of Object.values(this.views)) {
      view.destroy()
    }
    this.views = {}
    this._crudService = undefined
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
    
    // ✅ 优先从 views.default 读取配置（如果存在）
    if (data.views?.['default']) {
      const defaultViewConfig = data.views['default']
      if (defaultViewConfig.filterExpression !== undefined) def.filterExpression = defaultViewConfig.filterExpression
      if (defaultViewConfig.sortExpression !== undefined) def.sortExpression = defaultViewConfig.sortExpression
      if (defaultViewConfig.autoCurrentFirst !== undefined) def.autoCurrentFirst = defaultViewConfig.autoCurrentFirst
      if (defaultViewConfig.autoSelectFirst !== undefined) def.autoSelectFirst = defaultViewConfig.autoSelectFirst
      def.page = defaultViewConfig.page ?? data.page ?? 1
      def.pageSize = defaultViewConfig.pageSize ?? data.pageSize ?? 20
    } else {
      // 回退：从表级配置读取（兼容旧格式）
      if (data.filterExpression !== undefined) def.filterExpression = data.filterExpression
      if (data.sortExpression !== undefined) def.sortExpression = data.sortExpression
      if (data.autoSelectFirst !== undefined) def.autoSelectFirst = data.autoSelectFirst
      def.page = data.page ?? 1
      def.pageSize = data.pageSize ?? 20
    }
    
    // ✅ 应用 autoCurrentFirst 和 autoSelectFirst 逻辑（静态数据加载场景）
    const firstRow = def.rows.length > 0 ? def.rows[0] : null
    
    // autoCurrentFirst 默认 true，只有显式设为 false 时才不自动选中
    if (def.autoCurrentFirst !== false && firstRow) {
      def.currentRow = firstRow
      def.currentRowIndex = 0
      
      // 延迟触发事件，确保组件已挂载和事件监听器已注册
      setTimeout(() => {
        def.events.emit('stateChanged', {
          tableName: def.tableName,
          viewId: def.viewId,
          changeType: 'currentRow',
          row: firstRow,
          context: createEventContext('auto', { tableName: def.tableName, viewId: def.viewId })
        })
      }, 100)  // ✅ 延迟 100ms，确保页面脚本 __init__ 已执行
    }
    
    // autoSelectFirst 默认 true，只有显式设为 false 时才不自动选中
    if (def.autoSelectFirst !== false && firstRow) {
      def.selectedRows.splice(0, def.selectedRows.length, firstRow)
      def.selectedRowIndices = [0]
      setTimeout(() => {
        def.events.emit('stateChanged', {
          tableName: def.tableName,
          viewId: def.viewId,
          changeType: 'selectedRows',
          rows: [...def.selectedRows],  // ✅ 传递数组副本而非 reactive proxy
          context: createEventContext('auto', { tableName: def.tableName, viewId: def.viewId })
        })
      }, 100)  // ✅ 延迟 100ms，确保页面脚本 __init__ 已执行
    }

    // 处理命名视图（非 default）
    if (data.views) {
      for (const [cid, cd] of Object.entries(data.views)) {
        if (cid === 'default') continue
        t.views[cid] = reactive(DataView.fromData(cd, t.tableName, cid)) as DataView
      }
    }
    return t
  }
}
