// 沙箱注入的全局变量: 
// - $api, $route, $data, $el, $query, $queryAll, $dataSet, $rebindRules, $refreshData
// - ElMessage, ElMessageBox, SparkData, h

// 数据加载通过视图的 CRUD API 完成（loadFromServer）

// 初始化函数
function __init__() {
  const dataSet = $dataSet
  
  // 初始化 currentRowJson（防止 undefined）
  $data.currentRowJson = '未选择行'
  
  // 获取 Users 表的列定义（用于提取干净的数据对象）
  const usersTable = dataSet.getTable('Users')
  const columns = usersTable?.columns || []

  const usersView = dataSet.getView('Users', 'default')
  
  if (usersView) {
    const handleCurrentRowChange = (currentRow) => {
      if (currentRow !== null) {
        // 基于 columns 定义提取字段（过滤 _perm 等元数据）
        const pureData = {}
        columns.forEach(col => {
          if (currentRow[col.name] !== undefined) {
            pureData[col.name] = currentRow[col.name]
          }
        })
        const jsonStr = JSON.stringify(pureData, null, 2)
        if ($api) {
          $api.setValue('currentRowJson', jsonStr)
        } else {
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
    // 订阅后续变化
    usersView.events.on('currentRowChanged', handleCurrentRowChange)
    // 立即同步：DataSet 创建时 autoCurrentFirst=true 已设好第一行，事件在订阅前已发出
    handleCurrentRowChange(usersView.currentRow)
    // Users 视图 currentRowChanged 事件已订阅
  } else {
    console.warn('⚠️ [Script] 无法获取 Users 视图')
  }
  
  // 订阅 Orders 视图的 rowsChanged 事件
  const ordersView = dataSet.getView('Orders', 'default')
  
  if (ordersView) {
    ordersView.events.on('rowsChanged', () => {
      const count = ordersView.rows?.length || 0
      if (count > 0) {
        ElMessage.success(`✅ 订单数据加载完成！共 ${count} 条记录`)
      }
    })
    // Orders 视图 rowsChanged 事件已订阅
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
  const currentRow = dataSet?.getView('Users', 'default')?.currentRow
  
  return h('pre', {
    style: {
      background: '#f5f5f5',
      padding: '10px',
      borderRadius: '4px',
      margin: 0
    }
  }, currentRow ? JSON.stringify(currentRow, null, 2) : 'null')
}

