// 系统设置页面脚本
// 沙箱注入的全局变量: 
// - $api, $route, $el, $query, $queryAll, $dataSet, $rebindRules, $refreshData
// - ElMessage, ElMessageBox, SparkData, h

// 页面初始化
console.log('⚙️ 系统设置页面已加载');
console.log('📦 DataSet:', $dataSet);

// 示例：定义函数供页面使用
function saveSettings() {
    alert('💾 保存设置');
    console.log('保存设置');
}

function resetSettings() {
    alert('🔄 重置设置');
    console.log('重置设置');
}

function exportConfig() {
    alert('📤 导出配置');
    console.log('导出配置');
}
