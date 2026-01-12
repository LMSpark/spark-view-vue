# EJ2 Renderer 架构

## 概述

这是基于 **Syncfusion EJ2** 组件库的渲染器实现，与 Element Plus 版本保持相同的配置格式，但使用 EJ2 组件渲染。

## 目录结构

```
src/components/renderers/ej2/
├── TextRenderer.vue          # 文本类型（EJS-TextBox）
├── NumberRenderer.vue        # 数字类型（EJS-NumericTextBox）
├── DateRenderer.vue          # 日期类型（EJS-DatePicker）
├── TableRenderer.vue         # 表格容器（EJS-Grid）⭐
├── FormRenderer.vue          # 表单容器
├── DynamicRenderer.vue       # 动态渲染器（核心）
├── renderer-map.ts           # 类型到组件的映射表
└── README.md                 # 本文档
```

## 核心优势

### 为什么使用 EJ2？

相比 Element Plus，EJ2 提供企业级功能：

| 功能 | Element Plus | EJ2 |
|------|--------------|-----|
| **虚拟滚动** | ❌ 需第三方 | ✅ 内置 |
| **Excel 导出** | ❌ 需 xlsx.js | ✅ 原生支持 |
| **PDF 导出** | ❌ 无 | ✅ 原生支持 |
| **分组聚合** | ❌ 手动实现 | ✅ 内置 |
| **行内编辑** | ⚠️ 基础 | ✅ 强大 |
| **列冻结** | ⚠️ 左右冻结 | ✅ 任意列 |
| **过滤器** | ⚠️ 简单 | ✅ Excel 级别 |
| **大数据性能** | ⚠️ 1000 行卡顿 | ✅ 百万行流畅 |

## 使用示例

### 1. 基础表格

```json
{
  "type": "ej2-table",
  "dataSource": "users",
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

### 2. 高级表格（虚拟滚动 + Excel 导出）

```json
{
  "type": "ej2-grid",
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

### 3. 在 Vue 组件中使用

```vue
<script setup>
import EJ2DynamicRenderer from '@/components/renderers/ej2/DynamicRenderer.vue'

const rules = ref([{
  type: 'ej2-table',
  dataSource: 'users',
  allowPaging: true,
  children: [
    { type: 'text', name: '姓名', value: 'name' },
    { type: 'number', name: '年龄', value: 'age' }
  ]
}])

const pageData = reactive({
  users: [
    { name: '张三', age: 25 },
    { name: '李四', age: 30 }
  ]
})
</script>

<template>
  <EJ2DynamicRenderer
    v-for="(rule, index) in rules"
    :key="index"
    :rule="rule"
    :data="pageData"
  />
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
