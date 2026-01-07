// ES6 模块 - 用户管理页面脚本
import {$api, $route, $data, $el, $query, $queryAll} from '../common.js'

// 页面初始化
console.log('👥 用户管理页面已加载 (ES6 模块)');
console.log('📦 页面数据:', $data());

// 示例：导出函数供页面使用
export function addUser() {
    alert('➕ 添加用户功能');
    console.log('添加用户');
}

export function deleteUser() {
    alert('🗑️ 删除用户功能');
    console.log('删除用户');
}

export function editUser() {
    alert('✏️ 编辑用户功能');
    console.log('编辑用户');
}
