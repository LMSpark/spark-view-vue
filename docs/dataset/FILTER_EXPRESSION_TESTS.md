# FilterExpression 解析器测试

本文件提供了 FilterExpression 解析器的测试用例和使用示例。

## 基础测试

### 1. 简单相等条件

```typescript
import { SparkData } from '@spark-view/spark-data'
// FilterExpressionParser 是静态工具类，使用命名空间访问
const sql = SparkData.FilterParser.toSQL(expression)
const query = SparkData.FilterParser.toMongoDB(expression)

const expression = {
  field: 'status',
  op: '==',
  value: 'active'
}

// 内存过滤
const rows = [
  { id: 1, status: 'active' },
  { id: 2, status: 'inactive' }
]
const filter = FilterExpressionParser.toMemoryFilter(expression)
console.log(rows.filter(filter)) // [{ id: 1, status: 'active' }]

// SQL
const { sql, params } = FilterExpressionParser.toSQL(expression)
console.log(sql)     // WHERE status = $1
console.log(params)  // ['active']

// MongoDB
const mongoQuery = FilterExpressionParser.toMongoDB(expression)
console.log(mongoQuery) // { status: 'active' }
```

### 2. 逻辑组合（AND）

```typescript
const expression = {
  type: 'and',
  children: [
    { field: 'age', op: '>=', value: 18 },
    { field: 'status', op: '==', value: 'active' }
  ]
}

// SQL: (age >= $1 AND status = $2)
// MongoDB: { $and: [{ age: { $gte: 18 }}, { status: 'active' }] }
```

### 3. 父表字段引用

```typescript
const expression = {
  field: 'userId',
  op: '==',
  value: {
    func: 'FIELD',
    args: ['id']
  }
}

const context = {
  parentRow: { id: 1, name: '张三' }
}

// 会解析为: userId == 1
```

## 完整示例

### 订单-订单明细关系

```typescript
const orderItemsFilter = {
  field: 'orderId',
  op: '==',
  value: {
    func: 'FIELD',
    args: ['id']
  }
}

// 当选中订单 { id: 101, orderNo: 'ORD001' } 时
const context = {
  parentRow: { id: 101, orderNo: 'ORD001' }
}

// 生成 SQL
const { sql } = FilterExpressionParser.toSQL(orderItemsFilter, context)
// WHERE orderId = $1
// params: [101]

// 生成 MongoDB
const mongoQuery = FilterExpressionParser.toMongoDB(orderItemsFilter, context)
// { orderId: 101 }

// 内存过滤
const allItems = [
  { id: 1, orderId: 101, product: 'A' },
  { id: 2, orderId: 102, product: 'B' },
  { id: 3, orderId: 101, product: 'C' }
]
const filter = FilterExpressionParser.toMemoryFilter(orderItemsFilter, context)
const filtered = allItems.filter(filter)
// [{ id: 1, orderId: 101, product: 'A' }, { id: 3, orderId: 101, product: 'C' }]
```

## 高级特性

### 1. IN 操作符

```typescript
const expression = {
  field: 'status',
  op: 'in',
  value: ['active', 'pending']
}

// SQL: status IN ($1)
// MongoDB: { status: { $in: ['active', 'pending'] } }
```

### 2. LIKE 操作符

```typescript
const expression = {
  field: 'name',
  op: 'like',
  value: '张'
}

// SQL: name LIKE $1
// MongoDB: { name: { $regex: '张', $options: 'i' } }
```

### 3. BETWEEN 操作符

```typescript
const expression = {
  field: 'age',
  op: 'between',
  value: [18, 60]
}

// SQL: age BETWEEN $1 AND $2
// MongoDB: { age: { $gte: 18, $lte: 60 } }
```

### 4. 条件取反

```typescript
const expression = {
  type: '!condition',
  field: 'status',
  op: '==',
  value: 'deleted'
}

// SQL: NOT (status = $1)
// MongoDB: { $not: { status: 'deleted' } }
```

### 5. 复杂嵌套

```typescript
const expression = {
  type: 'and',
  children: [
    { field: 'age', op: '>=', value: 18 },
    {
      type: 'or',
      children: [
        { field: 'status', op: '==', value: 'active' },
        { field: 'status', op: '==', value: 'pending' }
      ]
    }
  ]
}

// SQL: (age >= $1 AND (status = $2 OR status = $3))
// MongoDB: { $and: [{ age: { $gte: 18 }}, { $or: [{ status: 'active' }, { status: 'pending' }] }] }
```

## 实际应用场景

### 场景 1：用户权限过滤

```typescript
// 只显示当前用户的数据
const expression = {
  field: 'userId',
  op: '==',
  value: { func: 'CURRENT_USER', args: [] }
}

const context = {
  variables: { currentUser: 123 }
}
```

### 场景 2：日期范围查询

```typescript
const expression = {
  type: 'and',
  children: [
    { field: 'createdAt', op: '>=', value: '2024-01-01' },
    { field: 'createdAt', op: '<', value: '2024-02-01' }
  ]
}
```

### 场景 3：多条件搜索

```typescript
const searchExpression = {
  type: 'or',
  children: [
    { field: 'name', op: 'like', value: keyword },
    { field: 'email', op: 'like', value: keyword },
    { field: 'phone', op: 'like', value: keyword }
  ]
}
```

## 性能建议

1. **参数化查询**：始终使用参数化查询防止 SQL 注入
2. **索引优化**：为常用的过滤字段添加数据库索引
3. **缓存策略**：对不常变化的过滤结果进行缓存
4. **分页处理**：大数据集配合分页使用

## 错误处理

```typescript
try {
  const { sql, params } = FilterExpressionParser.toSQL(expression)
  // 使用 sql 和 params
} catch (error) {
  console.error('过滤表达式解析失败:', error)
  // 返回默认查询或提示用户
}
```

## 调试技巧

```typescript
// 1. 查看生成的 SQL
const { sql, params } = FilterExpressionParser.toSQL(expression)
console.log('SQL:', sql)
console.log('Params:', params)

// 2. 查看 MongoDB 查询
const mongoQuery = FilterExpressionParser.toMongoDB(expression)
console.log('MongoDB Query:', JSON.stringify(mongoQuery, null, 2))

// 3. 测试内存过滤
const testData = [/* 测试数据 */]
const filter = FilterExpressionParser.toMemoryFilter(expression, context)
const result = testData.filter(filter)
console.log('Filtered Result:', result)
```

