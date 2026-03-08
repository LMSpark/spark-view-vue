// 系统设置页面脚本
// 沙箱注入的全局变量: 
// - $api, $route, $el, $query, $queryAll, $dataSet, $rebindRules, $refreshData, $page

// 页面初始化
console.log('⚙️ 系统设置页面已加载');
console.log('📦 DataSet:', $dataSet);

// 示例：定义函数供页面使用
function saveSettings() {
    $page.showMessage('💾 保存设置', 'success');
    console.log('保存设置');
}

function resetSettings() {
    $page.showMessage('🔄 重置设置', 'info');
    console.log('重置设置');
}

function exportConfig() {
    $page.showMessage('📤 导出配置', 'info');
    console.log('导出配置');
}
