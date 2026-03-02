// 用户管理页面脚本
// 沙箱注入的全局变量: 
// - $api, $route, $el, $query, $queryAll, $dataSet, $rebindRules, $refreshData
// - ElMessage, ElMessageBox, SparkData, h

// 页面初始化
console.log('👥 用户管理页面已加载');
console.log('📦 DataSet:', $dataSet);

// 示例：定义函数供页面使用
function addUser() {
    alert('➕ 添加用户功能');
    console.log('添加用户');
}

function deleteUser() {
    alert('🗑️ 删除用户功能');
    console.log('删除用户');
}

function editUser() {
    alert('✏️ 编辑用户功能');
    console.log('编辑用户');
}
