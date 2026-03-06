# 事件循环检测机制（实际实现）

**最后更新**: 2026-02-27
**状态**: 实装完成，以本文档为准

---

## 🎯 循环场景与破解路径

### 典型死循环路径

```
用户点击行
  → el-table.currentChange(rowA)
  → sync-helpers.onCurrentChange → view.setCurrentRow(rowA, 'ui')
  → emits stateChanged { source:'ui', changeType:'currentRow' }
  → useRuleBinding 回调
  → syncCurrentRowToTable(rowA)       ← 若不拦截
  → table.setCurrentRow(rowA)
  → el-table.currentChange(rowA) 再次触发
  → ∞ 死循环
```

---

## 🛡️ 双层防护机制

### 第一层：`source === 'ui'` 快速过滤（`useRuleBinding`）

```typescript
// packages/spark-component/src/renderer/composables/useRuleBinding.ts
dataSet.value.onAnyViewChange((evt) => {
  if (evt.context.source === 'ui') return   // ← 主要拦截点
  if (evt.changeType === 'currentRow') {
    syncCurrentRowToTable(...)
  }
})
```

**逻辑**：事件来源是 `'ui'`（用户操作的直接触发），说明 el-table UI 已更新，不需要再回写。

| source 值   | el-table 是否已最新 | 是否需要回写 |
|------------|---------------------|------------|
| `'ui'`      | ✅ 用户操作已更新    | ❌ 跳过     |
| `'program'` | ❌ 程序写入，UI 未知 | ✅ 同步     |
| `'auto'`    | ❌ 自动首选，UI 未知 | ✅ 同步     |
| `'crud'`    | ❌ CRUD 后状态变化   | ✅ 同步     |
| `'cascade'` | ❌ 级联触发         | ✅ 同步     |

### 第二层：幂等性守卫（`setCurrentRow` / `setSelectedRows`）

```typescript
// selection-delegate.ts
setCurrentRow(row, source?) {
  if (host.currentRow === row) return   // ← 安全网：值相同直接退出，无事件
  ...
}
setSelectedRows(rows, source?) {
  if (cur.length === rows.length && cur.every((r, i) => r === rows[i])) return
  ...
}
```

**作用**：`syncCurrentRowToTable` 通过 `nextTick` 调用 `table.setCurrentRow(row)` 后，
el-table 会重新触发 `currentChange(row)`。
此时 `currentRow` 已等于 `row`，幂等守卫无事件 → 循环自然终止。

---

## 📐 `EventContext` 的职责边界

```typescript
interface EventContext {
  eventId: number | string   // 每次 emit 内部独立生成，唯一标识单次通知
  source: EventSource        // 发起来源（必填），用于过滤和日志
  meta?: Record<string, unknown>
}
```

### `eventId` 的实际用途

| 用途                        | 是否实现 | 说明                            |
|---------------------------|--------|--------------------------------|
| 事件日志 / 调试追踪            | ✅     | 每次 emit 唯一，可在日志中关联       |
| 循环检测（processingEvents）  | ❌     | 未实现；`source` 过滤已足够         |

### 为什么不使用 `processingEvents.has(eventId)`

早期设计曾描述"透传 eventId"的双重防护方案，但与当前架构不兼容：

1. **透传要求**：UI 创建的 `eventId` 需沿整个调用链传至 DataSet 再返回 UI，
   但 UI→DataSet 和 DataSet→UI 是两条独立路径，`eventId` 无法自动携带回去。
2. **内生 eventId**：每个 `emitStateChanged` 调用内部独立生成 `eventId`（调用方只传 `source`），
   无法匹配跨路径的循环复现。
3. **`source='ui'` 更简洁**：单次判断即可准确识别 UI 来源，无需维护 Set 状态。

### `eventId` 生成规则（关键约束）

**每次 `emitStateChanged` 调用必须创建独立的 `EventContext`（独立 eventId）**，
禁止在同一操作中共享同一个 ctx 实例：

```typescript
// ✅ 正确：每次 emit 调用 createEventContext() / mkCtx()
this.emitStateChanged('currentRow',   { row: newRow, context: this.mkCtx() })
this.emitStateChanged('selectedRows', { rows: [...rows], context: this.mkCtx() })

// ❌ 错误：两次 emit 共享同一 ctx（若将来加 processingEvents 检测，第二个事件会被误跳过）
const ctx = this.mkCtx()
this.emitStateChanged('currentRow',   { row: newRow, context: ctx })
this.emitStateChanged('selectedRows', { rows: [...rows], context: ctx })
```

---

## 🔄 完整调用链（实际）

### 场景 A：用户点击行

```
用户点击 → el-table.currentChange(rowA)
  → sync-helpers.onCurrentChange
  → view.setCurrentRow(rowA, 'ui')
      ctx = createEventContext('ui', ...)   [eventId=42]
      emits stateChanged('currentRow', ctx)
        → useRuleBinding: source='ui' → return  ✅ 循环断开
      单选同步（!isMultiSelect）:
        setSelectedRows([rowA], 'ui')
          ctx = createEventContext('ui', ...)  [eventId=43，独立]
          emits stateChanged('selectedRows', ctx)
            → useRuleBinding: source='ui' → return  ✅
```

### 场景 B：程序设置当前行

```
view.setCurrentRow(rowB, 'program')
  ctx = createEventContext('program', ...)  [eventId=44]
  emits stateChanged('currentRow', ctx)
    → useRuleBinding: source='program' → 继续
    → syncCurrentRowToTable(rowB)
        nextTick → table.setCurrentRow(rowB)
        → el-table.currentChange(rowB)
        → setCurrentRow(rowB, 'ui')
            幂等：currentRow===rowB → return  ✅ 无事件，循环终止
```

### 场景 C：cascade 级联自动首选

```
父视图 stateChanged('currentRow', source='auto')
  → CascadeDelegate → childView.refresh() → loadFromServer
  → applyAutoFirst: setCurrentRow(firstRow, 'auto')
      ctx = createEventContext('auto', ...)  [eventId=45]
      emits stateChanged('currentRow', source='auto')
        → useRuleBinding: source='auto' → 继续
        → syncCurrentRowToTable(firstRow)
            nextTick → table.setCurrentRow(firstRow)
            → el-table.currentChange(firstRow)
            → setCurrentRow(firstRow, 'ui')
                幂等：currentRow===firstRow → return  ✅
```

---

## 📋 相关文件

| 文件 | 职责 |
|------|------|
| `spark-data/src/core/event-id.ts` | `createEventContext` / `generateEventId` 实现 |
| `spark-data/src/types.ts` | `EventContext`, `EventSource`, `ViewChangeHandlers` 类型定义 |
| `spark-data/src/strategies/selection-delegate.ts` | setter 前独立生成 ctx |
| `spark-data/src/strategies/local-mutation-delegate.ts` | 每次 emit 独立 ctx |
| `spark-data/src/sync-helpers.ts` | UI→DataSet，传 `'ui'` source |
| `spark-component/src/renderer/composables/useRuleBinding.ts` | `source==='ui'` 过滤，DataSet→UI 同步 |
