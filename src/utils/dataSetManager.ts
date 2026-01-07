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

  constructor(dataSet: DataSet) {
    this.dataSet = dataSet
    this.initializeContexts()
  }

  /**
   * 初始化所有表的上下文编号
   */
  private initializeContexts(): void {
    this.dataSet.tables.forEach(table => {
      // 为每个表的额外上下文分配编号和 contextOrder
      if (table.contexts && table.contexts.length > 0) {
        table.contexts.forEach((context, index) => {
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
    return this.dataSet.tables.find(t => t.tableName === tableName)
  }

  /**
   * 获取表的指定上下文
   */
  getContext(tableName: string, contextOrder?: number): BindingContext | undefined {
    const table = this.getTable(tableName)
    if (!table) return undefined

    // contextOrder 未指定时返回默认上下文（表本身）
    if (contextOrder === undefined || contextOrder === 0) {
      return table
    }

    // 返回额外上下文
    return table.contexts?.[contextOrder - 1]
  }

  /**
   * 设置当前行
   */
  setCurrentRow(tableName: string, row: DataRow | undefined, contextOrder?: number): void {
    const context = this.getContext(tableName, contextOrder)
    if (context) {
      context.currentRow = row
      
      // 触发关系更新
      this.updateRelatedTables(tableName, contextOrder)
      
      // 触发事件
      this.emit('currentRowChanged', { tableName, contextOrder, row })
    }
  }

  /**
   * 设置选中行
   */
  setSelectedRows(tableName: string, rows: DataRow[], contextOrder?: number): void {
    const context = this.getContext(tableName, contextOrder)
    if (context) {
      context.selectedRows = rows
      
      // 触发关系更新
      this.updateRelatedTables(tableName, contextOrder)
      
      // 触发事件
      this.emit('selectedRowsChanged', { tableName, contextOrder, rows })
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

    // 根据 dependencyType 获取父数据范围
    const parentRows = this.getParentRows(parentContext, relation.dependencyType)

    if (!parentRows || parentRows.length === 0) {
      // 父数据为空，清空子数据
      childContext.selectedRows = []
      return
    }

    // 应用过滤表达式
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
              console.log(`级联更新: ${relation.childTable}.${childField} = ${newValue}`)
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
  }

  /**
   * 级联删除
   * 当父表行删除时，自动删除子表中所有关联的行
   */
  cascadeDelete(tableName: string, row: DataRow): void {
    const table = this.getTable(tableName)
    if (!table) return

    // 查找需要级联删除的关系
    const relations = this.dataSet.relations?.filter(
      rel => rel.parentTable === tableName && rel.cascadeDelete
    ) || []

    relations.forEach(relation => {
      const childTable = this.getTable(relation.childTable)
      if (!childTable) return

      // 解析 filterExpression 找到外键字段映射
      const foreignKeyMap = this.extractForeignKeyMap(relation.filterExpression)
      
      if (foreignKeyMap.length === 0) {
        console.warn(`级联删除: 无法从 filterExpression 提取外键映射: ${tableName} -> ${relation.childTable}`)
        return
      }

      // 找到所有需要删除的子行
      const rowsToDelete: DataRow[] = []
      childTable.rows.forEach(childRow => {
        const matches = foreignKeyMap.every(({ childField, parentField }) => {
          return childRow[childField] === row[parentField]
        })
        
        if (matches) {
          rowsToDelete.push(childRow)
        }
      })

      // 递归级联删除子表的子表
      rowsToDelete.forEach(childRow => {
        this.cascadeDelete(relation.childTable, childRow)
      })

      // 删除子行
      if (rowsToDelete.length > 0) {
        childTable.rows = childTable.rows.filter(row => !rowsToDelete.includes(row))
        console.log(`级联删除: ${relation.childTable} 删除了 ${rowsToDelete.length} 行`)
      }

      // 触发子表删除事件
      this.emit('cascadeDelete', { 
        parentTable: tableName, 
        childTable: relation.childTable,
        parentRow: row,
        deletedRows: rowsToDelete
      })
    })
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
      this.emit('rowAdded', { tableName, row })
    }
  }

  /**
   * 更新数据行
   */
  updateRow(tableName: string, rowIndex: number, row: DataRow): void {
    const table = this.getTable(tableName)
    if (table && rowIndex >= 0 && rowIndex < table.rows.length) {
      table.rows[rowIndex] = row
      
      // 级联更新
      this.cascadeUpdate(tableName, row)
      
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
}
