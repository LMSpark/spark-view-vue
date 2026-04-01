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
import type { IDataRow, DataColumn, CrudApi, ITableMetadata, CrudOperationConfig } from './types'
import type { DataSet } from './dataset'
import { type DataValidator, createValidator, createSchema } from './validation'
import { type CrudService, createCrudService } from './crud-service'
import { normalizeTableMetadata } from './metadata'
import { assertNoSeparator, resolveApi } from './core/utils'

/**
 * DataTable - 管理单表的结构定义与配置
 *
 * 说明：管理表结构（columns）、视图集合（DataView）、CRUD 配置（api, crudConfig）；
 * 数据操作由 DataView 负责。
 */
export class DataTable {
  // ===== DataSet 引用 =====

  /** 所属 DataSet（由 DataSet 在构建时通过 setDataSet 设置，独立使用时为 undefined） */
  dataSet: DataSet | undefined

  // ===== 表元数据 =====

  /** 表名 */
  tableName: string

  /** 列定义 */
  columns: DataColumn[]

  /** CRUD API配置（含 tree 子字段存放树接口族） */
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
    if (this._crudService === undefined && this.api !== undefined) {
      // M5: 若 DataSet 提供共享 httpClient，所有表的 CrudService 复用同一 Request 实例
      const sharedClient = this.dataSet?._sharedHttpClient
      const endpointContextProvider = () => this.dataSet?.getRequestTemplateParams() ?? {}
      this._crudService = createCrudService(this.api, sharedClient, endpointContextProvider)
    }
    return this._crudService
  }

  // ===== 数据校验 =====

  /** 数据校验器（基于列定义创建） */
  validator?: DataValidator

  // ===== 视图容器 =====

  /**
   * 内联静态行（来自 pagedata.json 配置）——级联内存过滤的 source of truth。
   *
   * 与 DataView.rows 不同：DataView.rows 是当前视图（可能已过滤）的行；
   * 此字段存储全量原始行，供无 API 的内存级联过滤重复使用。
   * 有 API 的表此字段保持空数组（数据由服务端提供）。
   */
  rows: IDataRow[] = []

  /** 视图集合（包含 'default'） */
  views: Record<string, DataView> = {}

  // ===== 构造函数 =====

  /**
   * 创建 DataTable 实例
   * - 自动创建 `default` DataView
   */
  constructor(tableName: string, columns: DataColumn[] = []) {
    assertNoSeparator(tableName, 'tableName')
    this.tableName = tableName
    this.columns = columns
    // 保存原始用户列数（dataTable setter 会注入 _pk 计算列变更 columns.length）
    const hasUserColumns = columns.length > 0
    const defaultView = DataView.create(tableName, 'default')
    defaultView.dataTable = this   // 提前设置引用，使 view.primaryKey getter 可访问列定义
    this.views['default'] = defaultView
    // 初始化数据校验器（仅对用户定义列创建，排除框架计算列）
    if (hasUserColumns) {
      const schemaColumns = this.columns.filter(c => !c.isComputed)
      this.validator = createValidator(createSchema(schemaColumns))
    }
  }

  // ===== DataSet 关联（设置引用链） =====

  /**
   * 将 DataTable 绑定到 DataSet
   *
   * - 设置 `this.dataSet = ds`
   * - 为已存在的所有视图建立级联订阅
   *
   * 注意：`view.dataTable` 在视图创建时（构造函数 / getOrCreateView / fromTableData）
   * 已确保赋值，此处不重复赋值，避免触发冗余的 syncFromConfig()。
   */
  setDataSet(ds: DataSet): void {
    this.dataSet = ds
    for (const view of Object.values(this.views)) {
      view.cascade.setupCascade()
    }
  }

  /**
   * DataSet 关系规范化完成后调用——通知所有视图重编译含聚合的计算列并重算聚合行。
   *
   * 封装后置重算职责：DataSet 只需调用此方法，不直接触碰 view 内部。
   * 遍历各视图委托给 view.onDataSetRelationsReady()，DataSet 不需要了解视图内部细节。
   */
  onDataSetRelationsReady(): void {
    for (const view of Object.values(this.views)) {
      view.onDataSetRelationsReady()
    }
  }

  // ===== 视图管理 =====

  /**
   * 获取已存在的视图（不会创建新视图）
   * @param viewId - 视图 ID
   * @returns 对应的 DataView 实例，不存在时返回 undefined
   */
  getView(viewId: string): DataView | undefined {
    return this.views[viewId]
  }

  /**
   * 获取或创建视图
   * @param viewId - 视图 ID（'default' 为主视图）
   * @returns 对应的 DataView 实例
   * @behavior 若表已关联 DataSet，会为新视图设置 dataTable 引用并触发 setupCascade
   */
  getOrCreateView(viewId: string): DataView {
    if (!this.views[viewId]) {
      const view = DataView.create(this.tableName, viewId)
      // 始终设置 dataTable 引用（使 view.primaryKey getter 可访问列定义）
      view.dataTable = this
      // 视图管理职责：设置级联
      view.cascade.setupCascade()
      // Phase 6 M2: 动态视图自动订阅——通知 DataSet 将活跃的 on/onAnyViewChange 绑定到新视图
      this.dataSet?._subscribeNewView(view)
      this.views[viewId] = view
    }
    return this.views[viewId]
  }

  /**
   * 遍历所有视图（包含 default 和命名视图）——DataSet 的内部实现岁选择此入口，
   * 避免直接访问 `views` 属性（封装内部集合）。
   */
  forEachView(cb: (view: DataView) => void): void {
    for (const view of Object.values(this.views)) {
      cb(view)
    }
  }

  // ===== 配置管理 =====

  /**
   * 设置 CRUD API 配置（支持字符串简写和 `true` 约定模式）
   * @param api - CRUD 端点配置（完整对象 / 字符串基础路径 / `true` 约定）
   * @remarks 配置变更时自动清除 CrudService 缓存，下次访问时重建
   */
  setApi(api: CrudApi | string | boolean): void {
    const resolved = resolveApi(api, this.tableName)
    if (resolved !== undefined) this.api = resolved
    else delete this.api
    this._crudService = undefined
  }

  /**
   * 设置 CRUD 操作配置（权限、超时、重试等）
   * @param config - CRUD 操作配置
   */
  setCrudConfig(config: CrudOperationConfig): void { this.crudConfig = config }

  // ===== 序列化 / 反序列化 =====

  /**
   * 将 DataTable 序列化为 canonical ITableMetadata（表核 + views 壳）。
   */
  toData(): ITableMetadata {
    const viewsData = {} as ITableMetadata['views']
    for (const [id, view] of Object.entries(this.views)) {
      viewsData[id] = view.toData()
    }

    return {
      tableName: this.tableName,
      columns: this.columns.filter(c => !c.isComputed),
      views: viewsData,
      ...(this.api !== undefined ? { api: this.api } : {}),
      ...(this.crudConfig !== undefined ? { crudConfig: this.crudConfig } : {}),
    }
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
      const { [viewId]: _, ...rest } = this.views
      this.views = rest
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
   * 从表元数据恢复 DataTable。
   */
  static fromTableData(data: ITableMetadata): DataTable {
    const normalized = normalizeTableMetadata(data)
    const t = new DataTable(normalized.tableName, normalized.columns)
    // P2: API 简写展开（字符串 / true → CrudApi 对象）
    if (normalized.api !== undefined) {
      const resolved = resolveApi(normalized.api, normalized.tableName)
      if (resolved !== undefined) t.api = resolved
    }
    if (normalized.crudConfig !== undefined) t.crudConfig = normalized.crudConfig

    const def = t.getOrCreateView('default')
    const defaultViewCfg = normalized.views['default']
    const sourceRows = defaultViewCfg.rows
    if (sourceRows) {
      // 存入 DataTable.rows（内联静态数据 source of truth，供无 API 内存级联过滤使用）
      t.rows = [...sourceRows]
      // 同时初始化 default 视图的初始数据（渲染层可直接展示，无需 loadFromServer）
      def.rows = [...sourceRows]
    }

    def.applyViewConfig(defaultViewCfg)

    // 注意：不在此处调用 initAutoSelection()。
    // autoCurrentFirst / autoSelectFirst 的初始选中事件必须在消费者（如页面脚本）
    // 完成订阅后再发射，由渲染层在渲染器 mounted 后调用 DataSet.initAutoSelection() 统一触发。

    // 处理命名视图（非 default）
    for (const [cid, cd] of Object.entries(normalized.views)) {
      if (cid === 'default') continue
      const namedView = DataView.fromData(cd, t.tableName, cid)
      namedView.dataTable = t   // 确保 primaryKey getter 可访问列定义
      t.views[cid] = namedView
    }
    return t
  }
}
