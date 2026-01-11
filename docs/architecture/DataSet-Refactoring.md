# DataSet 架构重构：从接口到领域模型

## 重构目标

将 DataSet 从纯数据接口改为领域模型类，实现**职责分离**和**关注点分离**。

## 架构对比

### 重构前（God Class 反模式）

```
DataSetManager (1000+ 行)
├── 数据访问 (getTable, getContext)
├── CRUD 操作 (addRow, updateRow, deleteRow)
├── 关系管理 (applyRelation)
├── 级联操作 (cascadeUpdate, cascadeDelete)
├── 依赖分析 (getTableDependencies)
├── 订阅管理 (subscribe, notifySubscribers)
├── 数据加载 (requestTableData)
└── 事件系统 (on, off, emit)
```

**问题**：
- ❌ 单一类承担过多职责（违反单一职责原则）
- ❌ 领域逻辑与基础设施混杂
- ❌ 难以测试和维护

### 重构后（职责分离）

```
DataSet 类 (369 行) - 领域模型
├── 数据表管理 (tables, relations)
├── CRUD 操作 (addRow, updateRow, deleteRow)
├── 级联操作 (cascadeUpdate, cascadeDelete)
├── 关系逻辑 (getParentRows, filterChildRows)
└── 序列化 (toJSON, fromJSON)

DataSetManager 类 (1028 行) - 管理器/协调器
├── 上下文管理 (getContext, ensureContext)
├── 订阅系统 (subscribe, notifySubscribers)
├── 数据加载 (requestTableData, dataLoader)
├── 事件系统 (on, off, emit)
├── 关系应用 (applyRelation, updateRelatedTables)
├── 过滤排序 (updateContextRows, applySorting)
└── 方法注入 (injectMethodsToContext)
```

**优势**：
- ✅ 清晰的职责划分
- ✅ DataSet 可独立测试（纯领域逻辑）
- ✅ DataSetManager 专注基础设施
- ✅ 符合单一职责原则

## 核心类职责

### DataSet（领域模型）

**职责**：管理数据表的增删改查和业务规则

```typescript
class DataSet {
  // 数据访问
  getTable(tableName: string): DataTable | undefined
  
  // CRUD 操作
  addRow(tableName: string, row: DataRow): boolean
  updateRow(tableName: string, rowIndex: number, row: DataRow): boolean
  deleteRow(tableName: string, rowIndex: number): boolean
  
  // 业务规则：级联操作
  cascadeUpdate(tableName: string, row: DataRow, oldValues?: DataRow): string[]
  cascadeDelete(tableName: string, row: DataRow): string[]
  
  // 辅助逻辑
  getParentRows(context: BindingContext, type: DependencyType): DataRow[]
  filterChildRows(childRows: DataRow[], expr: FilterExpression, ...): DataRow[]
  
  // 序列化
  toJSON(): string
  static fromJSON(json: string): DataSet
}
```

**特点**：
- 无副作用（只操作数据，不触发事件）
- 返回受影响的表名列表（供调用方决定如何通知）
- 可脱离 UI 独立运行和测试

### DataSetManager（基础设施/协调器）

**职责**：协调 DataSet 与 UI 层，管理运行时状态

```typescript
class DataSetManager {
  private dataSet: DataSet  // 持有领域模型
  
  // 上下文管理（UI 多视图绑定）
  getContext(tableName: string, contextId?: string): BindingContext
  ensureContext(tableName: string, contextId: string): BindingContext
  injectMethodsToContext(context: BindingContext): void
  
  // 订阅系统（观察者模式）
  subscribe(tableName: string, contextId: string, callback: Function): () => void
  notifySubscribers(tableName: string, contextId?: string): void
  
  // 数据加载（异步、防重入）
  requestTableData(tableName: string): void  // 非阻塞
  private async _requestTableDataAsync(tableName: string): Promise<void>
  
  // 事件系统（松耦合通信）
  on(event: string, callback: Function): void
  emit(event: string, data: any): void
  
  // CRUD 协调（委托给 DataSet + 触发事件）
  addRow(tableName: string, row: DataRow): void
  updateRow(tableName: string, rowIndex: number, row: DataRow): void
  deleteRow(tableName: string, rowIndex: number): void
  cascadeUpdate(tableName: string, row: DataRow, oldValues?: DataRow): void
  cascadeDelete(tableName: string, row: DataRow): void
}
```

**特点**：
- 委托领域逻辑给 DataSet
- 处理副作用（事件、通知、UI 更新）
- 管理运行时状态（loading、订阅者）

## 委托模式示例

### 级联删除流程

```typescript
// DataSetManager（协调器）
cascadeDelete(tableName: string, row: DataRow): void {
  // 1. 委托给领域模型执行业务逻辑
  const affectedTables = this.dataSet.cascadeDelete(tableName, row)
  
  // 2. 处理副作用：触发事件
  affectedTables.forEach(childTable => {
    this.emit('cascadeDelete', { 
      parentTable: tableName,
      childTable,
      parentRow: row
    })
  })
  
  // 3. 通知订阅者（UI 更新）
  this.notifySubscribers(tableName)
  affectedTables.forEach(childTable => this.notifySubscribers(childTable))
}

// DataSet（领域模型）
cascadeDelete(tableName: string, row: DataRow): string[] {
  // 纯业务逻辑：递归删除关联数据
  const affectedTables: string[] = []
  
  relations.forEach(relation => {
    const rowsToDelete = findMatchingRows(...)
    rowsToDelete.forEach(childRow => {
      const nested = this.cascadeDelete(relation.childTable, childRow)
      affectedTables.push(...nested)
    })
    deleteRows(childTable, rowsToDelete)
    affectedTables.push(relation.childTable)
  })
  
  return affectedTables  // 只返回结果，不触发副作用
}
```

## 重构收益

### 1. 可测试性提升

**DataSet 单元测试**（无需 Mock）：
```typescript
test('cascadeDelete should remove related rows', () => {
  const dataSet = new DataSet({
    tables: { Users: [...], Orders: [...] },
    relations: [{ parentTable: 'Users', childTable: 'Orders', cascadeDelete: true }]
  })
  
  const affectedTables = dataSet.cascadeDelete('Users', { id: 1 })
  
  expect(affectedTables).toEqual(['Orders'])
  expect(dataSet.tables.Orders.rows).toHaveLength(0)
})
```

**DataSetManager 集成测试**（Mock 事件）：
```typescript
test('cascadeDelete should emit events', () => {
  const dataSet = new DataSetManager(dataSetConfig)
  const mockCallback = jest.fn()
  
  dataSet.on('cascadeDelete', mockCallback)
  dataSet.cascadeDelete('Users', { id: 1 })
  
  expect(mockCallback).toHaveBeenCalledWith({
    parentTable: 'Users',
    childTable: 'Orders',
    parentRow: { id: 1 }
  })
})
```

### 2. 代码复用

DataSet 可在多个场景使用：
- ✅ 服务端数据处理（SSR）
- ✅ 客户端 DataSetManager
- ✅ 命令行工具（数据迁移、批量操作）
- ✅ Worker 线程（后台计算）

### 3. 扩展性

新增功能时职责明确：
- **领域逻辑**（如新的级联规则）→ 修改 DataSet
- **基础设施**（如 WebSocket 同步）→ 修改 DataSetManager

### 4. 维护性

- 代码行数：`1000+ → 369 + 1028`（总数增加但职责清晰）
- 方法数量：DataSet 12 个，DataSetManager 25 个
- 单个类的复杂度降低

## 迁移指南

### 代码变更

**重构前**：
```typescript
import { DataSetManager } from '@/utils/dataSetManager'

const dataSet = new DataSetManager(pageData.dataset, mockDataLoader)
```

**重构后**：
```typescript
import { DataSetManager } from '@/utils/dataSetManager'

// DataSetManager 内部自动创建 DataSet 实例
const dataSet = new DataSetManager(pageData.dataset, mockDataLoader)
// API 保持兼容，无需修改现有代码！
```

### 类型导入

```typescript
// 领域模型类
import { DataSet } from '@/utils/dataSet'

// 接口定义（用于类型标注）
import type { DataSet as IDataSet } from '@/types/pageData'

// 管理器
import { DataSetManager } from '@/utils/dataSetManager'
```

### 直接使用 DataSet（无 UI 场景）

```typescript
import { DataSet } from '@/utils/dataSet'

// 纯数据操作，不需要订阅、事件、加载
const dataSet = new DataSet({
  dataSetName: 'MyData',
  tables: { ... },
  relations: [ ... ]
})

dataSet.addRow('Users', { id: 1, name: 'Alice' })
const affectedTables = dataSet.cascadeDelete('Users', { id: 1 })
console.log('Affected:', affectedTables)
```

## 架构图

```
┌─────────────────────────────────────────────┐
│           DynamicPage.vue (UI)              │
│  - autoSubscribeTables()                    │
│  - rebindRules()                            │
└──────────────────┬──────────────────────────┘
                   │ subscribe / listen events
                   ↓
┌─────────────────────────────────────────────┐
│       DataSetManager (协调器/基础设施)        │
│  ┌─────────────────────────────────────┐    │
│  │ Subscription System                 │    │
│  │  - contextSubscribers: Map          │    │
│  │  - subscribe()                      │    │
│  │  - notifySubscribers()              │    │
│  ├─────────────────────────────────────┤    │
│  │ Event System                        │    │
│  │  - eventListeners: Map              │    │
│  │  - on() / emit()                    │    │
│  ├─────────────────────────────────────┤    │
│  │ Data Loading                        │    │
│  │  - requestTableData()               │    │
│  │  - loadingTables: Set               │    │
│  ├─────────────────────────────────────┤    │
│  │ Context Management                  │    │
│  │  - getContext()                     │    │
│  │  - injectMethodsToContext()         │    │
│  └─────────────────────────────────────┘    │
│                   │ delegate                 │
│                   ↓                          │
│  ┌─────────────────────────────────────┐    │
│  │        DataSet (领域模型)            │    │
│  │  - tables: Record<string, DataTable>│    │
│  │  - relations: DataRelation[]        │    │
│  │  - addRow()                         │    │
│  │  - cascadeDelete()                  │    │
│  │  - filterChildRows()                │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

## 设计模式

1. **委托模式**：DataSetManager 委托业务逻辑给 DataSet
2. **观察者模式**：订阅/通知机制解耦 UI 和数据
3. **Facade 模式**：DataSetManager 为复杂系统提供统一接口
4. **单一职责原则**：每个类只负责一个明确的职责

## 未来优化方向

1. **进一步细分 DataSetManager**：
   - `SubscriptionManager` - 专职订阅管理
   - `EventBus` - 独立事件系统
   - `DataLoader` - 抽象数据加载策略

2. **DataSet 不可变化**：
   - 采用 Immutable.js 或 Immer
   - 每次操作返回新的 DataSet 实例
   - 便于实现 undo/redo

3. **关系引擎独立**：
   - `RelationEngine` 类处理所有关系逻辑
   - DataSet 只管理数据本身

## 总结

✅ **职责清晰**：领域逻辑 vs 基础设施  
✅ **可测试性**：DataSet 可独立单元测试  
✅ **可复用性**：DataSet 可用于多种场景  
✅ **可维护性**：每个类都有明确的边界  
✅ **向后兼容**：API 保持不变，平滑过渡  

重构遵循了 SOLID 原则，特别是**单一职责原则**和**依赖倒置原则**，为项目的长期维护打下了坚实的基础。

