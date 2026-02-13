/**
 * DataSet 类（轻量级） - 领域逻辑
 * 
 * 定位：UI-API 桥接层
 * - 负责：数据状态管理、UI状态同步、API参数构建
 * - 不负责：前端数据处理、级联操作、复杂过滤
 * 
 * 核心思想：
 * 1. 📊 维护数据表结构和关系定义
 * 2. 🎯 管理UI状态（选中、分页、排序）
 * 3. 📋 构建后端API所需的参数
 * 4. 🔄 同步后端返回的数据到前端状态
 * 
 * 级联操作：
 * - cascadeUpdate/Delete 返回受影响的表名
 * - 实际操作由后端API执行
 * - 前端接收结果并刷新UI
 */

import type {
  IDataSet,
  IDataSetMetadata,
  IDataSetConfig,
  ITableMetadata,
  IDataView,
  DataRelation,
  IDataRow,
  DependencyType,
  FilterExpression
} from './types'
import { DataTable } from './data-table'
import { DataView } from './data-view'
import { RelationEngine } from './core/relation-engine'
import { DependencyAnalyzer } from './core/dependency-analyzer'
import { DataLoader } from './core/data-loader'
import { SubscriptionManager } from './core/subscription-manager'
import { EventManager } from './core/event-manager'
import { Logger, DATA_SET_STATE } from '@spark-view/spark-utils'
import type { Provider as CapabilityProvider, CapabilityKey} from '@spark-view/spark-utils'

/**
 * DataSet 类（实现 IDataSet 接口 + 方法逻辑）
 * 相当于 .NET 的 DataSet - 领域逻辑层
 */
export class DataSet implements IDataSet {
  dataSetName: string
  tables: Record<string, DataTable>
  relations?: DataRelation[]
  version?: number
  pageId?: string
  autoLoadRelations?: boolean

  // 外部数据加载函数
  public dataLoader?: (tableName: string) => Promise<IDataRow[]>

  // 日志系统
  private logger = Logger()

  // 关系引擎
  private relationEngine!: RelationEngine

  // 依赖分析器
  private dependencyAnalyzer!: DependencyAnalyzer

  // 数据加载器
  private dataLoaderInstance!: DataLoader

  // 订阅管理器
  private subscriptionManager!: SubscriptionManager

  // 事件管理器
  private eventManager!: EventManager

  // ==================== 构造函数 ====================

  /**
   * 创建 DataSet 实例
   * @param config - DataSet 配置（数据 + 可选运行时配置）
   */
  constructor(config: IDataSetConfig) {
    this.dataLoader = config.dataLoader
    this.dataSetName = config.dataSetName

    // 转换表为类实例
    this.tables = {}
    Object.entries(config.tables).forEach(([tableName, tableData]) => {
      const table = DataTable.fromTableData(tableData, this)

      // 🔧 设置表（默认上下文）的 DataSet 引用
      table.setDataSet(this)

      // 处理自定义上下文
      Object.entries(table.contexts || {}).forEach(([contextId, context]) => {
        // 设置上下文的 DataSet 引用
        context.setDataSet(this)

        // 如果有初始过滤配置，应用过滤
        if (context.filterExpression) {
          this.updateContextRows(context, table)
          this.logger.info(`🌪️ [Init] ${tableName}.${contextId} 应用初始过滤: ${context.rows?.length} 行`)
        }
      })

      this.tables[tableName] = table
    })

    this.relations = config.relations
    this.version = config.version
    this.pageId = config.pageId
    this.autoLoadRelations = config.autoLoadRelations

    // 为关系分配默认 contextId
    this.relations?.forEach(relation => {
      relation.parentContextId = relation.parentContextId ?? 'default'
      relation.childContextId = relation.childContextId ?? 'default'
    })

    // 初始化依赖分析器
    this.dependencyAnalyzer = new DependencyAnalyzer(this)

    // 初始化关系引擎
    this.relationEngine = new RelationEngine(this)

    // 初始化数据加载器
    this.dataLoaderInstance = new DataLoader(this)

    // 初始化订阅管理器
    this.subscriptionManager = new SubscriptionManager(this)

    // 初始化事件管理器
    this.eventManager = new EventManager()
  }

  // ==================== 上下文管理 ====================

  // ==================== 能力注册 ====================
  
  /**
   * 获取数据空间层能力列表
   * 
   * 数据空间层提供的能力：
   * - DATA_SET_STATE: DataSet 状态（数据表访问、页面参数、权限、表变化监听）
   * 
   * @param pageParams 页面参数（可选）
   * @param pagePermission 页面权限（可选）
   * @returns 能力 Map（CapabilityKey → Provider）
   */
  getCapabilities(
    pageParams?: Record<string, unknown>,
    pagePermission?: Record<string, boolean>
  ): Map<CapabilityKey<unknown>, CapabilityProvider> {
    const capabilities = new Map<CapabilityKey<unknown>, CapabilityProvider>()
    
    // DATA_SET_STATE 能力
    capabilities.set(DATA_SET_STATE as CapabilityKey<unknown>, {
      name: DATA_SET_STATE,
      implementation: {
        getDataSet: () => this,
        
        getTable: (tableName: string) => {
          return this.tables[tableName]
        },
        
        getPageParams: () => {
          return pageParams ?? {}
        },
        
        getPagePermission: () => pagePermission ?? {},
        
        onTableChange: (tableName: string, callback: (table: unknown) => void) => {
          // 使用 DataSet 的事件系统，而非局部 Map
          const wrappedCallback = (data: unknown) => {
            const event = data as { tableName: string }
            if (event.tableName === tableName) {
              callback(this.tables[tableName])
            }
          }
          this.on('tableChanged', wrappedCallback)
          
          // 返回取消订阅函数
          return () => {
            this.off('tableChanged', wrappedCallback)
          }
        }
      }
    })
    
    return capabilities
  }

  /**
   * 更新上下文的 rows（委托给 DataView）
   */
  private updateContextRows(context: DataView, table: DataTable): void {
    // 始终基于完整数据源
    const sourceData = table.originalRows ?? table.rows ?? [];

    // 注意：filterExpression 应传给后端 API，前端不执行
    // 如果需要前端过滤，应从后端获取已过滤的数据
    
    // 委托给上下文处理排序并更新 rows
    context.updateRows(sourceData);
  }

  /**
   * 获取表
   */
  getTable(tableName: string): DataTable | undefined {
    return this.tables[tableName]
  }

  // ==================== 基础 CRUD 操作 ====================

  /**
   * 添加数据行
   */
  addRow(tableName: string, row: IDataRow): boolean {
    const table = this.getTable(tableName)
    if (!table) return false

    table.rows.push(row)

    // 同步默认上下文的缓存
    if (table.originalRows) {
      table.originalRows.push(row)
    }

    return true
  }

  /**
   * 更新数据行
   */
  updateRow(tableName: string, rowIndex: number, row: IDataRow): boolean {
    const table = this.getTable(tableName)
    if (!table || rowIndex < 0 || rowIndex >= table.rows.length) {
      return false
    }

    // 保持对象引用，使用 assign 更新属性（这样 _originalRows 也会自动更新）
    const existingRow = table.rows[rowIndex]
    if (existingRow) {
      Object.assign(existingRow, row)
    }

    return true
  }

  /**
   * 删除数据行
   */
  deleteRow(tableName: string, rowIndex: number): boolean {
    const table = this.getTable(tableName)
    if (!table || rowIndex < 0 || rowIndex >= table.rows.length) {
      return false
    }

    const row = table.rows[rowIndex]
    if (!row) {
      return false
    }

    table.rows.splice(rowIndex, 1)

    // 同步默认上下文的缓存
    if (table.originalRows) {
      const cacheIndex = table.originalRows.indexOf(row)
      if (cacheIndex > -1) {
        table.originalRows.splice(cacheIndex, 1)
      }
    }

    return true
  }

  // ==================== 级联操作（轻量级 - API参数构建器） ====================

  /**
   * 级联更新（轻量级 - 仅返回受影响的表名）
   * ⚠️ 前端不再执行级联更新逻辑，应通过后端API处理
   * 
   * 使用示例：
   * ```typescript
   * const affectedTables = dataSet.cascadeUpdate('users', updatedRow, oldRow)
   * // 返回: ['orders', 'addresses']
   * 
   * // 调用后端API执行实际更新
   * await api.put(`/users/${updatedRow.id}?cascade=true`, updatedRow)
   * 
   * // 刷新受影响的表
   * affectedTables.forEach(table => dataSet.loadTableData(table))
   * ```
   */
  cascadeUpdate(tableName: string, row: IDataRow, oldValues?: IDataRow): string[] {
    return this.relationEngine.cascadeUpdate(tableName, row, oldValues)
  }

  /**
   * 级联删除（轻量级 - 仅返回受影响的表名）
   * ⚠️ 前端不再执行级联删除逻辑，应通过后端API处理
   * 
   * 使用示例：
   * ```typescript
   * const affectedTables = dataSet.cascadeDelete('users', rowToDelete)
   * // 返回: ['orders', 'addresses']
   * 
   * // 调用后端API执行实际删除
   * await api.delete(`/users/${rowToDelete.id}?cascade=true`)
   * 
   * // 刷新受影响的表
   * affectedTables.forEach(table => dataSet.loadTableData(table))
   * ```
   */
  cascadeDelete(tableName: string, row: IDataRow): string[] {
    return this.relationEngine.cascadeDelete(tableName, row)
  }

  /**
   * 构建级联API参数（辅助方法）
   * 返回完整的API调用建议
   */
  buildCascadeApiParams(
    operation: 'update' | 'delete',
    tableName: string,
    row: IDataRow,
    oldValues?: IDataRow
  ): {
    endpoint: string;
    method: 'PUT' | 'DELETE';
    params: Record<string, unknown>;
    affectedTables: string[];
  } {
    const affectedTables = operation === 'update'
      ? this.cascadeUpdate(tableName, row, oldValues)
      : this.cascadeDelete(tableName, row);

    // 查找主键字段
    const table = this.getTable(tableName);
    const idField = table?.columns.find(c => c.isPrimaryKey)?.name ?? 'id';
    const id = row[idField];

    return {
      endpoint: `/api/${tableName}/${id}`,
      method: operation === 'update' ? 'PUT' : 'DELETE',
      params: {
        cascade: true,
        affectedTables,
        data: operation === 'update' ? row : undefined
      },
      affectedTables
    };
  }

  /**
   * 根据依赖类型获取父数据范围（用于UI状态管理）
   */
  getParentRows(
    parentContext: DataView | IDataView,
    dependencyType: DependencyType
  ): IDataRow[] | undefined {
    return this.relationEngine.getParentRows(parentContext, dependencyType)
  }

  /**
   * 过滤子表数据（轻量级 - 返回原始数据）
   * ⚠️ 前端不再执行过滤逻辑，应从后端获取已过滤数据
   */
  filterChildRows(
    childRows: IDataRow[],
    filterExpression: FilterExpression,
    parentRows: IDataRow[],
    _parentContext: DataView | IDataView
  ): IDataRow[] {
    return this.relationEngine.filterChildRows(childRows, filterExpression, parentRows, _parentContext)
  }

  /**
   * 构建关系过滤API参数（辅助方法）
   * 返回后端加载子表数据所需的参数
   * 
   * 使用示例：
   * ```typescript
   * const relation = dataSet.relations?.find(r => r.childTable === 'orders')
   * const apiParams = dataSet.buildRelationFilterApiParams(relation)
   * // 返回:
   * // {
   * //   endpoint: '/api/orders',
   * //   method: 'GET',
   * //   params: {
   * //     filter: { field: 'userId', op: 'in', value: { func: 'FIELD', args: ['id'] } },
   * //     parentIds: [1, 2, 3],
   * //     dependencyType: 'selectedRows'
   * //   }
   * // }
   * 
   * // 调用后端API
   * const data = await api.get(apiParams.endpoint, apiParams.params)
   * 
   * // 更新子表数据
   * const childTable = dataSet.getTable('orders')
   * childTable.rows = data
   * ```
   */
  buildRelationFilterApiParams(relation: DataRelation): {
    endpoint: string;
    method: 'GET';
    params: {
      filter: FilterExpression;
      parentIds: unknown[];
      dependencyType: DependencyType;
      parentContext?: string;
    };
  } | null {
    const parentTable = this.getTable(relation.parentTable);
    if (!parentTable) return null;

    const parentContext = parentTable.getOrCreateContext(relation.parentContextId ?? 'default');
    const parentRows = this.getParentRows(parentContext, relation.dependencyType);

    if (!parentRows || parentRows.length === 0) {
      return null;
    }

    // 提取父表ID字段
    const idField = parentTable.columns.find(c => c.isPrimaryKey)?.name ?? 'id';
    const parentIds = parentRows.map(row => row[idField]).filter(id => id !== undefined);

    return {
      endpoint: `/api/${relation.childTable}`,
      method: 'GET',
      params: {
        filter: relation.filterExpression,
        parentIds,
        dependencyType: relation.dependencyType,
        parentContext: relation.parentContextId
      }
    };
  }

  // ==================== 关系处理 ====================

  /**
   * 应用数据关系（根据父表状态过滤子表）
   * @param relation 关系定义
   * @returns 是否发生了数据变化
   */
  applyRelation(relation: DataRelation): { changed: boolean; message: string } {
    return this.relationEngine.applyRelation(relation)
  }

  /**
   * 比较两个数据集是否相等（静态工具方法）
   */
  static areRowsEqual(rows1: IDataRow[], rows2: IDataRow[]): boolean {
    if (rows1.length !== rows2.length) return false;
    
    return rows1.every((row1, index) => {
      const row2 = rows2[index];
      if (row1 === row2) return true;
      if (!row1 || !row2) return false;
      
      const keys1 = Object.keys(row1);
      const keys2 = Object.keys(row2);
      if (keys1.length !== keys2.length) return false;
      
      return keys1.every(key => {
        const val1 = row1[key];
        const val2 = row2[key];
        if (val1 === val2) return true;
        if (typeof val1 === 'object' && typeof val2 === 'object') {
          return JSON.stringify(val1) === JSON.stringify(val2);
        }
        return false;
      });
    });
  }

  // ==================== 依赖分析 ====================

  /**
   * 获取表的所有父依赖（递归）
   * @param tableName 表名
   * @returns 父表名称集合（从根到直接父表）
   * 
   * 委托给 DependencyAnalyzer 处理
   */
  getTableDependencies(tableName: string): Set<string> {
    return this.dependencyAnalyzer.getTableDependencies(tableName);
  }

  /**
   * 获取根依赖表（没有父表的表）
   * @param tableName 表名
   * @returns 根表名称集合
   * 
   * 委托给 DependencyAnalyzer 处理
   */
  getRootDependencies(tableName: string): Set<string> {
    return this.dependencyAnalyzer.getRootDependencies(tableName);
  }

  /**
   * 检查表的依赖条件是否满足
   * @param tableName 表名
   * @returns 依赖条件是否满足
   * 
   * 委托给 DependencyAnalyzer 处理
   */
  areDependenciesSatisfied(tableName: string): boolean {
    return this.dependencyAnalyzer.areDependenciesSatisfied(tableName);
  }

  // ==================== 序列化 ====================

  /**
   * 转换为纯数据对象（用于序列化）
   */
  toData(): IDataSetMetadata {
    // 转换表为普通对象（纯数据，不包含方法）
    const tables: Record<string, ITableMetadata> = {}
    Object.entries(this.tables).forEach(([tableName, table]) => {
      tables[tableName] = table.toData()
    })
    
    return {
      dataSetName: this.dataSetName,
      tables,
      relations: this.relations,
      version: this.version,
      pageId: this.pageId
    }
  }

  /**
   * 导出为 JSON 字符串
   */
  toJSON(): string {
    return JSON.stringify(this.toData(), null, 2)
  }

  /**
   * 从数据对象创建 DataSet
   */
  static fromData(
    data: IDataSetMetadata,
    dataLoader?: (tableName: string) => Promise<IDataRow[]>
  ): DataSet {
    return new DataSet({
      ...data,
      dataLoader
    })
  }

  /**
   * 从 JSON 字符串加载
   */
  static fromJSON(
    json: string,
    dataLoader?: (tableName: string) => Promise<IDataRow[]>
  ): DataSet {
    const data = JSON.parse(json) as IDataSetMetadata
    return DataSet.fromData(data, dataLoader)
  }

  // ==================== 事件系统 ====================

  /**
   * 注册事件监听器
   * 委托给 EventManager 处理
   */
  on(event: string, callback: (...args: unknown[]) => void): void {
    this.eventManager.on(event, callback);
  }

  /**
   * 移除事件监听器
   * 委托给 EventManager 处理
   */
  off(event: string, callback: (...args: unknown[]) => void): void {
    this.eventManager.off(event, callback);
  }

  /**
   * 触发事件
   * 委托给 EventManager 处理
   */
  emit(event: string, data: unknown): void {
    this.eventManager.emit(event, data);
  }

  // ==================== 订阅管理 ====================

  /**
   * 订阅视图数据变化
   * @param tableName 表名
   * @param contextId 视图ID（上下文ID），默认 'default'
   * @param callback 回调函数
   * 
   * 委托给 SubscriptionManager 处理
   */
  subscribe(tableName: string, contextId: string = 'default', callback: () => void): () => void {
    return this.subscriptionManager.subscribe(tableName, contextId, callback);
  }

  /**
   * 通知订阅者：视图数据已变化
   * @param tableName 表名
   * @param contextId 视图ID，如果未指定则通知所有视图
   * 
   * 委托给 SubscriptionManager 处理
   */
  notifySubscribers(tableName: string, contextId?: string): void {
    this.subscriptionManager.notifySubscribers(tableName, contextId);
  }

  /**
   * 检查视图是否有订阅者
   * @param tableName 表名
   * @param contextId 视图ID，未指定则检查表的所有视图
   * 
   * 委托给 SubscriptionManager 处理
   */
  hasSubscribers(tableName: string, contextId?: string): boolean {
    return this.subscriptionManager.hasSubscribers(tableName, contextId);
  }

  /**
   * 获取表的指定上下文
   * @param contextId 上下文ID，默认 'default'（返回 DataTable 本身）
   */
  getContext(tableName: string, contextId: string = 'default'): DataView | undefined {
    const table = this.getTable(tableName)
    if (!table) return undefined
    
    // 默认上下文：DataTable 本身
    if (contextId === 'default') return table
    
    // 自定义上下文：使用 DataTable 的方法创建或获取
    return table.getOrCreateContext(contextId)
  }

  // ==================== 数据加载 ====================

  /**
   * 智能请求表数据（自动处理依赖）- 完全解耦：不阻塞，异步加载后通知订阅者
   * @param tableName 表名
   * 
   * 委托给 DataLoader 处理
   */
  requestTableData(tableName: string): void {
    this.dataLoaderInstance.requestTableData(tableName);
  }

  /**
   * 通知依赖已更新（触发事件，不自动加载）
   * 
   * 委托给 DataLoader 处理
   */
  notifyDependencyUpdated(tableName: string): void {
    this.dataLoaderInstance.notifyDependencyUpdated(tableName);
  }

  /**
   * 更新相关联的子表
   */
  updateRelatedTables(parentTableName: string, parentContextId: string = 'default'): void {
    this.relationEngine.updateRelatedTables(parentTableName, parentContextId)
  }

  /**
   * 刷新所有关系
   */
  refreshAllRelations(): void {
    this.relationEngine.refreshAllRelations()
  }
}
