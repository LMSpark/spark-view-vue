# DataSet 排序功能使用指南

## 概述

每个 BindingContext（包括 DataTable 本身和自定义上下文）都可以配置独立的排序规则。排序在过滤之后执行，数据处理流程为：

```
原始数据 → 过滤 → 排序 → 分页 → 显示
```

## 类型定义

```typescript
type SortDirection = 'asc' | 'desc' | 'ASC' | 'DESC'

type SortExpression =
  // 单字段排序
  | {
      field: string           // 字段名
      direction: SortDirection // 排序方向
    }
  // 多字段排序
  | {
      fields: Array<{
        field: string
        direction: SortDirection
      }>
    }
```

## 使用示例

### 1. 单字段排序

在 `pagedata.json` 中配置上下文的初始排序：

```json
{
  "dataset": {
    "tables": {
      "Users": {
        "tableName": "Users",
        "columns": [...],
        "rows": [...],
        "sortExpression": {
          "field": "name",
          "direction": "asc"
        }
      }
    }
  }
}
```

### 2. 多字段排序

先按优先级排序，优先级相同则按创建时间排序：

```json
{
  "sortExpression": {
    "fields": [
      { "field": "priority", "direction": "desc" },
      { "field": "createTime", "direction": "asc" }
    ]
  }
}
```

### 3. 自定义上下文排序

为同一表的不同上下文配置不同排序规则：

```json
{
  "dataset": {
    "tables": {
      "Products": {
        "tableName": "Products",
        "columns": [...],
        "rows": [...],
        "sortExpression": {
          "field": "id",
          "direction": "asc"
        },
        "contexts": {
          "priceView": {
            "componentID": "priceView",
            "sortExpression": {
              "field": "price",
              "direction": "desc"
            }
          },
          "popularView": {
            "componentID": "popularView",
            "sortExpression": {
              "field": "sales",
              "direction": "desc"
            }
          }
        }
      }
    }
  }
}
```

### 4. 结合过滤和排序

```json
{
  "contexts": {
    "activeUsers": {
      "componentID": "activeUsers",
      "filterExpression": {
        "field": "status",
        "op": "==",
        "value": "active"
      },
      "sortExpression": {
        "fields": [
          { "field": "lastLogin", "direction": "desc" },
          { "field": "name", "direction": "asc" }
        ]
      }
    }
  }
}
```

## 排序规则

### 1. 数据类型处理

- **数值**：直接数值比较
- **字符串**：使用 `localeCompare('zh-CN')` 支持中文排序
- **null/undefined**：
  - 升序排序时：null 排在最后
  - 降序排序时：null 排在最前

### 2. 多字段排序逻辑

按照 `fields` 数组的顺序逐个比较：
1. 比较第一个字段，如果不相等则返回结果
2. 如果相等，继续比较第二个字段
3. 依此类推，直到找到不相等的字段或所有字段都相等

### 3. 性能考虑

- 排序在内存中执行，适合中小数据集（< 10,000 行）
- 大数据集建议：
  - 服务端排序（通过 API 的 sortParam）
  - 结合分页减少排序数据量

## 运行时动态排序

### 方法 1：更新上下文配置（推荐）

```javascript
// 沙箱注入的全局变量: $dataSet, $data, $rebindRules

export function handleSortByPrice() {
  const dataSet = $dataSet();
  const table = dataSet.getTable('Products');
  
  // 更新默认上下文的排序
  table.sortExpression = {
    field: 'price',
    direction: 'desc'
  };
  
  // 重新处理数据（过滤 + 排序）
  dataSet.refreshContext('Products', 'default');
}

export function handleSortByMultipleFields() {
  const dataSet = $dataSet();
  const context = dataSet.getContext('Products', 'priceView');
  
  // 更新自定义上下文的排序
  context.sortExpression = {
    fields: [
      { field: 'category', direction: 'asc' },
      { field: 'price', direction: 'desc' }
    ]
  };
  
  dataSet.refreshContext('Products', 'priceView');
}
```

### 方法 2：直接排序（适合临时排序）

```javascript
export function handleQuickSort() {
  const dataSet = $dataSet();
  const table = dataSet.getTable('Products');
  
  // 直接对 rows 排序（不修改 sortExpression）
  table.rows.sort((a, b) => b.price - a.price);
  
  // 通知 UI 更新
  table.notifyChange();
}
```

## UI 集成示例

### Element Plus Table 排序

```json
{
  "type": "el-table",
  "dataKey": "dataset.tables.Products.rows",
  "props": {
    "defaultSort": {
      "prop": "price",
      "order": "descending"
    }
  },
  "on": {
    "sortChange": "handleTableSort"
  },
  "children": [
    {
      "type": "el-table-column",
      "props": {
        "prop": "name",
        "label": "产品名称",
        "sortable": "custom"
      }
    },
    {
      "type": "el-table-column",
      "props": {
        "prop": "price",
        "label": "价格",
        "sortable": "custom"
      }
    }
  ]
}
```

```javascript
// script.js
export function handleTableSort({ prop, order }) {
  const dataSet = $dataSet();
  const table = dataSet.getTable('Products');
  
  if (!order) {
    // 取消排序
    delete table.sortExpression;
  } else {
    // 应用排序
    table.sortExpression = {
      field: prop,
      direction: order === 'ascending' ? 'asc' : 'desc'
    };
  }
  
  dataSet.refreshContext('Products', 'default');
}
```

## 最佳实践

### 1. 初始排序配置
- ✅ 在 `pagedata.json` 中配置默认排序
- ✅ 为常用视图预设排序规则
- ❌ 不要在 `rule.json` 中配置排序（属于数据层）

### 2. 多上下文场景
- ✅ 每个上下文可以有独立的排序规则
- ✅ 主表和详情表可以使用不同排序
- ✅ 利用多上下文实现"多种排序视图"

### 3. 性能优化
- ✅ 结合过滤减少排序数据量
- ✅ 避免频繁重新排序（使用防抖）
- ✅ 大数据集优先考虑服务端排序

### 4. 用户体验
- ✅ 排序时显示加载状态
- ✅ 保存用户的排序偏好（localStorage）
- ✅ 提供"恢复默认排序"功能

## 注意事项

1. **排序时机**：排序在过滤之后、分页之前执行
2. **数据不变性**：排序不会修改 `_originalRows`，始终基于过滤后的结果
3. **Vue 响应式**：使用 `notifyChange()` 或 `refreshContext()` 触发 UI 更新
4. **类型安全**：TypeScript 会检查 SortExpression 的结构

## 相关文档

- [DataKey 路径系统](./DataKey-Paths.md)
- [过滤表达式指南](./Filter-Expression-Guide.md)
- [分页功能说明](./Pagination-Guide.md)

