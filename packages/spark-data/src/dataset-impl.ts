/**
 * DataSet 类 - 领域逻辑
 * 负责：数据表、关系、CRUD 操作、级联更新/删除
 */

import type {
  IDataSet,
  IDataTable,
  IBindingContext,
  DataRelation,
  DataRow,
  FilterContext,
  DependencyType,
  FilterExpression,
  IApiAdapter
} from './types'
import { DataTable } from './dataTable'
import { BindingContext } from './bindingContext'
import { FilterExpressionParser } from './filterExpressionParser'

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
  
  // 事件系统
  private eventListeners: Map<string, Function[]> = new Map()
  // 上下文级别的订阅管理：key = "tableName.contextId"
  private contextSubscribers: Map<string, Set<Function>> = new Map()
  // 数据加载器
  public dataLoader?: (tableName: string) => Promise<DataRow[]>
  // 正在加载的表
  private loadingTables: Set<string> = new Set()
  // API 适配器（通过 setApiAdapter 设置，用于表级 API 注入）
  private apiAdapter?: IApiAdapter

  constructor(
    config: IDataSet, 
    dataLoader?: (tableName: string) => Promise<DataRow[]>,
    apiAdapter?: IApiAdapter
  ) {
    this.dataLoader = dataLoader
    this.apiAdapter = apiAdapter
    this.dataSetName = config.dataSetName
    
    // 转换表为类实例
    this.tables = {}
    Object.entries(config.tables).forEach(([tableName, tableData]) => {
      const table = DataTable.fromPlainObject({
        ...tableData,
        tableName // 确保 tableName 正确
      })
      
      // 🔧 设置表（默认上下文）的 DataSet 引用
      table.setDataSet(this)
      
      // 🔧 注入 API 适配器
      if (this.apiAdapter) {
        table.setApiAdapter(this.apiAdapter)
      }
      
      // 处理自定义上下文
      Object.entries(table.contexts || {}).forEach(([contextId, context]) => {
        // 设置上下文的 DataSet 引用
        context.setDataSet(this)
        
        // 如果有初始过滤配置，应用过滤
        if (context.filterExpression) {
          this.updateContextRows(context, table)
          console.info(`🌪️ [Init] ${tableName}.${contextId} 应用初始过滤: ${context.rows?.length} 行`)
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
  }
  
  /**
   * 更新上下文的 rows（委托给 BindingContext）
   */
  private updateContextRows(context: BindingContext, table: DataTable): void {
    // 始终基于完整数据源
    let sourceData = table._originalRows ?? table.rows ?? [];
    
    // 1. 执行过滤（需要 FilterExpressionParser）
    if (context.filterExpression) {
      try {
        const filterFn = FilterExpressionParser.toMemoryFilter(context.filterExpression);
        sourceData = sourceData.filter(filterFn);
      } catch (e) {
        console.error(`❌ [Context] 上下文 ${context.hostTable}.${context.contextId} 过滤失败:`, e);
        sourceData = [];
      }
    }
    
    // 2. 委托给上下文处理排序并更新 rows
    context.updateRows(sourceData);
  }

  /**
   * 获取表
   */
  getTable(tableName: string): DataTable | undefined {
    return this.tables[tableName]
  }
  
  /**
   * 设置 API 适配器（运行时注入）
   * 
   * @param adapter - API 适配器实例
   * 
   * @example
   * ```typescript
   * const apiAdapter = new ApiAdapter(httpClient, apiContext)
   * dataSet.setApiAdapter(apiAdapter)
   * ```
   */
  setApiAdapter(adapter: IApiAdapter): void {
    this.apiAdapter = adapter
    
    // 为所有表注入 API 适配器
    Object.values(this.tables).forEach(table => {
      table.setApiAdapter(adapter)
    })
    
    console.info(`✅ [DataSet] ${this.dataSetName} 已注入 ApiAdapter`)
  }

  /**
   * 添加数据行
   */
  addRow(tableName: string, row: DataRow): boolean {
    const table = this.getTable(tableName)
    if (!table) return false
    
    table.rows.push(row)
    
    // 同步默认上下文的缓存
    if (table._originalRows) {
      table._originalRows.push(row)
    }
    
    return true
  }

  /**
   * 更新数据行
   */
  updateRow(tableName: string, rowIndex: number, row: DataRow): boolean {
    const table = this.getTable(tableName)
    if (!table || rowIndex < 0 || rowIndex >= table.rows.length) {
      return false
    }
    
    // 保持对象引用，使用 assign 更新属性（这样 _originalRows 也会自动更新）
    Object.assign(table.rows[rowIndex], row)
    
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
    table.rows.splice(rowIndex, 1)
    
    // 同步默认上下文的缓存
    if (table._originalRows) {
      const cacheIndex = table._originalRows.indexOf(row)
      if (cacheIndex > -1) {
        table._originalRows.splice(cacheIndex, 1)
      }
    }
    
    return true
  }

  /**
   * 级联更新
   * 当父表行更新时，同步更新子表中匹配行的外键字段
   */
  cascadeUpdate(tableName: string, row: DataRow, oldValues?: DataRow): string[] {
    const table = this.getTable(tableName)
    if (!table) return []

    // 查找需要级联更新的关系
    const relations = this.relations?.filter(
      rel => rel.parentTable === tableName && rel.cascadeUpdate
    ) ?? []

    const affectedTables: string[] = []

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
      let hasUpdates = false
      childTable.rows.forEach(childRow => {
        let shouldUpdate = false
        
        // 检查是否匹配旧值（如果提供）
        if (oldValues) {
          shouldUpdate = foreignKeyMap.every(({ childField, parentField }) => {
            return childRow[childField] === oldValues[parentField]
          })
        } else {
          // 没有旧值，检查是否匹配当前值
          shouldUpdate = foreignKeyMap.every(({ childField, parentField }) => {
            return childRow[childField] === row[parentField]
          })
        }

        // 更新外键字段为新值
        if (shouldUpdate) {
          foreignKeyMap.forEach(({ childField, parentField }) => {
            const newValue = row[parentField]
            if (childRow[childField] !== newValue) {
              childRow[childField] = newValue
              hasUpdates = true
              console.info(`级联更新: ${relation.childTable}.${childField} = ${newValue}`)
            }
          })
        }
      })

      if (hasUpdates) {
        affectedTables.push(relation.childTable)
      }
    })
    
    return affectedTables
  }

  /**
   * 级联删除
   * 当父表行删除时，自动删除子表中所有关联的行
   */
  cascadeDelete(tableName: string, row: DataRow): string[] {
    console.info(`🔧 cascadeDelete 被调用: ${tableName}`, row)
    
    const table = this.getTable(tableName)
    if (!table) {
      console.warn(`⚠️ 找不到表: ${tableName}`)
      return []
    }

    // 查找需要级联删除的关系
    const relations = this.relations?.filter(
      rel => rel.parentTable === tableName && rel.cascadeDelete
    ) ?? []

    console.info(`🔗 找到 ${relations.length} 个级联删除关系`)

    const affectedTables: string[] = []

    relations.forEach(relation => {
      console.info(`  处理关系: ${relation.parentTable} -> ${relation.childTable}`)
      
      const childTable = this.getTable(relation.childTable)
      if (!childTable) {
        console.warn(`⚠️ 找不到子表: ${relation.childTable}`)
        return
      }

      // 解析 filterExpression 找到外键字段映射
      const foreignKeyMap = this.extractForeignKeyMap(relation.filterExpression)
      
      console.info(`  外键映射:`, foreignKeyMap)
      
      if (foreignKeyMap.length === 0) {
        console.warn(`级联删除: 无法从 filterExpression 提取外键映射: ${tableName} -> ${relation.childTable}`)
        return
      }

      // 找到所有需要删除的子行
      const rowsToDelete = new Set<DataRow>()
      childTable.rows.forEach(childRow => {
        const matches = foreignKeyMap.every(({ childField, parentField }) => {
          const childVal = childRow[childField]
          const parentVal = row[parentField]
          return childVal === parentVal
        })
        
        if (matches) {
          console.info(`    ✓ [级联删除] 匹配到子行:`, childRow)
          rowsToDelete.add(childRow)
        }
      })

      console.info(`  找到 ${rowsToDelete.size} 行需要删除`)

      // 递归级联删除子表的子表
      rowsToDelete.forEach(childRow => {
        const nestedAffected = this.cascadeDelete(relation.childTable, childRow)
        nestedAffected.forEach(t => {
          if (!affectedTables.includes(t)) {
            affectedTables.push(t)
          }
        })
      })

      // 删除子行 - 使用 splice 确保触发 Vue 响应式更新
      if (rowsToDelete.size > 0) {
        rowsToDelete.forEach(rowToDelete => {
          // 1. 从当前显示数据中删除
          const index = childTable.rows.indexOf(rowToDelete)
          if (index > -1) {
            childTable.rows.splice(index, 1)
          }
          
          // 2. 关键修复：同步从上下文原始缓存中删除
          if (childTable._originalRows) {
            const cacheIndex = childTable._originalRows.indexOf(rowToDelete)
            if (cacheIndex > -1) {
              childTable._originalRows.splice(cacheIndex, 1)
            } else {
              // 尝试通过 ID 查找（如果引用不同）
              const idField = childTable.columns.find(c => c.isPrimaryKey)?.name ?? 'id'
              const id = rowToDelete[idField]
              const cacheIdIndex = childTable._originalRows.findIndex(r => r[idField] === id)
              if (cacheIdIndex > -1) {
                childTable._originalRows.splice(cacheIdIndex, 1)
              }
            }
          }
        })
        
        console.info(`✅ 级联删除: ${relation.childTable} 删除了 ${rowsToDelete.size} 行，剩余 ${childTable.rows.length} 行`)
        
        if (!affectedTables.includes(relation.childTable)) {
          affectedTables.push(relation.childTable)
        }
      }
    })
    
    return affectedTables
  }

  /**
   * 从 FilterExpression 提取外键字段映射
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
          const value = node.value as Record<string, unknown>
          if ('func' in value && value.func === 'FIELD' && Array.isArray(value.args)) {
            result.push({
              childField: node.field,
              parentField: (value.args as unknown[])[0] as string
            })
          }
        }
      }
    }

    parse(expr)
    return result
  }

  /**
   * 根据依赖类型获取父数据范围
   */
  getParentRows(
    parentContext: BindingContext | IBindingContext,
    dependencyType: DependencyType
  ): DataRow[] | undefined {
    switch (dependencyType) {
      case 'currentRow':
        return parentContext.currentRow ? [parentContext.currentRow] : []
      case 'selectedRows':
        return parentContext.selectedRows ?? []
      case 'allRows':
        return parentContext.rows ?? []
      case 'pagedRows':
        // 返回当前分页的数据行
        if ('rows' in parentContext && 'pagination' in parentContext) {
          const table = parentContext as DataTable
          const pagination = table.pagination
          if (pagination?.pageIndex && pagination.pageSize) {
            const start = (pagination.pageIndex - 1) * pagination.pageSize
            const end = start + pagination.pageSize
            return table.rows.slice(start, end)
          }
        }
        return []
      default:
        // 自定义类型，暂时返回 currentRow
        return parentContext.currentRow ? [parentContext.currentRow] : []
    }
  }

  /**
   * 过滤子表数据
   */
  filterChildRows(
    childRows: DataRow[],
    filterExpression: FilterExpression,
    parentRows: DataRow[],
    _parentContext: BindingContext | IBindingContext
  ): DataRow[] {
    // 特殊处理：如果是 'in' 操作符且有多个 parentRows
    // 需要一次性提取所有 parentRows 的字段值，而不是逐个过滤
    if ('op' in filterExpression && filterExpression.op === 'in' && parentRows.length > 0) {
      // 提取所有 parentRows 的字段值
      const fieldName = 'value' in filterExpression && 
                        typeof filterExpression.value === 'object' && 
                        filterExpression.value !== null && 
                        'func' in filterExpression.value && 
                        filterExpression.value.func === 'FIELD' && 
                        'args' in filterExpression.value && 
                        Array.isArray(filterExpression.value.args)
        ? filterExpression.value.args[0] 
        : null;
      
      if (fieldName && 'field' in filterExpression) {
        // 收集所有 parentRows 的 fieldName 值
        const parentValues = parentRows.map(row => row[fieldName as string]).filter(v => v !== undefined);
        
        // 直接过滤子表：childRow[field] in parentValues
        const childFieldName = filterExpression.field;
        const filtered = childRows.filter(childRow => 
          parentValues.includes(childRow[childFieldName])
        );
        
        return filtered;
      }
    }
    
    // 默认逻辑：逐个 parentRow 过滤（适用于 ==, >, < 等操作符）
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
   * 应用数据关系（根据父表状态过滤子表）
   * @param relation 关系定义
   * @returns 是否发生了数据变化
   */
  applyRelation(relation: DataRelation): { changed: boolean; message: string } {
    // 解析父上下文
    const parentTable = this.getTable(relation.parentTable);
    if (!parentTable) {
      return { changed: false, message: `父表 ${relation.parentTable} 不存在` };
    }
    
    const parentContext = parentTable.getOrCreateContext(relation.parentContextId ?? 'default');
    
    // 解析子表和子上下文
    const childTable = this.getTable(relation.childTable);
    if (!childTable) {
      return { changed: false, message: `子表 ${relation.childTable} 不存在` };
    }
    
    const childContext = childTable.getOrCreateContext(relation.childContextId ?? 'default');

    console.info(`🔗 [DataSet.applyRelation] ${relation.parentTable}.${relation.parentContextId} -> ${relation.childTable}.${relation.childContextId}`, {
      dependencyType: relation.dependencyType,
      autoLoad: relation.autoLoad
    });

    // 根据依赖类型获取父级数据
    const parentRows = this.getParentRows(parentContext, relation.dependencyType);
    
    // ⚠️ 父表条件不满足：递归清空子表及其所有后代
    if (!parentRows || parentRows.length === 0) {
      console.info(`🧹 条件不满足：清空子表 ${relation.childTable}.${relation.childContextId}（父表无选中数据）`);
      
      const hadData = childContext.rows.length > 0 || childContext.currentRow !== null;
      
      // 清空子上下文的所有状态
      childContext.clearAll(true);  // skipNotify=true，稍后统一通知
      
      if (hadData) {
        // 📢 通知订阅者：子表已清空
        this.notifySubscribers(relation.childTable, relation.childContextId ?? 'default');
        
        // 🔗 递归清空：通知孙表也要清空
        this.recursiveClearChildTables(relation.childTable, relation.childContextId ?? 'default');
        
        return { changed: true, message: `清空 ${relation.childTable}.${relation.childContextId} (父表无选中数据)` };
      }
      
      return { changed: false, message: `${relation.childTable}.${relation.childContextId} 已为空` };
    }
    
    // 如果是 autoLoad，且数据未加载，返回等待加载
    if (relation.autoLoad && (!childContext._originalRows || childContext._originalRows.length === 0)) {
      return { changed: false, message: `autoLoad 等待数据加载: ${relation.childTable}` };
    }
    
    // 非 autoLoad，且数据未加载，跳过
    if (!relation.autoLoad && (!childContext._originalRows || childContext._originalRows.length === 0)) {
      return { changed: false, message: `非 autoLoad 且数据未加载: ${relation.childTable}` };
    }
    
    // 应用过滤：从子上下文的原始数据中过滤
    const sourceRows = childContext._originalRows ?? [];
    const filteredRows = this.filterChildRows(
      sourceRows,
      relation.filterExpression,
      parentRows,
      parentContext
    );
    
    // 检查过滤结果是否变化
    const existingRows = childContext.rows ?? [];
    const rowsChanged = !this.areRowsEqual(existingRows, filteredRows);
    
    if (!rowsChanged) {
      return { changed: false, message: `过滤结果未变化` };
    }
    
    // 使用 splice 替换数组内容，保持响应式
    childContext.rows.splice(0, childContext.rows.length, ...filteredRows);
    
    // 🔄 rows 改变 → 重置选中状态
    let selectionChanged = false;
    
    // 辅助函数：通过主键判断两行是否相同
    const isSameRow = (row1: DataRow | null, row2: DataRow | null): boolean => {
      if (!row1 || !row2) return row1 === row2;
      // 尝试通过 id 比较（约定主键字段名为 id）
      if ('id' in row1 && 'id' in row2) {
        return row1.id === row2.id;
      }
      // 如果没有 id，则使用引用比较
      return row1 === row2;
    };
    
    // 1. 清理 currentRow：如果不在新结果中，则置空或自动选第0行
    const validCurrentRow = filteredRows.find(row => isSameRow(row, childContext.currentRow));
    if (childContext.currentRow && !validCurrentRow) {
      if (childContext.autoSelectFirst && filteredRows.length > 0) {
        console.info(`🎯 [自动选择] ${relation.childTable}.${relation.childContextId ?? 'default'} 自动选中第0行`);
        childContext.currentRow = filteredRows[0];
      } else {
        console.info(`🧹 [清理] ${relation.childTable}.${relation.childContextId ?? 'default'} currentRow 置空`);
        childContext.currentRow = null;
      }
      selectionChanged = true;
    } else if (!childContext.currentRow && childContext.autoSelectFirst && filteredRows.length > 0) {
      // 如果之前没有 currentRow，且配置了自动选择，则选中第0行
      console.info(`🎯 [自动选择] ${relation.childTable}.${relation.childContextId ?? 'default'} 自动选中第0行`);
      childContext.currentRow = filteredRows[0];
      selectionChanged = true;
    }
    
    // 2. 清理 selectedRows：移除不在新结果中的行
    const validSelectedRows = childContext.selectedRows?.filter(row => 
      filteredRows.some(fr => isSameRow(fr, row))
    ) ?? [];
    if (childContext.selectedRows && childContext.selectedRows.length !== validSelectedRows.length) {
      console.info(`🧹 [清理] ${relation.childTable}.${relation.childContextId ?? 'default'} selectedRows 从 ${childContext.selectedRows.length} → ${validSelectedRows.length}`);
      // ✅ 使用 setSelectedRows 方法，触发 UI 同步
      childContext.setSelectedRows(validSelectedRows, false); // skipNotify=false，需要同步 UI
      selectionChanged = true;
    }
    
    // 🔗 如果选中状态发生变化，触发子表更新（级联）
    if (selectionChanged) {
      console.info(`🔗 [级联] ${relation.childTable}.${relation.childContextId ?? 'default'} 选中状态已变化，触发子表更新`);
      this.updateRelatedTables(relation.childTable, relation.childContextId ?? 'default');
      
      // 🔔 通知订阅者：选中状态已变化（触发 UI 更新）
      // 注意：这里会触发 rebindRules，让 el-table 重新渲染（从而清空复选框）
      this.notifySubscribers(relation.childTable, relation.childContextId ?? 'default');
    }
    
    return { 
      changed: true, 
      message: `过滤完成: ${filteredRows.length}/${sourceRows.length} 条` 
    };
  }

  /**
   * 比较两个数据集是否相等（静态工具方法）
   */
  static areRowsEqual(rows1: DataRow[], rows2: DataRow[]): boolean {
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

  /**
   * 比较两个数据集是否相等（实例方法）
   */
  private areRowsEqual(rows1: DataRow[], rows2: DataRow[]): boolean {
    return DataSet.areRowsEqual(rows1, rows2);
  }

  /**
   * 获取表的所有父依赖（递归）
   * @param tableName 表名
   * @returns 父表名称集合（从根到直接父表）
   */
  getTableDependencies(tableName: string): Set<string> {
    const dependencies = new Set<string>();
    const visited = new Set<string>();
    
    const findParents = (currentTable: string) => {
      if (visited.has(currentTable)) return;
      visited.add(currentTable);
      
      // 找到所有以 currentTable 为子表的关系
      const parentRelations = this.relations?.filter(
        rel => rel.childTable === currentTable
      ) ?? [];
      
      parentRelations.forEach(relation => {
        if (!dependencies.has(relation.parentTable)) {
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
   * 获取根依赖表（没有父表的表）
   * @param tableName 表名
   * @returns 根表名称集合
   */
  getRootDependencies(tableName: string): Set<string> {
    const allDependencies = this.getTableDependencies(tableName);
    const rootDeps = new Set<string>();
    
    // 过滤出没有父表的表（根表）
    allDependencies.forEach(depTable => {
      const hasParent = this.relations?.some(
        rel => rel.childTable === depTable
      );
      if (!hasParent) {
        rootDeps.add(depTable);
      }
    });
    
    return rootDeps;
  }

  /**
   * 检查表的依赖条件是否满足
   * @param tableName 表名
   * @returns 依赖条件是否满足
   */
  areDependenciesSatisfied(tableName: string): boolean {
    const relations = this.relations?.filter(rel => rel.childTable === tableName) ?? [];
    
    // 如果没有依赖关系，说明是根表，直接返回 true
    if (relations.length === 0) {
      return true;
    }
    
    // 检查每个依赖关系的条件
    for (const relation of relations) {
      const parentTableObj = this.getTable(relation.parentTable);
      if (!parentTableObj) {
        console.info(`❌ [DataSet] 父表 ${relation.parentTable} 不存在`);
        return false;
      }
      
      const parentContext = parentTableObj.getOrCreateContext(relation.parentContextId ?? 'default');
      
      // 检查父表是否有数据
      if (!parentTableObj.rows || parentTableObj.rows.length === 0) {
        // console.info(`❌ [DataSet] 父表 ${relation.parentTable} 缺少数据`);
        return false;
      }
      
      // 检查依赖类型的具体条件
      if (relation.dependencyType === 'currentRow') {
        if (!parentContext.currentRow) {
          // console.info(`❌ [DataSet] 依赖条件不满足: ${relation.parentTable}.${parentContext._contextId}.currentRow 为空`);
          return false;
        }
      } else if (relation.dependencyType === 'selectedRows') {
        if (!parentContext.selectedRows || parentContext.selectedRows.length === 0) {
          // console.info(`❌ [DataSet] 依赖条件不满足: ${relation.parentTable}.${parentContext._contextId}.selectedRows 为空`);
          return false;
        }
      }
      // allRows 和 pagedRows 类型只需要父表有数据即可，已在上面检查
    }
    
    return true; // 所有依赖条件都满足
  }

  /**
   * 导出为 JSON
   */
  toJSON(): string {
    // 转换表为普通对象
    const tables: Record<string, IDataTable> = {}
    Object.entries(this.tables).forEach(([tableName, table]) => {
      tables[tableName] = table.toPlainObject()
    })
    
    return JSON.stringify({
      dataSetName: this.dataSetName,
      tables,
      relations: this.relations,
      version: this.version,
      pageId: this.pageId,
      autoLoadRelations: this.autoLoadRelations
    }, null, 2)
  }

  /**
   * 从 JSON 加载
   */
  static fromJSON(json: string, dataLoader?: (tableName: string) => Promise<DataRow[]>): DataSet {
    const config = JSON.parse(json)
    return new DataSet(config, dataLoader)
  }

  // ==================== 事件系统 ====================

  /**
   * 事件监听
   */
  on(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.push(callback)
    } else {
      this.eventListeners.set(event, [callback])
    }
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

  /**
   * 触发事件
   */
  emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(callback => callback(data))
    }
  }

  // ==================== 订阅管理 ====================

  /**
   * 订阅上下文数据变化
   * @param tableName 表名
   * @param contextId 上下文ID，默认 'default'
   * @param callback 回调函数
   */
  subscribe(tableName: string, contextId: string = 'default', callback: Function): () => void {
    const key = `${tableName}.${contextId}`;
    
    const subscribers = this.contextSubscribers.get(key)
    if (subscribers) {
      subscribers.add(callback)
    } else {
      this.contextSubscribers.set(key, new Set([callback]))
    }
    
    console.info(`📡 UI 订阅上下文: ${key}`);
    
    // 返回取消订阅函数
    return () => {
      this.contextSubscribers.get(key)?.delete(callback);
    };
  }

  /**
   * 通知订阅者数据变化
   * @param tableName 表名
   * @param contextId 上下文ID，如果未指定则通知所有上下文
   */
  notifySubscribers(tableName: string, contextId?: string): void {
    const table = this.getTable(tableName);
    if (!table) return;
    
    // 自动刷新所有上下文的过滤视图（委托给 DataTable）
    table.refreshAllContexts();

    // 如果指定了 contextId，只通知该上下文
    if (contextId !== undefined) {
      const key = `${tableName}.${contextId}`;
      const subscribers = this.contextSubscribers.get(key);
      
      if (subscribers && subscribers.size > 0) {
        const context = this.getContext(tableName, contextId);
        console.info(`📢 通知 ${subscribers.size} 个订阅者: ${key} 数据已更新`);
        if (context) {
          subscribers.forEach(callback => callback(context));
        }
      }
    } else {
      // 未指定 contextId，通知所有上下文（包括默认上下文）
      const allKeys = Array.from(this.contextSubscribers.keys())
        .filter(key => key.startsWith(`${tableName}.`));
      
      if (allKeys.length > 0) {
        console.info(`📢 通知表 ${tableName} 的所有上下文: ${allKeys.join(', ')}`);
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

  // ==================== 数据加载 ====================

  /**
   * 智能请求表数据（自动处理依赖）- 完全解耦：不阻塞，异步加载后通知订阅者
   * @param tableName 表名
   */
  requestTableData(tableName: string): void {
    // 防重入检查：如果表正在加载中，跳过
    if (this.loadingTables.has(tableName)) {
      console.info(`⏭️ [DataSet] 表 ${tableName} 正在加载中，跳过重复请求`)
      return
    }
    
    console.info(`🔍 UI 请求表数据: ${tableName}`);
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
    const isDependentTable = dependencies.size > 0;
    
    // 仅对根表（无依赖）：如果已有数据，直接使用
    if (!isDependentTable && table?.rows && table.rows.length > 0) {
      console.info(`✅ 根表 ${tableName} 已有数据（${table.rows.length} 行），直接使用`);
      this.notifySubscribers(tableName);
      this.emit('loadSuccess', { tableName });
      return;
    }
    
    // 依赖表即使有数据，也要重新过滤（因为父表 currentRow 可能变化）
    if (isDependentTable && table?.rows && table.rows.length > 0) {
      console.info(`🔄 依赖表 ${tableName} 已有数据，重新应用过滤`);
      if (this.areDependenciesSatisfied(tableName)) {
        // 查找所有关联的 autoLoad 关系
        const relations = this.relations?.filter(
          rel => rel.childTable === tableName && rel.autoLoad
        ) ?? [];
        
        if (relations.length > 0) {
          console.info(`🔄 处理 ${relations.length} 个 autoLoad 关系 for ${tableName}`);

          relations.forEach(relation => {
            this.applyRelation(relation);
          });
        
          this.notifySubscribers(tableName);
          this.emit('loadSuccess', { tableName });
          return;
        }
      }
    }
    
    // 检查依赖是否满足
    if (this.areDependenciesSatisfied(tableName)) {
      const dependencies = this.getTableDependencies(tableName);
      
      // 如果是根表（无依赖）且无数据，需要加载
      if (dependencies.size === 0) {
        console.info(`📦 ${tableName} 是根表且无数据，开始加载`);
        await this.loadTableData(tableName);
        this.emit('loadSuccess', { tableName });
        return;
      }
      
      // 有依赖且依赖满足，检查是否需要加载数据
      console.info(`✅ 依赖条件具备，检查 ${tableName} 是否需要加载数据`);
      
      // 使用 _originalRows 判断数据是否已加载
      const needsLoading = table && !table._originalRows;
      
      if (needsLoading) {
        console.info(`📦 ${tableName} 数据未加载（_originalRows 为空），开始加载`);
        await this.loadTableData(tableName);
      }
      
      // 数据加载完成后，应用关系过滤
      console.info(`🔗 应用关系过滤: ${tableName}`);
      this.applyRelationsForTable(tableName);
      
      this.notifySubscribers(tableName);
      this.emit('loadSuccess', { tableName });
      return;
    }
    
    // 依赖不满足，找到根依赖并加载
    const rootTables = this.getRootDependencies(tableName);
    
    if (rootTables.size === 0) {
      // 当前表本身就是根表，直接加载
      await this.loadTableData(tableName);
      this.emit('loadSuccess', { tableName });
    } else {
      console.info(`📦 需要先加载根依赖表: ${Array.from(rootTables).join(', ')}`);
      
      // 加载所有根表
      for (const rootTable of rootTables) {
        const rootTableData = this.getTable(rootTable);
        if (!rootTableData?.rows || rootTableData.rows.length === 0) {
          await this.loadTableData(rootTable);
        }
      }
      
      // 根表加载完成后，通知子表依赖已更新
      this.notifyDependencyUpdated(tableName);
    }
  }

  /**
   * 加载表数据（调用外部数据加载器）
   */
  private async loadTableData(tableName: string): Promise<void> {
    if (!this.dataLoader) {
      console.warn(`⚠️ 未配置数据加载器，无法加载 ${tableName}`);
      return;
    }
    
    console.info(`🌐 开始加载数据: ${tableName}`);
    
    try {
      const rows = await this.dataLoader(tableName);
      const table = this.getTable(tableName);
      
      if (table) {
        // 检查 rows 是否变化
        const existingRows = table.rows || []
        const rowsChanged = !DataSet.areRowsEqual(existingRows, rows)
        
        if (!rowsChanged) {
          console.info(`⏭️ [DataSet] ${tableName}.rows 未变化，跳过通知`)
          return
        }
        
        // 将数据加载到默认上下文（table 本身）
        table.rows.splice(0, table.rows.length, ...rows);
        console.info(`✅ 数据加载成功: ${tableName}，共 ${rows.length} 行`);
        
        // 缓存原始完整数据
        if (!table._originalRows) {
          table._originalRows = [...rows];
          console.info(`💾 [默认上下文] 缓存原始数据: ${tableName} (${table._originalRows.length} 条)`);
        }
        
        // ✨ 自动选中第一行（如果配置了 autoSelectFirst）
        if (table.autoSelectFirst && rows.length > 0 && !table.currentRow) {
          console.info(`🎯 自动选中第一行: ${tableName}`);
          table.setCurrentRow(rows[0], false);  // 不跳过通知，触发级联
        }
        
        // 检查并清理所有上下文的无效选中状态
        this.cleanupInvalidSelections(table);
        
        // 数据加载完成后，如果该表是子表，重新应用父表的过滤规则
        const parentRelations = this.relations?.filter(
          rel => rel.childTable === tableName
        ) ?? [];
        
        if (parentRelations.length > 0) {
          console.info(`🔄 [加载完成] ${tableName} 是子表，重新应用 ${parentRelations.length} 个父表过滤规则`);
          parentRelations.forEach(relation => {
            const result = this.applyRelation(relation);
            if (result.changed) {
              console.info(`✅ [加载后过滤] ${relation.childTable}.${relation.childContextId ?? 'default'} 过滤完成: ${result.message}`);
            }
          });
        }
        
        // 数据加载并过滤完成，通知UI订阅者
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
   * 清理表的所有上下文的无效选中状态
   */
  private cleanupInvalidSelections(table: DataTable): void {
    const tableName = table._hostTable;
    let needsNotify = false;
    
    // 清理默认上下文（table 本身）
    if (table.cleanupInvalidSelections()) {
      needsNotify = true;
    }
    
    // 清理所有自定义上下文
    if (table.contexts) {
      Object.values(table.contexts).forEach(context => {
        if (context.cleanupInvalidSelections()) {
          needsNotify = true;
        }
      });
    }
    
    // 如果清理了选中状态，触发相关事件
    if (needsNotify) {
      this.emit('selectionCleaned', { tableName });
    }
  }

  /**
   * 通知依赖已更新（触发事件，不自动加载）
   */
  private notifyDependencyUpdated(tableName: string): void {
    console.info(`📢 通知 ${tableName}: 依赖数据已更新，请根据需要加载`);
    this.emit('dependencyUpdated', { tableName });
    
    const shouldAutoLoad = this.shouldAutoLoadDependentTable(tableName);
    
    // 检查该表的任意上下文是否有订阅者
    const hasSubscribers = Array.from(this.contextSubscribers.keys())
      .some(key => key.startsWith(`${tableName}.`));
    
    if (shouldAutoLoad && hasSubscribers) {
      console.info(`🎯 ${tableName} 依赖条件满足且有 UI 订阅者，自动加载数据`);
      this.loadTableData(tableName).catch(err => {
        console.error(`❌ 自动加载 ${tableName} 失败:`, err);
      });
    } else if (!shouldAutoLoad) {
      console.info(`⏸️ ${tableName} 依赖条件未满足（如 currentRow 为空），暂不加载`);
    }
  }

  /**
   * 判断依赖表是否应该自动加载
   */
  private shouldAutoLoadDependentTable(tableName: string): boolean {
    const relations = this.relations?.filter(rel => rel.childTable === tableName) ?? [];
    
    for (const relation of relations) {
      const parentContext = this.getContext(relation.parentTable, relation.parentContextId);
      
      if (!parentContext) continue;
      
      // 检查依赖类型
      if (relation.dependencyType === 'currentRow') {
        if (parentContext.currentRow) {
          return true;
        }
      } else if (relation.dependencyType === 'selectedRows') {
        if (parentContext.selectedRows && parentContext.selectedRows.length > 0) {
          return true;
        }
      } else if (relation.dependencyType === 'allRows') {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 通知子表：父表数据已更新
   */
  private notifyChildTables(parentTableName: string): void {
    if (!this.relations) return;
    
    // 找到所有以此表为父表的子表
    const childRelations = this.relations.filter(
      rel => rel.parentTable === parentTableName
    );
    
    childRelations.forEach(relation => {
      console.info(`📢 通知子表 ${relation.childTable}: 父表 ${parentTableName} 数据已更新`);
      this.notifyDependencyUpdated(relation.childTable);
    });
  }

  /**
   * 递归清空子表及其所有后代（用于父表条件不满足时）
   */
  private recursiveClearChildTables(parentTableName: string, parentContextId: string = 'default'): void {
    if (!this.relations) return;
    
    // 找到所有以此表/上下文为父的子表
    const childRelations = this.relations.filter(
      rel => rel.parentTable === parentTableName && 
             (rel.parentContextId ?? 'default') === parentContextId
    );
    
    childRelations.forEach(relation => {
      const childContextId = relation.childContextId ?? 'default';
      const childContext = this.getContext(relation.childTable, childContextId);
      
      if (childContext && (childContext.rows.length > 0 || childContext.currentRow !== null)) {
        console.info(`🧹 递归清空子表: ${relation.childTable}.${childContextId}`);
        
        // 清空子表状态
        childContext.clearAll(true);  // skipNotify=true，稍后统一通知
        
        // 通知订阅者
        this.notifySubscribers(relation.childTable, childContextId);
        
        // 递归清空孙表
        this.recursiveClearChildTables(relation.childTable, childContextId);
      }
    });
  }

  /**
   * 应用与指定表相关的所有关系
   */
  private applyRelationsForTable(tableName: string): void {
    if (!this.relations) return;
    
    // 找到所有以此表为子表的关系
    const relations = this.relations.filter(
      rel => rel.childTable === tableName
    );
    
    relations.forEach(relation => {
      this.applyRelation(relation);
    });
  }

  /**
   * 更新相关联的子表
   */
  updateRelatedTables(parentTableName: string, parentContextId: string = 'default'): void {
    if (!this.relations) return

    // 找到所有以此表为父表，且 parentContext 匹配的关系
    const relations = this.relations.filter(rel => {
        if (rel.parentTable !== parentTableName) return false;
        
        // 匹配 contextId
        return rel.parentContextId === parentContextId;
    });

    console.info(`🔗 [Relation] 上下文 ${parentTableName}.${parentContextId} 触发了 ${relations.length} 个关联更新`);

    relations.forEach(relation => {
      const childContext = this.getContext(relation.childTable, relation.childContextId ?? 'default');
      
      // ✅ 检查是否需要自动加载子表数据
      if (childContext && relation.autoLoad && (!childContext._originalRows || childContext._originalRows.length === 0)) {
        console.info(`🚀 [AutoLoad] ${relation.childTable} 数据未加载，触发自动加载`);
        this.requestTableData(relation.childTable);
        // 跳过本次 applyRelation，等待 loadTableData 完成后自动应用
        return;
      }
      
      // 数据已加载（或非 autoLoad），立即应用过滤规则
      const result = this.applyRelation(relation);
      
      // 如果数据变化了，通知子表的订阅者
      if (result.changed) {
        console.info(`✅ [Relation] ${relation.childTable}.${relation.childContextId ?? 'default'} 数据已更新: ${result.message}`);
        this.notifySubscribers(relation.childTable, relation.childContextId ?? 'default');
      } else {
        console.info(`⏭️ [Relation] ${relation.childTable}.${relation.childContextId ?? 'default'} 无变化: ${result.message}`);
      }
    })
  }

  /**
   * 刷新所有关系
   */
  refreshAllRelations(): void {
    if (!this.relations) return

    this.relations.forEach(relation => {
      this.applyRelation(relation)
    })
  }
}
