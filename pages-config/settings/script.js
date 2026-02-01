// ES6 模块 - 系统设置页面脚本
import {$api, $route, $data, $el, $query, $queryAll} from '@/utils/page-helpers/common.js'

// 页面初始化
console.log('⚙️ 系统设置页面已加载 (ES6 模块)');
console.log('📦 页面数据:', $data());

// 示例：导出函数供页面使用
export function saveSettings() {
    alert('💾 保存设置');
    console.log('保存设置');
}

export function resetSettings() {
    alert('🔄 重置设置');
    console.log('重置设置');
}

export function exportConfig() {
    alert('📤 导出配置');
    console.log('导出配置');
}
