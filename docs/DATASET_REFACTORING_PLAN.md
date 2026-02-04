# DataSet 重构方案

> **制定时间**: 2026-02-04  
> **基于**: [DATASET_DESIGN_ANALYSIS.md](./DATASET_DESIGN_ANALYSIS.md)  
> **目标**: 解决设计问题、提升性能、完善文档

---

## 一、重构目标

### 1.1 核心目标

- ✅ **代码质量提升**：统一命名规范、消除循环依赖风险
- ✅ **性能优化**：批量操作、表达式缓存、大数据量支持
- ✅ **可维护性增强**：订阅管理解耦、错误处理完善
- ✅ **文档完善**：API 文档、最佳实践、迁移指南

### 1.2 非目标（暂不处理）

- ❌ 重写整个架构（现有设计良好）
- ❌ 破坏现有 API（保持向后兼容）
- ❌ 引入新的外部依赖（保持轻量）

---

## 二、重构优先级

### P0（立即执行，1-2 天）

**影响**: 高  
**风险**: 低  
**必要性**: 代码规范、类型安全

| 任务 | 工作量 | 风险 |
|------|--------|------|
| [P0.1] 修复私有字段命名规范 | 2h | 低 |
| [P0.2] 添加 JSDoc 完整注释 | 3h | 低 |
| [P0.3] 修复 TypeScript 类型警告 | 1h | 低 |

### P1（短期，1-2 周）

**影响**: 中高  
**风险**: 中  
**必要性**: 性能优化、功能增强

| 任务 | 工作量 | 风险 |
|------|--------|------|
| [P1.1] 实现批量操作 API | 1d | 中 |
| [P1.2] 引入 SubscriptionManager | 2d | 中 |
| [P1.3] 过滤表达式缓存优化 | 1d | 低 |
| [P1.4] 补充集成测试 | 2d | 低 |
| [P1.5] 添加错误处理机制 | 1d | 中 |

### P2（中期，1-2 月）

**影响**: 中  
**风险**: 中高  
**必要性**: 可维护性、开发体验

| 任务 | 工作量 | 风险 |
|------|--------|------|
| [P2.1] 循环依赖重构（中介者模式） | 3d | 高 |
| [P2.2] 虚拟滚动集成方案 | 3d | 中 |
| [P2.3] 性能测试套件 | 2d | 低 |
| [P2.4] 数据流可视化工具 | 3d | 中 |
| [P2.5] 完善文档（迁移指南、最佳实践） | 2d | 低 |

### P3（长期，3+ 月）

**影响**: 低中  
**风险**: 高  
**必要性**: 高级特性、边缘优化

| 任务 | 工作量 | 风险 |
|------|--------|------|
| [P3.1] 表达式编译器（WebAssembly） | 1w | 高 |
| [P3.2] 离线编辑/事务支持 | 1w | 高 |
| [P3.3] 时间旅行调试 | 1w | 中 |

---

## 三、详细任务规划

---

## P0 任务：代码规范（立即执行）

### [P0.1] 修复私有字段命名规范

#### 问题描述

当前使用单下划线 `_` 表示私有字段，不符合 TypeScript 最佳实践：

```typescript
// ❌ 当前（容易误用）
class BindingContext {
  _originalRows?: DataRow[]
  _hostTable: string
  _contextId: string
}
```

#### 解决方案

使用 TypeScript `private` 关键字 + 双下划线（内部访问时）：

```typescript
// ✅ 改进
class BindingContext {
  private __originalRows?: DataRow[]
  private __hostTable: string
  private __contextId: string
  
  // 提供只读访问器（如果需要）
  get hostTable(): string { return this.__hostTable }
  get contextId(): string { return this.__contextId }
}
```

#### 影响的文件

- `packages/spark-data/src/bindingContext.ts`
- `packages/spark-data/src/bindingContext.js`
- `packages/spark-data/src/dataTable.ts`
- `packages/spark-data/src/types.ts` (接口定义)

#### 迁移策略

```typescript
// 阶段 1：添加 getter（保持向后兼容）
class BindingContext {
  private __originalRows?: DataRow[]
  
  // 废弃警告
  /** @deprecated 使用 getOriginalRows() 代替 */
  get _originalRows() { return this.__originalRows }
}

// 阶段 2：几个版本后移除 getter
```

#### 工作量

- 代码修改：2h
- 测试验证：1h
- **总计**: 3h

---

### [P0.2] 添加 JSDoc 完整注释

#### 问题描述

部分方法缺少 JSDoc 注释，影响开发体验：

```typescript
// ❌ 无注释
setCurrentRow(row: DataRow | null, skipNotify: boolean = false): void {
  // ...
}
```

#### 解决方案

为所有公共 API 添加完整 JSDoc：

```typescript
/**
 * 设置当前选中行
 * 
 * @param row - 要选中的行数据，传入 null 则取消选中
 * @param skipNotify - 是否跳过 UI 更新通知（默认 false）
 *   - true: 不更新当前表格 UI，但仍会触发关联表更新
 *   - false: 触发完整的更新流程
 * 
 * @example
 * ```typescript
 * // 选中第一行并触发级联
 * context.setCurrentRow(rows[0])
 * 
 * // 取消选中
 * context.setCurrentRow(null)
 * 
 * // 内部同步（不触发 UI 更新）
 * context.setCurrentRow(row, true)
 * ```
 * 
 * @fires DataSet#contextChange - 触发上下文变化事件
 */
setCurrentRow(row: DataRow | null, skipNotify: boolean = false): void {
  // ...
}
```

#### 影响的文件

- `packages/spark-data/src/bindingContext.ts`
- `packages/spark-data/src/dataTable.ts`
- `packages/spark-data/src/dataset-impl.ts`

#### 工作量

- BindingContext: 1h
- DataTable: 0.5h
- DataSet: 1.5h
- **总计**: 3h

---

### [P0.3] 修复 TypeScript 类型警告

#### 问题描述

部分代码存在 `any` 类型：

```typescript
// bindRules.ts 中
let value: any = pageData
for (const key of keys) {
  value = value?.[key]  // ⚠️ any 类型
}
```

#### 解决方案

使用类型守卫和泛型：

```typescript
function getNestedValue<T = unknown>(
  obj: Record<string, unknown>,
  path: string[]
): T | undefined {
  let value: unknown = obj
  for (const key of path) {
    if (value && typeof value === 'object' && key in value) {
      value = (value as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }
  return value as T
}

// 使用
const rows = getNestedValue<DataRow[]>(pageData, keys)
```

#### 工作量

- 修复类型警告：1h
- **总计**: 1h

---

## P1 任务：性能与功能（1-2 周）

### [P1.1] 实现批量操作 API

#### 问题描述

当前逐行操作，每次都触发通知，批量导入性能差：

```typescript
// ❌ 低效
for (const row of 10000) {
  dataSet.addRow('Users', row)  // 触发 10000 次通知！
}
```

#### 解决方案

新增批量 API + 批处理模式：

```typescript
// 方案 1：批量方法
class DataSet {
  /**
   * 批量添加数据行
   * @param tableName - 表名
   * @param rows - 行数据数组
   * @returns 成功添加的行数
   */
  addRows(tableName: string, rows: DataRow[]): number {
    const table = this.getTable(tableName)
    if (!table) return 0
    
    table.rows.push(...rows)
    
    // 同步默认上下文缓存
    if (table.__originalRows) {
      table.__originalRows.push(...rows)
    }
    
    // 一次性通知
    this.notifyContextChange(tableName, 'default', table)
    
    return rows.length
  }
  
  /**
   * 批量更新数据行
   * @param tableName - 表名
   * @param updates - 更新数组 [{rowIndex, row}]
   */
  updateRows(tableName: string, updates: Array<{rowIndex: number, row: DataRow}>): boolean {
    const table = this.getTable(tableName)
    if (!table) return false
    
    for (const {rowIndex, row} of updates) {
      if (rowIndex >= 0 && rowIndex < table.rows.length) {
        Object.assign(table.rows[rowIndex], row)
        
        // 同步缓存
        if (table.__originalRows && table.__originalRows[rowIndex]) {
          Object.assign(table.__originalRows[rowIndex], row)
        }
      }
    }
    
    // 一次性通知
    this.notifyContextChange(tableName, 'default', table)
    
    return true
  }
  
  /**
   * 批量删除数据行
   * @param tableName - 表名
   * @param rowIndexes - 行索引数组（从大到小排序）
   */
  deleteRows(tableName: string, rowIndexes: number[]): boolean {
    const table = this.getTable(tableName)
    if (!table) return false
    
    // 从大到小删除（避免索引错位）
    const sorted = [...rowIndexes].sort((a, b) => b - a)
    
    for (const index of sorted) {
      if (index >= 0 && index < table.rows.length) {
        table.rows.splice(index, 1)
        
        // 同步缓存
        if (table.__originalRows) {
          table.__originalRows.splice(index, 1)
        }
      }
    }
    
    // 一次性通知
    this.notifyContextChange(tableName, 'default', table)
    
    return true
  }
}

// 方案 2：批处理模式
class DataSet {
  private __batchMode: boolean = false
  private __pendingNotifications: Set<string> = new Set()
  
  /**
   * 开始批处理模式（暂停通知）
   */
  beginBatch(): void {
    this.__batchMode = true
    this.__pendingNotifications.clear()
  }
  
  /**
   * 结束批处理模式（一次性触发所有通知）
   */
  endBatch(): void {
    this.__batchMode = false
    
    // 触发所有待处理的通知
    for (const key of this.__pendingNotifications) {
      const [tableName, contextId] = key.split('.')
      const context = this.getContext(tableName, contextId)
      if (context) {
        this.notifyContextChange(tableName, contextId, context)
      }
    }
    
    this.__pendingNotifications.clear()
  }
  
  // 修改 notifyContextChange
  notifyContextChange(tableName: string, contextId: string, data: any): void {
    if (this.__batchMode) {
      // 记录待通知的上下文
      this.__pendingNotifications.add(`${tableName}.${contextId}`)
      return
    }
    
    // 原有逻辑
    // ...
  }
}

// 使用示例
dataSet.beginBatch()
try {
  for (const row of 10000) {
    dataSet.addRow('Users', row)  // 暂不通知
  }
} finally {
  dataSet.endBatch()  // 一次性通知
}

// 或使用批量方法
dataSet.addRows('Users', rows)  // 直接批量添加
```

#### 实施步骤

1. 在 `DataSet` 类添加批量方法
2. 实现批处理模式（beginBatch/endBatch）
3. 添加单元测试（性能对比）
4. 更新文档和示例

#### 工作量

- 代码实现：4h
- 单元测试：2h
- 文档更新：1h
- **总计**: 1d

---

### [P1.2] 引入 SubscriptionManager

#### 问题描述

当前订阅管理耦合在 DataSet 中，复杂度高：

```typescript
// ❌ 复杂的订阅管理
class DataSet {
  private contextSubscribers: Map<string, Array<{...}>>
  
  subscribeToContext(...) { /* 复杂逻辑 */ }
  notifyContextChange(...) { /* 遍历 Map */ }
}
```

#### 解决方案

提取专门的 SubscriptionManager：

```typescript
/**
 * 订阅管理器 - 解耦订阅逻辑
 */
export class SubscriptionManager {
  private subscriptions: Map<string, Subscription[]> = new Map()
  private subscriptionId = 0
  
  /**
   * 订阅上下文变化
   * @returns 订阅 ID（用于取消订阅）
   */
  subscribe(
    source: { table: string, context: string },
    listener: { table: string, context: string },
    callback: (data: any) => void
  ): number {
    const key = `${source.table}.${source.context}`
    
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, [])
    }
    
    const id = ++this.subscriptionId
    
    this.subscriptions.get(key)!.push({
      id,
      listenerTable: listener.table,
      listenerContext: listener.context,
      callback
    })
    
    console.info(`📡 [Subscription] ${listener.table}.${listener.context} ← ${source.table}.${source.context}`)
    
    return id
  }
  
  /**
   * 取消订阅
   */
  unsubscribe(id: number): boolean {
    for (const [key, subs] of this.subscriptions.entries()) {
      const index = subs.findIndex(s => s.id === id)
      if (index !== -1) {
        const sub = subs[index]
        subs.splice(index, 1)
        console.info(`🔌 [Unsubscribe] ${sub.listenerTable}.${sub.listenerContext}`)
        
        // 清理空列表
        if (subs.length === 0) {
          this.subscriptions.delete(key)
        }
        
        return true
      }
    }
    return false
  }
  
  /**
   * 取消某个上下文的所有订阅
   */
  unsubscribeAll(table: string, context: string): number {
    let count = 0
    
    for (const [key, subs] of this.subscriptions.entries()) {
      const filtered = subs.filter(s => 
        s.listenerTable !== table || s.listenerContext !== context
      )
      
      count += subs.length - filtered.length
      
      if (filtered.length === 0) {
        this.subscriptions.delete(key)
      } else {
        this.subscriptions.set(key, filtered)
      }
    }
    
    if (count > 0) {
      console.info(`🔌 [UnsubscribeAll] ${table}.${context} (${count} subscriptions)`)
    }
    
    return count
  }
  
  /**
   * 通知订阅者
   */
  notify(table: string, context: string, data: any): void {
    const key = `${table}.${context}`
    const subs = this.subscriptions.get(key)
    
    if (!subs || subs.length === 0) return
    
    console.info(`📢 [Notify] ${table}.${context} → ${subs.length} subscribers`)
    
    for (const sub of subs) {
      try {
        sub.callback(data)
      } catch (error) {
        console.error(`❌ [Subscription Error] ${sub.listenerTable}.${sub.listenerContext}:`, error)
      }
    }
  }
  
  /**
   * 获取订阅关系（调试用）
   */
  getSubscriptions(): Map<string, Subscription[]> {
    return new Map(this.subscriptions)
  }
  
  /**
   * 清空所有订阅
   */
  clear(): void {
    this.subscriptions.clear()
    console.info('🧹 [Clear] All subscriptions cleared')
  }
}

interface Subscription {
  id: number
  listenerTable: string
  listenerContext: string
  callback: (data: any) => void
}

// 集成到 DataSet
class DataSet {
  private subscriptionManager = new SubscriptionManager()
  
  subscribeToContext(
    listenerTable: string,
    listenerContextId: string,
    sourceTable: string,
    sourceContextId: string,
    callback: (data: any) => void
  ): number {
    return this.subscriptionManager.subscribe(
      { table: sourceTable, context: sourceContextId },
      { table: listenerTable, context: listenerContextId },
      callback
    )
  }
  
  notifyContextChange(tableName: string, contextId: string, data: any): void {
    this.subscriptionManager.notify(tableName, contextId, data)
  }
  
  // 组件卸载时调用
  destroyContext(tableName: string, contextId: string): void {
    this.subscriptionManager.unsubscribeAll(tableName, contextId)
  }
}
```

#### 优势

1. **解耦**：订阅逻辑独立，DataSet 更简洁
2. **可测试**：SubscriptionManager 可单独测试
3. **自动清理**：组件卸载时自动取消订阅
4. **调试友好**：订阅关系可视化

#### 实施步骤

1. 创建 `SubscriptionManager` 类
2. 重构 DataSet 使用新管理器
3. 添加单元测试
4. 集成到 Renderer（自动清理）

#### 工作量

- SubscriptionManager 实现：4h
- DataSet 重构：3h
- 单元测试：3h
- Renderer 集成：2h
- **总计**: 2d

---

### [P1.3] 过滤表达式缓存优化

#### 问题描述

每次过滤都重新解析表达式，性能开销大：

```typescript
// ❌ 每次都解析
updateRows(sourceData: DataRow[]): void {
  if (this.filterExpression) {
    const parser = new FilterExpressionParser()
    this.rows = parser.evaluate(sourceData, this.filterExpression).filtered
  }
}
```

#### 解决方案

缓存编译后的过滤函数：

```typescript
class BindingContext {
  private __filterFunction?: (row: DataRow) => boolean
  private __sortFunction?: (a: DataRow, b: DataRow) => number
  
  /**
   * 设置过滤表达式（自动编译缓存）
   */
  setFilterExpression(expr: FilterExpression | undefined): void {
    this.filterExpression = expr
    
    if (expr) {
      // 编译为函数并缓存
      const parser = new FilterExpressionParser()
      this.__filterFunction = parser.compile(expr)
    } else {
      this.__filterFunction = undefined
    }
  }
  
  /**
   * 更新数据（使用缓存的函数）
   */
  updateRows(sourceData: DataRow[]): void {
    let filtered = sourceData
    
    // 使用缓存的过滤函数
    if (this.__filterFunction) {
      filtered = sourceData.filter(this.__filterFunction)
    }
    
    // 排序
    if (this.__sortFunction) {
      filtered = [...filtered].sort(this.__sortFunction)
    }
    
    this.rows.splice(0, this.rows.length, ...filtered)
  }
}

// FilterExpressionParser 新增 compile 方法
class FilterExpressionParser {
  /**
   * 编译表达式为纯函数（性能优化）
   */
  compile(expr: FilterExpression): (row: DataRow) => boolean {
    if ('field' in expr) {
      // 单一条件
      return (row: DataRow) => {
        const value = row[expr.field]
        return this.compare(value, expr.operator, expr.value)
      }
    }
    
    if ('and' in expr) {
      // 逻辑 AND
      const funcs = expr.and.map(e => this.compile(e))
      return (row: DataRow) => funcs.every(f => f(row))
    }
    
    if ('or' in expr) {
      // 逻辑 OR
      const funcs = expr.or.map(e => this.compile(e))
      return (row: DataRow) => funcs.some(f => f(row))
    }
    
    if ('not' in expr) {
      // 逻辑 NOT
      const func = this.compile(expr.not)
      return (row: DataRow) => !func(row)
    }
    
    return () => true
  }
}
```

#### 性能提升

- **前**: 1000 行 * 10 次过滤 = 10000 次解析
- **后**: 1 次编译 + 10000 次函数调用 = **10x 性能提升**

#### 实施步骤

1. 在 `FilterExpressionParser` 添加 `compile` 方法
2. 在 `BindingContext` 添加缓存机制
3. 添加性能基准测试
4. 更新文档

#### 工作量

- 代码实现：4h
- 性能测试：2h
- 文档更新：1h
- **总计**: 1d

---

### [P1.4] 补充集成测试

#### 问题描述

当前主要是单元测试，缺少端到端场景测试。

#### 解决方案

添加主从表级联、多上下文等场景测试：

```typescript
describe('DataSet Integration Tests', () => {
  describe('Master-Detail Cascade', () => {
    it('should filter child table when parent row changes', async () => {
      // 创建 DataSet
      const dataSet = SparkData.createDataSet({
        dataSetName: 'MasterDetail',
        tables: {
          Users: {
            tableName: 'Users',
            columns: [
              { name: 'id', type: 'number' },
              { name: 'name', type: 'string' }
            ],
            rows: [
              { id: 1, name: 'Alice' },
              { id: 2, name: 'Bob' }
            ]
          },
          Orders: {
            tableName: 'Orders',
            columns: [
              { name: 'id', type: 'number' },
              { name: 'userId', type: 'number' },
              { name: 'product', type: 'string' }
            ],
            rows: [
              { id: 101, userId: 1, product: 'Laptop' },
              { id: 102, userId: 1, product: 'Mouse' },
              { id: 103, userId: 2, product: 'Keyboard' }
            ],
            contexts: {
              default: {
                filterExpression: {
                  dependency: {
                    sourceTable: 'Users',
                    sourceContext: 'default',
                    type: 'currentRow'
                  },
                  field: 'userId',
                  operator: '==',
                  valuePath: 'id'
                }
              }
            }
          }
        }
      })
      
      // 建立订阅
      const ordersTable = dataSet.getTable('Orders')!
      const usersTable = dataSet.getTable('Users')!
      
      dataSet.subscribeToContext(
        'Orders', 'default',
        'Users', 'default',
        () => {
          dataSet.updateContextRows(ordersTable, ordersTable)
        }
      )
      
      // 初始状态：无选中
      expect(ordersTable.rows).toHaveLength(3)
      
      // 选中 Alice (userId=1)
      usersTable.setCurrentRow({ id: 1, name: 'Alice' })
      
      // 等待级联更新
      await nextTick()
      
      // 断言：只显示 Alice 的订单
      expect(ordersTable.rows).toHaveLength(2)
      expect(ordersTable.rows.every(r => r.userId === 1)).toBe(true)
      
      // 选中 Bob (userId=2)
      usersTable.setCurrentRow({ id: 2, name: 'Bob' })
      
      await nextTick()
      
      // 断言：只显示 Bob 的订单
      expect(ordersTable.rows).toHaveLength(1)
      expect(ordersTable.rows[0].product).toBe('Keyboard')
    })
  })
  
  describe('Multi-Context Isolation', () => {
    it('should maintain independent selections in different contexts', () => {
      const dataSet = SparkData.createDataSet({
        dataSetName: 'MultiContext',
        tables: {
          Products: {
            tableName: 'Products',
            rows: [
              { id: 1, name: 'A' },
              { id: 2, name: 'B' },
              { id: 3, name: 'C' }
            ],
            contexts: {
              detail: {}
            }
          }
        }
      })
      
      const table = dataSet.getTable('Products')!
      const detailContext = table.contexts.detail
      
      // 默认上下文选中第一行
      table.setCurrentRow(table.rows[0])
      
      // 详情上下文选中第二行
      detailContext.setCurrentRow(table.rows[1])
      
      // 断言：两个上下文各自独立
      expect(table.currentRow?.id).toBe(1)
      expect(detailContext.currentRow?.id).toBe(2)
    })
  })
  
  describe('Batch Operations', () => {
    it('should perform batch insert efficiently', () => {
      const dataSet = SparkData.createDataSet({
        dataSetName: 'Batch',
        tables: {
          Users: {
            tableName: 'Users',
            rows: []
          }
        }
      })
      
      // 批量添加 10000 行
      const rows = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        name: `User${i}`
      }))
      
      const start = performance.now()
      dataSet.addRows('Users', rows)
      const elapsed = performance.now() - start
      
      // 断言：性能要求 < 100ms
      expect(elapsed).toBeLessThan(100)
      expect(dataSet.getTable('Users')!.rows).toHaveLength(10000)
    })
  })
})
```

#### 实施步骤

1. 创建 `tests/integration/` 目录
2. 编写主从表级联测试
3. 编写多上下文测试
4. 编写批量操作性能测试

#### 工作量

- 测试用例编写：1d
- 测试基础设施：0.5d
- **总计**: 2d

---

### [P1.5] 添加错误处理机制

#### 问题描述

当前缺少统一的错误处理：

```typescript
// ❌ 无错误处理
loadTableData(tableName: string): Promise<void> {
  const rows = await this.dataLoader(tableName)
  table.rows = rows
}
```

#### 解决方案

统一的错误处理机制：

```typescript
/**
 * 数据加载错误
 */
export class DataLoadError extends Error {
  constructor(
    public tableName: string,
    public cause: Error
  ) {
    super(`Failed to load data for table "${tableName}": ${cause.message}`)
    this.name = 'DataLoadError'
  }
}

/**
 * 过滤表达式错误
 */
export class FilterExpressionError extends Error {
  constructor(
    public expression: FilterExpression,
    public cause: Error
  ) {
    super(`Invalid filter expression: ${cause.message}`)
    this.name = 'FilterExpressionError'
  }
}

class DataSet {
  private async loadTableData(tableName: string): Promise<void> {
    const table = this.getTable(tableName)
    if (!table) return
    
    try {
      table.loading = true
      table.error = undefined
      
      const rows = await this.dataLoader!(tableName)
      
      table.rows.splice(0, table.rows.length, ...rows)
      table.__originalRows = [...rows]
      
      console.info(`✅ 数据加载成功: ${tableName}，共 ${rows.length} 行`)
      
    } catch (error) {
      const err = new DataLoadError(tableName, error as Error)
      
      table.error = err.message
      console.error(`❌ [DataSet] ${err.message}`, error)
      
      // 触发错误事件
      this.dispatchEvent('error', { tableName, error: err })
      
      throw err
      
    } finally {
      table.loading = false
      this.loadingTables.delete(tableName)
    }
  }
}

class BindingContext {
  updateRows(sourceData: DataRow[]): void {
    try {
      let filtered = sourceData
      
      if (this.__filterFunction) {
        filtered = sourceData.filter(this.__filterFunction)
      }
      
      if (this.__sortFunction) {
        filtered = [...filtered].sort(this.__sortFunction)
      }
      
      this.rows.splice(0, this.rows.length, ...filtered)
      
    } catch (error) {
      const err = new FilterExpressionError(this.filterExpression!, error as Error)
      console.error(`❌ [Filter] ${err.message}`, error)
      
      // 回退到原始数据
      this.rows.splice(0, this.rows.length, ...sourceData)
      
      throw err
    }
  }
}
```

#### UI 集成

```typescript
// Renderer 层捕获错误
dataSet.addEventListener('error', ({ tableName, error }) => {
  // 显示错误提示
  ElMessage.error(`加载 ${tableName} 失败：${error.message}`)
})
```

#### 实施步骤

1. 定义错误类型（DataLoadError 等）
2. 在关键方法添加 try-catch
3. 添加错误事件机制
4. 更新文档（错误处理指南）

#### 工作量

- 代码实现：4h
- 文档更新：2h
- **总计**: 1d

---

## P2 任务：可维护性（1-2 月）

### [P2.1] 循环依赖重构（中介者模式）

#### 问题描述

存在循环依赖：BindingContext ↔ DataSet ↔ DataTable

#### 解决方案（待详细设计）

引入中介者模式，解耦 BindingContext 和 DataSet：

```typescript
/**
 * 上下文中介者（解耦通知机制）
 */
interface IContextMediator {
  notifyChange(table: string, context: string, data: any): void
  requestData(table: string): Promise<void>
}

class BindingContext {
  private mediator?: IContextMediator
  
  setMediator(mediator: IContextMediator): void {
    this.mediator = mediator
  }
  
  setCurrentRow(row: DataRow | null, skipNotify: boolean = false): void {
    this.currentRow = row
    
    if (!skipNotify && this.mediator) {
      this.mediator.notifyChange(this.__hostTable, this.__contextId, this)
    }
  }
}

class DataSet implements IContextMediator {
  notifyChange(table: string, context: string, data: any): void {
    this.subscriptionManager.notify(table, context, data)
  }
  
  async requestData(table: string): Promise<void> {
    await this.loadTableData(table)
  }
}
```

#### 工作量（待评估）

- 设计方案：1d
- 代码重构：2d
- 测试验证：1d
- **总计**: 3d

---

### [P2.2] 虚拟滚动集成方案

#### 目标

支持大数据量（100k+ 行）场景。

#### 方案（待研究）

1. 与 el-table-v2（虚拟滚动表格）集成
2. 按需加载数据（分页/懒加载）
3. 内存优化（只保留可见行）

#### 工作量（待评估）

- 方案设计：1d
- 代码实现：2d
- 性能测试：1d
- **总计**: 3d

---

## 四、测试策略

### 4.1 单元测试

**目标覆盖率**: 90%+

| 模块 | 当前覆盖率 | 目标覆盖率 |
|------|-----------|----------|
| BindingContext | 70% | 90% |
| DataTable | 60% | 90% |
| DataSet | 65% | 90% |
| FilterExpressionParser | 80% | 95% |
| SubscriptionManager | 0% | 95% |

### 4.2 集成测试

**关键场景**:

- ✅ 主从表级联
- ✅ 多上下文隔离
- ✅ 批量操作
- ✅ 错误处理

### 4.3 性能测试

**基准测试**:

```typescript
describe('Performance Benchmarks', () => {
  it('should handle 10k rows filtering in <50ms', () => {
    // ...
  })
  
  it('should handle 100k rows batch insert in <500ms', () => {
    // ...
  })
  
  it('should maintain <100MB memory for 50k rows', () => {
    // ...
  })
})
```

---

## 五、风险评估

### 5.1 技术风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 重构破坏现有功能 | 中 | 高 | 完善测试覆盖、渐进式重构 |
| 性能优化效果不明显 | 低 | 中 | 先做基准测试、小范围试验 |
| 循环依赖重构复杂 | 高 | 中 | 延后到 P2、充分设计 |

### 5.2 兼容性风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 破坏向后兼容 | 低 | 高 | 保留废弃 API、提供迁移指南 |
| 类型定义变更 | 中 | 中 | 使用版本号、changelog 记录 |

---

## 六、实施计划

### 第一周（P0 任务）

| 任务 | 负责人 | 状态 |
|------|--------|------|
| [P0.1] 修复私有字段命名 | TBD | 待开始 |
| [P0.2] 添加 JSDoc 注释 | TBD | 待开始 |
| [P0.3] 修复类型警告 | TBD | 待开始 |

### 第二周（P1 任务 - 批量操作）

| 任务 | 负责人 | 状态 |
|------|--------|------|
| [P1.1] 实现批量操作 API | TBD | 待开始 |
| [P1.3] 过滤表达式缓存 | TBD | 待开始 |

### 第三周（P1 任务 - 订阅管理）

| 任务 | 负责人 | 状态 |
|------|--------|------|
| [P1.2] 引入 SubscriptionManager | TBD | 待开始 |
| [P1.5] 错误处理机制 | TBD | 待开始 |

### 第四周（P1 任务 - 测试）

| 任务 | 负责人 | 状态 |
|------|--------|------|
| [P1.4] 补充集成测试 | TBD | 待开始 |
| 性能基准测试 | TBD | 待开始 |

---

## 七、成功标准

### 7.1 代码质量

- ✅ TypeScript 零警告
- ✅ ESLint 零错误
- ✅ 测试覆盖率 > 90%
- ✅ 所有公共 API 有 JSDoc

### 7.2 性能指标

- ✅ 10k 行过滤 < 50ms
- ✅ 100k 行批量插入 < 500ms
- ✅ 50k 行内存占用 < 100MB

### 7.3 文档完善

- ✅ API 文档完整
- ✅ 错误处理指南
- ✅ 性能调优指南
- ✅ 迁移指南

---

## 八、后续工作

### P3 任务（长期）

- [ ] WebAssembly 表达式编译器
- [ ] 离线编辑/事务支持
- [ ] 时间旅行调试
- [ ] 可视化调试工具

---

**制定完成时间**: 2026-02-04  
**预计总工时**: P0(1d) + P1(7d) + P2(11d) = **约 3-4 周**  
**下一步**: 开始 P0 任务执行
