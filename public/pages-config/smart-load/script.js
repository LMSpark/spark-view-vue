// 沙箱注入的全局变量: 
// - $api, $route, $el, $query, $queryAll, $dataSet, $rebindRules, $refreshData
// - ElMessage, ElMessageBox, SparkData, h

// 数据加载通过视图的 CRUD API 完成（loadFromServer）

/**
 * 请求订单明细数据 - 完全解耦：发起请求不等待，数据加载完成后自动更新 UI
 */
function handleRequestOrderDetails() {
  const dataSet = $dataSet;
  
  if (!dataSet) {
    ElMessage?.warning('DataSetManager 未初始化');
    return;
  }
  
  ElMessage?.info({
    message: '🔍 开始智能加载 OrderDetails...',
    duration: 2000
  });
  
  console.log('='.repeat(60));
  console.log('🚀 用户请求: OrderDetails 数据（非阻塞）');
  console.log('='.repeat(60));
  
  // 完全解耦：只发起请求，不等待
  // DataSetManager 加载完成后会自动通知订阅者 → UI 自动更新
  dataSet.getView('OrderDetails', 'default').loadFromServer();
  
  console.log('✅ 请求已发起，等待数据加载...');
}

/**
 * 请求产品数据
 */
function handleRequestProducts() {
  const dataSet = $dataSet;
  
  console.log('='.repeat(60));
  console.log('🚀 用户请求: Products 数据（非阻塞）');
  console.log('='.repeat(60));
  
  dataSet.getView('Products', 'default').loadFromServer();
  console.log('✅ 请求已发起，等待数据加载...');
}

/**
 * 请求分类数据
 */
function handleRequestCategories() {
  const dataSet = $dataSet;
  
  console.log('='.repeat(60));
  console.log('🚀 用户请求: Categories 数据（非阻塞）');
  console.log('='.repeat(60));
  
  dataSet.getView('Categories', 'default').loadFromServer();
  console.log('✅ 请求已发起，等待数据加载...');
}

/**
 * 清空所有数据
 */
function handleClearAll() {
  const dataSet = $dataSet;
  
  console.log('='.repeat(60));
  console.log('🗑️ 清空所有表数据');
  console.log('='.repeat(60));
  
  // 获取所有表
  const tables = dataSet.tables;
  
  Object.keys(tables).forEach(tableName => {
    const view = dataSet.getView(tableName, 'default');
    if (view) view.clearAll(); // clearAll 自动通知订阅者
  });
  
  ElMessage?.success('🗑️ 所有数据已清空');
}

/**
 * 页面初始化函数（由 PageRenderer 自动调用）
 * 用于注册数据加载器等初始化操作
 */
function __init__() {
  console.log('📦 smart-load 脚本开始初始化...');
  
  const dataSet = $dataSet;
  
  if (dataSet) {
    // 数据加载通过视图的 CRUD API 完成，不再使用 dataLoader
    console.log('✅ smart-load 初始化完成');
    console.log('📋 可用表: Categories, Products, OrderDetails');
    console.log('🔗 依赖关系: OrderDetails → Products → Categories');
    
    // 监听加载成功事件（用于显示提示）
    dataSet.on('loadSuccess', ({ tableName }) => {
      console.log('='.repeat(60));
      console.log(`✅ ${tableName} 加载完成！数据已自动更新到 UI`);
      console.log('='.repeat(60));
      ElMessage?.success(`✅ ${tableName} 数据加载完成！`);
    });
    
    // 监听加载失败事件
    dataSet.on('loadError', ({ tableName, error }) => {
      console.error(`❌ ${tableName} 加载失败:`, error);
      ElMessage?.error(`❌ ${tableName} 数据加载失败`);
    });
  } else {
    console.warn('⚠️ DataSetManager 未初始化');
  }
  
  console.log('✅ smart-load 脚本初始化完成');
}




