// 沙箱注入的全局变量: 
// - $api: FormCreate API
// - $route: 当前路由快照 (IPageRoute)
// - $el: 页面容器元素 (() => HTMLElement)
// - $query: DOM 查询单个元素
// - $queryAll: DOM 查询所有元素
// - $dataSet: 页面级 DataSet 实例
// - $rebindRules: 重新绑定规则（触发 form-create 重建）
// - $refreshData: 刷新数据 (key?) => Promise<void>
// - $page: UI 消息、确认框、导航（IPageServiceCapability）
// - SparkData: SPARK 数据空间命名空间
// - h: Vue h 函数

/**
 * 刷新所有数据
 */
async function refreshAllData() {
  try {
    $page.showMessage('正在刷新数据...', 'info')
    await $refreshData()
    $page.showMessage('所有数据刷新成功！')
    console.log('刷新后的数据:', $dataSet)
  } catch (error) {
    $page.showMessage('刷新数据失败', 'error')
    console.error('刷新失败:', error)
  }
}

/**
 * 只刷新订单数据
 */
async function refreshOrders() {
  try {
    $page.showMessage('正在刷新订单数据...', 'info')
    await $refreshData('recentOrders')
    $page.showMessage('订单数据刷新成功！')
    console.log('最新订单:', $dataSet?.getView?.('recentOrders', 'default')?.rows)
  } catch (error) {
    $page.showMessage('刷新订单数据失败', 'error')
    console.error('刷新失败:', error)
  }
}
