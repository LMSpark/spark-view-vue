// 沙箱注入的全局变量: 
// - $api: FormCreate API
// - $route: Vue Router 路由
// - $el: 页面容器元素 (() => HTMLElement)
// - $query: DOM 查询单个元素
// - $queryAll: DOM 查询所有元素
// - $dataSet: DataSet 实例
// - $rebindRules: 重新绑定规则
// - $refreshData: 刷新数据
// - ElMessage: Element Plus 消息提示
// - ElMessageBox: Element Plus 消息框
// - SparkData: SPARK 数据空间命名空间
// - h: Vue h 函数

/**
 * 刷新所有数据
 */
async function refreshAllData() {
  try {
    ElMessage.info('正在刷新数据...')
    await $refreshData()
    ElMessage.success('所有数据刷新成功！')
    console.log('刷新后的数据:', $dataSet)
  } catch (error) {
    ElMessage.error('刷新数据失败')
    console.error('刷新失败:', error)
  }
}

/**
 * 只刷新订单数据
 */
async function refreshOrders() {
  try {
    ElMessage.info('正在刷新订单数据...')
    await $refreshData('recentOrders')
    ElMessage.success('订单数据刷新成功！')
    console.log('最新订单:', $dataSet?.getView?.('recentOrders', 'default')?.rows)
  } catch (error) {
    ElMessage.error('刷新订单数据失败')
    console.error('刷新失败:', error)
  }
}
