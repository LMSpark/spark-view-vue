# Demo 配置文件说明

参考 `pages-config` 目录的标准配置格式。

## 📁 文件结构

```
demo-configs/
├── simple-grid.json          # 组件树配置（标准配置）
├── custom-fields-grid.json   # 组件树配置（自定义字段）
├── readonly-grid.json        # 组件树配置（只读模式）
├── pagedata.json            # 页面数据
├── script.js                # 事件处理函数
└── README.md               # 说明文档
```

## 📋 配置格式

### 1. rule.json / *.json（组件树配置）

```json
[
  {
    "type": "div",           // 组件类型（HTML 标签或组件名）
    "class": "demo-grid",    // CSS 类名
    "style": {},             // 内联样式对象
    "props": {},             // 组件属性
    "on": {                  // 事件处理器
      "click": "handleClick" // 函数名（定义在 script.js）
    },
    "dataKey": "users",      // 数据绑定路径（从 pagedata.json）
    "children": []           // 子节点数组
  }
]
```

### 2. pagedata.json（页面数据）

```json
{
  "users": [
    {
      "id": 1,
      "name": "Alice",
      "age": 28
    }
  ]
}
```

### 3. script.js（事件处理函数）

```javascript
// 沙箱注入的全局变量
// - $data: pagedata.json 的数据
// - $api: 表单 API
// - $el: 页面容器元素
// - $query, $queryAll: DOM 查询
// - $dataSet: DataSet 实例
// - $refreshData: 刷新数据函数

function handleClick(event) {
  console.info('点击事件:', event);
  console.info('当前数据:', $data);
}
```

## 🎯 核心特性

### 数据绑定（dataKey）

```json
{
  "type": "span",
  "dataKey": "user.name",  // 绑定到 $data.user.name
  "children": []
}
```

### 循环渲染（_loop）

```json
{
  "type": "div",
  "dataKey": "users",
  "_loop": {
    "item": "user",        // 循环变量名
    "template": {          // 模板节点
      "type": "div",
      "children": [
        {
          "type": "span",
          "dataKey": "user.name"  // 访问循环项
        }
      ]
    }
  }
}
```

### 条件渲染（_condition）

```json
{
  "type": "div",
  "dataKey": "user.status",
  "_condition": "isActive",  // script.js 中的条件函数
  "children": []
}
```

### 数据转换（_transform）

```json
{
  "type": "span",
  "dataKey": "user.status",
  "_transform": "statusText",  // script.js 中的转换函数
  "children": []
}
```

## 🔄 与 TypeScript 配置对比

### TypeScript 配置
```typescript
{
  type: 'grid',
  childrenGenerator: (context) => context.users.map(...),
  condition: (context) => !context.readonly,
  events: {
    click: (data) => console.log(data)
  }
}
```

### JSON 配置
```json
{
  "type": "div",
  "dataKey": "users",
  "_loop": { "item": "user", "template": {...} },
  "_condition": "notReadonly",
  "on": { "click": "handleClick" }
}
```

## 📚 参考

完整示例请参考 `public/pages-config/` 目录：
- `pages-config/home/` - 基础示例
- `pages-config/users/` - 用户管理
- `pages-config/dataset-demo/` - DataSet 示例
- `pages-config/README.md` - 完整文档
