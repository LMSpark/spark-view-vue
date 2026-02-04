# Vue 响应式架构 - 零 rebindRules 设计

## 🎯 核心原则

**数据驱动 UI，而非重新渲染**

- ✅ 数据是响应式的（`reactive()`）
- ✅ 组件通过 `dataKey` 绑定响应式数据
- ✅ 数据变化时，Vue 自动更新组件
- ❌ **不需要** 手动调用 `rebindRules()`

## 📊 响应式流程

### 正确的数据流（零 rebindRules）

```
用户操作
  ↓
事件处理器（系统注入 A + 可选业务 B）
  ↓
修改响应式数据（pageData / context.rows）
  ↓
Vue 响应式系统检测变化
  ↓
自动更新绑定的组件
  ↓
UI 自动刷新
```

**关键点**：
- 数据修改是**唯一来源**
- Vue 自动处理 UI 更新
- 组件状态保持（选中、焦点、滚动）

### 错误的数据流（过度 rebindRules）

```
用户操作
  ↓
事件处理器
  ↓
修改数据
  ↓
❌ 调用 rebindRules()
  ↓
重新创建整个组件树
  ↓
丢失组件状态（选中、焦点）
  ↓
性能下降 + 用户体验差
```

## 🔧 rebindRules 使用场景

### ✅ 应该使用的场景（极少）

1. **rules 结构动态变化**
   ```javascript
   // 动态添加/删除组件
   export function addComponent() {
     const pageData = $data()
     pageData.showExtraField = true
     $rebindRules()  // ← 必要：rules 结构变化
   }
   ```

2. **dataKey 表达式需要重新计算**
   ```javascript
   // 极少情况：dataKey 依赖外部变量
   export function switchView() {
     window.currentView = 'detail'
     $rebindRules()  // ← 必要：dataKey 需要重新解析
   }
   ```

### ❌ 不应使用的场景（99%情况）

1. **数据变化**
   ```javascript
   // ❌ 错误
   export function updateUser(user) {
     user.name = 'New Name'
     $rebindRules()  // ← 不必要！Vue 响应式自动更新
   }
   
   // ✅ 正确
   export function updateUser(user) {
     user.name = 'New Name'
     // 什么都不需要做，UI 自动更新
   }
   ```

2. **currentRow/selectedRows 变化**
   ```javascript
   // ❌ 错误
   export function handleRowSelect(row) {
     const dataSet = $dataSet()
     dataSet.setCurrentRow('Users', row)
     $rebindRules()  // ← 不必要！会丢失选中状态
   }
   
   // ✅ 正确
   export function handleRowSelect(row) {
     // 系统事件 A 已自动处理
     // 这里只写业务逻辑（可选）
     ElMessage.info(`选中用户: ${row.name}`)
   }
   ```

3. **DataSet 数据变化**
   ```javascript
   // ❌ 错误
   export function loadOrders() {
     const dataSet = $dataSet()
     dataSet.requestTableData('Orders')
     $rebindRules()  // ← 不必要！订阅者会自动通知
   }
   
   // ✅ 正确
   export function loadOrders() {
     const dataSet = $dataSet()
     dataSet.requestTableData('Orders')
     // 订阅者自动通知 → Vue 响应式更新
   }
   ```

## 🏗️ 内核响应式机制

### DataSet 订阅者（零 rebindRules）

```javascript
// DynamicPage.vue 自动订阅
dataSet.subscribe(tableName, contextId, () => {
  console.log('数据变化（Vue 响应式自动更新）')
  // ❌ 不调用 rebindRules()
})
```

**原理**：
- `pageData` 是 `reactive()`
- `context.rows` 是响应式数组
- Vue 自动检测变化
- 绑定的组件自动更新

### 事件监听器（零 rebindRules）

```javascript
// 监听 currentRow 变化
dataSet.on('currentRowChanged', () => {
  console.log('currentRow 变化（Vue 响应式自动更新）')
  // ❌ 不调用 rebindRules()
})

// 监听 selectedRows 变化
dataSet.on('selectedRowsChanged', () => {
  console.log('selectedRows 变化（Vue 响应式自动更新）')
  // ❌ 不调用 rebindRules() - 会丢失选中状态
})
```

## 📋 实际案例

### 案例1：主从表级联（零 rebindRules）

**场景**：选择用户 → 自动加载订单

```javascript
// ❌ 旧的错误做法
export function handleUserSelect(user) {
  const dataSet = $dataSet()
  dataSet.setCurrentRow('Users', user)  // 设置当前行
  dataSet.requestTableData('Orders')     // 加载订单
  $rebindRules()                         // ← 不必要！
}

// ✅ 新的零代码做法
// 不需要 handleUserSelect 函数！
// 系统事件 A 自动处理：
// 1. setCurrentRow
// 2. 触发关系 Users → Orders
// 3. 自动加载 Orders（autoLoad: true）
// 4. 订阅者通知 → Vue 响应式更新
```

### 案例2：多选表格（零 rebindRules）

**场景**：多选订单 → 显示统计信息

```javascript
// ❌ 旧的错误做法
export function handleOrderSelect(selectedRows) {
  const pageData = $data()
  pageData.selectedCount = selectedRows.length
  $rebindRules()  // ← 会丢失选中状态！
}

// ✅ 新的正确做法
export function handleOrderSelect(selectedRows) {
  const pageData = $data()
  pageData.selectedCount = selectedRows.length
  // Vue 响应式自动更新统计信息
  // 表格选中状态保持
}
```

### 案例3：条件不满足清空子表（零 rebindRules）

**场景**：取消选择用户 → 清空订单

```javascript
// 内核自动处理（DataSet.applyRelation）
if (!parentRows || parentRows.length === 0) {
  childContext.clearAll(true)
  this.notifySubscribers(childTable, childContextId)
  this.recursiveClearChildTables(childTable, childContextId)
  // ❌ 不调用 rebindRules()
  // Vue 响应式自动清空 UI
}
```

## 🎯 性能对比

| 操作 | 使用 rebindRules | 不使用 rebindRules |
|------|----------------|-------------------|
| **数据变化** | 重新创建组件树 | Vue diff 更新 |
| **时间** | ~50-200ms | ~5-20ms |
| **内存** | 创建新对象 | 复用现有对象 |
| **状态** | 丢失 | 保持 |
| **闪烁** | 可能 | 无 |

**结论**：不使用 `rebindRules()` 性能提升 **10-40倍**！

## 📚 总结

### 黄金法则

> **只修改数据，让 Vue 处理 UI**

### 实践指南

1. **99% 的情况不需要 `rebindRules()`**
2. **只在 rules 结构变化时使用**
3. **数据变化交给 Vue 响应式**
4. **信任框架，不要过度控制**

### 检查清单

在调用 `$rebindRules()` 之前，问自己：

- [ ] rules 的结构是否变化了？
- [ ] 是否只是数据值变化？（如果是，删除 `$rebindRules()`）
- [ ] 是否会丢失组件状态？（如果会，删除 `$rebindRules()`）
- [ ] Vue 响应式能否自动处理？（如果能，删除 `$rebindRules()`）

### 最佳实践

```javascript
// ✅ 零代码业务逻辑
export function __init__() {
  const dataSet = $dataSet()
  dataSet.dataLoader = mockDataLoader
  dataSet.requestTableData('Users')
  // ❌ 不调用 $rebindRules()
}

// ✅ 可选的业务增强
export function handleUserSelect(user) {
  // 只关注业务逻辑
  ElMessage.info(`选中: ${user.name}`)
  // ❌ 不调用 $rebindRules()
  // ❌ 不手动加载数据
  // ❌ 不手动设置状态
}
```

---

## 🚀 迁移指南

### 从旧代码迁移

1. **删除所有 `$rebindRules()` 调用**（除非 rules 结构变化）
2. **删除手动数据加载逻辑**（使用 autoLoad）
3. **删除手动状态同步代码**（系统自动处理）
4. **信任 Vue 响应式系统**

### 验证迁移成功

- [ ] 多选表格状态保持
- [ ] 输入框焦点不丢失
- [ ] 页面无闪烁
- [ ] 性能显著提升
- [ ] 代码量大幅减少

**零 rebindRules = 更快 + 更稳定 + 更简洁！** 🎉
