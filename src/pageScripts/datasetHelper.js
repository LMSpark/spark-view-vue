/**
 * DataSet 辅助函数 - 支持动态结构和数据的 CRUD 操作
 */

// ==================== 结构管理 ====================

/**
 * 从 API 加载 DataSet 结构
 * @param {object} pageData - 页面数据对象
 * @param {string} apiKey - 结构 API 的 key（如 'datasetStructureApi'）
 * @returns {object|null} DataSet 结构对象
 */
export function loadDataSetStructure(pageData, apiKey) {
  const structureData = pageData[apiKey]
  if (!structureData) {
    console.warn(`API 数据 ${apiKey} 不存在`)
    return null
  }
  
  // 验证基本结构
  if (!structureData.tables || !Array.isArray(structureData.tables)) {
    console.error('DataSet 结构无效：缺少 tables 数组')
    return null
  }
  
  // 确保每个表都有必要的属性
  structureData.tables = structureData.tables.map(table => ({
    ...table,
    rows: table.rows || [],
    currentRow: table.currentRow || null,
    selectedRows: table.selectedRows || []
  }))
  
  console.log(`✅ 加载 DataSet 结构: ${structureData.dataSetName}，包含 ${structureData.tables.length} 个表`)
  return structureData
}

// ==================== 数据管理 ====================

/**
 * 将 API 数据填充到 DataSet 表中
 * @param {object} dataset - DataSet 对象
 * @param {string} tableName - 表名
 * @param {Array} rows - API 返回的数据行
 */
export function loadDataToTable(dataset, tableName, rows) {
  const table = dataset.tables?.find(t => t.tableName === tableName)
  if (!table) {
    console.warn(`表 ${tableName} 不存在于 DataSet 中`)
    return
  }
  
  // 更新表数据
  table.rows = rows || []
  console.log(`✅ 加载 ${rows?.length || 0} 行数据到表 ${tableName}`)
}

/**
 * 批量加载多个表的数据
 * @param {object} dataset - DataSet 对象
 * @param {object} dataMap - 表名到数据的映射，如 { Users: [...], Orders: [...] }
 */
export function loadMultipleTablesData(dataset, dataMap) {
  for (const [tableName, rows] of Object.entries(dataMap)) {
    loadDataToTable(dataset, tableName, rows)
  }
}

/**
 * 从 API 响应中提取数据并加载到 DataSet 表
 * @param {object} dataset - DataSet 对象
 * @param {string} tableName - 表名
 * @param {object} pageData - 页面数据对象
 * @param {string} apiKey - API 数据在 pageData 中的 key
 */
export function loadApiDataToTable(dataset, tableName, pageData, apiKey) {
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
 * @param {object} dataset - DataSet 对象
 * @param {string} tableName - 表名
 * @param {object} row - 新行数据
 * @returns {boolean} 是否添加成功
 */
export function addRow(dataset, tableName, row) {
  const table = dataset.tables?.find(t => t.tableName === tableName)
  if (!table) {
    console.warn(`表 ${tableName} 不存在`)
    return false
  }
  
  table.rows.push(row)
  console.log(`✅ 添加新行到表 ${tableName}:`, row)
  return true
}

/**
 * 更新表中的行（Update）
 * 支持级联更新（如果 DataSetManager 中配置了 cascadeUpdate）
 * @param {object} dataset - DataSet 对象
 * @param {string} tableName - 表名
 * @param {function} predicate - 查找条件函数，如 row => row.id === 1
 * @param {object} updates - 要更新的字段，如 { name: '新名称' }
 * @param {object} manager - 可选的 DataSetManager 实例，用于级联更新
 * @returns {number} 更新的行数
 */
export function updateRow(dataset, tableName, predicate, updates, manager = null) {
  const table = dataset.tables?.find(t => t.tableName === tableName)
  if (!table) {
    console.warn(`表 ${tableName} 不存在`)
    return 0
  }
  
  let updateCount = 0
  table.rows = table.rows.map(row => {
    if (predicate(row)) {
      const oldRow = { ...row }
      const newRow = { ...row, ...updates }
      
      // 如果提供了 DataSetManager，触发级联更新
      if (manager && typeof manager.cascadeUpdate === 'function') {
        manager.cascadeUpdate(tableName, newRow, oldRow)
      }
      
      updateCount++
      return newRow
    }
    return row
  })
  
  console.log(`✅ 更新表 ${tableName} 中的 ${updateCount} 行`)
  return updateCount
}

/**
 * 从表中删除行（Delete）
 * 支持级联删除（如果 DataSetManager 中配置了 cascadeDelete）
 * @param {object} dataset - DataSet 对象
 * @param {string} tableName - 表名
 * @param {function} predicate - 删除条件函数，如 row => row.id === 1
 * @param {object} manager - 可选的 DataSetManager 实例，用于级联删除
 * @returns {number} 删除的行数
 */
export function deleteRow(dataset, tableName, predicate, manager = null) {
  const table = dataset.tables?.find(t => t.tableName === tableName)
  if (!table) {
    console.warn(`表 ${tableName} 不存在`)
    return 0
  }
  
  // 找到要删除的行
  const rowsToDelete = table.rows.filter(predicate)
  
  // 如果提供了 DataSetManager，触发级联删除
  if (manager && typeof manager.cascadeDelete === 'function') {
    rowsToDelete.forEach(row => {
      manager.cascadeDelete(tableName, row)
    })
  }
  
  const originalLength = table.rows.length
  table.rows = table.rows.filter(row => !predicate(row))
  const deletedCount = originalLength - table.rows.length
  
  console.log(`✅ 从表 ${tableName} 删除 ${deletedCount} 行`)
  return deletedCount
}

/**
 * 查询表中的行（Read）
 * @param {object} dataset - DataSet 对象
 * @param {string} tableName - 表名
 * @param {function} [predicate] - 可选的过滤条件，如 row => row.status === '激活'
 * @returns {Array} 符合条件的行数组
 */
export function queryRows(dataset, tableName, predicate = null) {
  const table = dataset.tables?.find(t => t.tableName === tableName)
  if (!table) {
    console.warn(`表 ${tableName} 不存在`)
    return []
  }
  
  return predicate ? table.rows.filter(predicate) : [...table.rows]
}

/**
 * 根据主键查找单行
 * @param {object} dataset - DataSet 对象
 * @param {string} tableName - 表名
 * @param {any} keyValue - 主键值
 * @returns {object|null} 找到的行或 null
 */
export function findRowByKey(dataset, tableName, keyValue) {
  const table = dataset.tables?.find(t => t.tableName === tableName)
  if (!table) return null
  
  const pkColumn = table.columns?.find(col => col.isPrimaryKey)
  if (!pkColumn) {
    console.warn(`表 ${tableName} 没有定义主键`)
    return null
  }
  
  return table.rows.find(row => row[pkColumn.columnName] === keyValue) || null
}

// ==================== 批量操作 ====================

/**
 * 批量添加行
 * @param {object} dataset - DataSet 对象
 * @param {string} tableName - 表名
 * @param {Array} rows - 新行数组
 * @returns {number} 添加的行数
 */
export function batchAddRows(dataset, tableName, rows) {
  const table = dataset.tables?.find(t => t.tableName === tableName)
  if (!table) return 0
  
  table.rows.push(...rows)
  console.log(`✅ 批量添加 ${rows.length} 行到表 ${tableName}`)
  return rows.length
}

/**
 * 批量删除行（根据主键列表）
 * @param {object} dataset - DataSet 对象
 * @param {string} tableName - 表名
 * @param {Array} keyValues - 主键值数组
 * @returns {number} 删除的行数
 */
export function batchDeleteByKeys(dataset, tableName, keyValues) {
  const table = dataset.tables?.find(t => t.tableName === tableName)
  if (!table) return 0
  
  const pkColumn = table.columns?.find(col => col.isPrimaryKey)
  if (!pkColumn) return 0
  
  const keySet = new Set(keyValues)
  const originalLength = table.rows.length
  table.rows = table.rows.filter(row => !keySet.has(row[pkColumn.columnName]))
  
  const deletedCount = originalLength - table.rows.length
  console.log(`✅ 批量删除表 ${tableName} 中的 ${deletedCount} 行`)
  return deletedCount
}

// ==================== API 集成辅助 ====================

/**
 * 保存行到服务器（调用 API）
 * @param {string} apiUrl - API 地址
 * @param {string} method - HTTP 方法（POST/PUT/PATCH）
 * @param {object} rowData - 行数据
 * @returns {Promise<any>} API 响应
 */
export async function saveRowToServer(apiUrl, method, rowData) {
  try {
    const response = await fetch(apiUrl, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rowData)
    })
    const result = await response.json()
    console.log(`✅ 保存数据到服务器: ${apiUrl}`, result)
    return result
  } catch (error) {
    console.error(`❌ 保存数据失败: ${apiUrl}`, error)
    throw error
  }
}

/**
 * 从服务器删除行（调用 API）
 * @param {string} apiUrl - API 地址（包含 ID，如 /api/users/1）
 * @returns {Promise<any>} API 响应
 */
export async function deleteRowFromServer(apiUrl) {
  try {
    const response = await fetch(apiUrl, { method: 'DELETE' })
    const result = await response.json()
    console.log(`✅ 从服务器删除数据: ${apiUrl}`, result)
    return result
  } catch (error) {
    console.error(`❌ 删除数据失败: ${apiUrl}`, error)
    throw error
  }
}
