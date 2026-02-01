// 沙箱注入的全局变量: $data, $dataSet, $api, $route, $rebindRules, $refreshData
import { ElMessage } from 'element-plus';

// 模拟数据加载器（实际项目中应该是 API 请求）
const mockDataLoader = async (tableName) => {
  console.log(`🌐 模拟加载数据: ${tableName}`);
  
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 800));
  
  const mockData = {
    Categories: [
      { id: 1, name: '电子产品' },
      { id: 2, name: '图书' },
      { id: 3, name: '服装' }
    ],
    Products: [
      { id: 101, categoryId: 1, name: '笔记本电脑', price: 5999 },
      { id: 102, categoryId: 1, name: '鼠标', price: 99 },
      { id: 103, categoryId: 2, name: 'JavaScript 高级程序设计', price: 89 },
      { id: 104, categoryId: 3, name: 'T恤', price: 59 }
    ],
    OrderDetails: [
      { id: 1001, productId: 101, quantity: 1 },
      { id: 1002, productId: 102, quantity: 2 },
      { id: 1003, productId: 103, quantity: 1 },
      { id: 1004, productId: 104, quantity: 3 }
    ]
  };
  
  return mockData[tableName] || [];
};

/**
 * 请求订单明细数据 - 完全解耦：发起请求不等待，数据加载完成后自动更新 UI
 */
export function handleRequestOrderDetails() {
  const dataSet = $dataSet();
  
  if (!dataSet) {
    ElMessage.warning('DataSetManager 未初始化');
    return;
  }
  
  ElMessage.info({
    message: '🔍 开始智能加载 OrderDetails...',
    duration: 2000
  });
  
  console.log('='.repeat(60));
  console.log('🚀 用户请求: OrderDetails 数据（非阻塞）');
  console.log('='.repeat(60));
  
  // 完全解耦：只发起请求，不等待
  // DataSetManager 加载完成后会自动通知订阅者 → UI 自动更新
  dataSet.requestTableData('OrderDetails');
  
  console.log('✅ 请求已发起，等待数据加载...');
}

/**
 * 请求产品数据
 */
export function handleRequestProducts() {
  const dataSet = $dataSet();
  
  console.log('='.repeat(60));
  console.log('🚀 用户请求: Products 数据（非阻塞）');
  console.log('='.repeat(60));
  
  dataSet.requestTableData('Products');
  console.log('✅ 请求已发起，等待数据加载...');
}

/**
 * 请求分类数据
 */
export function handleRequestCategories() {
  const dataSet = $dataSet();
  
  console.log('='.repeat(60));
  console.log('🚀 用户请求: Categories 数据（非阻塞）');
  console.log('='.repeat(60));
  
  dataSet.requestTableData('Categories');
  console.log('✅ 请求已发起，等待数据加载...');
}

/**
 * 清空所有数据
 */
export function handleClearAll() {
  const dataSet = $dataSet();
  
  console.log('='.repeat(60));
  console.log('🗑️ 清空所有表数据');
  console.log('='.repeat(60));
  
  // ✅ 使用 DataSetManager API 获取所有表
  const tables = dataSet.dataSet.tables;
  
  Object.keys(tables).forEach(tableName => {
    const table = tables[tableName];
    table.rows.splice(0, table.rows.length); // 使用 splice 保持响应式
    
    // 通知订阅者数据已更新
    dataSet.notifySubscribers(tableName);
  });
  
  ElMessage.success('🗑️ 所有数据已清空');
}

/**
 * 页面初始化函数（由 DynamicPage 自动调用）
 * 用于注册数据加载器等初始化操作
 */
export function __init__() {
  console.log('📦 smart-load 脚本开始初始化...');
  
  const dataSet = $dataSet();
  if (dataSet) {
    // 注册数据加载器
    dataSet.dataLoader = mockDataLoader;
    console.log('✅ 数据加载器已注册到 DataSetManager');
    console.log('📋 可用表: Categories, Products, OrderDetails');
    console.log('🔗 依赖关系: OrderDetails → Products → Categories');
    
    // 监听加载成功事件（用于显示提示）
    dataSet.on('loadSuccess', ({ tableName }) => {
      console.log('='.repeat(60));
      console.log(`✅ ${tableName} 加载完成！数据已自动更新到 UI`);
      console.log('='.repeat(60));
      ElMessage.success(`✅ ${tableName} 数据加载完成！`);
    });
    
    // 监听加载失败事件
    dataSet.on('loadError', ({ tableName, error }) => {
      console.error(`❌ ${tableName} 加载失败:`, error);
      ElMessage.error(`❌ ${tableName} 数据加载失败`);
    });
  } else {
    console.warn('⚠️ DataSetManager 未初始化');
  }
  
  console.log('✅ smart-load 脚本初始化完成');
}




