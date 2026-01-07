import { $data, $rebindRules } from '../common.js'
import { DataSetManager } from '../../utils/dataSetManager'
import { FilterExpressionParser } from '../../utils/filterExpressionParser'
import { ElMessage } from 'element-plus'

// DataSet 管理器实例
let dataSetManager = null

/**
 * 初始化 DataSet
 */
export function initDataSet() {
  const pageData = $data()
  if (pageData.dataset) {
    dataSetManager = new DataSetManager(pageData.dataset)
    console.log('✅ DataSet 初始化完成', dataSetManager.getDataSet())
  }
}

/**
 * 用户选中事件
 */
export function handleUserSelect(row) {
  if (!dataSetManager || !row) return
  
  console.log('👤 选中用户:', row)
  
  // 设置当前行
  dataSetManager.setCurrentRow('Users', row)
  
  // 获取 Users 表的 currentRow
  const usersTable = dataSetManager.getTable('Users')
  const ordersTable = dataSetManager.getTable('Orders')
  
  if (!usersTable || !ordersTable) return
  
  // 应用关系过滤
  const relation = dataSetManager.getDataSet().relations?.find(
    r => r.parentTable === 'Users' && r.childTable === 'Orders'
  )
  
  if (relation) {
    dataSetManager.applyRelation(relation)
    
    // 更新页面数据
    const ordersContext = dataSetManager.getContext('Orders')
    const pageData = $data()
    pageData.filteredOrders = ordersContext?.selectedRows || []
    pageData.currentUser = {
      label: row.name,
      orderCount: pageData.filteredOrders.length
    }
    
    // 清空订单明细
    pageData.filteredOrderItems = []
    pageData.selectedOrdersCount = 0
    
    console.log(`📋 用户 ${row.name} 的订单:`, pageData.filteredOrders)
    
    // 重新绑定数据到视图
    $rebindRules()
  }
}

/**
 * 订单选中事件
 */
export function handleOrderSelect(rows) {
  if (!dataSetManager) return
  
  console.log('📦 选中订单:', rows)
  
  // 设置选中行
  dataSetManager.setSelectedRows('Orders', rows)
  
  // 应用关系过滤
  const relation = dataSetManager.getDataSet().relations?.find(
    r => r.parentTable === 'Orders' && r.childTable === 'OrderItems'
  )
  
  if (relation) {
    dataSetManager.applyRelation(relation)
    
    // 更新页面数据
    const orderItemsContext = dataSetManager.getContext('OrderItems')
    const pageData = $data()
    pageData.filteredOrderItems = orderItemsContext?.selectedRows || []
    
    // 刷新视图
    $rebindRules()
    pageData.selectedOrdersCount = rows.length
    
    console.log('🛒 订单明细:', pageData.filteredOrderItems)
  }
}

/**
 * 显示 SQL 查询
 */
export function showSQLQuery() {
  if (!dataSetManager) {
    ElMessage.warning('DataSet 未初始化')
    return
  }
  
  const relations = dataSetManager.getDataSet().relations || []
  
  if (relations.length === 0) {
    ElMessage.info('没有关系配置')
    return
  }
  
  const sqlQueries = relations.map(relation => {
    const result = FilterExpressionParser.toSQL(relation.filterExpression)
    return {
      relation: `${relation.parentTable} -> ${relation.childTable}`,
      sql: `SELECT * FROM ${relation.childTable} WHERE ${result.sql}`,
      params: result.params
    }
  })
  
  console.log('🔍 SQL 查询:', sqlQueries)
  
  ElMessage.success({
    message: 'SQL 查询已输出到控制台',
    duration: 2000
  })
  
  // 显示第一个查询
  if (sqlQueries.length > 0) {
    alert(`SQL 查询示例:\n\n${sqlQueries[0].sql}\n\n完整信息请查看控制台`)
  }
}

/**
 * 显示 MongoDB 查询
 */
export function showMongoQuery() {
  if (!dataSetManager) {
    ElMessage.warning('DataSet 未初始化')
    return
  }
  
  const relations = dataSetManager.getDataSet().relations || []
  
  if (relations.length === 0) {
    ElMessage.info('没有关系配置')
    return
  }
  
  const mongoQueries = relations.map(relation => {
    const query = FilterExpressionParser.toMongoDB(relation.filterExpression)
    return {
      relation: `${relation.parentTable} -> ${relation.childTable}`,
      collection: relation.childTable,
      query: query
    }
  })
  
  console.log('🍃 MongoDB 查询:', mongoQueries)
  
  ElMessage.success({
    message: 'MongoDB 查询已输出到控制台',
    duration: 2000
  })
  
  // 显示第一个查询
  if (mongoQueries.length > 0) {
    alert(`MongoDB 查询示例:\n\ndb.${mongoQueries[0].collection}.find(${JSON.stringify(mongoQueries[0].query, null, 2)})\n\n完整信息请查看控制台`)
  }
}

/**
 * 导出 DataSet
 */
export function exportDataSet() {
  if (!dataSetManager) {
    ElMessage.warning('DataSet 未初始化')
    return
  }
  
  const json = dataSetManager.toJSON()
  console.log('📦 导出 DataSet:', json)
  
  // 下载为文件
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'dataset-export.json'
  a.click()
  URL.revokeObjectURL(url)
  
  ElMessage.success('DataSet 已导出')
}

// 页面加载时初始化
setTimeout(() => {
  initDataSet()
}, 100)
