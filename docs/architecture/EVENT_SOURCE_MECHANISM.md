# 事件来源标识机制 (Event Source Mechanism)

> **ℹ️ 更新说明 (Phase 16)**: `sync-helpers.ts` 已删除，其功能已由独立事件模型 + `originatorId` 参数替代。
> 本文档保留作为历史设计参考。

**实施日期**: 2026-02-23  
**问题**: 所有事件缺乏参数来标识原发  
**解决方案**: 在事件中添加 `source` 字段，从根本上解决防循环问题

---

## 🎯 核心改进

### 问题分析

**原有机制的缺陷**:
```typescript
// ❌ 旧的统一事件定义 - 需要按 changeType switch 分派
// 已移除，改为独立事件通道
```

**导致的问题**:
1. **依赖全局标志**: `isSyncingToUI` 模块级变量，存在时序竞争风险
2. **难以追踪**: 无法从事件本身知道是用户操作还是程序驱动
3. **维护困难**: 防循环逻辑分散在多个文件中
4. **扩展性差**: 新增同步路径需要添加新的标志位

### 解决方案

**新的事件定义**:
```typescript
// ✅ 新的独立事件模型（DataViewEventMap）
// 每种状态变化使用独立事件通道，无需 switch 分派
interface DataViewEventMap {
  currentRowChanged: [currentRow: IDataRow | null, originatorId?: string]
  selectedRowsChanged: [selectedRows: IDataRow[], originatorId?: string]
  rowsChanged: []
  cleared: []
  requestStateChanged: [requestState: RequestState]
  mutatingChanged: [mutating: boolean]
}

// originatorId 用于防循环同步（发起方实例 ID）
```

---

## 📋 修改清单

### 1. 类型定义 (`packages/spark-data/src/types.ts`)

```typescript
/**
 * 事件来源标识
 * - 'ui': UI 组件触发（用户交互，如点击行）
 * - 'program': 程序代码直接调用（如 __init__ 中设置）
 * - 'sync': DataSet→UI 同步触发（由 useRuleBinding 发起）
 * - 'cascade': 级联更新触发（父视图变化导致子视图更新）
 * - 'auto': 自动触发（如 loadFromServer 后的 autoCurrentFirst）
 * - 'crud': CRUD 操作触发（增删改后的状态更新）
 */
export type EventSource = 'ui' | 'program' | 'sync' | 'cascade' | 'auto' | 'crud'

/**
 * DataView 独立事件映射（取代旧的统一 ViewStateEvent）
 * 每种状态变化对应独立事件通道，无需 changeType + switch 分派
 */
interface DataViewEventMap {
  currentRowChanged: [currentRow: IDataRow | null, originatorId?: string]
  selectedRowsChanged: [selectedRows: IDataRow[], originatorId?: string]
  rowsChanged: []           // 16ms 防抖
  cleared: []
  requestStateChanged: [requestState: RequestState]
  mutatingChanged: [mutating: boolean]
}

/**
 * DataSet 级订阅处理器映射（用于 onAnyViewChange）
 */
export interface ViewChangeHandlers {
  currentRowChanged?: (tableName: string, viewId: string, currentRow: IDataRow | null, originatorId?: string) => void
  selectedRowsChanged?: (tableName: string, viewId: string, selectedRows: IDataRow[], originatorId?: string) => void
  rowsChanged?: (tableName: string, viewId: string) => void
  cleared?: (tableName: string, viewId: string) => void
  requestStateChanged?: (tableName: string, viewId: string, requestState: RequestState) => void
  mutatingChanged?: (tableName: string, viewId: string, mutating: boolean) => void
}
```

### 2. DataView 方法签名 (`packages/spark-data/src/data-view.ts`)

```typescript
/**
 * 设置当前行
 * @param row - 要设置的行（null 表示清空）
 * @param options - 可选配置
 * @param options.source - 事件来源标识（用于防止循环同步）
 */
setCurrentRow(row: IDataRow | null, options?: { source?: EventSource }): void {
  if (this.currentRow === row) return
  
  this.currentRow = row
  this.currentRowIndex = row === null ? null : this.rows.indexOf(row)
  if (this.currentRowIndex === -1) this.currentRowIndex = null
  
  // ✅ 只在 source 明确指定时才传递，避免 undefined
  if (options?.source) {
    this.emitStateChanged('currentRow', { row, source: options.source })
  } else {
    this.emitStateChanged('currentRow', { row })
  }
  
  // 级联更新时传递相同的 source
  if (this.syncCurrentToSelected) {
    const needsUpdate = /* ... */
    if (needsUpdate) {
      if (options?.source) {
        this.setSelectedRows(newSelection, { source: options.source })
      } else {
        this.setSelectedRows(newSelection)
      }
    }
  }
}

/**
 * 设置多选行
 * @param rows - 要设置的行数组
 * @param options - 可选配置
 * @param options.source - 事件来源标识（用于防止循环同步）
 */
setSelectedRows(rows: IDataRow[], options?: { source?: EventSource }): void {
  // ... 幂等检查 ...
  
  // ✅ 只在 source 明确指定时才传递
  if (options?.source) {
    this.emitStateChanged('selectedRows', { rows: [...rows], source: options.source })
  } else {
    this.emitStateChanged('selectedRows', { rows: [...rows] })
  }
}
```

### 3. UI→DataSet 同步 (`packages/spark-data/src/sync-helpers.ts`)

```typescript
export function createTableSyncHandlers(...): TableSyncHandlers {
  return {
    onCurrentChange(row: IDataRow | null) {
      const view = table.getOrCreateView(viewId)
      
      if (row === null) {
        // ✅ 明确标记事件来源为 'ui'（用户交互触发）
        view.setCurrentRow(null, { source: 'ui' })
        return
      }
      
      const cleanRow = /* 提取干净数据 */
      if (cleanRow) {
        // ✅ 明确标记事件来源为 'ui'
        view.setCurrentRow(cleanRow, { source: 'ui' })
      }
    },

    onSelectionChange(rows: IDataRow[]) {
      const view = table.getOrCreateView(viewId)
      const validRows = Array.isArray(rows) ? rows : []
      // ✅ 明确标记事件来源为 'ui'
      view.setSelectedRows(validRows, { source: 'ui' })
    }
  }
}
```

### 4. DataSet→UI 同步订阅 (`packages/spark-component/src/renderer/composables/useRuleBinding.ts`)

```typescript
if (dataSet.value) {
  cleanupSync = dataSet.value.onAnyViewChange({
    currentRowChanged(tableName, viewId, currentRow, originatorId) {
      // ✅ 跳过本实例触发的事件（防循环同步）
      if (originatorId === instanceId) return
      syncCurrentRowToTable(tableName, viewId, currentRow, formApi.value)
    },
    selectedRowsChanged(tableName, viewId, selectedRows, originatorId) {
      if (originatorId === instanceId) return
      syncSelectedRowsToTable(tableName, viewId, selectedRows, formApi.value)
    },
    cleared(tableName, viewId) {
      syncCurrentRowToTable(tableName, viewId, null, formApi.value)
      syncSelectedRowsToTable(tableName, viewId, [], formApi.value)
    },
  })
}
```

### 5. 自动选中首行 (`packages/spark-data/src/data-view.ts`)

```typescript
// loadFromServer 处理 autoCurrentFirst/autoSelectFirst
if (this.autoCurrentFirst !== false) {
  // ✅ 标记来源为 'auto'（由 loadFromServer 自动触发）
  this.emitStateChanged('currentRow', { row: this.currentRow, source: 'auto' })
}

if (this.autoSelectFirst !== false && firstRow) {
  // ✅ 标记来源为 'auto'
  this.emitStateChanged('selectedRows', { rows: this.selectedRows, source: 'auto' })
}
```

### 6. 导出类型 (`packages/spark-data/src/index.ts`)

```typescript
export type {
  // ... 其他类型 ...
  ViewChangeHandlers,  // ✅ DataSet 级订阅处理器映射
  EventSource,         // ✅ 事件来源标识
  // ...
} from './types'
```

---

## 🔄 数据流分析

### 场景 1: 用户点击行

```
用户点击行 A
  ↓
el-table.currentChange(A)
  ↓
bindRules: onCurrentChange
  ↓
sync.onCurrentChange(A)
  ↓
DataView.setCurrentRow(A, originatorId)  ← ✅ 携带实例 ID
  ↓
emit('currentRowChanged', A, originatorId)
  ↓
useRuleBinding onAnyViewChange.currentRowChanged 回调
  ↓
检查 originatorId === instanceId  ← ✅ 跳过本实例
  ↓
✅ 不会触发 DataSet→UI 同步，避免循环
```

### 场景 2: 程序设置 currentRow

```
__init__ 中调用
  ↓
DataView.setCurrentRow(row)  ← ✅ 无 originatorId
  ↓
emit('currentRowChanged', row, undefined)
  ↓
useRuleBinding onAnyViewChange.currentRowChanged 回调
  ↓
检查 originatorId !== instanceId  ← ✅ 需要同步
  ↓
syncCurrentRowToTable(row)
  ↓
el-table.setCurrentRow(row)
  ↓
⚠️ 触发 el-table.currentChange(row)
  ↓
bindRules 检查 isCurrentlySyncingToUI()  ← ✅ 跳过
  ↓
✅ 不会调用 DataView API，避免循环
```

### 场景 3: loadFromServer 自动选中首行

```
loadFromServer 成功
  ↓
autoCurrentFirst 处理
  ↓
DataView.setCurrentRow(row)  ← ✅ 内部调用，无 originatorId
  ↓
emit('currentRowChanged', row, undefined)
  ↓
useRuleBinding onAnyViewChange.currentRowChanged 回调
  ↓
检查 originatorId !== instanceId  ← ✅ 需要同步
  ↓
syncCurrentRowToTable(row)
  ↓
el-table 高亮首行，用户可见
```

---

## 🛡️ 防循环机制（双重保障）

### 主要机制: originatorId 检查

```typescript
// useRuleBinding.ts - 订阅 DataSet 事件（handler map 模式）
dataSet.onAnyViewChange({
  currentRowChanged(tableName, viewId, currentRow, originatorId) {
    // ✅ 主要防护：检查发起方 ID
    if (originatorId === instanceId) return  // 本实例触发，跳过
    syncCurrentRowToTable(tableName, viewId, currentRow, formApi)
  },
  selectedRowsChanged(tableName, viewId, selectedRows, originatorId) {
    if (originatorId === instanceId) return
    syncSelectedRowsToTable(tableName, viewId, selectedRows, formApi)
  },
})
```

### 辅助机制: isSyncingToUI 标志

```typescript
// useRuleBinding.ts - DataSet→UI 同步
function syncCurrentRowToTable(...) {
  void nextTick(() => {
    isSyncingToUI = true  // ✅ 设置临时标志
    try {
      table.setCurrentRow(row)  // ⚠️ 可能触发 currentChange
    } finally {
      isSyncingToUI = false
    }
  })
}

// bindRules.ts - UI 事件处理
rule.on['currentChange'] = (row) => {
  // ✅ 辅助防护：检查是否正在同步
  if (isCurrentlySyncingToUI()) {
    return  // 跳过 el-table API 副作用触发的事件
  }
  
  // 调用 DataSet API
  sync.onCurrentChange(row)  // → source='ui'
}
```

**两种机制的关系**:
- **event.source**: 长效保护，贯穿整个数据流
- **isSyncingToUI**: 短效保护，仅在 nextTick 期间有效
- **互补关系**: event.source 防止主循环，isSyncingToUI 防止 UI API 副作用

---

## ✅ 优势对比

### 旧方案（仅全局标志）

```typescript
// ❌ 时序竞争风险
void nextTick(() => {
  isSyncingToUI = true
  table.setCurrentRow(row)  // Tick N
  isSyncingToUI = false     // 立即清除
})

// ⚠️ 如果 currentChange 在 Tick N+1 触发，标志已失效
rule.on['currentChange'] = () => {
  if (isSyncingToUI) return  // 可能检查失败
}
```

**问题**:
- 依赖时序假设
- 难以追踪事件来源
- 多实例可能相互干扰

### 新方案（事件携带 source）

```typescript
// ✅ 事件本身携带完整信息
DataView.setCurrentRow(row, { source: 'ui' })
  ↓
emit({ row, source: 'ui' })
  ↓
订阅回调收到完整事件
  ↓
if (event.source === 'ui') return  // 准确判断
```

**优势**:
- ✅ 无时序依赖
- ✅ 完整的事件上下文
- ✅ 易于追踪和调试
- ✅ 多实例安全
- ✅ 扩展性强

---

## 📊 EventSource 使用指南

| 来源 | 场景 | 示例 | UI同步 |
|------|------|------|--------|
| `ui` | 用户交互 | 点击行、勾选复选框 | ❌ 跳过 |
| `program` | 程序调用 | `__init__` 中设置 | ✅ 需要 |
| `auto` | 自动触发 | `autoCurrentFirst` | ✅ 需要 |
| `cascade` | 级联更新 | 父视图→子视图 | ✅ 需要 |
| `crud` | CRUD操作 | 新增/删除后更新 | ✅ 需要 |
| `sync` | DataSet→UI | （未使用，保留） | ❌ 跳过 |

---

## 🧪 测试建议

### 1. 单元测试

```typescript
describe('独立事件与 originatorId', () => {
  it('setCurrentRow 应触发 currentRowChanged 事件', () => {
    const view = createDataView()
    const spy = vi.fn()
    view.events.on('currentRowChanged', spy)
    
    view.setCurrentRow(row)
    
    expect(spy).toHaveBeenCalledWith(row, undefined)
  })
  
  it('originatorId 相同时应跳过 UI 同步', () => {
    // 订阅事件（handler map 模式）
    dataSet.onAnyViewChange({
      currentRowChanged(tn, vid, cr, originatorId) {
        if (originatorId === instanceId) return
        syncCurrentRowToTable(tn, vid, cr, formApi)
      },
    })
    
    // 触发带 originatorId 的事件
    view.setCurrentRow(row, instanceId)
    
    // 同一 instanceId → 应跳过同步
    expect(syncCurrentRowToTable).not.toHaveBeenCalled()
  })
})
```

### 2. 集成测试

```typescript
describe('防循环完整流程', () => {
  it('用户点击行不应触发循环', async () => {
    // 挂载组件
    const wrapper = mount(PageRenderer, { props: { config } })
    
    // 模拟点击
    await wrapper.find('.el-table__row').trigger('click')
    
    // DataView.setCurrentRow 应该只调用一次
    expect(setCurrentRowSpy).toHaveBeenCalledTimes(1)
  })
})
```

---

## 🚀 迁移指南

### 现有代码兼容性

**向后兼容**：
- `source` 字段为可选，未指定时默认行为为 'program'
- 旧代码不需要立即修改，可以逐步迁移

**推荐迁移步骤**：
1. 关键路径（UI、auto）优先添加 source
2. 补充日志，验证防循环机制
3. 添加单元测试覆盖
4. 逐步覆盖所有调用点

### 新功能开发

**强制要求**：
- 所有 `setCurrentRow/setSelectedRows` 调用必须指定 `source`
- UI 事件处理器固定使用 `source: 'ui'`
- 程序驱动固定使用 `source: 'program'`
- 自动触发固定使用 `source: 'auto'`

---

## 📝 总结

### 核心价值

1. **从根本上解决问题**: 事件本身携带来源信息，不依赖外部状态
2. **完整的数据流追踪**: 每个事件都有明确的来源标识
3. **健壮的防循环机制**: 双重保障（source + isSyncingToUI）
4. **良好的扩展性**: 新增同步路径只需添加新的 EventSource 值

### 技术债务清理

- ✅ 移除了对全局标志的强依赖
- ✅ 解决了时序竞争风险
- ✅ 提升了代码可维护性
- ✅ 增强了系统的可观测性

### 未来优化方向

1. 添加详细的事件追踪日志（开发模式）
2. 考虑添加循环检测器作为最后的安全网
3. 补充完整的单元测试和集成测试
4. 文档完善和最佳实践指南

---

**相关文件**:
- [ANTI_LOOP_MECHANISM_REVIEW.md](./ANTI_LOOP_MECHANISM_REVIEW.md) - 防循环机制完善性审阅
- `packages/spark-data/src/types.ts` - EventSource 类型定义
- `packages/spark-data/src/data-view.ts` - DataView 方法签名
- `packages/spark-data/src/sync-helpers.ts` - UI→DataSet 同步
- `packages/spark-component/src/renderer/composables/useRuleBinding.ts` - DataSet→UI 同步
- `packages/spark-component/src/renderer/utils/bindRules.ts` - UI 事件处理
