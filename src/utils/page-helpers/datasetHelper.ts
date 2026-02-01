/**
 * DataSet 辅助函数 - 支持动态结构和数据的 CRUD 操作
 */

import type { DataSetManager, IDataTable, DataRow, DataColumn } from '@spark-view/spark-data'

/**
 * DataSet 结构数据
 */
export interface DataSetStructure {
  dataSetName: string
  tables: Record<string, Partial<IDataTable>>
}

// ==================== 结构管理 ====================

/**
 * 从 API 加载 DataSet 结构
 */
export function loadDataSetStructure(
  pageData: Record<string, unknown>,
  apiKey: string
): DataSetStructure | null {
  const structureData = pageData[apiKey] as DataSetStructure | undefined
  if (!structureData) {
    console.warn(`API 数据 ${apiKey} 不存在`)
    return null
  }
  
  // 验证基本结构
  if (!structureData.tables || typeof structureData.tables !== 'object') {
    console.error('DataSet 结构无效：tables 应该是对象')
    return null
  }
  
  // 确保每个表都有必要的属性
  Object.keys(structureData.tables).forEach(key => {
    const table = structureData.tables[key]
    structureData.tables[key] = {
      ...table,
      rows: table.rows ?? [],
      currentRow: table.currentRow ?? null,
      selectedRows: table.selectedRows ?? []
    }
  })
  
  console.info(`✅ 加载 DataSet 结构: ${structureData.dataSetName}，包含 ${Object.keys(structureData.tables).length} 个表`)
  return structureData
}

// ==================== 数据管理 ====================

/**
 * 将 API 数据填充到 DataSet 表中
 */
export function loadDataToTable(
  dataset: { tables?: Record<string, Partial<IDataTable>> },
  tableName: string,
  rows: DataRow[]
): void {
  const table = dataset.tables?.[tableName]
  if (!table) {
    console.warn(`表 ${tableName} 不存在于 DataSet 中`)
    return
  }
  
  // 更新表数据
  table.rows = rows ?? []
  console.info(`✅ 加载 ${rows?.length ?? 0} 行数据到表 ${tableName}`)
}

/**
 * 批量加载多个表的数据
 */
export function loadMultipleTablesData(
  dataset: { tables?: Record<string, Partial<IDataTable>> },
  dataMap: Record<string, DataRow[]>
): void {
  for (const [tableName, rows] of Object.entries(dataMap)) {
    loadDataToTable(dataset, tableName, rows)
  }
}

/**
 * 从 API 响应中提取数据并加载到 DataSet 表
 */
export function loadApiDataToTable(
  dataset: { tables?: Record<string, Partial<IDataTable>> },
  tableName: string,
  pageData: Record<string, unknown>,
  apiKey: string
): void {
  const apiData = pageData[apiKey]
  if (Array.isArray(apiData)) {
    loadDataToTable(dataset, tableName, apiData)
  } else {
    console.warn(`API 数据 ${apiKey} 不是数组类型`)
  }
}

// ==================== CRUD 操作 ====================

/**
 * 添加新行到表中（Create）
 */
export function addRow(
  dataset: { tables?: Record<string, Partial<IDataTable>> },
  tableName: string,
  row: DataRow
): boolean {
  const table = dataset.tables?.[tableName]
  if (!table?.rows) {
    console.warn(`表 ${tableName} 不存在`)
    return false
  }
  
  table.rows.push(row)
  console.info(`✅ 添加新行到表 ${tableName}:`, row)
  return true
}

/**
 * 更新表中的行（Update）
 * 支持级联更新（如果 DataSetManager 中配置了 cascadeUpdate）
 */
export function updateRow(
  dataset: { tables?: Record<string, Partial<IDataTable>> },
  tableName: string,
  predicate: (row: DataRow) => boolean,
  updates: Partial<DataRow>,
  manager: DataSetManager | null = null
): number {
  const table = dataset.tables?.[tableName]
  if (!table?.rows) {
    console.warn(`表 ${tableName} 不存在`)
    return 0
  }
  
  let updateCount = 0
  table.rows = table.rows.map((row: DataRow) => {
    if (predicate(row)) {
      const oldRow = { ...row }
      const newRow = { ...row, ...updates }
      
      // 如果提供了 DataSetManager，触发级联更新
      if (manager && typeof (manager as unknown as Record<string, unknown>).cascadeUpdate === 'function') {
        ((manager as unknown as Record<string, unknown>).cascadeUpdate as (tableName: string, newRow: DataRow, oldRow: DataRow) => void)(tableName, newRow, oldRow)
      }
      
      updateCount++
      return newRow
    }
    return row
  })
  
  console.info(`✅ 更新表 ${tableName} 中的 ${updateCount} 行`)
  return updateCount
}

/**
 * 从表中删除行（Delete）
 * 支持级联删除（如果 DataSetManager 中配置了 cascadeDelete）
 */
export function deleteRow(
  dataset: { tables?: Record<string, Partial<IDataTable>> },
  tableName: string,
  predicate: (row: DataRow) => boolean,
  manager: DataSetManager | null = null
): number {
  const table = dataset.tables?.[tableName]
  if (!table?.rows) {
    console.warn(`表 ${tableName} 不存在`)
    return 0
  }
  
  // 找到要删除的行
  const rowsToDelete = table.rows.filter(predicate)
  
  // 如果提供了 DataSetManager，触发级联删除
  if (manager && typeof (manager as unknown as Record<string, unknown>).cascadeDelete === 'function') {
    rowsToDelete.forEach((row: DataRow) => {
      ((manager as unknown as Record<string, unknown>).cascadeDelete as (tableName: string, row: DataRow) => void)(tableName, row)
    })
  }
  
  const originalLength = table.rows.length
  table.rows = table.rows.filter((row: DataRow) => !predicate(row))
  const deletedCount = originalLength - table.rows.length
  
  console.info(`✅ 从表 ${tableName} 删除 ${deletedCount} 行`)
  return deletedCount
}

/**
 * 查询表中的行（Read）
 */
export function queryRows(
  dataset: { tables?: Record<string, Partial<IDataTable>> },
  tableName: string,
  predicate: ((row: DataRow) => boolean) | null = null
): DataRow[] {
  const table = dataset.tables?.[tableName]
  if (!table?.rows) {
    console.warn(`表 ${tableName} 不存在`)
    return []
  }
  
  return predicate ? table.rows.filter(predicate) : [...table.rows]
}

/**
 * 根据主键查找单行
 */
export function findRowByKey(
  dataset: { tables?: Record<string, Partial<IDataTable>> },
  tableName: string,
  keyValue: unknown
): DataRow | null {
  const table = dataset.tables?.[tableName]
  if (!table?.rows) return null
  
  const pkColumn = table.columns?.find((col: unknown) => (col as DataColumn).isPrimaryKey)
  if (!pkColumn) {
    console.warn(`表 ${tableName} 没有定义主键`)
    return null
  }
  
  // 兼容 name 和 columnName
  const pkName = (pkColumn).name
  return table.rows.find((row: DataRow) => row[pkName] === keyValue) ?? null
}

// ==================== 批量操作 ====================

/**
 * 批量添加行
 */
export function batchAddRows(
  dataset: { tables?: Record<string, Partial<IDataTable>> },
  tableName: string,
  rows: DataRow[]
): number {
  const table = dataset.tables?.[tableName]
  if (!table?.rows) return 0
  
  table.rows.push(...rows)
  console.info(`✅ 批量添加 ${rows.length} 行到表 ${tableName}`)
  return rows.length
}

/**
 * 批量删除行（根据主键列表）
 */
export function batchDeleteByKeys(
  dataset: { tables?: Record<string, Partial<IDataTable>> },
  tableName: string,
  keyValues: unknown[]
): number {
  const table = dataset.tables?.[tableName]
  if (!table?.rows) return 0
  
  const pkColumn = table.columns?.find((col: unknown) => (col as DataColumn).isPrimaryKey)
  if (!pkColumn) return 0
  
  // 兼容 name 和 columnName
  const pkName = (pkColumn).name
  
  const keySet = new Set(keyValues)
  const originalLength = table.rows.length
  table.rows = table.rows.filter((row: DataRow) => !keySet.has(row[pkName]))
  
  const deletedCount = originalLength - table.rows.length
  console.info(`✅ 批量删除表 ${tableName} 中的 ${deletedCount} 行`)
  return deletedCount
}

// ==================== API 集成辅助 ====================

/**
 * 保存行到服务器（调用 API）
 */
export async function saveRowToServer(
  apiUrl: string,
  method: 'POST' | 'PUT' | 'PATCH',
  rowData: DataRow
): Promise<unknown> {
  try {
    const response = await fetch(apiUrl, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rowData)
    })
    const result = await response.json()
    console.info(`✅ 保存数据到服务器: ${apiUrl}`, result)
    return result
  } catch (error) {
    console.error(`❌ 保存数据失败: ${apiUrl}`, error)
    throw error
  }
}

/**
 * 从服务器删除行（调用 API）
 */
export async function deleteRowFromServer(apiUrl: string): Promise<unknown> {
  try {
    const response = await fetch(apiUrl, { method: 'DELETE' })
    const result = await response.json()
    console.info(`✅ 从服务器删除数据: ${apiUrl}`, result)
    return result
  } catch (error) {
    console.error(`❌ 删除数据失败: ${apiUrl}`, error)
    throw error
  }
}
