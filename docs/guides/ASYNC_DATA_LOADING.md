# 异步数据加载指南

## 概述

Form Create SSR App 现在支持在页面配置中定义异步数据加载，无需在页面挂载时就拥有所有数据。

## 配置方式

### 1. 静态数据（原有方式）

在 `pagedata.json` 中直接定义静态数据：

```json
{
  "stats": {
    "totalUsers": "1,234",
    "todayOrders": "89"
  },
  "userList": [
    { "id": 1, "name": "张三" },
    { "id": 2, "name": "李四" }
  ]
}
```

### 2. API 配置（新增方式）

在 `pagedata.json` 中定义 API 配置来异步加载数据：

```json
{
  "stats": {
    "totalUsers": "1,234",
    "todayOrders": "89"
  },
  "userList": {
    "url": "/api/users",
    "method": "GET",
    "params": {
      "page": 1,
      "pageSize": 10
    },
    "dataPath": "data.list",
    "autoLoad": true
  }
}
```

#### API 配置参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `url` | string | 是 | - | API 请求地址 |
| `method` | string | 否 | GET | 请求方法：GET/POST/PUT/DELETE |
| `params` | object | 否 | - | 请求参数（GET 为 query，POST 为 body） |
| `dataPath` | string | 否 | - | 响应数据路径，如 'data.list' |
| `autoLoad` | boolean | 否 | true | 是否自动加载 |

### 3. 混合使用

可以在同一个 `pagedata.json` 中混合使用静态数据和 API 配置：

```json
{
  "title": "用户管理",
  "stats": {
    "url": "/api/stats",
    "dataPath": "data"
  },
  "users": {
    "url": "/api/users",
    "method": "GET",
    "autoLoad": true
  },
  "options": [
    { "label": "选项1", "value": 1 },
    { "label": "选项2", "value": 2 }
  ]
}
```

## 数据刷新

在页面脚本（`script.js`）中，可以使用 `$refreshData()` 方法刷新数据：

```javascript
// 沙箱注入的全局变量: $refreshData, $data, $dataSet

// 刷新所有 API 数据
export async function refreshAll() {
  await $refreshData()
  console.log('所有数据已刷新')
}

// 刷新指定的数据
export async function refreshUsers() {
  await $refreshData('users')
  console.log('用户数据已刷新:', $data().users)
}

// 按钮点击事件示例
export async function handleRefresh() {
  try {
    await $refreshData('tableData')
    console.log('表格数据刷新成功')
  } catch (error) {
    console.error('刷新失败:', error)
  }
}
```

## 在 Rule 中使用

数据加载后，可以通过 `dataKey` 绑定到 UI 组件：

### 支持的绑定方式

#### 1. 表格数据绑定（el-table）

```json
{
  "type": "el-table",
  "dataKey": "users",
  "props": {
    "border": true
  },
  "children": [
    {
      "type": "el-table-column",
      "props": {
        "prop": "name",
        "label": "姓名"
      }
    }
  ]
}
```

**说明**：
- `dataKey` 路径从 `pageData` 根对象开始解析
- 支持嵌套路径，如 `"stats.totalUsers"`
- 不需要 DataSet，直接绑定简单数据即可

#### 2. 文本内容绑定（div、span 等）

```json
{
  "type": "div",
  "class": "stat-value",
  "dataKey": "stats.totalUsers",
  "children": [""]
}
```

**说明**：
- `children` 必须设置为 `[""]`（空字符串数组）
- 绑定的值会自动转换为字符串并替换 children
- 支持任意嵌套路径

#### 3. DataSet 绑定（高级场景）

```json
{
  "type": "el-table",
  "dataKey": "dataset.tables.Users.rows",
  "props": {
    "border": true
  }
}
```

**说明**：
- 用于需要主从表联动、过滤、排序等高级功能的场景
- 需要在 pagedata.json 中定义 DataSet 结构
- 自动同步表格选中状态到 DataSet

### 数据路径解析规则

`dataKey` 支持点号分隔的路径表达式：

```javascript
// pageData 结构
{
  "stats": {
    "totalUsers": 8523,
    "revenue": "¥89,234"
  },
  "orders": [
    { "id": 1, "customer": "张三" }
  ]
}

// 有效的 dataKey 示例
"stats.totalUsers"     // → 8523
"stats.revenue"        // → "¥89,234"
"orders"               // → [{ id: 1, customer: "张三" }]
```

## 完整示例

### pagedata.json
```json
{
  "pageTitle": "仪表板",
  "stats": {
    "url": "/api/dashboard/stats",
    "method": "GET",
    "dataPath": "data"
  },
  "recentOrders": {
    "url": "/api/orders/recent",
    "method": "GET",
    "params": {
      "limit": 10
    },
    "dataPath": "data.orders"
  }
}
```

### rule.json
```json
[
  {
    "type": "div",
    "class": "page-header",
    "children": [
      {
        "type": "h1",
        "children": ["仪表板"],
        "dataKey": "pageTitle"
      }
    ]
  },
  {
    "type": "div",
    "class": "stats-container",
    "children": [
      {
        "type": "el-card",
        "children": [
          {
            "type": "div",
            "children": ["总销售额: "],
            "dataKey": "stats.totalSales"
          }
        ]
      }
    ]
  },
  {
    "type": "el-button",
    "props": {
      "type": "primary"
    },
    "on": {
      "click": "handleRefresh"
    },
    "children": ["刷新数据"]
  },
  {
    "type": "el-table",
    "dataKey": "recentOrders",
    "props": {
      "border": true
    },
    "children": [
      {
        "type": "el-table-column",
        "props": {
          "prop": "orderNo",
          "label": "订单号"
        }
      }
    ]
  }
]
```

### script.js
```javascript
// 沙箱注入的全局变量: $refreshData

export async function handleRefresh() {
  // 刷新最近订单数据
  await $refreshData('recentOrders')
}
```

## 注意事项

1. **SSR 兼容性**：在 SSR 模式下，API 请求会在服务端执行，需确保 API 地址可访问
2. **错误处理**：API 请求失败会在控制台输出错误，但不会阻止页面渲染
3. **响应式更新**：数据加载后会自动触发 UI 更新，无需手动操作
4. **autoLoad=false**：如果设置为 false，需要在脚本中手动调用 `$refreshData(key)` 加载
5. **数据路径**：`dataPath` 支持嵌套路径，如 'data.result.list'

## 高级用法

### 条件加载

```javascript
import { $refreshData, $route } from '@/utils/page-helpers/common.js'

export async function onPageMounted() {
  const userId = $route().params.id
  if (userId) {
    // 只有当有 userId 时才加载用户详情
    await $refreshData('userDetail')
  }
}
```

### 定时刷新

```javascript
import { $refreshData } from '@/utils/page-helpers/common.js'

let timer = null

export function startAutoRefresh() {
  timer = setInterval(async () => {
    await $refreshData('liveData')
  }, 5000) // 每5秒刷新一次
}

export function stopAutoRefresh() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
```

### 级联加载

```javascript
import { $refreshData, $data } from '@/utils/page-helpers/common.js'

export async function loadCascadeData() {
  // 先加载分类
  await $refreshData('categories')
  
  // 根据第一个分类加载商品
  const firstCategory = $data().categories[0]
  if (firstCategory) {
    // 修改 API 参数（需要在配置中支持动态参数）
    await $refreshData('products')
  }
}
```

## 迁移指南

如果你有现有的静态数据配置，可以按以下步骤迁移：

1. **保留静态数据**：不需要改动的静态数据保持原样
2. **识别动态数据**：找出需要从 API 获取的数据
3. **替换为 API 配置**：将动态数据替换为 API 配置对象
4. **添加刷新逻辑**：在需要的地方调用 `$refreshData()`

示例迁移：

**迁移前：**
```json
{
  "users": [
    { "id": 1, "name": "张三" }
  ]
}
```

**迁移后：**
```json
{
  "users": {
    "url": "/api/users",
    "autoLoad": true
  }
}
```

