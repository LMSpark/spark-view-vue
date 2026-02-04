# 按组件级别的能力提供

## 概述

完整的能力流转层级（从上到下）：

```
┌─────────────────┐
│   应用层         │
│ (App/Router)    │
└─────────────────┘
        │
        │ 提供能力
        ▼
┌─────────────────┐
│ 业务页面上下文   │ ←──访问能力── 沙箱（业务脚本）
│ (DataSet)       │ ──提供能力──► (Sandbox)
└─────────────────┘
        │
        │ 提供能力
        ▼
┌─────────────────┐
│  模型级组件      │ ←──控制──── 沙箱可操作
│ (Grid/CardList) │
└─────────────────┘
        │
        │ 提供能力
        ▼
┌─────────────────┐
│  实例级组件      │ ←──控制──── 沙箱可操作
│ (行/Card/Form)  │
└─────────────────┘
        │
        │ 提供能力
        ▼
┌─────────────────┐
│  字段级组件      │ ←──控制──── 沙箱可操作
│ (Input/Text)    │
└─────────────────┘
```

**层级说明：**
- **应用层**：全局路由、应用配置
- **DataSet（页面上下文）**：管理页面级数据表、全局状态、API 调用
- **沙箱（业务脚本）**：业务脚本执行环境，可访问 DataSet 能力和控制所有组件
- **模型级组件**：Grid、CardList 等数据展示容器
- **实例级组件**：Grid 行、单个 Card、Form 表单
- **字段级组件**：Input、Select、Text 等字段组件

## 0. DataSet（页面上下文）提供的能力

**层级：** DataSet（业务页面数据管理层）

**职责：** 管理页面级数据表（tables）、全局状态、API 调用、权限数据

**为下游模型级组件提供：**

### 0.1 数据表状态能力 (dataSetState)
```typescript
interface IDataSetStateCapability {
  name: 'dataSetState'
  implementation: {
    /** 获取 DataSet 实例 */
    getDataSet(): IDataSet
    
    /** 获取指定数据表 */
    getTable(tableName: string): IDataTable
    
    /** 获取页面参数（路由参数、查询参数） */
    getPageParams(): Record<string, unknown>
    
    /** 获取页面级权限 */
    getPagePermission(): Record<string, boolean>
    
    /** 监听数据表变化 */
    onTableChange(tableName: string, callback: (table: IDataTable) => void): () => void
  }
}
```

### 0.2 全局数据能力 (globalData)
```typescript
interface IGlobalDataCapability {
  name: 'globalData'
  implementation: {
    /** 获取全局用户信息 */
    getUserInfo(): { id: string; name: string; roles: string[] }
    
    /** 获取全局配置 */
    getConfig(key: string): unknown
    
    /** 获取字典数据 */
    getDictionary(type: string): Array<{ label: string; value: unknown }>
  }
}
```

### 0.3 页面服务能力 (pageService)
```typescript
interface IPageServiceCapability {
  name: 'pageService'
  implementation: {
    /** 显示消息提示 */
    showMessage(message: string, type: 'success' | 'error' | 'warning'): void
    
    /** 显示确认对话框 */
    showConfirm(message: string): Promise<boolean>
    
    /** 显示加载状态 */
    showLoading(show: boolean): void
    
    /** 页面导航 */
    navigate(path: string, params?: Record<string, unknown>): void
  }
}
```

### 0.4 API 调用能力 (apiClient)
```typescript
interface IApiClientCapability {
  name: 'apiClient'
  implementation: {
    /** 统一的 API 请求方法 */
    request<T>(config: { url: string; method: string; data?: unknown }): Promise<T>
    
    /** 获取 API 基础配置 */
    getApiConfig(): { baseURL: string; timeout: number }
  }
}
```

---

## 沙箱（业务脚本执行环境）

**层级：** Sandbox（与 DataSet 同层，业务脚本执行环境）

**职责：** 执行业务脚本，提供安全的 JavaScript 执行环境

**可访问的能力：**

### 1. DataSet 层所有能力

业务脚本可以直接访问 DataSet 提供的所有能力：

```javascript
// 在沙箱中执行的业务脚本

// 访问 DataSet 能力
const dataSet = use('dataSetState')
const usersTable = dataSet.getTable('Users')
const pageParams = dataSet.getPageParams()

// 访问全局数据
const globalData = use('globalData')
const userInfo = globalData.getUserInfo()
const dictData = globalData.getDictionary('status')

// 访问页面服务
const pageService = use('pageService')
pageService.showMessage('操作成功', 'success')

// 调用 API
const apiClient = use('apiClient')
const result = await apiClient.request({
  url: '/api/users',
  method: 'GET'
})
```

### 2. 组件控制能力

业务脚本可以通过组件 ID 获取并控制页面上的任意组件：

```javascript
// 获取组件实例
const grid = getComponent('userGrid')  // 模型级组件
const form = getComponent('userForm')  // 实例级组件
const nameInput = getComponent('nameInput')  // 字段级组件

// 控制模型级组件
grid.refresh()                    // 刷新数据
grid.getSelectedRows()            // 获取选中行
grid.setSelection([row1, row2])   // 设置选中

// 控制实例级组件
form.setFieldValue('name', '张三')  // 设置字段值
form.validateRow()                  // 验证表单
form.startEdit()                    // 进入编辑模式
form.commitEdit()                   // 提交编辑

// 控制字段级组件
nameInput.focus()                   // 设置焦点
nameInput.validate()                // 验证字段
```

### 3. 组件事件监听

业务脚本可以监听组件事件：

```javascript
// 监听 Grid 选中变化
grid.onSelectionChange((rows) => {
  log.log('选中行数：', rows.length)
  // 根据选中状态控制其他组件
  deleteBtn.setDisabled(rows.length === 0)
})

// 监听 Form 字段变化
form.onFieldChange('status', (value) => {
  // 联动逻辑：状态改变时显示/隐藏其他字段
  if (value === 'approved') {
    approvalReasonField.show()
  } else {
    approvalReasonField.hide()
  }
})

// 监听 DataSet 数据变化
dataSet.onTableChange('Users', (table) => {
  // 数据变化时更新统计信息
  totalLabel.setText(`共 ${table.rows.length} 条`)
})
```

### 4. 组件生命周期钩子

业务脚本可以定义页面生命周期钩子：

```javascript
// 页面加载完成
export function onPageMounted() {
  log.log('页面加载完成')
  // 初始化逻辑
  const dataSet = use('dataSetState')
  const table = dataSet.getTable('Users')
  log.log('用户数据：', table.rows)
}

// 页面卸载前
export function onPageBeforeUnmount() {
  log.log('页面即将卸载')
  // 清理逻辑
}

// 组件事件处理
export function onAddClick() {
  const form = getComponent('userForm')
  form.startEdit()
}

export function onDeleteClick() {
  const grid = getComponent('userGrid')
  const selectedRows = grid.getSelectedRows()
  
  if (selectedRows.length === 0) {
    const pageService = use('pageService')
    pageService.showMessage('请先选择要删除的数据', 'warning')
    return
  }
  
  // 批量删除逻辑
  grid.batchDelete(selectedRows)
}
```

### 5. 沙箱隔离与安全

```javascript
// 沙箱提供的全局对象
const sandbox = {
  // 能力访问
  use,                    // 访问 DataSet 能力
  getComponent,           // 获取组件实例
  
  // 工具函数（由页面上下文注入）
  log,                    // 页面级 logger 实例（log.log, log.warn, log.error）
  setTimeout,             // 定时器（受限）
  setInterval,            // 定时器（受限）
  
  // 禁止访问
  // window,              // ❌ 不能访问 window
  // document,            // ❌ 不能访问 document
  // console,             // ❌ 不能访问 console（使用页面注入的 log）
  // eval,                // ❌ 不能使用 eval
  // Function,            // ❌ 不能动态创建函数
}
```

### 沙箱与组件的关系

```
┌─────────────────────────────────────────┐
│  沙箱（Sandbox）                         │
│  - 执行业务脚本                          │
│  - 访问 DataSet 能力                     │
│  - 控制所有层级组件                      │
└─────────────────────────────────────────┘
              │
              │ 访问能力
              ▼
┌─────────────────────────────────────────┐
│  DataSet（数据管理）                     │
│  - dataSetState                          │
│  - globalData                            │
│  - apiClient                             │
└─────────────────────────────────────────┘
              │
              │ 控制
              ▼
┌─────────────────────────────────────────┐
│  组件层（所有级别）                      │
│  - 模型级：Grid, CardList                │
│  - 实例级：Grid行, Card, Form            │
│  - 字段级：Input, Text                   │
└─────────────────────────────────────────┘
```

---

## 1. 模型级组件提供的能力

**组件类型：** Grid 表格、CardList 卡片视图

**消费上游：** dataSetState、globalData、pageService、apiClient

**为下游实例级组件提供：**

### 1.1 数据源能力 (dataSource)
```typescript
interface IDataSourceCapability {
  name: 'dataSource'
  implementation: {
    /** 获取完整数据表 */
    getData(): IPermissionDataRow[]
    
    /** 获取模型级权限 */
    getModelPermission(): IModelPermission
    
    /** 刷新数据 */
    refresh(): Promise<void>
    
    /** 监听数据变化 */
    onDataChange(callback: (data: IPermissionDataRow[]) => void): () => void
  }
}
```

### 1.2 选择管理能力 (selectionManager)
```typescript
interface ISelectionManagerCapability {
  name: 'selectionManager'
  implementation: {
    /** 获取选中的行 */
    getSelectedRows(): IPermissionDataRow[]
    
    /** 设置选中的行 */
    setSelectedRows(rows: IPermissionDataRow[]): void
    
    /** 监听选中变化 */
    onSelectionChange(callback: (rows: IPermissionDataRow[]) => void): () => void
    
    /** 清除选中 */
    clearSelection(): void
  }
}
```

### 1.3 排序过滤能力 (queryManager)
```typescript
interface IQueryManagerCapability {
  name: 'queryManager'
  implementation: {
    /** 获取当前排序配置 */
    getSortConfig(): { field: string; order: 'asc' | 'desc' }[]
    
    /** 获取当前过滤配置 */
    getFilterConfig(): Record<string, unknown>
    
    /** 应用排序 */
    applySort(config: { field: string; order: 'asc' | 'desc' }[]): void
    
    /** 应用过滤 */
    applyFilter(config: Record<string, unknown>): void
  }
}
```

### 1.4 批量操作能力 (batchOperator)
```typescript
interface IBatchOperatorCapability {
  name: 'batchOperator'
  implementation: {
    /** 批量删除 */
    batchDelete(rows: IPermissionDataRow[]): Promise<void>
    
    /** 批量更新 */
    batchUpdate(updates: Array<{ row: IPermissionDataRow; data: Record<string, unknown> }>): Promise<void>
    
    /** 批量导出 */
    batchExport(rows: IPermissionDataRow[]): Promise<void>
  }
}
```

## 2. 实例级组件提供的能力

**组件类型：** Grid 行、单个 Card、Form 表单

**为下游字段级组件提供：**

### 2.1 数据绑定能力 (dataBinding)
```typescript
interface IDataBindingCapability {
  name: 'dataBinding'
  implementation: {
    /** 获取当前行数据 */
    getRowData(): IPermissionDataRow
    
    /** 获取字段值 */
    getFieldValue(field: string): unknown
    
    /** 设置字段值 */
    setFieldValue(field: string, value: unknown): void
    
    /** 监听字段变化 */
    onFieldChange(field: string, callback: (value: unknown) => void): () => void
    
    /** 监听整行数据变化 */
    onRowChange(callback: (row: IPermissionDataRow) => void): () => void
  }
}
```

### 2.2 实例权限能力 (instancePermission)
```typescript
interface IInstancePermissionCapability {
  name: 'instancePermission'
  implementation: {
    /** 获取实例级权限 */
    getPermission(): IInstancePermission
    
    /** 检查是否可删除 */
    canDelete(): boolean
    
    /** 检查字段是否可编辑 */
    canEditField(field: string): boolean
    
    /** 获取字段可见性 */
    getFieldVisibility(field: string): FieldVisibility
    
    /** 获取字段脱敏值 */
    getMaskedValue(field: string): string
  }
}
```

### 2.3 表单验证能力 (formValidator)
```typescript
interface IFormValidatorCapability {
  name: 'formValidator'
  implementation: {
    /** 验证单个字段 */
    validateField(field: string): Promise<{ valid: boolean; message?: string }>
    
    /** 验证整个实例 */
    validateRow(): Promise<{ valid: boolean; errors: Record<string, string> }>
    
    /** 添加验证规则 */
    addRule(field: string, rule: (value: unknown) => boolean | Promise<boolean>): void
    
    /** 清除验证状态 */
    clearValidation(field?: string): void
  }
}
```

### 2.4 编辑状态能力 (editState)
```typescript
interface IEditStateCapability {
  name: 'editState'
  implementation: {
    /** 是否处于编辑模式 */
    isEditing(): boolean
    
    /** 进入编辑模式 */
    startEdit(): void
    
    /** 提交编辑 */
    commitEdit(): Promise<void>
    
    /** 取消编辑 */
    cancelEdit(): void
    
    /** 获取变更的字段 */
    getChangedFields(): string[]
    
    /** 监听编辑状态变化 */
    onEditStateChange(callback: (editing: boolean) => void): () => void
  }
}
```

## 3. 字段级组件提供的能力

**组件类型：** Input、Select、Text 显示组件

**为上游或兄弟组件提供：**

### 3.1 字段渲染能力 (fieldRenderer)
```typescript
interface IFieldRendererCapability {
  name: 'fieldRenderer'
  implementation: {
    /** 获取字段名 */
    getFieldName(): string
    
    /** 获取显示值 */
    getDisplayValue(): string
    
    /** 获取原始值 */
    getRawValue(): unknown
    
    /** 设置焦点 */
    focus(): void
    
    /** 触发验证 */
    validate(): Promise<boolean>
  }
}
```

### 3.2 字段事件能力 (fieldEvents)
```typescript
interface IFieldEventsCapability {
  name: 'fieldEvents'
  implementation: {
    /** 监听值变化 */
    onValueChange(callback: (value: unknown) => void): () => void
    
    /** 监听焦点事件 */
    onFocus(callback: () => void): () => void
    
    /** 监听失焦事件 */
    onBlur(callback: () => void): () => void
    
    /** 触发自定义事件 */
    emit(event: string, data: unknown): void
  }
}
```

## 能力流转示例

### 场景：Grid 中的可编辑字段

```
┌──────────────────────────────────────────┐
│  DataSet（页面上下文）                    │
│  提供能力:                                │
│  - dataSetState: DataSet 实例、数据表     │
│  - globalData: 用户信息、字典             │
│  - apiClient: API 调用                    │
└──────────────────────────────────────────┘
              │ 提供
              ▼
┌──────────────────────────────────────────┐
│  Grid (模型级)                            │
│  消费: dataSetState, apiClient            │
│  提供能力:                                │
│  - dataSource: 完整数据表                 │
│  - selectionManager: 选中管理             │
└──────────────────────────────────────────┘
              │ 提供
              ▼
┌──────────────────────────────────────────┐
│  Grid 行 (实例级)                         │
│  消费: dataSource (获取单行数据)          │
│  提供能力:                                │
│  - dataBinding: 字段值读写                │
│  - instancePermission: 字段权限           │
│  - editState: 编辑状态                    │
└──────────────────────────────────────────┘
              │ 提供
              ▼
┌──────────────────────────────────────────┐
│  Input (字段级)                           │
│  消费:                                    │
│  - dataBinding.getFieldValue('name')     │
│  - instancePermission.canEditField()     │
│  提供能力:                                │
│  - fieldRenderer: 渲染控制                │
│  - fieldEvents: 事件通知                  │
└──────────────────────────────────────────┘
```

### 代码示例

```vue
<!-- Grid (模型级组件) -->
<template>
  <ejs-grid ref="gridRef" :dataSource="tableData">
    <e-columns>
      <e-column field="name" />
    </e-columns>
  </ejs-grid>
</template>

<script setup>
// Grid 消费 DataSet 能力
const dataSetState = use('dataSetState')
const table = dataSetState.getTable('Users')
const tableData = computed(() => table.rows)

// Grid 提供能力给下游
provide('dataSource', {
  getData: () => tableData.value,
  getModelPermission: () => table.permission,
  refresh: async () => { 
    await dataSetState.getDataSet().refresh('Users')
  }
})

provide('selectionManager', {
  getSelectedRows: () => gridRef.value.getSelectedRecords(),
  setSelectedRows: (rows) => { /* ... */ }
})
</script>

<!-- Grid 行 (实例级组件，由 Grid 内部渲染) -->
<script setup>
// Grid 行消费上游能力
const dataSource = use('dataSource')

// Grid 行提供能力给字段
provide('dataBinding', {
  getRowData: () => currentRow.value,
  getFieldValue: (field) => currentRow.value[field],
  setFieldValue: (field, value) => {
    currentRow.value[field] = value
  }
})

provide('instancePermission', {
  getPermission: () => currentRow.value._perm,
  canEditField: (field) => {
    return currentRow.value._perm?.editableFields?.includes(field) ?? false
  },
  getFieldVisibility: (field) => { /* ... */ }
})

provide('editState', {
  isEditing: () => editMode.value,
  startEdit: () => { editMode.value = true },
  commitEdit: async () => { /* ... */ }
})
</script>

<!-- Input (字段级组件) -->
<template>
  <input 
    v-model="displayValue"
    :readonly="!editable"
  />
</template>

<script setup>
// Input 消费上游能力
const dataBinding = use('dataBinding')
const instancePermission = use('instancePermission')
const editState = use('editState')

const props = defineProps<{ field: string }>()

const displayValue = computed({
  get: () => dataBinding.getFieldValue(props.field),
  set: (value) => dataBinding.setFieldValue(props.field, value)
})

const editable = computed(() => 
  editState.isEditing() && 
  instancePermission.canEditField(props.field)
)

// Input 提供能力（可选）
provide('fieldRenderer', {
  getFieldName: () => props.field,
  getDisplayValue: () => displayValue.value,
  focus: () => inputRef.value?.focus()
})
</script>
```

## 能力依赖规则

1. **单向流动**：能力只能从上游提供给下游，不能反向
   - ✅ 应用层 → DataSet → 模型级 → 实例级 → 字段级
   - ❌ 字段级 ← 实例级 ← 模型级 ← DataSet ← 应用层

2. **跨级访问**：下游可直接访问更上层的能力（跳过中间层）
   - 例如：字段级监听整个数据表的刷新事件（跳过实例级）
   - 例如：实例级直接访问 DataSet 获取全局数据（跳过模型级）

3. **能力覆盖**：下游可以覆盖上游提供的同名能力
   - 例如：Form 覆盖 Grid 的 editState，提供表单专用的编辑逻辑

4. **能力组合**：一个组件可以同时提供多个能力
   - 例如：Grid 行同时提供 dataBinding、instancePermission、editState

5. **层级隔离**：DataSet 不依赖具体组件实现
   - DataSet 只提供通用能力，不关心下游是 Grid 还是 CardList
   - 模型级组件负责从 DataSet 获取数据并转换为组件所需格式

## 总结

| 层级 | 主要提供的能力类型 | 典型能力 |
|------|-------------------|----------|
| 应用层 | 全局配置、路由管理 | （应用层面不在本文档范围） |
| DataSet（页面上下文） | 数据表管理、全局服务 | dataSetState, globalData, pageService, apiClient |
| **沙箱（业务脚本）** | **访问能力、控制组件** | **use(), getComponent(), 事件监听** |
| 模型级 | 数据表展示、批量操作 | dataSource, selectionManager, queryManager, batchOperator |
| 实例级 | 数据绑定、权限控制、编辑管理 | dataBinding, instancePermission, formValidator, editState |
| 字段级 | 渲染控制、事件通知 | fieldRenderer, fieldEvents |

**核心原则：**
- 能力单向流动（应用层 → DataSet → 模型级 → 实例级 → 字段级）
- 沙箱可访问 DataSet 所有能力，可控制所有层级组件
- 每个级别关注自己的职责范围
- 通过能力系统解耦层级间依赖
- DataSet 作为业务层与组件层的桥梁
- 沙箱作为业务脚本的安全执行环境
