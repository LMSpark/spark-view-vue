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
  FilterExpression
} from '../types/pageData'
import { DataTable } from '../models/DataTable'
import { BindingContext } from '../models/BindingContext'
import { FilterExpressionParser } from './filterExpressionParser'

/**
 * DataSet 类（实现 IDataSet 接口 + 方法逻辑）
 */
export class DataSet implements IDataSet {
  dataSetName: string
  tables: Record<string, DataTable>
  relations?: DataRelation[]
  version?: number
  pageId?: string
  autoLoadRelations?: boolean

  constructor(config: IDataSet) {
    this.dataSetName = config.dataSetName
    
    // 转换表为类实例
    this.tables = {}
    Object.entries(config.tables).forEach(([tableName, tableData]) => {
      this.tables[tableName] = DataTable.fromPlainObject({
        ...tableData,
        tableName // 确保 tableName 正确
      })
    })
    
    this.relations = config.relations
    this.version = config.version
    this.pageId = config.pageId
    this.autoLoadRelations = config.autoLoadRelations
    
    // 为关系分配默认 contextId
    this.relations?.forEach(relation => {
      relation.parentContextId = relation.parentContextId || 'default'
      relation.childContextId = relation.childContextId || 'default'
    })
  }

  /**
   * 获取表
   */
  getTable(tableName: string): DataTable | undefined {
    return this.tables[tableName]
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
    ) || []

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
              hasUpdates = true
              console.log(`级联更新: ${relation.childTable}.${childField} = ${newValue}`)
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
    console.log(`🔧 cascadeDelete 被调用: ${tableName}`, row)
    
    const table = this.getTable(tableName)
    if (!table) {
      console.warn(`⚠️ 找不到表: ${tableName}`)
      return []
    }

    // 查找需要级联删除的关系
    const relations = this.relations?.filter(
      rel => rel.parentTable === tableName && rel.cascadeDelete
    ) || []

    console.log(`🔗 找到 ${relations.length} 个级联删除关系`)

    const affectedTables: string[] = []

    relations.forEach(relation => {
      console.log(`  处理关系: ${relation.parentTable} -> ${relation.childTable}`)
      
      const childTable = this.getTable(relation.childTable)
      if (!childTable) {
        console.warn(`⚠️ 找不到子表: ${relation.childTable}`)
        return
      }

      // 解析 filterExpression 找到外键字段映射
      const foreignKeyMap = this.extractForeignKeyMap(relation.filterExpression)
      
      console.log(`  外键映射:`, foreignKeyMap)
      
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
          return childVal == parentVal
        })
        
        if (matches) {
          console.log(`    ✓ [级联删除] 匹配到子行:`, childRow)
          rowsToDelete.add(childRow)
        }
      })

      console.log(`  找到 ${rowsToDelete.size} 行需要删除`)

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
              const idField = childTable.columns.find(c => c.isPrimaryKey)?.name || 'id'
              const id = rowToDelete[idField]
              const cacheIdIndex = childTable._originalRows.findIndex(r => r[idField] == id)
              if (cacheIdIndex > -1) {
                childTable._originalRows.splice(cacheIdIndex, 1)
              }
            }
          }
        })
        
        console.log(`✅ 级联删除: ${relation.childTable} 删除了 ${rowsToDelete.size} 行，剩余 ${childTable.rows.length} 行`)
        
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
        return parentContext.selectedRows || []
      case 'allRows':
        return parentContext.rows || []
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
  static fromJSON(json: string): DataSet {
    const config = JSON.parse(json) as IDataSet
    return new DataSet(config)
  }
}
