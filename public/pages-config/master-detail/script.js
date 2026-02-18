// 沙箱注入的全局变量: 
// - $api, $route, $data, $el, $query, $queryAll, $dataSet, $rebindRules, $refreshData
// - ElMessage, ElMessageBox, SparkData, h

// 数据加载通过视图的 CRUD API 完成（loadFromServer）

// 初始化函数
function __init__() {
  const dataSet = $dataSet
  
  // 监听 Users 视图状态变化（直接订阅 DataView 的事件）
  const usersView = dataSet.getView('Users', 'default')
  if (usersView) {
    usersView.events.on('stateChanged', (event) => {
      if (event.changeType === 'currentRow' && event.tableName === 'Users') {
        const pageData = $data
        const jsonText = event.row ? JSON.stringify(event.row, null, 2) : '未选择行'
        pageData.currentRowJson = jsonText
        console.log('📝 [CurrentRow] JSON 已更新:', jsonText.substring(0, 50) + '...')
        
        // 手动触发 UI 更新
        $rebindRules()
      }
    })
  }
  
  // 订阅 Orders 视图的 stateChanged 事件
  const ordersView = dataSet.getView('Orders', 'default')
  if (ordersView) {
    ordersView.events.on('stateChanged', () => {
      const count = ordersView.rows?.length || 0
      if (count > 0) {
        ElMessage.success(`✅ 订单数据加载完成！共 ${count} 条记录`)
      }
    })
  }
  
  console.log('✅ [Master-Detail] 初始化完成')
}

/**
 * 自定义渲染函数：显示 currentRow
 */
function RenderCurrentRow() {
  const { h } = window.Vue
  const dataSet = $dataSet
  const currentRow = dataSet?.getTable('Users')?.currentRow
  
  return h('pre', {
    style: {
      background: '#f5f5f5',
      padding: '10px',
      borderRadius: '4px',
      margin: 0
    }
  }, currentRow ? JSON.stringify(currentRow, null, 2) : 'null')
}

