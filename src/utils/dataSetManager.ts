/**
 * DataSet 管理器
 * 负责：订阅管理、数据加载、事件系统、上下文管理
 */

import type {
  IDataSet,
  DataRelation,
  DataRow,
  SortExpression,
  SortDirection
} from '../types/pageData'
import { FilterExpressionParser } from './filterExpressionParser'
import { DataSet } from './dataSet'
import { DataTable } from '../models/DataTable'
import { BindingContext } from '../models/BindingContext'

/**
 * DataSet 管理器类
 */
export class DataSetManager {
  private dataSet: DataSet  // 领域模型
  private eventListeners: Map<string, Function[]> = new Map()
  // 上下文级别的订阅管理：key = "tableName.contextId"
  private contextSubscribers: Map<string, Set<Function>> = new Map()
  private loadingTables: Set<string> = new Set() // 正在加载的表名（防重复请求）
  public dataLoader?: (tableName: string) => Promise<DataRow[]> // 数据加载器（公开以便注册）

  constructor(dataSetConfig: IDataSet, dataLoader?: (tableName: string) => Promise<DataRow[]>) {
    this.dataSet = new DataSet(dataSetConfig)
    this.dataLoader = dataLoader
    
    // 🔧 为所有表和上下文设置 Manager 引用
    Object.entries(this.dataSet.tables).forEach(([tableName, table]) => {
      // 设置表（默认上下文）的 manager
      table.setManager(this)
      
      // 处理自定义上下文
      Object.entries(table.contexts || {}).forEach(([contextId, context]) => {
        // 设置上下文的 manager
        context.setManager(this)
        
        // 如果有初始过滤配置，应用过滤
        if (context.filterExpression) {
          this.updateContextRows(context, table)
          console.log(`🌪️ [Init] ${tableName}.${contextId} 应用初始过滤: ${context.rows?.length} 行`)
        }
      })
    })
  }
  
  /**
   * 更新上下文的 rows
   */
  private updateContextRows(context: BindingContext, table: DataTable): void {
      // 始终基于完整数据源
      let result = table._originalRows || table.rows || [];
      
      // 1. 执行过滤
      if (context.filterExpression) {
        try {
          const filterFn = FilterExpressionParser.toMemoryFilter(context.filterExpression);
          result = result.filter(filterFn);
        } catch (e) {
          console.error(`❌ [Context] 上下文 ${context._hostTable}.${context._contextId} 过滤失败:`, e);
          result = [];
        }
      }
      
      // 2. 执行排序
      if (context.sortExpression) {
        try {
          result = this.applySorting(result, context.sortExpression);
        } catch (e) {
          console.error(`❌ [Context] 上下文 ${context._hostTable}.${context._contextId} 排序失败:`, e);
        }
      }
      
      context.rows = result; // ✨ 同步更新上下文的 rows
  }

  /**
   * 应用排序表达式
   */
  private applySorting(rows: DataRow[], sortExpression: SortExpression): DataRow[] {
    // 创建副本以避免修改原数组
    const sorted = [...rows];
    
    // 判断是单字段还是多字段排序
    if ('field' in sortExpression) {
      // 单字段排序
      const { field, direction } = sortExpression;
      return this.sortByField(sorted, field, direction);
    } else if ('fields' in sortExpression) {
      // 多字段排序
      return this.sortByFields(sorted, sortExpression.fields);
    }
    
    return sorted;
  }

  /**
   * 单字段排序
   */
  private sortByField(rows: DataRow[], field: string, direction: SortDirection): DataRow[] {
    const isAsc = direction.toLowerCase() === 'asc';
    
    return rows.sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      
      // 处理 null/undefined
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return isAsc ? 1 : -1;
      if (bVal == null) return isAsc ? -1 : 1;
      
      // 数值比较
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return isAsc ? aVal - bVal : bVal - aVal;
      }
      
      // 字符串比较
      const aStr = String(aVal);
      const bStr = String(bVal);
      const compareResult = aStr.localeCompare(bStr, 'zh-CN');
      
      return isAsc ? compareResult : -compareResult;
    });
  }

  /**
   * 多字段排序
   */
  private sortByFields(rows: DataRow[], fields: Array<{ field: string; direction: SortDirection }>): DataRow[] {
    return rows.sort((a, b) => {
      for (const { field, direction } of fields) {
        const isAsc = direction.toLowerCase() === 'asc';
        const aVal = a[field];
        const bVal = b[field];
        
        // 处理 null/undefined
        if (aVal == null && bVal == null) continue;
        if (aVal == null) return isAsc ? 1 : -1;
        if (bVal == null) return isAsc ? -1 : 1;
        
        // 数值比较
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          const diff = aVal - bVal;
          if (diff !== 0) return isAsc ? diff : -diff;
          continue;
        }
        
        // 字符串比较
        const aStr = String(aVal);
        const bStr = String(bVal);
        const compareResult = aStr.localeCompare(bStr, 'zh-CN');
        
        if (compareResult !== 0) {
          return isAsc ? compareResult : -compareResult;
        }
      }
      
      return 0; // 所有字段都相等
    });
  }

  /**
   * 获取表（委托给 DataSet）
   */
  getTable(tableName: string): DataTable | undefined {
    return this.dataSet.getTable(tableName)
  }

  /**
   * 获取表的指定上下文
   * @param contextId 上下文ID，默认 'default'（返回 DataTable 本身）
   */
  getContext(tableName: string, contextId: string = 'default'): BindingContext | undefined {
    const table = this.getTable(tableName)
    if (!table) return undefined
    
    // 默认上下文：DataTable 本身
    if (contextId === 'default') return table
    
    // 自定义上下文：使用 DataTable 的方法创建或获取
    return table.getOrCreateContext(contextId)
  }

  /**
   * 刷新上下文数据（重新应用过滤、排序）
   * @param tableName 表名
   * @param contextId 上下文ID，默认 'default'
   */
  refreshContext(tableName: string, contextId: string = 'default'): void {
    const table = this.getTable(tableName);
    if (!table) {
      console.warn(`⚠️ [Refresh] 表 ${tableName} 不存在`);
      return;
    }

    const context = contextId === 'default' 
      ? table 
      : table.contexts?.[contextId];

    if (!context) {
      console.warn(`⚠️ [Refresh] 上下文 ${contextId} 不存在`);
      return;
    }

    // 重新处理数据（过滤 + 排序）
    this.updateContextRows(context, table);
    
    // 通知订阅者
    this.notifySubscribers(tableName);
    
    console.log(`✅ [Refresh] 上下文 ${contextId} 已刷新，当前 ${context.rows?.length || 0} 行`);
  }

  /**
   * 更新相关联的子表
   * @param parentContextId 父上下文ID，默认 'default'
   */
  updateRelatedTables(parentTableName: string, parentContextId: string = 'default'): void {
    if (!this.dataSet.relations) return

    // 找到所有以此表为父表，且 parentContext 匹配的关系
    const relations = this.dataSet.relations.filter(rel => {
        if (rel.parentTable !== parentTableName) return false;
        
        // 匹配 contextId
        return rel.parentContextId === parentContextId;
    });

    console.log(`🔗 [Relation] 上下文 ${parentTableName}.${parentContextId} 触发了 ${relations.length} 个关联更新`);

    relations.forEach(relation => {
      this.applyRelation(relation)
    })
  }

  /**
   * 应用数据关系
   */
  applyRelation(relation: DataRelation): void {
    // 解析父上下文
    const parentContext = this.getContext(relation.parentTable, relation.parentContextId);
    
    // 解析子表和子上下文
    const childTable = this.getTable(relation.childTable);
    const childContext = this.getContext(relation.childTable, relation.childContextId);

    if (!parentContext || !childTable) {
        // 子上下文可以不存在（虽然通常应该存在），但 BindingContext 是必须的吗？
        // 如果我们只是要更新 filteredRows，我们需要 BindingContext。
        // getContext 会自动 create if not exists，所以这里通常不会 fail，除非 childTable 都不存在。
      console.warn(`无法应用关系: ${relation.parentTable} -> ${relation.childTable}`)
      return
    }

    // 复用之前的逻辑...
    // 但这里原来的 implement 实现是基于 Order 的。
    // 我们需要更新它。
    
    console.log(`🔗 [applyRelation] ${relation.parentTable} -> ${relation.childTable}`, {
      dependencyType: relation.dependencyType,
      autoLoad: relation.autoLoad
    })

    // 根据依赖类型获取父级数据
    // const parentRows = this.getParentRows(parentContext, relation.dependencyType)

    // 如果是 autoLoad，请求子表加载（会处理数据过滤）
    if (relation.autoLoad) {
      // ✅ 优化：只在数据未加载时触发 autoLoad
      if (!childContext._originalRows || childContext._originalRows.length === 0) {
        console.log(`⚡ autoLoad 触发数据加载: ${relation.childTable}`)
        this.requestTableData(relation.childTable)
      } else {
        console.log(`⏭️ autoLoad 跳过：${relation.childTable} 数据已加载，走手动过滤`)
        // 数据已加载，走手动过滤逻辑
        const parentRows = this.getParentRows(parentContext, relation.dependencyType);
        
        if (!parentRows || parentRows.length === 0) {
          // 🔑 使用 splice 清空数组，保持响应式
          childContext.rows.splice(0, childContext.rows.length);
          console.log(`🧹 清空 ${relation.childTable}.rows (父表无选中行)`);
        } else {
          // 应用过滤：从子上下文的原始数据中过滤
          const sourceRows = childContext._originalRows || childContext.rows || [];
          const filteredRows = this.filterChildRows(
            sourceRows,
            relation.filterExpression,
            parentRows,
            parentContext
          );
          
          // 🔑 使用 splice 替换数组内容，保持响应式
          childContext.rows.splice(0, childContext.rows.length, ...filteredRows);
          console.log(`✅ [autoLoad Filter] ${relation.childTable} 过滤完成: ${filteredRows.length}/${sourceRows.length} 条`);
        }
      }
    } else { 
      // 手动过滤逻辑 (非 autoLoad 场景)
      // 例如：主从表依赖，但不自动加载，只是做内存过滤
      if (childContext && childContext.rows) {
          // 根据依赖类型获取父级数据
          const parentRows = this.getParentRows(parentContext, relation.dependencyType);
          
          if (!parentRows || parentRows.length === 0) {
              // 🔑 使用 splice 清空数组，保持响应式
              childContext.rows.splice(0, childContext.rows.length);
          } else {
             // 🔑 检查原始数据是否已加载
             if (!childContext._originalRows || childContext._originalRows.length === 0) {
                console.log(`🔄 检测到 ${relation.childTable} 原始数据未加载，触发加载...`);
                this.requestTableData(relation.childTable);
                return; // 加载完成后会重新应用过滤
             }
             
             // 应用过滤：从子上下文的原始数据中过滤
             const sourceRows = childContext._originalRows || childContext.rows || [];
             const filteredRows = this.filterChildRows(
                sourceRows,
                relation.filterExpression,
                parentRows,
                parentContext
              );
              
              // 🔑 使用 splice 替换数组内容，保持响应式
              childContext.rows.splice(0, childContext.rows.length, ...filteredRows);
              console.log(`✅ [Manual Filter] ${relation.childTable} 上下文更新: ${filteredRows.length} 条`);
          }
          this.notifySubscribers(relation.childTable);
      }
    }
  }

  /**
   * 根据依赖类型获取父数据范围（委托给 DataSet）
   */
  private getParentRows(
    parentContext: BindingContext,
    dependencyType: any
  ): DataRow[] | undefined {
    return this.dataSet.getParentRows(parentContext, dependencyType)
  }

  /**
   * 过滤子表数据（委托给 DataSet）
   */
  private filterChildRows(
    childRows: DataRow[],
    filterExpression: any,
    parentRows: DataRow[],
    _parentContext: BindingContext
  ): DataRow[] {
    return this.dataSet.filterChildRows(childRows, filterExpression, parentRows, _parentContext)
  }

  /**
   * 级联更新（委托给 DataSet）
   */
  cascadeUpdate(tableName: string, row: DataRow, oldValues?: DataRow): void {
    const affectedTables = this.dataSet.cascadeUpdate(tableName, row, oldValues)
    
    // 触发事件
    this.emit('cascadeUpdate', { 
      parentTable: tableName, 
      parentRow: row,
      oldValues,
      affectedTables
    })
    
    // 通知订阅者
    this.notifySubscribers(tableName)
    affectedTables.forEach(childTable => this.notifySubscribers(childTable))
  }

  /**
   * 级联删除（委托给 DataSet）
   */
  cascadeDelete(tableName: string, row: DataRow): void {
    const affectedTables = this.dataSet.cascadeDelete(tableName, row)
    
    // 触发事件
    affectedTables.forEach(childTable => {
      this.emit('cascadeDelete', { 
        parentTable: tableName,
        childTable,
        parentRow: row
      })
    })
    
    // 通知订阅者
    this.notifySubscribers(tableName)
    affectedTables.forEach(childTable => this.notifySubscribers(childTable))
  }

  /**
   * 刷新所有关系
   */
  refreshAllRelations(): void {
    if (!this.dataSet.relations) return

    this.dataSet.relations.forEach(relation => {
      this.applyRelation(relation)
    })
  }

  /**
   * 添加数据行（委托给 DataSet）
   */
  addRow(tableName: string, row: DataRow): void {
    if (this.dataSet.addRow(tableName, row)) {
      this.emit('rowAdded', { tableName, row })
    }
  }

  /**
   * 更新数据行（委托给 DataSet）
   */
  updateRow(tableName: string, rowIndex: number, row: DataRow): void {
    if (this.dataSet.updateRow(tableName, rowIndex, row)) {
      // 级联更新
      this.cascadeUpdate(tableName, this.getTable(tableName)!.rows[rowIndex])
      
      this.emit('rowUpdated', { tableName, rowIndex, row })
    }
  }

  /**
   * 删除数据行（委托给 DataSet）
   */
  deleteRow(tableName: string, rowIndex: number): void {
    const table = this.getTable(tableName)
    if (!table || rowIndex < 0 || rowIndex >= table.rows.length) return
    
    const row = table.rows[rowIndex]
    
    // 级联删除
    this.cascadeDelete(tableName, row)
    
    if (this.dataSet.deleteRow(tableName, rowIndex)) {
      this.emit('rowDeleted', { tableName, rowIndex, row })
    }
  }

  /**
   * 事件监听
   */
  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(callback)
  }

  /**
   * 移除事件监听
   */
  off(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(callback)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  /**   * 触发事件
   */
  emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(callback => callback(data))
    }
  }

  /**
   * 获取整个 DataSet（返回领域模型）
   */
  getDataSet(): DataSet {
    return this.dataSet
  }

  /**
   * 导出为 JSON（委托给 DataSet）
   */
  toJSON(): string {
    return this.dataSet.toJSON()
  }

  /**
   * 从 JSON 加载（创建新的 DataSetManager）
   */
  static fromJSON(json: string): DataSetManager {
    const dataSet = DataSet.fromJSON(json)
    return new DataSetManager(dataSet as any)
  }

  /**
   * 订阅上下文数据变化
   * @param tableName 表名
   * @param contextId 上下文ID，默认 'default'
   * @param callback 回调函数
   */
  subscribe(tableName: string, contextId: string = 'default', callback: Function): () => void {
    const key = `${tableName}.${contextId}`;
    
    if (!this.contextSubscribers.has(key)) {
      this.contextSubscribers.set(key, new Set());
    }
    this.contextSubscribers.get(key)!.add(callback);
    
    console.log(`📡 UI 订阅上下文: ${key}`);
    
    // 返回取消订阅函数
    return () => {
      this.contextSubscribers.get(key)?.delete(callback);
    };
  }

  /**
   * 通知订阅者数据变化（公开方法）
   * @param tableName 表名
   * @param contextId 上下文ID，如果未指定则通知所有上下文
   */
  notifySubscribers(tableName: string, contextId?: string): void {
    const table = this.getTable(tableName);
    if (!table) return;
    
    // 自动更新所有上下文的过滤视图
    if (table.contexts) {
       const contexts = Object.values(table.contexts);
       contexts.forEach(context => {
            if (context.filterExpression) {
                this.updateContextRows(context, table);
            }
        });
    }

    // 如果指定了 contextId，只通知该上下文
    if (contextId !== undefined) {
      const key = `${tableName}.${contextId}`;
      const subscribers = this.contextSubscribers.get(key);
      
      if (subscribers && subscribers.size > 0) {
        const context = this.getContext(tableName, contextId);
        console.log(`📢 通知 ${subscribers.size} 个订阅者: ${key} 数据已更新`);
        if (context) {
          subscribers.forEach(callback => callback(context));
        }
      }
    } else {
      // 未指定 contextId，通知所有上下文（包括默认上下文）
      const allKeys = Array.from(this.contextSubscribers.keys())
        .filter(key => key.startsWith(`${tableName}.`));
      
      if (allKeys.length > 0) {
        console.log(`📢 通知表 ${tableName} 的所有上下文: ${allKeys.join(', ')}`);
      }
      
      allKeys.forEach(key => {
        const contextId = key.split('.')[1];
        const context = this.getContext(tableName, contextId);
        const subscribers = this.contextSubscribers.get(key);
        
        if (subscribers && context) {
          subscribers.forEach(callback => callback(context));
        }
      });
    }
  }

  /**
   * 获取表的所有父依赖（递归）
   * @param tableName 表名
   * @returns 父表名称集合（从根到直接父表）
   */
  getTableDependencies(tableName: string): Set<string> {
    const dependencies = new Set<string>();  // ✅ 改用 Set，自动去重，has() 性能 O(1)
    const visited = new Set<string>();
    
    const findParents = (currentTable: string) => {
      if (visited.has(currentTable)) return;
      visited.add(currentTable);
      
      // 找到所有以 currentTable 为子表的关系
      const parentRelations = this.dataSet.relations?.filter(
        rel => rel.childTable === currentTable
      ) || [];
      
      parentRelations.forEach(relation => {
        if (!dependencies.has(relation.parentTable)) {  // ✅ O(1) vs includes O(n)
          // 递归查找父表的父表
          findParents(relation.parentTable);
          dependencies.add(relation.parentTable);
        }
      });
    };
    
    findParents(tableName);
    return dependencies;
  }

  /**
   * 检查表的依赖条件是否满足
   * @param tableName 表名
   * @returns 依赖条件是否满足（不仅仅检查父表有数据，还检查依赖类型的条件）
   */
  areDependenciesSatisfied(tableName: string): boolean {
    const relations = this.dataSet.relations?.filter(rel => rel.childTable === tableName) || [];
    
    // 如果没有依赖关系，说明是根表，直接返回 true
    if (relations.length === 0) {
      return true;
    }
    
    // 检查每个依赖关系的条件
    for (const relation of relations) {
      const parentContext = this.getContext(relation.parentTable, relation.parentContextId);
      
      if (!parentContext) {
        console.log(`❌ 父上下文 ${relation.parentTable}.${relation.parentContextId} 不存在`);
        return false;
      }
      
      // 检查父表是否有数据
      const parentTable = this.getTable(relation.parentTable);
      if (!parentTable || !parentTable.rows || parentTable.rows.length === 0) {
        console.log(`❌ 父表 ${relation.parentTable} 缺少数据`);
        return false;
      }
      
      // 检查依赖类型的具体条件
      if (relation.dependencyType === 'currentRow') {
        if (!parentContext.currentRow) {
          console.log(`❌ 依赖条件不满足: ${relation.parentTable}.currentRow 为空`);
          return false;
        }
      } else if (relation.dependencyType === 'selectedRows') {
        if (!parentContext.selectedRows || parentContext.selectedRows.length === 0) {
          console.log(`❌ 依赖条件不满足: ${relation.parentTable}.selectedRows 为空`);
          return false;
        }
      }
      // allRows 和 pagedRows 类型只需要父表有数据即可，已在上面检查
    }
    
    return true; // 所有依赖条件都满足
  }

  /**
   * 获取根依赖表（没有父表的表）
   * @param tableName 表名
   * @returns 根表名称集合
   */
  getRootDependencies(tableName: string): Set<string> {
    const allDependencies = this.getTableDependencies(tableName);
    const rootDeps = new Set<string>();  // ✅ 直接返回 Set
    
    // 过滤出没有父表的表（根表）
    allDependencies.forEach(depTable => {
      const hasParent = this.dataSet.relations?.some(
        rel => rel.childTable === depTable
      );
      if (!hasParent) {
        rootDeps.add(depTable);
      }
    });
    
    return rootDeps;
  }

  /**
   * 智能请求表数据（自动处理依赖）- 完全解耦：不阻塞，异步加载后通知订阅者
   * @param tableName 表名
   */
  requestTableData(tableName: string): void {
    // 防重入检查：如果表正在加载中，跳过
    if (this.loadingTables.has(tableName)) {
      console.log(`⏭️ [DataSetManager] 表 ${tableName} 正在加载中，跳过重复请求`)
      return
    }
    
    console.log(`🔍 UI 请求表数据: ${tableName}`);
    this.emit('loadStart', { tableName });
    
    // 标记为正在加载
    this.loadingTables.add(tableName)
    
    // 异步处理，不阻塞 UI
    this._requestTableDataAsync(tableName)
      .then(() => {
        // 加载完成，移除标记
        this.loadingTables.delete(tableName)
      })
      .catch(error => {
        console.error(`❌ 加载 ${tableName} 失败:`, error);
        this.emit('loadError', { tableName, error });
        // 失败也要移除标记，否则永远不能重试
        this.loadingTables.delete(tableName)
      });
  }

  /**
   * 内部异步请求方法
   */
  private async _requestTableDataAsync(tableName: string): Promise<void> {
    const table = this.getTable(tableName);
    
    // 检查是否为依赖表
    const dependencies = this.getTableDependencies(tableName);
    const isDependentTable = dependencies.size > 0;  // ✅ Set 使用 size
    
    // 仅对根表（无依赖）：如果已有数据，直接使用
    if (!isDependentTable && table && table.rows && table.rows.length > 0) {
      console.log(`✅ 根表 ${tableName} 已有数据（${table.rows.length} 行），直接使用`);
      this.notifySubscribers(tableName);
      this.emit('loadSuccess', { tableName });
      return;
    }
    
    // 依赖表即使有数据，也要重新过滤（因为父表 currentRow 可能变化）
    if (isDependentTable && table && table.rows && table.rows.length > 0) {
      console.log(`🔄 依赖表 ${tableName} 已有数据，重新应用过滤`);
      if (this.areDependenciesSatisfied(tableName)) {
        // 查找所有关联的 autoLoad 关系 (可能多个，用于不同的上下文)
        const relations = this.dataSet.relations?.filter(
          rel => rel.childTable === tableName && rel.autoLoad
        ) || [];
        
        if (relations.length > 0) {
          console.log(`🔄 处理 ${relations.length} 个 autoLoad 关系 for ${tableName}`);

          relations.forEach(relation => {
              // 使用 contextId
              const parentContext = this.getContext(relation.parentTable, relation.parentContextId);
              
              if (!parentContext) {
                console.warn(`⚠️ 父表 ${relation.parentTable} 的 context (${relation.parentContextId}) 不存在`);
                return;
              }
              
              const parentRows = this.getParentRows(parentContext, relation.dependencyType);
              
              // 确定目标上下文（如果有）
              const targetContext = relation.childContextId && relation.childContextId !== 'default'
                  ? this.getContext(tableName, relation.childContextId)
                  : null;

              if (parentRows && parentRows.length > 0) {
                // 🔑 关键修复：从原始完整数据中过滤
                const sourceData = table._originalRows && table._originalRows.length > 0 
                  ? table._originalRows 
                  : table.rows;
                
                // console.log(`🔍 从${sourceData === table._originalRows ? '原始数据' : '当前数据'}过滤: ${tableName} (${sourceData.length} 条)`);
                
                const allRows = [...sourceData];
                const filteredRows = this.filterChildRows(
                  allRows,
                  relation.filterExpression,
                  parentRows,
                  parentContext
                );
                
                if (targetContext) {
                    targetContext.rows = filteredRows;
                    console.log(`✅ 上下文自动过滤: ${relation.childTable}.${relation.childContextId} -> ${filteredRows.length} 条`);
                } else {
                    // Legacy: 更新主表
                    table.rows.splice(0, table.rows.length, ...filteredRows);
                    console.log(`✅ 主表自动过滤: ${filteredRows.length}/${sourceData.length} 条记录`);
                }
              } else {
                // 父行为空
                if (targetContext) {
                    targetContext.rows = [];
                } else {
                    table.rows.splice(0, table.rows.length);
                }
              }
          });
        
          this.notifySubscribers(tableName);
          this.emit('loadSuccess', { tableName });
          return;
        }
      }
    }
    
    // 调试：显示当前表状态
    console.log(`🔍 表 ${tableName} 状态检查:`, {
      tableExists: !!table,
      hasRows: !!(table && table.rows),
      rowsLength: table?.rows?.length || 0,
      rowsIsArray: Array.isArray(table?.rows),
      isDependentTable
    });
    
    // 检查依赖是否满足
    if (this.areDependenciesSatisfied(tableName)) {
      const dependencies = this.getTableDependencies(tableName);
      
      // 如果是根表（无依赖）且无数据，需要加载
      if (dependencies.size === 0) {  // ✅ Set 使用 size
        console.log(`📦 ${tableName} 是根表且无数据，开始加载`);
        await this.loadTableData(tableName);
        this.emit('loadSuccess', { tableName });
        return;
      }
      
      // 有依赖且依赖满足，检查是否需要加载数据
      console.log(`✅ 依赖条件具备，检查 ${tableName} 是否需要加载数据`);
      
      // 🔑 关键修复：无论是否配置 autoLoad，都要检查数据是否已加载
      // 使用 _originalRows 判断数据是否已加载（_originalRows 在首次加载时被设置）
      const needsLoading = table && !table._originalRows;
      
      if (needsLoading) {
        console.log(`📦 ${tableName} 数据未加载（_originalRows 为空），开始加载`);
        await this.loadTableData(tableName);
      }
      
      // 数据加载完成后，应用关系过滤
      console.log(`🔗 应用关系过滤: ${tableName}`);
      this.applyRelationsForTable(tableName);
      
      this.notifySubscribers(tableName);
      this.emit('loadSuccess', { tableName });
      return;
    }
    
    // 依赖不满足，找到根依赖并加载
    const rootTables = this.getRootDependencies(tableName);
    
    if (rootTables.size === 0) {  // ✅ Set 使用 size
      // 当前表本身就是根表，直接加载
      await this.loadTableData(tableName);
      this.emit('loadSuccess', { tableName });
    } else {
      console.log(`📦 需要先加载根依赖表: ${Array.from(rootTables).join(', ')}`);  // ✅ Set 转 Array
      
      // 加载所有根表
      for (const rootTable of rootTables) {
        const rootTableData = this.getTable(rootTable);
        if (!rootTableData || !rootTableData.rows || rootTableData.rows.length === 0) {
          await this.loadTableData(rootTable);
        }
      }
      
      // 根表加载完成后，通知子表依赖已更新（不递归加载，让子表自己决定）
      this.notifyDependencyUpdated(tableName);
    }
  }

  /**
   * 通知依赖已更新（触发事件，不自动加载）
   * @param tableName 表名
   */
  private notifyDependencyUpdated(tableName: string): void {
    console.log(`📢 通知 ${tableName}: 依赖数据已更新，请根据需要加载`);
    this.emit('dependencyUpdated', { tableName });
    
    // 🔑 修复：检查依赖条件是否真正满足（不仅仅是父表有数据）
    // 只有当依赖的 currentRow 或 selectedRows 存在时，才自动加载
    const shouldAutoLoad = this.shouldAutoLoadDependentTable(tableName);
    
    // 检查该表的任意上下文是否有订阅者
    const hasSubscribers = Array.from(this.contextSubscribers.keys())
      .some(key => key.startsWith(`${tableName}.`));
    
    if (shouldAutoLoad && hasSubscribers) {
      console.log(`🎯 ${tableName} 依赖条件满足且有 UI 订阅者，自动加载数据`);
      this.loadTableData(tableName).catch(err => {
        console.error(`❌ 自动加载 ${tableName} 失败:`, err);
      });
    } else if (!shouldAutoLoad) {
      console.log(`⏸️ ${tableName} 依赖条件未满足（如 currentRow 为空），暂不加载`);
    }
  }

  /**
   * 判断依赖表是否应该自动加载
   * 检查父表的 currentRow 或 selectedRows 是否存在
   */
  private shouldAutoLoadDependentTable(tableName: string): boolean {
    const relations = this.dataSet.relations?.filter(rel => rel.childTable === tableName) || [];
    
    for (const relation of relations) {
      const parentContext = this.getContext(relation.parentTable, relation.parentContextId);
      
      if (!parentContext) continue;
      
      // 检查依赖类型
      if (relation.dependencyType === 'currentRow') {
        if (parentContext.currentRow) {
          return true; // currentRow 存在，可以加载
        }
      } else if (relation.dependencyType === 'selectedRows') {
        if (parentContext.selectedRows && parentContext.selectedRows.length > 0) {
          return true; // selectedRows 存在，可以加载
        }
      } else if (relation.dependencyType === 'allRows') {
        // allRows 类型总是可以加载
        return true;
      }
    }
    
    return false; // 所有依赖条件都不满足
  }

  /**
   * 加载表数据（调用外部数据加载器）
   * @param tableName 表名
   */
  private async loadTableData(tableName: string): Promise<void> {
    if (!this.dataLoader) {
      console.warn(`⚠️ 未配置数据加载器，无法加载 ${tableName}`);
      return;
    }
    
    console.log(`🌐 开始加载数据: ${tableName}`);
    
    try {
      const rows = await this.dataLoader(tableName);
      const table = this.getTable(tableName);
      
      if (table) {
        // 将数据加载到默认上下文（table 本身）
        table.rows.splice(0, table.rows.length, ...rows);
        console.log(`✅ 数据加载成功: ${tableName}，共 ${rows.length} 行`);
        
        // 📦 缓存原始完整数据到默认上下文（用于后续过滤）
        if (!table._originalRows) {
          table._originalRows = [...rows];
          console.log(`💾 [默认上下文] 缓存原始数据: ${tableName} (${table._originalRows.length} 条)`);
        }
        
        // 🔑 关键修复：数据加载完成后，如果该表是子表，重新应用父表的过滤规则
        const parentRelations = this.dataSet.relations?.filter(
          rel => rel.childTable === tableName
        ) || [];
        
        if (parentRelations.length > 0) {
          console.log(`🔄 [加载完成] ${tableName} 是子表，重新应用 ${parentRelations.length} 个父表过滤规则`);
          parentRelations.forEach(relation => {
            this.applyRelation(relation);
          });
        }
        
        // 数据加载完成，通知UI订阅者
        this.notifySubscribers(tableName);
        
        // 通知子表：父表数据已更新
        this.notifyChildTables(tableName);
      }
    } catch (error) {
      console.error(`❌ 加载数据失败: ${tableName}`, error);
      throw error;
    }
  }

  /**
   * 通知子表：父表数据已更新（让子表自己决定是否加载）
   * @param parentTableName 父表名
   */
  private notifyChildTables(parentTableName: string): void {
    if (!this.dataSet.relations) return;
    
    // 找到所有以此表为父表的子表
    const childRelations = this.dataSet.relations.filter(
      rel => rel.parentTable === parentTableName
    );
    
    childRelations.forEach(relation => {
      console.log(`📢 通知子表 ${relation.childTable}: 父表 ${parentTableName} 数据已更新`);
      this.notifyDependencyUpdated(relation.childTable);
    });
  }

  /**
   * 应用与指定表相关的所有关系
   * @param tableName 表名
   */
  private applyRelationsForTable(tableName: string): void {
    if (!this.dataSet.relations) return;
    
    // 找到所有以此表为子表的关系
    const relations = this.dataSet.relations.filter(
      rel => rel.childTable === tableName
    );
    
    relations.forEach(relation => {
      this.applyRelation(relation);
    });
  }
}

