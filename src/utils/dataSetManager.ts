/**
 * DataSet 管理器
 * 负责管理 DataTable、DataRelation 和上下文绑定
 */

import type {
  DataSet,
  DataTable,
  DataRelation,
  DataRow,
  BindingContext,
  FilterContext,
  DependencyType,
  FilterExpression
} from '../types/pageData'
import { FilterExpressionParser } from './filterExpressionParser'

/**
 * DataSet 管理器类
 */
export class DataSetManager {
  private dataSet: DataSet
  private eventListeners: Map<string, Function[]> = new Map()
  private tableSubscribers: Map<string, Set<Function>> = new Map() // UI 订阅表数据变化
  private loadingTables: Set<string> = new Set() // 正在加载的表名（防重复请求）
  public dataLoader?: (tableName: string) => Promise<DataRow[]> // 数据加载器（公开以便注册）

  constructor(dataSet: DataSet, dataLoader?: (tableName: string) => Promise<DataRow[]>) {
    this.dataSet = dataSet
    this.dataLoader = dataLoader
    this.initializeContexts()
  }

  /**
   * 初始化所有表的上下文编号
   */
  private initializeContexts(): void {
    // 强制使用对象值数组
    const tables = Object.values(this.dataSet.tables);
    
    tables.forEach((table: DataTable) => {
      // 1. 初始化 _originalRows 缓存（修复静态数据丢失问题）
      if (table.rows && table.rows.length > 0 && (!table._originalRows || table._originalRows.length === 0)) {
        table._originalRows = [...table.rows];
        console.log(`💾 [Init] 初始化原始数据缓存: ${table.tableName} (${table._originalRows.length} 行)`);
      }

      // 为每个表的额外上下文分配编号和 contextOrder
      if (table.contexts && table.contexts.length > 0) {
        table.contexts.forEach((context: BindingContext, index: number) => {
          if (!context.componentID) {
            context.componentID = `${table.tableName}_context_${index + 1}`
          }
        })
      }
    })

    // 为关系自动分配 contextOrder（如果未指定）
    if (this.dataSet.relations) {
      this.dataSet.relations.forEach(relation => {
        // parentContextOrder 默认为 0（表的默认上下文）
        if (relation.parentContextOrder === undefined) {
          relation.parentContextOrder = 0
        }
        // childContextOrder 默认为 0（表的默认上下文）
        if (relation.childContextOrder === undefined) {
          relation.childContextOrder = 0
        }
      })
    }
  }

  /**
   * 获取表
   */
  getTable(tableName: string): DataTable | undefined {
    // 直接通过对象属性访问
    return this.dataSet.tables[tableName];
  }

  /**
   * 获取表的指定上下文
   */
  getContext(tableName: string, contextOrder?: number): BindingContext | undefined {
    // 兼容旧签名
    return this.ensureContext(tableName, contextOrder || 0);
  }

  /**
   * 确保上下文存在（如果不存在则创建）
   */
  /**
   * 查找或创建上下文（支持 ID 或 Order）
   */
  private ensureContext(tableName: string, descriptor: number | string): BindingContext | undefined {
    const table = this.getTable(tableName);
    if (!table) return undefined;
    
    // 默认主上下文
    if (descriptor === 0 || descriptor === 'default') return table;
    
    // 初始化数组
    if (!table.contexts) table.contexts = [];
    
    // 方式 A: 按索引 (number) 查找/创建
    if (typeof descriptor === 'number') {
        const order = descriptor;
        if (!table.contexts[order - 1]) {
           // 自动填充空位
           for(let i = 0; i < order; i++) {
               if (!table.contexts[i]) {
                   table.contexts[i] = {
                       currentRow: null,
                       selectedRows: [],
                       componentID: `${tableName}_ctx_${i+1}`
                   };
               }
           }
        }
        return table.contexts[order - 1];
    }
    
    // 方式 B: 按 ID (string) 查找/创建
    if (typeof descriptor === 'string') {
        let context = table.contexts.find(c => c.componentID === descriptor);
        
        if (!context) {
            context = {
                currentRow: null,
                selectedRows: [],
                componentID: descriptor // 显式使用 ID
            };
            table.contexts.push(context);
            console.log(`✨ [Auto-Create] 创建命名上下文: ${descriptor}`);
        }
        
        return context;
    }
    
    return undefined;
  }

  /**
   * 获取表
   */
  getTable(tableName: string): DataTable | undefined {
    return this.dataSet.tables[tableName];
  }

  /**
   * 获取表的指定上下文
   */
  getContext(tableName: string, descriptor: number | string = 0): BindingContext | undefined {
    return this.ensureContext(tableName, descriptor);
  }

  /**
   * 设置当前行（兼容 number | string）
   * @param descriptor contextOrder(number) 或 contextId(string)
   */
  setCurrentRow(tableName: string, row: DataRow | undefined, descriptor: number | string = 0, skipNotify: boolean = false): void {
    const context = this.getContext(tableName, descriptor)
    
    if (context) {
      // 防重复检查：值未变化时直接返回，避免触发不必要的更新链
      const existingRow = context.currentRow
      const isSameRow = (
        existingRow === row || 
        (existingRow === null && row === null) ||
        (existingRow === undefined && row === undefined) ||
        (existingRow && row && (existingRow as any).id === (row as any).id)
      )
      
      if (isSameRow) {
        console.log(`⏭️ [DataSetManager] ${tableName}.currentRow 未变化，跳过更新`)
        return // 跳过后续所有操作
      }
      
      console.log(`🔄 [DataSetManager] ${tableName}.currentRow 更新`, { from: existingRow, to: row, skipNotify })
      context.currentRow = row
      
      // 触发关系更新 (如果是主上下文或显式配置的)
      // 目前简化逻辑：只有主上下文 (Order 0 / 'default') 触发级联
      const isMainContext = descriptor === 0 || descriptor === 'default';
      if (isMainContext) {
         this.updateRelatedTables(tableName, 0)
      }
      
      // 通知订阅者
      if (!skipNotify) {
        this.notifySubscribers(tableName)
      }
      
      this.emit('currentRowChanged', { tableName, context: descriptor, row })
    }
  }

  /**
   * 设置选中行（兼容 number | string）
   */
  setSelectedRows(tableName: string, rows: DataRow[], descriptor: number | string = 0): void {
    const context = this.getContext(tableName, descriptor)
    
    if (context) {
      context.selectedRows = rows
      
      // 触发关系更新 (同上)
      const isMainContext = descriptor === 0 || descriptor === 'default';
      if (isMainContext) {
         this.updateRelatedTables(tableName, 0)
      }
      
      this.notifySubscribers(tableName)
      this.emit('selectedRowsChanged', { tableName, context: descriptor, rows })
    }
  }

  /**
   * 更新相关联的子表
   */
  private updateRelatedTables(parentTableName: string, parentContextOrder?: number): void {
    if (!this.dataSet.relations) return

    // 找到所有以此表为父表的关系
    const relations = this.dataSet.relations.filter(
      rel => rel.parentTable === parentTableName &&
        (rel.parentContextOrder === parentContextOrder ||
         (rel.parentContextOrder === undefined && parentContextOrder === undefined))
    )

    relations.forEach(relation => {
      this.applyRelation(relation)
    })
  }

  /**
   * 应用数据关系
   */
  applyRelation(relation: DataRelation): void {
    const parentContext = this.getContext(relation.parentTable, relation.parentContextOrder)
    const childTable = this.getTable(relation.childTable)
    const childContext = this.getContext(relation.childTable, relation.childContextOrder)

    if (!parentContext || !childTable || !childContext) {
      console.warn(`无法应用关系: ${relation.parentTable} -> ${relation.childTable}`)
      return
    }

    console.log(`🔗 [applyRelation] ${relation.parentTable} -> ${relation.childTable}`, {
      dependencyType: relation.dependencyType,
      autoLoad: relation.autoLoad,
      parentCurrentRow: parentContext.currentRow
    })

    // 根据 dependencyType 获取父数据范围
    const parentRows = this.getParentRows(parentContext, relation.dependencyType)

    if (!parentRows || parentRows.length === 0) {
      // 父数据为空，清空子数据
      childContext.selectedRows = []
      
      // 如果是 currentRow 依赖且有 autoLoad 配置，清空子表数据
      if (relation.dependencyType === 'currentRow' && relation.autoLoad) {
        childTable.rows.splice(0, childTable.rows.length) // 使用 splice 保持响应式
        this.notifySubscribers(relation.childTable)
      }
      return
    }

    // 特殊处理 currentRow 依赖 + autoLoad：触发加载，数据由 _requestTableDataAsync 统一处理
    if (relation.dependencyType === 'currentRow' && relation.autoLoad) {
      // 子表无数据，触发加载（不在这里过滤，统一在 _requestTableDataAsync 中处理）
      if (!childTable.rows || childTable.rows.length === 0) {
        console.log(`🔄 [自动加载] ${relation.childTable} (基于 ${relation.parentTable}.currentRow)`)
        this.requestTableData(relation.childTable)
        return
      }
      // 如果已有数据，不在这里处理，让 requestTableData 检测后重新过滤
      console.log(`🔄 [重新请求] ${relation.childTable} (已有数据，需重新过滤)`)
      this.requestTableData(relation.childTable)
      return
    }

    // 应用过滤表达式（用于 selectedRows/allRows 等其他依赖类型）
    const filteredRows = this.filterChildRows(
      childTable.rows,
      relation.filterExpression,
      parentRows,
      parentContext
    )

    // 更新子上下文
    childContext.selectedRows = filteredRows

    // 如果子表也有关系，递归更新
    this.updateRelatedTables(relation.childTable, relation.childContextOrder)
  }

  /**
   * 根据依赖类型获取父数据范围
   */
  private getParentRows(
    parentContext: BindingContext,
    dependencyType: DependencyType
  ): DataRow[] | undefined {
    switch (dependencyType) {
      case 'currentRow':
        return parentContext.currentRow ? [parentContext.currentRow] : []
      case 'selectedRows':
        return parentContext.selectedRows || []
      case 'allRows':
        // 如果父上下文是表，返回所有行
        if ('rows' in parentContext) {
          return (parentContext as DataTable).rows
        }
        return []
      case 'pagedRows':
        // 返回当前分页的数据行
        if ('rows' in parentContext && 'pagination' in parentContext) {
          const table = parentContext as DataTable
          const pagination = table.pagination
          if (pagination && pagination.pageIndex && pagination.pageSize) {
            const start = (pagination.pageIndex - 1) * pagination.pageSize
            const end = start + pagination.pageSize
            return table.rows.slice(start, end)
          }
        }
        return []
      case 'filteredRows':
        // filteredRows 需要自定义过滤逻辑，暂时返回 selectedRows 或 allRows
        // 实际使用时应该在业务代码中手动设置 selectedRows
        return parentContext.selectedRows && parentContext.selectedRows.length > 0
          ? parentContext.selectedRows
          : ('rows' in parentContext ? (parentContext as DataTable).rows : [])
      default:
        // 自定义类型，暂时返回 currentRow
        return parentContext.currentRow ? [parentContext.currentRow] : []
    }
  }

  /**
   * 过滤子表数据
   */
  private filterChildRows(
    childRows: DataRow[],
    filterExpression: any,
    parentRows: DataRow[],
    _parentContext: BindingContext
  ): DataRow[] {
    const results: DataRow[] = []

    // 对每个父行进行过滤
    parentRows.forEach(parentRow => {
      const context: FilterContext = {
        parentRow,
        parentRows,
        variables: {}
      }

      // 生成过滤函数
      const filterFn = FilterExpressionParser.toMemoryFilter(filterExpression, context)

      // 过滤子表数据
      const filtered = childRows.filter(filterFn)
      results.push(...filtered)
    })

    // 去重（基于所有字段）
    return this.uniqueRows(results)
  }

  /**
   * 数组去重
   */
  private uniqueRows(rows: DataRow[]): DataRow[] {
    const seen = new Set<string>()
    return rows.filter(row => {
      const key = JSON.stringify(row)
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }

  /**
   * 级联更新
   * 当父表行更新时，同步更新子表中匹配行的外键字段
   */
  cascadeUpdate(tableName: string, row: DataRow, oldValues?: DataRow): void {
    const table = this.getTable(tableName)
    if (!table) return

    // 查找需要级联更新的关系
    const relations = this.dataSet.relations?.filter(
      rel => rel.parentTable === tableName && rel.cascadeUpdate
    ) || []

    relations.forEach(relation => {
      const childTable = this.getTable(relation.childTable)
      if (!childTable) return

      // 解析 filterExpression 找到外键字段映射
      const foreignKeyMap = this.extractForeignKeyMap(relation.filterExpression)
      
      if (foreignKeyMap.length === 0) {
        console.warn(`级联更新: 无法从 filterExpression 提取外键映射: ${tableName} -> ${relation.childTable}`)
        return
      }

      // 更新子表中所有匹配的行
      childTable.rows.forEach(childRow => {
        let shouldUpdate = false
        
        // 检查是否匹配旧值（如果提供）
        if (oldValues) {
          shouldUpdate = foreignKeyMap.every(({ childField, parentField }) => {
             // 宽松相等
            return childRow[childField] == oldValues[parentField]
          })
        } else {
          // 没有旧值，检查是否匹配当前值
          shouldUpdate = foreignKeyMap.every(({ childField, parentField }) => {
            return childRow[childField] == row[parentField]
          })
        }

        // 更新外键字段为新值
        if (shouldUpdate) {
          foreignKeyMap.forEach(({ childField, parentField }) => {
            const newValue = row[parentField]
            if (childRow[childField] !== newValue) {
              childRow[childField] = newValue
              console.log(`级联更新: ${relation.childTable}.${childField} = ${newValue}`)
              
              // 关键修复：同步更新原始缓存中的数据（如果是引用相同，其实已经更新了，但为了保险起见检查一下）
              // 如果 _originalRows 存储的是不同的对象引用，则需要手动查找并更新
              // 在当前架构中，_originalRows 即使是浅拷贝，对象引用也是共享的，所以 rows 修改会自动反映。
              // 除非重新赋值了对象。childRow[field] = val 是安全的。
            }
          })
        }
      })

      // 触发子表更新事件
      this.emit('cascadeUpdate', { 
        parentTable: tableName, 
        childTable: relation.childTable,
        parentRow: row,
        oldValues
      })
    })
    
    // 通知订阅者
    this.notifySubscribers(tableName);
    if (relations.length > 0) {
      relations.forEach(rel => this.notifySubscribers(rel.childTable));
    }
  }

  /**
   * 级联删除
   * 当父表行删除时，自动删除子表中所有关联的行
   */
  cascadeDelete(tableName: string, row: DataRow): void {
    console.log(`🔧 cascadeDelete 被调用: ${tableName}`, row);
    
    const table = this.getTable(tableName)
    if (!table) {
      console.warn(`⚠️ 找不到表: ${tableName}`);
      return;
    }

    // 查找需要级联删除的关系
    const relations = this.dataSet.relations?.filter(
      rel => rel.parentTable === tableName && rel.cascadeDelete
    ) || []

    console.log(`🔗 找到 ${relations.length} 个级联删除关系`);

    relations.forEach(relation => {
      console.log(`  处理关系: ${relation.parentTable} -> ${relation.childTable}`);
      
      const childTable = this.getTable(relation.childTable)
      if (!childTable) {
        console.warn(`⚠️ 找不到子表: ${relation.childTable}`);
        return;
      }

      // 解析 filterExpression 找到外键字段映射
      const foreignKeyMap = this.extractForeignKeyMap(relation.filterExpression)
      
      console.log(`  外键映射:`, foreignKeyMap);
      
      if (foreignKeyMap.length === 0) {
        console.warn(`级联删除: 无法从 filterExpression 提取外键映射: ${tableName} -> ${relation.childTable}`)
        return
      }

      // 找到所有需要删除的子行
      const rowsToDelete: DataRow[] = []
      childTable.rows.forEach(childRow => {
        const matches = foreignKeyMap.every(({ childField, parentField }) => {
          // 使用宽松相等 (==) 以支持 string/number 混合场景
          const childVal = childRow[childField];
          const parentVal = row[parentField];
          return childVal == parentVal;
        })
        
        if (matches) {
          console.log(`    ✓ [级联删除] 匹配到子行:`, childRow);
          rowsToDelete.push(childRow)
        }
      })

      console.log(`  找到 ${rowsToDelete.length} 行需要删除`);

      // 递归级联删除子表的子表
      rowsToDelete.forEach(childRow => {
        this.cascadeDelete(relation.childTable, childRow)
      })

      // 删除子行 - 使用 splice 确保触发 Vue 响应式更新
      if (rowsToDelete.length > 0) {
        // 从后向前删除，避免索引变化影响
        rowsToDelete.forEach(rowToDelete => {
          // 1. 从当前显示数据中删除
          const index = childTable.rows.indexOf(rowToDelete);
          if (index > -1) {
            childTable.rows.splice(index, 1);
          }
          
          // 2. 关键修复：同步从原始缓存中删除（防止过滤时僵尸数据复活）
          if (childTable._originalRows) {
            // 注意：_originalRows 中的对象引用可能与 rowsToDelete 中的不同（如果经过了深拷贝）
            // 但在这里通常是引用相同的。为了安全，使用 ID 或对象比较。
            const cacheIndex = childTable._originalRows.indexOf(rowToDelete);
            if (cacheIndex > -1) {
               childTable._originalRows.splice(cacheIndex, 1);
            } else {
               // 尝试通过 ID 查找（如果引用不同）
               const idField = childTable.columns.find(c => c.isPrimaryKey)?.name || 'id';
               const id = rowToDelete[idField];
               const cacheIdIndex = childTable._originalRows.findIndex(r => r[idField] == id);
               if (cacheIdIndex > -1) {
                 childTable._originalRows.splice(cacheIdIndex, 1);
               }
            }
          }
        });
        console.log(`✅ 级联删除: ${relation.childTable} 删除了 ${rowsToDelete.length} 行，剩余 ${childTable.rows.length} 行`)
      }

      // 触发子表删除事件
      this.emit('cascadeDelete', { 
        parentTable: tableName, 
        childTable: relation.childTable,
        parentRow: row,
        deletedRows: rowsToDelete
      })
    })
    
    // 通知订阅者
    this.notifySubscribers(tableName);
    if (relations.length > 0) {
      relations.forEach(rel => this.notifySubscribers(rel.childTable));
    }
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
   * 添加数据行
   */
  addRow(tableName: string, row: DataRow): void {
    const table = this.getTable(tableName)
    if (table) {
      table.rows.push(row)
      // 同步缓存
      if (table._originalRows) {
        table._originalRows.push(row)
      }
      this.emit('rowAdded', { tableName, row })
    }
  }

  /**
   * 更新数据行
   */
  updateRow(tableName: string, rowIndex: number, row: DataRow): void {
    const table = this.getTable(tableName)
    if (table && rowIndex >= 0 && rowIndex < table.rows.length) {
      // 保持对象引用，使用 assign 更新属性（这样 _originalRows 也会自动更新）
      // table.rows[rowIndex] = row // ❌ 这会破坏引用
      Object.assign(table.rows[rowIndex], row);
      
      // 级联更新
      this.cascadeUpdate(tableName, table.rows[rowIndex])
      
      this.emit('rowUpdated', { tableName, rowIndex, row })
    }
  }

  /**
   * 删除数据行
   */
  deleteRow(tableName: string, rowIndex: number): void {
    const table = this.getTable(tableName)
    if (table && rowIndex >= 0 && rowIndex < table.rows.length) {
      const row = table.rows[rowIndex]
      
      // 级联删除
      this.cascadeDelete(tableName, row)
      
      table.rows.splice(rowIndex, 1)
      
      // 同步缓存
      if (table._originalRows) {
        const cacheIndex = table._originalRows.indexOf(row);
        if (cacheIndex > -1) {
          table._originalRows.splice(cacheIndex, 1);
        }
      }
      
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

  /**   * 从 FilterExpression 提取外键字段映射
   * 例如: { field: 'userId', op: '==', value: { func: 'FIELD', args: ['id'] } }
   * 返回: [{ childField: 'userId', parentField: 'id' }]
   */
  private extractForeignKeyMap(expr: FilterExpression): Array<{ childField: string; parentField: string }> {
    const result: Array<{ childField: string; parentField: string }> = []

    // 递归解析表达式
    const parse = (node: FilterExpression): void => {
      // 逻辑组合节点
      if ('children' in node && Array.isArray(node.children)) {
        node.children.forEach((child: FilterExpression) => parse(child))
        return
      }

      // 单一条件节点
      if ('field' in node && 'op' in node && 'value' in node) {
        // 检查 value 是否是 FIELD() 函数调用
        if (typeof node.value === 'object' && node.value !== null) {
          if ('func' in node.value && node.value.func === 'FIELD' && Array.isArray(node.value.args)) {
            result.push({
              childField: node.field,
              parentField: node.value.args[0]
            })
          }
        }
      }
    }

    parse(expr)
    return result
  }

  /**   * 触发事件
   */
  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(callback => callback(data))
    }
  }

  /**
   * 获取整个 DataSet
   */
  getDataSet(): DataSet {
    return this.dataSet
  }

  /**
   * 导出为 JSON
   */
  toJSON(): string {
    return JSON.stringify(this.dataSet, null, 2)
  }

  /**
   * 从 JSON 加载
   */
  static fromJSON(json: string): DataSetManager {
    const dataSet = JSON.parse(json) as DataSet
    return new DataSetManager(dataSet)
  }

  /**
   * 订阅表数据变化
   * @param tableName 表名
   * @param callback 回调函数
   */
  subscribe(tableName: string, callback: Function): () => void {
    if (!this.tableSubscribers.has(tableName)) {
      this.tableSubscribers.set(tableName, new Set());
    }
    this.tableSubscribers.get(tableName)!.add(callback);
    
    console.log(`📡 UI 订阅表: ${tableName}`);
    
    // 返回取消订阅函数
    return () => {
      this.tableSubscribers.get(tableName)?.delete(callback);
    };
  }

  /**
   * 通知订阅者数据变化（公开方法）
   * @param tableName 表名
   */
  notifySubscribers(tableName: string): void {
    const subscribers = this.tableSubscribers.get(tableName);
    if (subscribers && subscribers.size > 0) {
      const table = this.getTable(tableName);
      console.log(`📢 通知 ${subscribers.size} 个订阅者: ${tableName} 数据已更新`);
      subscribers.forEach(callback => callback(table));
    }
  }

  /**
   * 获取表的所有父依赖（递归）
   * @param tableName 表名
   * @returns 父表名称数组（从根到直接父表）
   */
  getTableDependencies(tableName: string): string[] {
    const dependencies: string[] = [];
    const visited = new Set<string>();
    
    const findParents = (currentTable: string) => {
      if (visited.has(currentTable)) return;
      visited.add(currentTable);
      
      // 找到所有以 currentTable 为子表的关系
      const parentRelations = this.dataSet.relations?.filter(
        rel => rel.childTable === currentTable
      ) || [];
      
      parentRelations.forEach(relation => {
        if (!dependencies.includes(relation.parentTable)) {
          // 递归查找父表的父表
          findParents(relation.parentTable);
          dependencies.push(relation.parentTable);
        }
      });
    };
    
    findParents(tableName);
    return dependencies;
  }

  /**
   * 检查表的依赖是否都有数据
   * @param tableName 表名
   * @returns 是否所有依赖表都有数据
   */
  areDependenciesSatisfied(tableName: string): boolean {
    const dependencies = this.getTableDependencies(tableName);
    
    for (const depTableName of dependencies) {
      const depTable = this.getTable(depTableName);
      if (!depTable || !depTable.rows || depTable.rows.length === 0) {
        console.log(`❌ 依赖表 ${depTableName} 缺少数据`);
        return false;
      }
    }
    
    return true;
  }

  /**
   * 获取根依赖表（没有父表的表）
   * @param tableName 表名
   * @returns 根表名称数组
   */
  getRootDependencies(tableName: string): string[] {
    const allDependencies = this.getTableDependencies(tableName);
    
    // 过滤出没有父表的表（根表）
    return allDependencies.filter(depTable => {
      const hasParent = this.dataSet.relations?.some(
        rel => rel.childTable === depTable
      );
      return !hasParent;
    });
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
    const isDependentTable = dependencies.length > 0;
    
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
        // 直接在这里过滤，不调用 applyRelationsForTable（避免递归调用 requestTableData）
        const relation = this.dataSet.relations?.find(
          rel => rel.childTable === tableName && rel.autoLoad
        );
        
        if (relation) {
          const parentContext = this.getContext(relation.parentTable, relation.parentContextOrder);
          
          if (!parentContext) {
            console.warn(`⚠️ 父表 ${relation.parentTable} 的 context 不存在`);
            return;
          }
          
          const parentRows = this.getParentRows(parentContext, relation.dependencyType);
          
          if (parentRows && parentRows.length > 0) {
            // 🔑 关键修复：从原始完整数据中过滤，而不是从已过滤的 rows 中过滤
            const sourceData = table._originalRows && table._originalRows.length > 0 
              ? table._originalRows 
              : table.rows;
            
            console.log(`🔍 从${sourceData === table._originalRows ? '原始数据' : '当前数据'}过滤: ${tableName} (${sourceData.length} 条)`);
            
            const allRows = [...sourceData]; // 从完整数据集复制
            const filteredRows = this.filterChildRows(
              allRows,
              relation.filterExpression,
              parentRows,
              parentContext
            );
            
            // 更新 table.rows 为过滤后的数据
            table.rows.splice(0, table.rows.length, ...filteredRows);
            console.log(`✅ 重新过滤完成: ${filteredRows.length}/${sourceData.length} 条记录`);
          } else {
            // 父行为空，清空子表
            table.rows.splice(0, table.rows.length);
            console.log(`🧹 父行为空，清空 ${tableName}`);
          }
        }
        
        this.notifySubscribers(tableName);
        this.emit('loadSuccess', { tableName });
        return;
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
      if (dependencies.length === 0) {
        console.log(`📦 ${tableName} 是根表且无数据，开始加载`);
        await this.loadTableData(tableName);
        this.emit('loadSuccess', { tableName });
        return;
      }
      
      // 有依赖且依赖满足，检查是否需要加载数据
      console.log(`✅ 依赖条件具备，检查 ${tableName} 是否需要加载数据`);
      
      // 检查是否有 autoLoad 配置且表为空
      const hasAutoLoadRelation = this.dataSet.relations?.some(
        rel => rel.childTable === tableName && rel.autoLoad
      );
      
      if (hasAutoLoadRelation) {
        // 如果表为空，先加载数据
        if (!table || !table.rows || table.rows.length === 0) {
          console.log(`📦 ${tableName} 配置了 autoLoad 且无数据，开始加载`);
          await this.loadTableData(tableName);
        }
        
        // 加载完成后，应用过滤（基于父表的 currentRow）
        console.log(`🔗 应用关系过滤: ${tableName}`);
        const relation = this.dataSet.relations?.find(
          rel => rel.childTable === tableName && rel.autoLoad
        );
        
        if (relation) {
          const parentContext = this.getContext(relation.parentTable, relation.parentContextOrder);
          
          if (!parentContext) {
            console.warn(`⚠️ 父表 ${relation.parentTable} 的 context 不存在`);
            return;
          }
          
          const parentRows = this.getParentRows(parentContext, relation.dependencyType);
          
          if (parentRows && parentRows.length > 0 && table) {
            // 过滤数据
            const allRows = [...table.rows]; // 保存全部数据的副本
            const filteredRows = this.filterChildRows(
              allRows,
              relation.filterExpression,
              parentRows,
              parentContext
            );
            
            // 更新 table.rows 为过滤后的数据
            table.rows.splice(0, table.rows.length, ...filteredRows);
            console.log(`✅ 过滤完成: ${filteredRows.length}/${allRows.length} 条记录`);
          }
        }
      } else {
        // 没有 autoLoad，只应用关系
        console.log(`🔗 应用关系过滤: ${tableName}`);
        this.applyRelationsForTable(tableName);
      }
      
      this.notifySubscribers(tableName);
      this.emit('loadSuccess', { tableName });
      return;
    }
    
    // 依赖不满足，找到根依赖并加载
    const rootTables = this.getRootDependencies(tableName);
    
    if (rootTables.length === 0) {
      // 当前表本身就是根表，直接加载
      await this.loadTableData(tableName);
      this.emit('loadSuccess', { tableName });
    } else {
      console.log(`📦 需要先加载根依赖表: ${rootTables.join(', ')}`);
      
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
    
    // 如果有订阅者关注此表，说明 UI 需要数据，则加载
    if (this.tableSubscribers.has(tableName) && this.tableSubscribers.get(tableName)!.size > 0) {
      console.log(`🎯 ${tableName} 有 UI 订阅者，自动加载数据`);
      this.loadTableData(tableName).catch(err => {
        console.error(`❌ 自动加载 ${tableName} 失败:`, err);
      });
    }
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
        table.rows = rows;
        console.log(`✅ 数据加载成功: ${tableName}，共 ${rows.length} 行`);
        
        // 📦 缓存原始完整数据（用于后续过滤）
        if (!table._originalRows || table._originalRows.length === 0) {
          table._originalRows = [...rows];
          console.log(`💾 缓存原始数据: ${tableName} (${table._originalRows.length} 条)`);
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

