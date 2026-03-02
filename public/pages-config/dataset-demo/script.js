// 沙箱注入的全局变量: 
// - $api, $route, $el, $query, $queryAll, $dataSet, $rebindRules, $refreshData, $page, SparkData, h

let _pageState = { currentUser: null, selectedOrdersCount: 0 }

/**
 * 初始化 DataSet - __init__ 生命周期
 */
function __init__() {
  const dataSet = $dataSet
  if (dataSet) {
    // 数据已内联在 pagedata.json，无需 loadFromServer（演示环境无后端）
    // 有 API 配置时才发起请求
    const usersView = dataSet.getView('Users', 'default')
    if (usersView && usersView.table?.api?.list) {
      console.log('🚀 [autoLoad] Users 有 API，发起加载...')
      usersView.loadFromServer()
    } else {
      console.log('✅ DataSet 初始化完成（使用内联数据）')
    }

    // 监听加载事件
    dataSet.on('loadSuccess', ({ tableName }) => {
      $page.showMessage(`✅ ${tableName} 数据加载完成！`, 'success')
    })
    
    dataSet.on('loadError', ({ tableName, error }) => {
      $page.showMessage(`❌ ${tableName} 加载失败: ${error.message}`, 'error')
    })
  }
}

/**
 * 用户选中事件
 */
function handleUserSelect(row) {
  const dataSet = $dataSet;
  if (!dataSet || !row) return
  
  console.log('👤 选中用户:', row)

  // ⚠️ 不要在此调用 view.setCurrentRow(row)！
  // injectTableEvents（bindRules.ts）已在此回调之后通过 PK 查找干净行并调用 setCurrentRow。
  // 此处拿到的 row 可能被 form-create 污染（加了 $f/api/rule 属性），直接传入会触发 WARN。
  // 应用层只需处理业务逻辑（加载子表、更新 UI 状态），DataView 同步由框架负责。

  // 检查子表视图是否已配置 API（演示环境内联数据，无需加载）
  const ordersView = dataSet.getView('Orders', 'default')
  const itemsView = dataSet.getView('OrderItems', 'default')
  
  if (ordersView && ordersView.table?.api?.list && ordersView.requestState === 0) {
    console.log('🔄 检测到 Orders 有 API 且数据未加载，触发按需加载...')
    ordersView.loadFromServer()
  }
  
  if (itemsView && itemsView.table?.api?.list && itemsView.requestState === 0) {
    console.log('🔄 检测到 OrderItems 有 API 且数据未加载，触发按需加载...')
    itemsView.loadFromServer()
  }
  
  // 更新 UI 统计信息
  const ordersTable = dataSet.getTable('Orders')
  _pageState.currentUser = {
    label: row.name,
    orderCount: ordersTable?.rows?.length || 0
  }
  
  // 清空级联状态
  _pageState.selectedOrdersCount = 0
  
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
  _pageState.selectedOrdersCount = selection.length
  
  // ❌ 移除 $rebindRules() - 会导致 el-table 重新渲染，复选框状态丢失
}

/**
 * 显示 SQL 查询
 * TODO: FilterParser 尚未实现
 */
function showSQLQuery() {
  $page.showMessage('FilterParser 尚未实现，此功能待开发', 'info')
}

/**
 * 显示 MongoDB 查询
 * TODO: FilterParser 尚未实现
 */
function showMongoQuery() {
  $page.showMessage('FilterParser 尚未实现，此功能待开发', 'info')
}

/**
 * 导出 DataSet
 */
function exportDataSet() {
  const dataSet = $dataSet;
  if (!dataSet) {
    $page.showMessage('DataSet 未初始化', 'warning')
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
  
  $page.showMessage('DataSet 已导出', 'success')
}



