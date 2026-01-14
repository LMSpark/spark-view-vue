# EJ2 Renderer 架构 (Vue 3 + SLOT 递归)

## 概述

基于 **Syncfusion EJ2 + Vue 3 SLOT 递归架构**的企业级渲染器实现。

### 核心特性
- ✅ **Vue 3 SLOT 架构**：所有组件支持作用域 slot 定制
- ✅ **递归渲染**：EJ2DynamicRenderer 自动处理嵌套结构
- ✅ **企业级功能**：虚拟滚动、Excel/PDF 导出、高级过滤
- ✅ **统一配置**：与 Element Plus 版本配置格式兼容
- ✅ **高性能**：百万行数据流畅渲染

## 目录结构

```
src/components/renderers/ej2/
├── EJ2DynamicRenderer.vue    # 动态渲染器（核心递归组件）
├── EJ2TableRenderer.vue      # EJ2 Grid 表格渲染器 ⭐
├── EJ2FormRenderer.vue       # 表单容器渲染器
├── EJ2TextRenderer.vue       # 文本字段渲染器（EJS-TextBox）
├── EJ2NumberRenderer.vue     # 数字字段渲染器（EJS-NumericTextBox）
├── EJ2DateRenderer.vue       # 日期字段渲染器（EJS-DatePicker）
├── renderer-map.ts           # 类型到组件的映射表
└── README.md                 # 本文档
```

## 🚀 核心优势

### EJ2 vs Element Plus

| 功能 | Element Plus | EJ2 |
|------|--------------|-----|
| **虚拟滚动** | ❌ 需第三方 | ✅ 内置 `enableVirtualization` |
| **Excel 导出** | ❌ 需 xlsx.js | ✅ 原生 `allowExcelExport` |
| **PDF 导出** | ❌ 无 | ✅ 原生 `allowPdfExport` |
| **分组聚合** | ❌ 手动实现 | ✅ 内置 `allowGrouping` |
| **行内编辑** | ⚠️ 基础 | ✅ 强大 `editSettings` |
| **列冻结** | ⚠️ 左右冻结 | ✅ 任意列 `frozenColumns` |
| **高级过滤** | ⚠️ 简单 | ✅ Excel 级别 `filterSettings` |
| **大数据性能** | ⚠️ 1000 行卡顿 | ✅ 百万行流畅 |
| **SLOT 支持** | ✅ 完整 | ✅ 三层 SLOT（通过包装层）|

## 🎯 EJ2 Grid 三层 SLOT 架构

**突破性方案**: 通过 `EJ2ColumnsWrapper` 组件实现了完整的 SLOT 支持！

### 架构设计
```
EJ2TableRenderer (外层)
  ↓ 传递 columns
EJ2ColumnsWrapper (包装层)
  ↓ 三层 SLOT 接口
<e-columns> (EJ2 指令)
```

### 三层 SLOT 使用

#### 层级 1：字段级 SLOT（默认，零代码）
```vue
<EJ2ColumnsWrapper :columns="columns">
  <!-- 不传 slot，自动渲染 -->
</EJ2ColumnsWrapper>
```

#### 层级 2：列级 SLOT（中等灵活）
```vue
<EJ2ColumnsWrapper :columns="columns">
  <template #column="{ column: col, index }">
    <e-column
      :field="col.field"
      :header-text="col.headerText + (col.required ? ' *' : '')"
    />
  </template>
</EJ2ColumnsWrapper>
```

#### 层级 3：列表级 SLOT（最灵活）
```vue
<EJ2ColumnsWrapper :columns="columns">
  <template #default="{ columns: cols }">
    <e-column
      v-for="col in cols.filter(c => c.visible)"
      :key="col.field"
      v-bind="col"
    />
  </template>
</EJ2ColumnsWrapper>
```

### 详细文档
📖 查看完整指南：[EJ2 多层 SLOT 文档](../../../docs/guides/EJ2_MULTI_SLOT.md)

---

## ⚠️ 旧版限制说明（已通过包装层解决）

<details>
<summary>点击展开旧版限制（仅供参考）</summary>

**旧版问题**: Syncfusion EJ2 Grid 使用自己的指令系统（`<e-columns>`/`<e-column>`），与 Vue 标准 slot 机制不兼容。

### 旧版支持的场景
- ✅ **EJ2FormRenderer**: 支持 header/footer slot
- ✅ **字段渲染器作为表单字段**: Text/Number/Date 支持 slot
- ✅ **字段渲染器作为详情显示**: 支持 slot

### 不支持的场景
- ❌ **EJ2TableRenderer 列定义**: 不能使用 Vue slot 自定义
- ❌ **字段渲染器作为 Grid 列**: template slot 不可用

### 解决方案
如需自定义 EJ2 Grid 列内容，使用 EJ2 原生 template 机制：
```vue
<e-column field="status" headerText="Status">
  <template #template="{ data }">
    <span :class="getStatusClass(data.status)">{{ data.status }}</span>
  </template>
</e-column>
```
参考: [EJ2 Column Templates](https://ej2.syncfusion.com/vue/documentation/grid/columns/column-template/)

</details>

---

## 🎯 使用示例

### 1. 基础表格（使用默认 SLOT）

```json
{
  "type": "ej2-table",
  "dataKey": "users",
  "allowPaging": true,
  "allowSorting": true,
  "allowFiltering": true,
  "pageSettings": {
    "pageSize": 20,
    "pageSizes": [10, 20, 50, 100]
  },
  "children": [
    {
      "type": "text",
      "name": "姓名",
      "value": "name",
      "width": 150
    },
    {
      "type": "number",
      "name": "年龄",
      "value": "age",
      "width": 100
    },
    {
      "type": "date",
      "name": "注册时间",
      "value": "createdAt",
      "width": 180
    }
  ]
}
```

### 2. 使用 SLOT 自定义列内容

```vue
<template>
  <EJ2DynamicRenderer :rule="tableRule" :data="pageData">
    <!-- 自定义单元格内容 -->
    <template #default="{ data, value }">
      <el-tag :type="data.status === 'active' ? 'success' : 'danger'">
        {{ data.name }}
      </el-tag>
    </template>
  </EJ2DynamicRenderer>
</template>

<script setup>
import EJ2DynamicRenderer from '@/components/renderers/ej2/EJ2DynamicRenderer.vue'

const tableRule = {
  type: 'ej2-table',
  dataSource: 'users',
  children: [
    { type: 'text', name: '姓名', value: 'name' }
  ]
}
</script>
```

### 3. 高级表格（虚拟滚动 + Excel 导出）

```json
{
  "type": "ej2-table",
  "dataSource": "dataset.tables.Orders.rows",
  "enableVirtualization": true,
  "allowExcelExport": true,
  "allowPdfExport": true,
  "allowGrouping": true,
  "showColumnChooser": true,
  "toolbar": ["ExcelExport", "PdfExport", "Search", "ColumnChooser"],
  "editSettings": {
    "allowEditing": true,
    "allowAdding": true,
    "allowDeleting": true,
    "mode": "Normal"
  },
  "children": [
    {
      "type": "number",
      "name": "订单ID",
      "value": "orderId",
      "width": 120,
      "isPrimaryKey": true
    },
    {
      "type": "text",
      "name": "客户名称",
      "value": "customerName",
      "width": 180
    },
    {
      "type": "number",
      "name": "金额",
      "value": "amount",
      "width": 120,
      "format": "C2"
    },
    {
      "type": "date",
      "name": "下单时间",
      "value": "orderDate",
      "width": 150,
      "format": "yyyy-MM-dd"
    }
  ]
}
```

### 4. 表单自定义字段

```vue
<template>
  <EJ2DynamicRenderer :rule="formRule" :data="formData">
    <!-- 自定义输入框 -->
    <template #default="{ value, update, config }">
      <ejs-textbox
        :value="value"
        :placeholder="config.placeholder"
        prefix-icon="e-icons e-search"
        @change="update"
      />
    </template>
  </EJ2DynamicRenderer>
</template>
```

## EJ2 Grid 完整配置

### 分页配置

```json
{
  "allowPaging": true,
  "pageSettings": {
    "pageSize": 20,
    "pageSizes": [10, 20, 50, 100, "All"],
    "pageCount": 5
  }
}
```

### 排序配置

```json
{
  "allowSorting": true,
  "allowMultiSorting": true,
  "sortSettings": {
    "columns": [
      { "field": "orderDate", "direction": "Descending" }
    ]
  }
}
```

### 过滤配置

```json
{
  "allowFiltering": true,
  "filterSettings": {
    "type": "Excel",
    "mode": "Immediate"
  }
}
```

### 分组配置

```json
{
  "allowGrouping": true,
  "groupSettings": {
    "columns": ["customerName"],
    "showDropArea": true,
    "showGroupedColumn": true
  }
}
```

### 编辑配置

```json
{
  "editSettings": {
    "allowEditing": true,
    "allowAdding": true,
    "allowDeleting": true,
    "mode": "Normal",
    "showConfirmDialog": true,
    "showDeleteConfirmDialog": true
  },
  "toolbar": ["Add", "Edit", "Delete", "Update", "Cancel"]
}
```

### 虚拟滚动

```json
{
  "enableVirtualization": true,
  "height": 600
}
```

### 选择配置

```json
{
  "selectionSettings": {
    "mode": "Row",
    "type": "Multiple",
    "checkboxMode": "ResetOnRowClick"
  }
}
```

## 安装依赖

```bash
# 安装 EJ2 核心包
pnpm add @syncfusion/ej2-vue-grids
pnpm add @syncfusion/ej2-vue-inputs
pnpm add @syncfusion/ej2-vue-calendars

# 注册 EJ2 授权（如果有）
# 在 main.ts 或 app.ts 添加：
import { registerLicense } from '@syncfusion/ej2-base'
registerLicense('YOUR-LICENSE-KEY')
```

## 注册组件

### main.ts / app.ts

```typescript
import { GridPlugin } from '@syncfusion/ej2-vue-grids'
import { TextBoxPlugin, NumericTextBoxPlugin } from '@syncfusion/ej2-vue-inputs'
import { DatePickerPlugin } from '@syncfusion/ej2-vue-calendars'

// 注册 EJ2 插件
app.use(GridPlugin)
app.use(TextBoxPlugin)
app.use(NumericTextBoxPlugin)
app.use(DatePickerPlugin)
```

## 在 DynamicPage.vue 中集成

### 方案 1：通过 rule.json 配置

```json
{
  "type": "ej2-table",
  "dataKey": "dataset.tables.Users.rows",
  "allowPaging": true,
  "allowSorting": true,
  "children": [
    { "type": "text", "name": "姓名", "value": "name" }
  ]
}
```

### 方案 2：注册为 form-create 自定义组件

在页面 script.js 中：

```javascript
import EJ2DynamicRenderer from '@/components/renderers/ej2/DynamicRenderer.vue'

export function __init__() {
  // 注册自定义组件
  return {
    'ej2-renderer': EJ2DynamicRenderer
  }
}
```

## 事件处理

### 绑定 EJ2 事件

```json
{
  "type": "ej2-table",
  "dataSource": "users",
  "on": {
    "rowSelected": "handleRowSelected",
    "actionComplete": "handleActionComplete",
    "dataSourceChanged": "handleDataChanged"
  }
}
```

在 script.js 中：

```javascript
export function handleRowSelected(args) {
  console.log('选中行:', args.data)
}

export function handleActionComplete(args) {
  if (args.requestType === 'save') {
    ElMessage.success('保存成功！')
  }
}
```

## 性能对比

### Element Plus el-table
- ✅ 适用场景：100-500 行数据
- ⚠️ 1000+ 行：明显卡顿
- ❌ 5000+ 行：基本不可用

### EJ2 Grid (虚拟滚动)
- ✅ 适用场景：10万+ 行数据
- ✅ 100万行：流畅渲染
- ✅ 内存占用低

## 与 Element Plus 版本兼容

两套渲染器可以共存：

```vue
<script setup>
import DynamicRenderer from '@/components/renderers/DynamicRenderer.vue'
import EJ2DynamicRenderer from '@/components/renderers/ej2/DynamicRenderer.vue'

const useEJ2 = ref(false) // 动态切换
</script>

<template>
  <component 
    :is="useEJ2 ? EJ2DynamicRenderer : DynamicRenderer"
    :rule="rule"
    :data="data"
  />
</template>
```

## 授权说明

- **社区许可证**：免费，适用于年收入 <$1M 的公司
- **商业许可证**：需购买
- **开发许可证**：试用期 30 天

官方授权页面：https://www.syncfusion.com/sales/products

## 参考资料

- [EJ2 Grid 官方文档](https://ej2.syncfusion.com/vue/documentation/grid/getting-started/)
- [EJ2 Grid API](https://ej2.syncfusion.com/vue/documentation/api/grid/)
- [示例代码](https://ej2.syncfusion.com/vue/demos/)

## 下一步

1. ✅ 创建 EJ2 版本渲染器
2. ⏳ 安装 EJ2 依赖包
3. ⏳ 注册 EJ2 插件
4. ⏳ 创建演示页面
5. ⏳ 在 form-create 中集成
