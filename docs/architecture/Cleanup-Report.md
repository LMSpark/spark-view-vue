# 删除向后兼容代码 - 清理报告

## 清理目标

彻底删除所有过时的向后兼容接口和类型，保持代码库干净、现代化。

## 删除内容

### 1. 删除的接口（src/types/pageData.ts）

#### ❌ BindingContext 接口（已删除）
```typescript
/**
 * @deprecated 使用 IBindingContext 代替
 */
export interface BindingContext extends IBindingContext {
  setCurrentRow?: (row: DataRow | null, skipNotify?: boolean) => void
  setSelectedRows?: (rows: DataRow[]) => void
  notifyChange?: () => void
}
```
**原因**：方法已移至 `BindingContext` 类实现，接口应该只包含属性。

#### ❌ DataTable 接口（已删除）
```typescript
/**
 * @deprecated 使用 IDataTable 代替
 */
export interface DataTable extends BindingContext {
  tableName: string
  columns: DataColumn[]
  api?: CrudApi
  rows: DataRow[]
  contexts?: Record<string, BindingContext>
  loading?: boolean
  error?: string
}
```
**原因**：已由 `DataTable` 类实现 `IDataTable` 接口替代。

#### ❌ DataSet 接口（已删除）
```typescript
/**
 * @deprecated 使用 IDataSet 代替
 */
export interface DataSet {
  dataSetName: string
  tables: Record<string, DataTable>
  relations?: DataRelation[]
  version?: number
  pageId?: string
  autoLoadRelations?: boolean
}
```
**原因**：已由 `DataSet` 类实现 `IDataSet` 接口替代。

#### ❌ TableLookupResult 接口（已删除）
```typescript
export interface TableLookupResult {
  table: DataTable
  context: BindingContext
}
```
**原因**：使用旧接口类型，已不再需要。

### 2. 更新的类型引用

#### SelfReferenceTable
```typescript
// 更新前
export interface SelfReferenceTable extends DataTable { ... }

// 更新后
export interface SelfReferenceTable extends IDataTable { ... }
```

## 保留的内容

### ✅ 新接口（纯数据结构）

#### IBindingContext
```typescript
export interface IBindingContext {
  currentRow?: DataRow | null
  selectedRows?: DataRow[]
  rows?: DataRow[]
  _originalRows?: DataRow[]
  _hostTable?: string
  _contextId?: string
  filterExpression?: FilterExpression
  sortExpression?: SortExpression
  pagination?: { ... }
}
```

#### IDataTable
```typescript
export interface IDataTable extends IBindingContext {
  tableName: string
  columns: DataColumn[]
  api?: CrudApi
  rows: DataRow[]
  contexts?: Record<string, IBindingContext>
  loading?: boolean
  error?: string
}
```

#### IDataSet
```typescript
export interface IDataSet {
  dataSetName: string
  tables: Record<string, IDataTable>
  relations?: DataRelation[]
  version?: number
  pageId?: string
  autoLoadRelations?: boolean
}
```

### ✅ 类实现（src/models/）

- `BindingContext` 类 - 实现 `IBindingContext` 接口
- `DataTable` 类 - 继承 `BindingContext`，实现 `IDataTable` 接口
- `DataSet` 类 - 实现 `IDataSet` 接口（src/utils/）

## 更新的文档

### 1. DataKey-Paths.md
```typescript
// 更新前
import type { DataTable, BindingContext } from '@/types/pageData'

// 更新后
import type { IDataTable, IBindingContext } from '@/types/pageData'
import { DataTable } from '@/models/DataTable'
import { BindingContext } from '@/models/BindingContext'
```

### 2. Interface-Class-Separation.md
- 删除"向后兼容性"章节
- 删除"迁移指南"中的旧代码示例
- 更新示例代码使用新接口

## 代码统计

| 项目 | 数量 |
|------|------|
| 删除的接口定义 | 4 个 |
| 删除的代码行 | ~49 行 |
| 更新的文档 | 3 个文件 |
| 更新的类型引用 | 1 处 |

## 验证结果

### ✅ TypeScript 类型检查
```bash
npm run typecheck
# 通过 ✓
```

### ✅ 构建测试
```bash
npm run build:ssr
# 通过 ✓
```

### ✅ 无遗留引用
使用 grep 搜索确认没有遗留的旧类型引用。

## 清理效果

### Before（清理前）
```typescript
// 混乱：接口包含可选方法
interface BindingContext {
  rows?: DataRow[]
  setCurrentRow?: (...) => void  // ❌ 可选方法
}

// 向后兼容层
interface DataTable extends BindingContext { ... }
interface DataSet { ... }
```

### After（清理后）
```typescript
// 清晰：接口只有属性
interface IBindingContext {
  rows?: DataRow[]  // ✅ 只有属性
}

// 类实现接口 + 方法
class BindingContext implements IBindingContext {
  rows: DataRow[] = []
  setCurrentRow(row: DataRow): void { ... }  // ✅ 必需方法
}
```

## 架构优势

### 1. 更清晰的职责分离
- **接口（I前缀）**：纯数据契约，用于序列化/反序列化
- **类**：数据 + 行为，用于运行时逻辑

### 2. 更好的类型安全
```typescript
// 旧方式：方法可选，运行时可能不存在
context.setCurrentRow?.(row)  // ❌ 需要检查

// 新方式：方法必需，编译时保证存在
context.setCurrentRow(row)    // ✅ 直接调用
```

### 3. 更简洁的代码
- 无需运行时注入方法
- 无需 `@deprecated` 标记
- 无需向后兼容代码

### 4. 更好的开发体验
- IDE 自动补全更准确
- 类型提示更清晰
- 重构更安全

## 总结

✅ **删除了 4 个过时接口**（BindingContext, DataTable, DataSet, TableLookupResult）  
✅ **保留 3 个现代接口**（IBindingContext, IDataTable, IDataSet）  
✅ **保留 3 个类实现**（BindingContext, DataTable, DataSet）  
✅ **代码库更干净、类型更安全**  
✅ **无向后兼容负担**  

代码库现在完全基于现代 OOP 架构：**接口定义契约，类实现逻辑**。
