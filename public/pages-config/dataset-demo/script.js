// 沙箱注入的全局变量: 
// - $api, $route, $data, $el, $query, $queryAll, $dataSet, $rebindRules, $refreshData
// - ElMessage, ElMessageBox, SparkData, h

// Mock 数据加载器（模拟 API 请求）
const mockDataLoader = async (tableName) => {
  console.log(`🔄 [按需加载] 开始加载表: ${tableName}`)
  
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 500))
  
  // 从 database 加载数据
  const mockData = {
    Users: [
      { id: 1, name: '张三', email: 'zhangsan@example.com', status: '激活' },
      { id: 2, name: '李四', email: 'lisi@example.com', status: '激活' },
      { id: 3, name: '王五', email: 'wangwu@example.com', status: '禁用' }
    ],
    Orders: [
      { id: 101, userId: 1, orderNo: 'ORD001', amount: 1200, status: '已完成', date: '2024-01-15' },
      { id: 102, userId: 1, orderNo: 'ORD002', amount: 800, status: '进行中', date: '2024-01-20' },
      { id: 103, userId: 2, orderNo: 'ORD003', amount: 1500, status: '已完成', date: '2024-01-18' },
      { id: 104, userId: 2, orderNo: 'ORD004', amount: 600, status: '待付款', date: '2024-01-22' },
      { id: 105, userId: 3, orderNo: 'ORD005', amount: 2000, status: '已完成', date: '2024-01-25' }
    ],
    OrderItems: [
      { id: 1, orderId: 101, productName: '商品A', quantity: 2, price: 400 },
      { id: 2, orderId: 101, productName: '商品B', quantity: 1, price: 400 },
      { id: 3, orderId: 102, productName: '商品C', quantity: 4, price: 200 },
      { id: 4, orderId: 103, productName: '商品A', quantity: 3, price: 500 },
      { id: 5, orderId: 104, productName: '商品D', quantity: 2, price: 300 },
      { id: 6, orderId: 105, productName: '商品E', quantity: 5, price: 400 }
    ]
  }
  
  console.log(`✅ [按需加载] 表 ${tableName} 加载完成: ${mockData[tableName]?.length || 0} 行`)
  return mockData[tableName] || []
}

/**
 * 初始化 DataSet - __init__ 生命周期
 */
function __init__() {
  const dataSet = $dataSet
  if (dataSet) {
    // 注册数据加载器
    dataSet.dataLoader = mockDataLoader
    console.log('✅ DataSet 已注册 dataLoader')
    
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
  
  // 🔑 关键修复：检查默认上下文的 _originalRows 判断数据是否已加载
  // _originalRows 是缓存的全量数据，只在首次加载时触发请求
  const table = dataSet.getTable('Users')
  
  // ✅ 使用 OOP 方式设置当前行（内核会自动触发关系过滤）
  table.setCurrentRow(row)
  
  // 检查子表数据是否已加载
  const ordersTable = dataSet.getTable('Orders')
  const itemsTable = dataSet.getTable('OrderItems')
  
  // 如果原始数据未加载（_originalRows 为 undefined），先加载（按需加载）
  if (!ordersTable.originalRows) {
    console.log('🔄 检测到 Orders 原始数据未加载，触发加载...')
    dataSet.getView('Orders', 'default').loadFromServer()
  }
  
  if (!itemsTable.originalRows) {
    console.log('🔄 检测到 OrderItems 原始数据未加载，触发加载...')
    dataSet.getView('OrderItems', 'default').loadFromServer()
  }
  
  // 更新 UI 统计信息
  const pageData = $data;
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



