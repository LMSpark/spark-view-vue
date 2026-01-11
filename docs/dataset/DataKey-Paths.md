# DataKey 路径完整指南

> 📌 **核心理念**：一切皆视图（BindingContext）  
> DataTable 本身就是一个 BindingContext（默认上下文），同时可以包含多个自定义上下文。

## 1. 架构概览

```typescript
DataSet {
  tables: {
    Users: DataTable {           // ← DataTable 继承自 BindingContext
      // ===== 默认上下文属性 =====
      rows: [],                  // 视图数据（过滤/排序后）
      currentRow: null,          // 当前选中行
      selectedRows: [],          // 批量选中行
      _originalRows: [],         // 原始完整数据（内部缓存）
      
      // ===== 表特有属性 =====
      tableName: 'Users',
      columns: [...],
      
      // ===== 自定义上下文 =====
      contexts: {
        detail: {                // contextId = 'detail'
          rows: [],              // 该上下文的视图数据
          currentRow: null,      // 该上下文的当前行
          selectedRows: [],      // 该上下文的选中行
          _originalRows: []      // 该上下文的原始数据
        },
        chart: {                 // contextId = 'chart'
          rows: [],
          selectedRows: []
        }
      }
    }
  }
}
```

## 2. DataKey 路径规范

### 2.1 默认上下文（最常用）

| 路径 | 说明 | 使用场景 |
|------|------|----------|
| `dataset.tables.Users.rows` | 视图数据（过滤/分页后） | el-table 主数据源 |
| `dataset.tables.Users.currentRow` | 当前选中行 | 显示详情、编辑表单 |
| `dataset.tables.Users.selectedRows` | 批量选中行 | 批量操作、统计信息 |
| `dataset.tables.Users._originalRows` | 原始完整数据 | ⚠️ 内部使用，不推荐绑定 UI |

### 2.2 自定义上下文

| 路径 | 说明 | 使用场景 |
|------|------|----------|
| `dataset.tables.Users.contexts.detail.rows` | detail 上下文的视图数据 | 独立的详情表格 |
| `dataset.tables.Users.contexts.detail.currentRow` | detail 上下文的当前行 | 详情视图的选中行 |
| `dataset.tables.Users.contexts.chart.selectedRows` | chart 上下文的选中行 | 图表筛选数据源 |

### 2.3 表元数据

| 路径 | 说明 | 使用场景 |
|------|------|----------|
| `dataset.tables.Users.tableName` | 表名 | 标题显示 |
| `dataset.tables.Users.columns` | 列定义 | 动态列配置 |
| `dataset.tables.Users.loading` | 加载状态 | 显示 loading |
| `dataset.tables.Users.error` | 错误信息 | 错误提示 |

## 3. 实际应用示例

### 3.1 主从表（Master-Detail）

```json
{
  "type": "div",
  "children": [
    {
      "type": "el-table",
      "dataKey": "dataset.tables.Users.rows",
      "props": { "highlightCurrentRow": true }
    },
    {
      "type": "el-descriptions",
      "title": "当前用户详情",
      "dataKey": "dataset.tables.Users.currentRow",
      "children": [
        {
          "type": "el-descriptions-item",
          "props": { "label": "姓名" },
          "children": ["{{name}}"]
        }
      ]
    },
    {
      "type": "el-table",
      "dataKey": "dataset.tables.Orders.rows"
    }
  ]
}
```

**数据流**：
1. 用户点击 Users 表格行
2. Kernel 自动同步：`Users.currentRow = clickedRow`
3. Kernel 检测依赖关系（Orders 依赖 Users.currentRow）
4. Kernel 自动加载并过滤：`Orders.rows = filter(...)`
5. UI 自动更新（两个组件都重新绑定）

### 3.2 多视图绑定（同一表不同上下文）

```json
{
  "type": "div",
  "children": [
    {
      "type": "el-table",
      "dataKey": "dataset.tables.Products.rows",
      "contextId": "default"
    },
    {
      "type": "el-table",
      "dataKey": "dataset.tables.Products.contexts.detail.rows",
      "contextId": "detail"
    },
    {
      "type": "div",
      "children": [
        "主表选中：",
        { "type": "pre", "dataKey": "dataset.tables.Products.currentRow" }
      ]
    },
    {
      "type": "div",
      "children": [
        "详情表选中：",
        { "type": "pre", "dataKey": "dataset.tables.Products.contexts.detail.currentRow" }
      ]
    }
  ]
}
```

**特点**：
- 两个表格显示同一份数据（Products）
- 但各自维护独立的 currentRow / selectedRows
- 互不干扰，各自触发不同的业务逻辑

### 3.3 批量操作统计

```json
{
  "type": "div",
  "children": [
    {
      "type": "el-table",
      "dataKey": "dataset.tables.Orders.rows",
      "props": { "showSelection": true }
    },
    {
      "type": "el-alert",
      "props": { "type": "info" },
      "children": [
        "已选中 ",
        { "type": "code", "dataKey": "dataset.tables.Orders.selectedRows.length" },
        " 条订单"
      ]
    }
  ]
}
```

## 4. 路径解析机制

### 4.1 bindDataToRules 实现

```typescript
if (newRule.dataKey) {
    const keys = newRule.dataKey.split('.')  // ['dataset', 'tables', 'Users', 'rows']
    let value: any = data
    for (const key of keys) {
        value = value?.[key]  // 逐层解析：data.dataset.tables.Users.rows
    }
    
    // 绑定到组件
    if (newRule.type === 'el-table') {
        newRule.props.data = value
    }
}
```

### 4.2 支持任意嵌套深度

✅ **完全支持**：
- `dataset.tables.Users.contexts.detail.rows`
- `dataset.tables.Users.contexts.chart.selectedRows.0.name`（访问第一个选中行的 name）
- `dataset.tables.Users.pagination.total`（分页信息）

## 5. 最佳实践

### ✅ 推荐用法

1. **使用语义化路径**：
   ```json
   "dataKey": "dataset.tables.Users.currentRow"  // ✅ 清晰
   ```

2. **多上下文用 contextId 命名**：
   ```json
   {
     "dataKey": "dataset.tables.Products.contexts.detail.rows",
     "contextId": "detail"
   }
   ```

3. **显示状态用元数据路径**：
   ```json
   {
     "type": "el-alert",
     "dataKey": "dataset.tables.Users.loading",
     "children": ["加载中..."]
   }
   ```

### ❌ 不推荐用法

1. **直接绑定 _originalRows**：
   ```json
   "dataKey": "dataset.tables.Users._originalRows"  // ❌ 内部缓存，不应用于 UI
   ```

2. **手动过滤数据**：
   ```javascript
   // ❌ 不要在 script.js 中手动过滤
   const filtered = $data().dataset.tables.Users.rows.filter(...)
   
   // ✅ 使用关系配置自动过滤
   // 在 pagedata.json 中配置 relation
   ```

3. **混淆 contextId 和 dataKey**：
   ```json
   {
     "contextId": "detail",
     "dataKey": "dataset.tables.Users.rows"  // ❌ 应该用 contexts.detail.rows
   }
   ```

## 6. 调试技巧

### 6.1 查看绑定数据

在浏览器控制台：
```javascript
// 查看完整 DataSet
console.log($data().dataset)

// 查看特定表
console.log($data().dataset.tables.Users)

// 查看自定义上下文
console.log($data().dataset.tables.Users.contexts.detail)
```

### 6.2 监听数据变化

DynamicPage.vue 自动打印绑定日志：
```
📊 [数据绑定] el-table dataKey="dataset.tables.Users.rows" 绑定数据: [...]
🔄 表 Users 数据变化，自动重绑 UI
```

### 6.3 类型检查

使用 TypeScript 类型定义：
```typescript
import type { IDataTable, IBindingContext } from '@/types/pageData'
import { DataTable } from '@/models/DataTable'
import { BindingContext } from '@/models/BindingContext'

// 类型安全的路径访问
const table: DataTable = $data().dataset.tables.Users
const context: BindingContext = table.contexts.detail
```

## 7. 常见问题

### Q1: 为什么有时候数据不更新？

A: 检查以下几点：
1. 确保使用了 Vue 响应式方法（splice 而非赋值）
2. 确认订阅已注册（autoSubscribeTables 在 __init__ 之前）
3. 检查 dataKey 路径是否正确

### Q2: 如何创建新的自定义上下文？

A: 在 pagedata.json 中初始化：
```json
{
  "dataset": {
    "tables": {
      "Users": {
        "rows": [],
        "contexts": {
          "myContext": {
            "rows": [],
            "currentRow": null
          }
        }
      }
    }
  }
}
```

### Q3: _originalRows 什么时候被填充？

A: 第一次调用 `requestTableData()` 时自动缓存：
```javascript
// Kernel 自动处理
table._originalRows = [...loadedData]  // 缓存完整数据
table.rows = loadedData                // 初始视图数据
```

## 8. 参考资料

- [DataSet 架构文档](./README_ARCHITECTURE.md)
- [BindingContext 设计](./PageData-Flow.md)
- [类型定义](../../src/types/pageData.ts)
- [DynamicPage 实现](../../src/views/DynamicPage.vue)

