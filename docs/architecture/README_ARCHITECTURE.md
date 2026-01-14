# 全配置化表单系统架构说明

## 📋 核心理念

本项目采用**完全配置化**的架构设计，所有页面都通过 JSON 配置驱动，无需为每个页面创建单独的 Vue 组件。

## 🏗️ 架构特点

### 1. 单一通用组件
- **只有一个** `DynamicPage.vue` 组件
- 所有页面路由都使用这个组件
- 通过路由 `meta.pageId` 区分不同页面

### 2. JSON 配置驱动
每个页面配置包含 4 个文件：
```
src/pages-config/{pageId}/
├── rule.json      # 页面结构配置（必需）
├── pagedata.json      # 页面数据元数据（必需）
├── config.json    # 脚本和样式（可选）
└── README.md      # 页面说明文档（可选）
```

### 3. 配置文件说明

#### rule.json - 页面结构
定义页面的 UI 结构和组件：
```json
[
  {
    "type": "div",
    "class": "container",
    "children": [
      {
        "type": "el-button",
        "props": { "type": "primary" },
        "on": { "click": "handleClick" },
        "children": ["点击按钮"]
      }
    ]
  }
]
```

支持的配置项：
- `type`: 组件类型（HTML 标签或 Element Plus 组件）
- `class`: CSS 类名
- `style`: 内联样式对象
- `props`: 组件属性
- `on`: 事件处理器（可以是函数名字符串）
- `children`: 子元素数组
- `dataKey`: 数据绑定键（用于从 pagedata.json 获取数据）
- `field`: 表单字段名
- `value`: 默认值
- `options`: 选项列表
- `validate`: 验证规则

#### pagedata.json - 页面数据元数据
存储页面需要的数据：
```json
{
  "stats": {
    "totalUsers": "1,234",
    "todayOrders": "89"
  },
  "tableData": [...],
  "formOptions": {
    "statusOptions": [...]
  }
}
```

#### config.json - 脚本和样式
```json
{
  "script": "window.handleClick = function() { alert('Hello!'); };",
  "style": ".custom-class { color: red; }"
}
```

## 🔄 工作流程

1. **路由注册**
   - 从 `routes.json` 读取路由配置
   - 所有路由都映射到 `DynamicPage.vue` 组件
   - 通过 `meta.pageId` 传递页面标识

2. **页面加载**
   - `DynamicPage.vue` 根据 `pageId` 加载对应配置
   - 执行 `script` 注入全局函数
   - 绑定 `data` 到 `rule`
   - 注入 `style` 样式

3. **事件处理**
   - JSON 中的事件处理器使用字符串配置
   - 运行时自动转换为实际函数引用
   - 从 `window` 对象查找对应函数

## 📦 添加新页面

### 步骤 1: 创建页面配置目录
```bash
mkdir src/pages-config/newpage
```

### 步骤 2: 创建配置文件

**rule.json**
```json
[
  {
    "type": "div",
    "children": [
      {
        "type": "h1",
        "children": ["新页面标题"]
      }
    ]
  }
]
```

**pagedata.json**
```json
{
  "message": "Hello World"
}
```

**config.json** (可选)
```json
{
  "script": "console.log('页面加载完成');",
  "style": ".container { padding: 20px; }"
}
```

### 步骤 3: 添加路由配置
在 `routes.json` 中添加：
```json
{
  "path": "/newpage",
  "name": "newpage",
  "pageId": "newpage",
  "meta": {
    "title": "新页面",
    "icon": "🆕"
  }
}
```

## 🎯 优势

1. **快速开发**: 无需写 Vue 组件，只需配置 JSON
2. **易于维护**: 配置和逻辑分离，结构清晰
3. **动态更新**: 修改配置即时生效，无需重新编译
4. **复用性强**: 相同的组件逻辑可在多个页面复用
5. **类型安全**: TypeScript 提供完整的类型定义

## 📚 示例页面

- **home**: 工作台页面（包含统计卡片、表格、表单）
- **users**: 用户管理页面
- **settings**: 系统设置页面

## 🔧 技术栈

- Vue 3 + TypeScript
- Element Plus
- @form-create/element-ui
- Vite + vite-plugin-mock
- Vue Router

## 🚀 运行项目

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 访问
http://localhost:3000
```

## 💡 最佳实践

1. **配置分离**: 将复杂配置拆分到多个文件
2. **数据绑定**: 使用 `dataKey` 实现数据和 UI 的绑定
3. **事件命名**: 使用清晰的函数名，便于调试
4. **样式复用**: 通用样式放在 `style.css`，页面特定样式放在 `config.json`
5. **类型定义**: 扩展新字段时更新 `types/index.ts`

## 📖 相关文档

- [form-create 官方文档](https://www.form-create.com/)
- [Element Plus 组件](https://element-plus.org/)
- [Vue Router 文档](https://router.vuejs.org/)

