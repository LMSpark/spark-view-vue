# 组件分类：模型级、实例级、字段级

## 概述

组件按操作粒度分为3类，与权限系统的3个级别完美对应：

| 组件级别 | 操作粒度 | 权限级别 | 典型示例 |
|---------|---------|---------|---------|
| 模型级 (Model) | 整个数据表 | IModelPermission | Grid 表格、CardList 卡片视图 |
| 实例级 (Instance) | 单条数据 | IInstancePermission | Grid 行、单个 Card、Form 表单 |
| 字段级 (Field) | 单个字段 | 字段权限 | Input、Select、Text 显示组件 |

## 1. 模型级组件

**操作对象：** 整个数据表（Table）

**权限来源：** `IModelPermission`

**典型场景：**
- Grid 表格（显示整个数据表）
- CardList 卡片视图（显示整个卡片列表）

- 批量操作面板
- 数据集级别的统计面板

**示例：**
```typescript
// 工具栏组件
const toolbarConfig: IComponentPermissionConfig = {
  level: ComponentLevel.Model,
  modelPermission: {
    allowCreate: true,     // 显示"新增"按钮
    allowImport: false,    // 隐藏"导入"按钮
    allowExport: true      // 显示"导出"按钮
  }
}
```

## 2. 实例级组件

**操作对象：** 单条数据（DataRow）

**权限来源：** `IInstancePermission`

**典型场景：**
- Grid 的一行数据
- 单个 Card 卡片
- Form 表单（新增/编辑）
- 详情页

**示例：**
```typescript
// Grid 行组件
const rowConfig: IComponentPermissionConfig = {
  level: ComponentLevel.Instance,
  instancePermission: {
    allowDelete: true,
    editableFields: ['name', 'age'],     // name, age 可编辑
    hiddenFields: ['password'],          // password 不显示
    maskedFields: ['phone', 'email']     // phone, email 脱敏
  }
}
```

## 3. 字段级组件

**操作对象：** 单个字段（Field）

**权限来源：** 字段权限（从 `IInstancePermission` 中提取）

**典型场景：**
- 输入框（Input/Select/DatePicker）
- 显示组件（Text/Label）
- 自定义字段渲染器

**示例：**
```typescript
// 手机号字段组件
const phoneFieldConfig: IComponentPermissionConfig = {
  level: ComponentLevel.Field,
  fieldPermission: {
    field: 'phone',
    permission: {
      editableFields: [],               // 不可编辑 = ReadOnly
      maskedFields: ['phone']           // 脱敏显示
    }
  }
}

// 使用 FieldRenderHelper 计算状态
const state = helper.computeFieldState(
  { field: 'phone', permission: phoneFieldConfig.fieldPermission!.permission },
  row,
  checker
)
// 结果：{ visibility: Masked, editable: false, displayValue: '138****8000' }
```

## 权限级别对应关系

```
┌─────────────────┐
│  IModelPermission │ ──► 模型级组件（Grid 表格、CardList）
└─────────────────┘
        │
        │ 包含多个
        ▼
┌─────────────────┐
│IInstancePermission│ ──► 实例级组件（Grid 行、单个 Card、Form）
└─────────────────┘
        │
        │ 包含多个字段
        ▼
┌─────────────────┐
│  字段权限配置    │ ──► 字段级组件（Input、Text）
│ (editableFields) │
│ (maskedFields)   │
│ (hiddenFields)   │
└─────────────────┘
```

## 组件与权限的绑定

### 模型级组件（Grid 表格、CardList）
```vue
<template>
  <!-- Grid 表格（模型级组件） -->
  <ejs-grid :dataSource="dataSet.tables.Users.rows">
    <!-- 工具栏按钮根据模型级权限显示 -->
    <template #toolbar>
      <button v-if="modelPermission.allowCreate" @click="onCreate">新增</button>
      <button v-if="modelPermission.allowExport" @click="onExport">导出</button>
    </template>
  </ejs-grid>
  
  <!-- CardList 卡片视图（模型级组件） -->
  <div class="card-list">
    <div v-for="row in dataSet.tables.Users.rows" :key="row.id">
      <!-- 单个 Card 是实例级组件 -->
      <UserCard :row="row" :permission="row._permission" />
    </div>
  </div>
</template>
```

### 实例级组件（Grid 行、单个 Card、Form）
```vue
<template>
  <!-- Grid 行（实例级组件） -->
  <ejs-grid :dataSource="rows">
    <e-columns>
      <e-column v-for="field in visibleFields" 
                :key="field"
                :field="field"
                :allowEditing="isFieldEditable(field)" />
    </e-columns>
  </ejs-grid>
  
  <!-- 单个 Card（实例级组件） -->
  <div class="card" v-if="instancePermission">
    <div v-if="instancePermission.allowDelete">
      <button @click="onDelete">删除</button>
    </div>
    <!-- 根据字段权限渲染字段 -->
    <div v-for="field in visibleFields" :key="field">
      <FieldRenderer :field="field" :row="row" :permission="instancePermission" />
    </div>
  </div>
</template>
```

### 字段级组件
```vue
<template>
  <div v-if="fieldState.shouldRender">
    <input v-if="fieldState.editable"
           v-model="fieldState.displayValue" />
    <span v-else>{{ fieldState.displayValue }}</span>
  </div>
</template>

<script setup lang="ts">
const fieldState = helper.computeFieldState(
  { field: props.fieldName, permission: props.permission },
  props.row,
  checker
)
</script>
```

## 实战场景

### 场景1：用户列表 Grid

**需求：**
- 显示"新增用户"按钮（模型级）
- 每行显示删除按钮（实例级）
- 手机号脱敏显示，不可编辑（字段级）

**实现：**
```typescript
// 1. 模型级权限（工具栏）
const modelPermission: IModelPermission = {
  allowCreate: true,
  allowImport: false,
  allowExport: true
}

// 2. 实例级权限（Grid 行）
const instancePermission: IInstancePermission = {
  allowDelete: true,
  editableFields: ['name', 'age', 'email'],
  maskedFields: ['phone'],
  hiddenFields: ['password']
}

// 3. 字段级权限（手机号字段）
const phoneState = helper.computeFieldState(
  { field: 'phone', permission: instancePermission },
  row,
  checker
)
// 结果：{ visibility: Masked, editable: false }
```

### 场景2：订单详情 Form

**需求：**
- 不允许删除订单（实例级）
- 订单号/创建时间不可编辑（字段级）
- 收货地址可编辑（字段级）

**实现：**
```typescript
// 实例级权限（Form）
const instancePermission: IInstancePermission = {
  allowDelete: false,
  editableFields: ['address', 'remark'],
  maskedFields: [],
  hiddenFields: []
}

// 字段级状态计算
const orderNoState = helper.computeFieldState(
  { field: 'orderNo', permission: instancePermission },
  order,
  checker
)
// 结果：{ visibility: Visible, editable: false }

const addressState = helper.computeFieldState(
  { field: 'address', permission: instancePermission },
  order,
  checker
)
// 结果：{ visibility: Visible, editable: true }
```

## 总结

| 组件级别 | 关注点 | 权限接口 | 操作范围 | 典型组件 |
|---------|--------|---------|---------|----------|
| 模型级 | 数据表级操作 | IModelPermission | 增删导 | Grid、CardList |
| 实例级 | 单条数据操作 | IInstancePermission | 删改 | Grid 行、单个 Card、Form |
| 字段级 | 单个字段操作 | 字段权限配置 | 读写 | Input、Select、Text |

**核心原则：**
- 组件级别越高，权限粒度越粗
- 组件级别越低，权限粒度越细
- 三级组件与三级权限一一对应
