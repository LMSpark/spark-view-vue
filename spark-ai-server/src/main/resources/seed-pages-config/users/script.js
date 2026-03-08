// 用户管理页面脚本
// 沙箱注入的全局变量: 
// - $api, $route, $el, $query, $queryAll, $dataSet, $rebindRules, $refreshData, $page

// 页面初始化
console.log('👥 用户管理页面已加载');
console.log('📦 DataSet:', $dataSet);

// 示例：定义函数供页面使用
function addUser() {
    $page.showMessage('➕ 添加用户功能', 'info');
    console.log('添加用户');
}

function deleteUser() {
    $page.showMessage('🗑️ 删除用户功能', 'info');
    console.log('删除用户');
}

function editUser() {
    $page.showMessage('✏️ 编辑用户功能', 'info');
    console.log('编辑用户');
}
