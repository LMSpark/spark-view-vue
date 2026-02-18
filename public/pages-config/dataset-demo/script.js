// 沙箱注入的全局变量: 
// - $api, $route, $data, $el, $query, $queryAll, $dataSet, $rebindRules, $refreshData
// - ElMessage, ElMessageBox, SparkData, h

/**
 * 初始化 DataSet - __init__ 生命周期
 */
function __init__() {
  const dataSet = $dataSet
  if (dataSet) {
    // 数据加载通过视图的 CRUD API 完成，不再使用 dataLoader
    console.log('✅ DataSet 初始化完成')
    
    // 监听加载事件
    dataSet.on('loadSuccess', ({ tableName }) => {
      ElMessage.success(`✅ ${tableName} 数据加载完成！`)
    })
    
    dataSet.on('loadError', ({ tableName, error }) => {
      ElMessage.error(`❌ ${tableName} 加载失败: ${error.message}`)
    })
    
    // 🚀 页面启动时自动加载主表（Users）
    // 从表（Orders、OrderItems）只在依赖条件满足时才加载
    console.log('🚀 [自动加载] 启动时加载主表: Users')
    dataSet.getView('Users', 'default').loadFromServer()
  }
}

/**
 * 用户选中事件
 */
function handleUserSelect(row) {
  const dataSet = $dataSet;
  if (!dataSet || !row) return
  
  console.log('👤 选中用户:', row)
  
  // ✅ 使用 OOP 方式设置当前行（内核会自动触发关系过滤）
  const table = dataSet.getTable('Users')
  table.setCurrentRow(row)
  
  // 检查子表视图是否已加载过数据（requestState: 0=Idle 表示未加载）
  const ordersView = dataSet.getView('Orders', 'default')
  const itemsView = dataSet.getView('OrderItems', 'default')
  
  if (ordersView && ordersView.requestState === 0) {
    console.log('🔄 检测到 Orders 数据未加载，触发按需加载...')
    ordersView.loadFromServer()
  }
  
  if (itemsView && itemsView.requestState === 0) {
    console.log('🔄 检测到 OrderItems 数据未加载，触发按需加载...')
    itemsView.loadFromServer()
  }
  
  // 更新 UI 统计信息
  const pageData = $data;
  const ordersTable = dataSet.getTable('Orders')
  pageData.currentUser = {
    label: row.name,
    orderCount: ordersTable?.rows?.length || 0
  }
  
  // 清空级联状态
  pageData.selectedOrdersCount = 0
  
  // ❌ 移除 $rebindRules() - 内核会自动通知订阅者更新 UI
  // 调用 $rebindRules() 会导致 el-table 重新渲染，复选框状态丢失
  
  console.log(`📋 用户 ${row.name} 的订单数:`, ordersTable?.rows?.length)
}

/**
 * 订单选中事件
 */
function handleOrderSelect(selection) {
  console.log('📦 选中订单:', selection)
  
  // ✅ 不需要手动设置 selectedRows - 自动注入的事件处理器已经完成了同步
  // ✅ 不需要调用 $rebindRules - 关联更新会自动通知子表（OrderItems）刷新
  // 这里只更新 UI 统计信息（不触发重绑）
  const pageData = $data;
  pageData.selectedOrdersCount = selection.length
  
  // ❌ 移除 $rebindRules() - 会导致 el-table 重新渲染，复选框状态丢失
}

/**
 * 显示 SQL 查询
 */
function showSQLQuery() {
  const dataSet = $dataSet;
  if (!dataSet) {
    ElMessage.warning('DataSet 未初始化')
    return
  }
  
  const relations = dataSet.getDataSet().relations || []
  
  if (relations.length === 0) {
    ElMessage.info('没有关系配置')
    return
  }
  
  const sqlQueries = relations.map(relation => {
    const result = SparkData.FilterParser.toSQL(relation.filterExpression)
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
function showMongoQuery() {
  const dataSet = $dataSet;
  if (!dataSet) {
    ElMessage.warning('DataSet 未初始化')
    return
  }
  
  const relations = dataSet.getDataSet().relations || []
  
  if (relations.length === 0) {
    ElMessage.info('没有关系配置')
    return
  }
  
  const mongoQueries = relations.map(relation => {
    const query = SparkData.FilterParser.toMongoDB(relation.filterExpression)
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
function exportDataSet() {
  const dataSet = $dataSet;
  if (!dataSet) {
    ElMessage.warning('DataSet 未初始化')
    return
  }
  
  const json = dataSet.toJSON()
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



