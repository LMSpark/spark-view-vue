// 沙箱注入的全局变量: 
// - $api, $route, $data, $el, $query, $queryAll, $dataSet, $rebindRules, $refreshData
// - ElMessage, ElMessageBox, SparkData, h

// Mock 数据加载器
const mockOrders = [
  // 用户1的订单
  { id: 101, userId: 1, product: 'MacBook Pro', amount: 12999 },
  { id: 102, userId: 1, product: 'iPhone 15', amount: 6999 },
  { id: 103, userId: 1, product: 'AirPods Pro', amount: 1999 },
  // 用户2的订单
  { id: 201, userId: 2, product: 'ThinkPad X1', amount: 8999 },
  { id: 202, userId: 2, product: 'Dell Monitor', amount: 2499 },
  // 用户3的订单
  { id: 301, userId: 3, product: 'Surface Pro', amount: 7999 }
]

async function mockDataLoader(tableName) {
  console.log(`🌐 [Mock API] 加载 ${tableName} 数据...`)
  
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 500))
  
  if (tableName === 'Orders') {
    // 返回全部订单数据，由 DataSetManager 根据 relation 的 filterExpression 过滤
    console.log(`✅ [Mock API] 返回全部 ${mockOrders.length} 条订单数据`)
    return mockOrders
  }
  
  return []
}

// 初始化函数
function __init__() {
  const dataSet = $dataSet
  
  // 注册数据加载器
  dataSet.dataLoader = mockDataLoader
  
  // 监听加载成功事件
  dataSet.on('loadSuccess', ({ tableName }) => {
    if (tableName === 'Orders') {
      const ordersTable = dataSet.getTable('Orders')
      const count = ordersTable?.rows?.length || 0
      ElMessage.success(`✅ 订单数据加载完成！共 ${count} 条记录`)
    }
  })
  
  // 监听加载错误事件
  dataSet.on('loadError', ({ tableName, error }) => {
    ElMessage.error(`❌ ${tableName} 加载失败: ${error.message}`)
  })
  
  // 监听 Users 表的 currentRow 变化，自动更新 JSON 显示
  dataSet.on('currentRowChanged', ({ tableName, row }) => {
    if (tableName === 'Users') {
      const pageData = $data
      const jsonText = row ? JSON.stringify(row, null, 2) : '未选择行'
      pageData.currentRowJson = jsonText
      console.log('📝 [CurrentRow] JSON 已更新:', jsonText.substring(0, 50) + '...')
      
      // 手动触发 UI 更新
      $rebindRules()
    }
  })
  
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

