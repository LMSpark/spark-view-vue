# 基于事件 ID 的循环检测机制

**实施日期**: 2026-02-23  
**核心改进**: 使用唯一 ID（支持视图/组件级别）标识事件，透传并检测循环

---

## 🎯 核心思想

**问题**: 之前依赖 `source` 字符串判断，无法精确检测真正的循环路径。

**解决方案**: 
1. 每个事件携带唯一的 `eventId`
2. eventId 在调用链中透传
3. 检测到同一个 eventId 再次出现时，说明形成了循环，立即退出

---

## 📋 EventContext 定义

```typescript
interface EventContext {
  /**
   * 事件唯一标识符
   * - 支持 number（全局递增）或 string（视图/组件级别）
   * - 在调用链中透传
   * - 用于循环检测
   */
  eventId: number | string
  
  /** 事件来源类型（用于日志和调试） */
  source?: EventSource
  
  /** 扩展元数据 */
  meta?: Record<string, unknown>
}
```

---

## 🔧 ID 生成策略

### 1. 全局递增 ID（默认）

```typescript
generateEventId(): number
// 返回: 1, 2, 3, ...
```

**用途**: 简单场景，全局唯一

### 2. 视图级别 ID（推荐）

```typescript
generateViewEventId(tableName: string, viewId: string): string
// 返回: "Users@grid:42"
```

**用途**: 
- 按视图隔离循环检测
- 更精确的事件追踪
- 包含上下文信息

### 3. 组件级别 ID

```typescript
generateComponentEventId(componentId: string): string
// 返回: "component:table-instance-123:42"
```

**用途**: 
- 按组件实例隔离
- 支持多实例场景

---

## 📝 使用示例

### 创建事件上下文

```typescript
import { createEventContext } from '@spark-view/spark-data'

// 方式 1: 全局 ID
const ctx1 = createEventContext('ui')
// { eventId: 42, source: 'ui' }

// 方式 2: 视图级别 ID（推荐）
const ctx2 = createEventContext('ui', { 
  tableName: 'Users', 
  viewId: 'grid' 
})
// { eventId: "Users@grid:42", source: 'ui' }

// 方式 3: 组件级别 ID
const ctx3 = createEventContext('ui', { 
  componentId: 'table-123' 
})
// { eventId: "component:table-123:42", source: 'ui' }

// 方式 4: 带元数据
const ctx4 = createEventContext('ui', {
  tableName: 'Users',
  viewId: 'grid',
  meta: { timestamp: Date.now() }
})
```

### 在 DataView 中使用

```typescript
// sync-helpers.ts - UI → DataSet
const { createEventContext } = require('./types')
view.setCurrentRow(row, { 
  context: createEventContext('ui', { tableName, viewId })
})
```

### 循环检测

```typescript
// useRuleBinding.ts - DataSet → UI
const processingEvents = new Set<number | string>()

subscribeViewStateChanges(dataSet, (tableName, viewId, event) => {
  // ✅ 检查是否已处理此事件
  if (event.context?.eventId !== undefined) {
    if (processingEvents.has(event.context.eventId)) {
      // 🔄 检测到循环，退出
      logger.warn('检测到事件循环', { 
        eventId: event.context.eventId,
        tableName, 
        viewId 
      })
      return
    }
    // 标记为正在处理
    processingEvents.add(event.context.eventId)
  }
  
  try {
    // 同步到 UI
    syncCurrentRowToTable(...)
  } finally {
    // 处理完成后移除标记
    if (event.context?.eventId) {
      processingEvents.delete(event.context.eventId)
    }
  }
})
```

---

## 🔄 完整调用链示例

### 场景: 用户点击行

```
1. 用户点击行 A
   ↓
2. el-table.currentChange(A)
   ↓
3. bindRules: onCurrentChange
   ↓
4. sync.onCurrentChange(A)
   创建 context = { eventId: "Users@grid:42", source: 'ui' }
   ↓
5. DataView.setCurrentRow(A, { context })
   ↓
6. emit('stateChanged', { row: A, context })
   ↓
7. useRuleBinding 订阅回调
   检查 processingEvents.has("Users@grid:42") → false
   添加到 processingEvents
   ↓
8. syncCurrentRowToTable(A)
   ↓
9. el-table.setCurrentRow(A)
   ⚠️ 触发 el-table.currentChange(A)
   ↓
10. bindRules 检查 isCurrentlySyncingToUI() → true （辅助防护）
    跳过，不调用 DataView API
    ✅ 防止循环

11. 返回步骤 7 的 finally 块
    从 processingEvents 删除 "Users@grid:42"
```

### 场景: 循环被检测

如果步骤 10 的防护失败，导致再次调用 `DataView.setCurrentRow()`：

```
10'. DataView.setCurrentRow(A, { context: 同一个 context })
     ↓
11'. emit('stateChanged', { row: A, context })
     eventId 仍然是 "Users@grid:42"
     ↓
12'. useRuleBinding 订阅回调
     检查 processingEvents.has("Users@grid:42") → true ✅
     检测到循环，记录警告日志
     return（退出）
     ✅ 循环被阻止
```

---

## ✅ 优势对比

| 特性 | 旧方案（source字符串） | 新方案（eventId） |
|------|----------------------|-----------------|
| **循环检测** | 基于来源推测 | 精确 ID 匹配 |
| **多实例安全** | 需要额外处理 | 天然支持 |
| **调试追踪** | 模糊 | 清晰（带上下文） |
| **时序问题** | 可能存在 | 无依赖 |
| **粒度控制** | 全局 | 视图/组件级别 |

---

## 🛡️ 双重防护机制

### 主要防护: eventId 检测

```typescript
if (processingEvents.has(event.context.eventId)) {
  return  // ✅ 精确检测循环
}
```

### 辅助防护: isSyncingToUI 标志

```typescript
if (isCurrentlySyncingToUI()) {
  return  // ✅ 防止 UI API 副作用
}
```

**关系**: 互补而非替代
- eventId: 长效保护，贯穿整个数据流
- isSyncingToUI: 短效保护，防止 nextTick 内的副作用

---

## 📊 ID 格式选择建议

| 场景 | 推荐格式 | 示例 |
|------|---------|------|
| **简单应用** | 全局 ID | `42` |
| **多视图应用** | 视图级别 ID | `Users@grid:42` |
| **组件库** | 组件级别 ID | `component:table-123:42` |
| **复杂系统** | 混合使用 | 视图内用视图ID，跨视图用全局ID |

---

## 🧪 测试要点

```typescript
describe('事件循环检测', () => {
  it('应检测到 UI → DataSet → UI 循环', () => {
    const ctx = createEventContext('ui', { 
      tableName: 'Users', 
      viewId: 'grid' 
    })
    
    // 第一次处理
    view.setCurrentRow(row, { context: ctx })
    expect(processingEvents.has(ctx.eventId)).toBe(true)
    
    // 尝试循环（同一个 eventId）
    view.setCurrentRow(row, { context: ctx })
    expect(循环被阻止).toBe(true)
  })
  
  it('不同的 eventId 不应被误判为循环', () => {
    const ctx1 = createEventContext('ui', { tableName: 'Users', viewId: 'grid' })
    const ctx2 = createEventContext('ui', { tableName: 'Users', viewId: 'grid' })
    
    expect(ctx1.eventId).not.toBe(ctx2.eventId)
    // 两个独立事件应该都能正常处理
  })
})
```

---

## 🚀 迁移指南

### 现有代码兼容性

✅ **完全向后兼容**: 
- `context` 字段为可选
- 未指定时仍然可以工作（使用旧的 source 逻辑）
- 可以逐步迁移

### 推荐迁移步骤

1. **关键路径优先**: UI 事件处理器先使用 context
2. **视图级别 ID**: 在 sync-helpers.ts 中使用视图级别 ID
3. **循环检测**: 在订阅回调中添加 eventId 检测
4. **测试验证**: 确保循环被正确检测
5. **全面推广**: 所有事件都使用 context

---

## 📝 总结

### 核心价值

1. **精确检测**: 基于唯一 ID，不依赖推测
2. **透传机制**: eventId 在调用链中传递，保持上下文
3. **灵活粒度**: 支持全局/视图/组件级别
4. **易于调试**: 日志中包含清晰的事件 ID
5. **向后兼容**: 不破坏现有代码

### 最佳实践

- ✅ UI 事件使用视图级别 ID
- ✅ 自动触发使用视图级别 ID
- ✅ 跨视图操作使用全局 ID
- ✅ 在订阅回调中始终检查 eventId
- ✅ 处理完成后立即清理标记

---

**相关文件**:
- `packages/spark-data/src/types.ts` - EventContext 定义
- `packages/spark-data/src/sync-helpers.ts` - UI→DataSet 使用 context
- `packages/spark-component/src/renderer/composables/useRuleBinding.ts` - 循环检测逻辑
- `docs/architecture/EVENT_SOURCE_MECHANISM.md` - 事件来源机制（旧方案）
