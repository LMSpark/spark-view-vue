// 沙箱注入的全局变量: 
// - $api, $route, $data, $el, $query, $queryAll, $dataSet, $rebindRules, $refreshData
// - ElMessage, ElMessageBox, SparkData, h

// 数据加载通过视图的 CRUD API 完成（loadFromServer）

// 初始化函数
function __init__() {
  const dataSet = $dataSet
  
  // 🔍 验证新时序：$api 应该在脚本编译时就可用
  console.log('🔍 [__init__] $api 状态验证（新时序）:', {
    hasApi: !!$api,
    apiType: typeof $api,
    apiIsNull: $api === null,
    canSetValue: $api && typeof $api.setValue === 'function',
    apiMethods: $api ? Object.keys($api).filter(k => typeof $api[k] === 'function').slice(0, 5) : []
  })
  
  // 初始化 currentRowJson（防止 undefined）
  $data.currentRowJson = '未选择行'
  
  // 获取 Users 表的列定义（用于提取干净的数据对象）
  const usersTable = dataSet.getTable('Users')
  const columns = usersTable?.columns || []

  
  // 监听 Users 视图状态变化（直接订阅 DataView 的事件）
  const usersView = dataSet.getView('Users', 'default')
  
  console.log('📡 [Script] 获取 Users 视图', {
    hasView: !!usersView,
    currentRow: usersView?.currentRow,
    rowsCount: usersView?.rows?.length ?? 0
  })
  
  if (usersView) {
    usersView.events.on('stateChanged', (event) => {
      if (event.changeType === 'currentRow' && event.tableName === 'Users') {
        const currentIndex = usersView.rows.indexOf(usersView.currentRow)
        
        // 🔍 验证事件触发时 $api 状态
        console.log('🔍 [stateChanged] $api 状态验证:', {
          hasApi: !!$api,
          canSetValue: $api && typeof $api.setValue === 'function'
        })
        
        if (currentIndex !== null && currentIndex >= 0 && currentIndex < usersView.rows.length) {
          const cleanRow = usersView.rows[currentIndex]
          
          // 基于 columns 定义提取字段（过滤 _perm 等元数据）
          const pureData = {}
          columns.forEach(col => {
            if (cleanRow[col.name] !== undefined) {
              pureData[col.name] = cleanRow[col.name]
            }
          })
          
          const jsonStr = JSON.stringify(pureData, null, 2)
          
          // ✅ 使用 $api.setValue() 更新字段（FormCreate 的标准方式）
          if ($api) {
            $api.setValue('currentRowJson', jsonStr)
          } else {
            // 回退方案：直接赋值
            $data.currentRowJson = jsonStr
          }
        } else {
          if ($api) {
            $api.setValue('currentRowJson', '未选择行')
          } else {
            $data.currentRowJson = '未选择行'
          }
        }
      }
    })
    // Users 视图事件已订阅
  } else {
    console.warn('⚠️ [Script] 无法获取 Users 视图')
  }
  
  // 订阅 Orders 视图的 stateChanged 事件
  const ordersView = dataSet.getView('Orders', 'default')
  console.log('📡 [Script] 获取 Orders 视图', { hasView: !!ordersView })
  
  if (ordersView) {
    ordersView.events.on('stateChanged', () => {
      const count = ordersView.rows?.length || 0
      console.log('📥 [Script] Orders 视图状态变化', { rowsCount: count })
      if (count > 0) {
        ElMessage.success(`✅ 订单数据加载完成！共 ${count} 条记录`)
      }
    })
    // Orders 视图事件已订阅
  } else {
    console.warn('⚠️ [Script] 无法获取 Orders 视图')
  }
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

