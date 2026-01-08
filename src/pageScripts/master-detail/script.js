import { $dataSetManager } from '../common.js'
import { ElMessage } from 'element-plus'

// Mock 数据加载器
const mockOrders = {
  1: [
    { id: 101, userId: 1, product: 'MacBook Pro', amount: 12999 },
    { id: 102, userId: 1, product: 'iPhone 15', amount: 6999 },
    { id: 103, userId: 1, product: 'AirPods Pro', amount: 1999 }
  ],
  2: [
    { id: 201, userId: 2, product: 'ThinkPad X1', amount: 8999 },
    { id: 202, userId: 2, product: 'Dell Monitor', amount: 2499 }
  ],
  3: [
    { id: 301, userId: 3, product: 'Surface Pro', amount: 7999 }
  ]
}

async function mockDataLoader(tableName) {
  console.log(`🌐 [Mock API] 加载 ${tableName} 数据...`)
  
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 500))
  
  if (tableName === 'Orders') {
    // 从 Users.currentRow 获取当前选中的用户 ID
    const manager = $dataSetManager()
    const usersTable = manager.getTable('Users')
    const currentUserId = usersTable?.currentRow?.id
    
    if (!currentUserId) {
      console.log(`⚠️ [Mock API] 未选中用户，返回空订单`)
      return []
    }
    
    const orders = mockOrders[currentUserId] || []
    console.log(`✅ [Mock API] 返回用户 ${currentUserId} 的 ${orders.length} 条订单`)
    return orders
  }
  
  return []
}

// 初始化函数
export function __init__() {
  const manager = $dataSetManager()
  
  // 注册数据加载器
  manager.dataLoader = mockDataLoader
  
  // 监听加载成功事件
  manager.on('loadSuccess', ({ tableName }) => {
    if (tableName === 'Orders') {
      const ordersTable = manager.getTable('Orders')
      const count = ordersTable?.rows?.length || 0
      ElMessage.success(`✅ 订单数据加载完成！共 ${count} 条记录`)
    }
  })
  
  // 监听加载错误事件
  manager.on('loadError', ({ tableName, error }) => {
    ElMessage.error(`❌ ${tableName} 加载失败: ${error.message}`)
  })
  
  console.log('✅ [Master-Detail] 初始化完成')
}
