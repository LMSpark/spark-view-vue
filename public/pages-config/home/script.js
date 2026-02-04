// 页面脚本
// 沙箱注入的全局变量: 
// - $api, $route, $data, $el, $query, $queryAll, $dataSet, $rebindRules, $refreshData
// - ElMessage, ElMessageBox, SparkData, h

// 页面初始化（直接使用沙箱变量）
console.log('🚀 工作台页面已加载');
console.log('📦 页面数据:', $data);
console.log('🛣️ 当前路由:', $route?.path);
console.log('📄 页面容器:', $el());

// 定义函数（不使用 export）
function testButtonClick() {
    alert('✅ JavaScript 执行成功！\n按钮变色说明 CSS 也生效了！');
    console.log('🎯 测试按钮被点击');
    
    // 访问表单 API
    if ($api) {
        console.log('📋 表单值:', $api.formData());
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

function showAlert() {
    const now = new Date().toLocaleTimeString();
    alert('🔔 当前时间: ' + now);
}

function getFormData() {
    if ($api) {
        const data = $api.formData();
        console.log('📋 表单数据:', data);
        alert('表单数据: ' + JSON.stringify(data, null, 2));
        return data;
    }
    console.warn('⚠️ 表单 API 未就绪');
    return null;
}

function handleInputChange(value) {
    console.log('📝 输入值变化:', value);
    if ($api) {
        console.log('当前表单数据:', $api.formData());
    }
}

function handleRowClick(row, column, event) {
    console.log('📊 点击行:', row);
    console.log('📊 点击列:', column);
    alert('点击了行: ' + JSON.stringify(row));
}

// 示例：操作 DOM 元素
function highlightButtons() {
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

// 配置对象
const config = {
    pageName: '工作台',
    version: '1.0.0',
    initTime: new Date().toISOString()
};

