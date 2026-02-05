// Demo 配置事件处理脚本
// 沙箱注入的全局变量: $api, $route, $data, $el, $query, $queryAll, $dataSet

console.info('🚀 Demo 配置页面已加载');
console.info('📦 页面数据:', $data);

// 刷新数据
function handleRefresh() {
  console.info('🔄 刷新数据');
  // 可以通过 $refreshData() 重新加载数据
  if (typeof $refreshData === 'function') {
    $refreshData();
  }
}

// 全选
function handleSelectAll() {
  console.info('☑️ 全选用户');
  if ($data && $data.users) {
    console.info('用户总数:', $data.users.length);
  }
}

// 编辑用户
function handleEdit(event) {
  console.info('✏️ 编辑用户:', event);
  // 这里可以打开编辑对话框
}

// 删除用户
function handleDelete(event) {
  console.info('🗑️ 删除用户:', event);
  // 这里可以显示确认对话框
}

// 导出函数供外部使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    handleRefresh,
    handleSelectAll,
    handleEdit,
    handleDelete
  };
}
