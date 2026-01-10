// ES6 模块 - 页面脚本
import {$api, $route, $data, $el, $query, $queryAll} from '@/utils/page-helpers/common.js'

// 页面初始化（使用函数调用获取实时值）
console.log('🚀 工作台页面已加载 (ES6 模块)');
console.log('📦 页面数据:', $data());
console.log('🛣️ 当前路由:', $route()?.path);
console.log('📄 页面容器:', $el());

// 使用 export 导出函数
export function testButtonClick() {
    alert('✅ JavaScript 执行成功！\n按钮变色说明 CSS 也生效了！');
    console.log('🎯 测试按钮被点击');
    
    // 访问表单 API
    const api = $api()
    if (api) {
        console.log('📋 表单值:', api.formData());
    }
    
    // 访问 DOM 元素
    const el = $el()
    if (el) {
        console.log('📄 页面容器元素:', el);
        console.log('📏 容器高度:', el.offsetHeight);
    }
    
    // 查询页面中的按钮
    const buttons = $queryAll('button');
    console.log('🔘 页面中有', buttons?.length, '个按钮');
}

export function showAlert() {
    const now = new Date().toLocaleTimeString();
    alert('🔔 当前时间: ' + now);
}

export function getFormData() {
    const api = $api()
    if (api) {
        const data = api.formData();
        console.log('📋 表单数据:', data);
        alert('表单数据: ' + JSON.stringify(data, null, 2));
        return data;
    }
    console.warn('⚠️ 表单 API 未就绪');
    return null;
}

export function handleInputChange(value) {
    console.log('📝 输入值变化:', value);
    const api = $api()
    if (api) {
        console.log('当前表单数据:', api.formData());
    }
}

export function handleRowClick(row, column, event) {
    console.log('📊 点击行:', row);
    console.log('📊 点击列:', column);
    alert('点击了行: ' + JSON.stringify(row));
}

// 示例：操作 DOM 元素
export function highlightButtons() {
    const buttons = $queryAll('button');
    if (buttons) {
        buttons.forEach((btn, index) => {
            setTimeout(() => {
                btn.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    btn.style.transform = 'scale(1)';
                }, 200);
            }, index * 100);
        });
    }
    console.log('✨ 按钮高亮动画执行');
}

// 私有辅助函数（不导出，外部无法访问）
function formatDate(date) {
    return date.toLocaleDateString('zh-CN');
}

// 导出配置对象
export const config = {
    pageName: '工作台',
    version: '1.0.0',
    initTime: new Date().toISOString()
};

