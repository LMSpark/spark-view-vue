# EJ2 Grid 多层 SLOT 架构

## 概述

通过 `EJ2ColumnsWrapper` 组件实现了三层 SLOT 自定义能力，完美解决 EJ2 Grid 指令系统与 Vue SLOT 的兼容性问题。

## 架构设计

```
┌─────────────────────────────────────────┐
│  EJ2TableRenderer (外层组件)            │
│  传递 columns 配置                       │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│  EJ2ColumnsWrapper (包装层)             │
│  - 标准化数据格式                        │
│  - 提供三层 SLOT 接口                    │
│  - 生成直接 VNode                        │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│  <e-columns> (EJ2 指令层)               │
│  接收直接的 <e-column> VNodes            │
└─────────────────────────────────────────┘
```

## 三层 SLOT 使用

### 层级 1：字段级 SLOT（默认，最简单）

**使用场景**：不需要自定义，使用内置渲染逻辑

**配置示例**：
```vue
<EJ2ColumnsWrapper :columns="columns">
  <!-- 不传任何 slot，使用默认渲染 -->
</EJ2ColumnsWrapper>
```

**rule.json 配置**：
```json
{
  "type": "ej2-table",
  "dataKey": "users",
  "children": [
    { "value": "id", "name": "ID", "width": 80 },
    { "value": "name", "name": "姓名", "width": 150 }
  ]
}
```

**优点**：
- ✅ 零代码，配置驱动
- ✅ 自动处理字段标准化（value→field, name→headerText）
- ✅ 自动处理只读逻辑（readonly → allowEditing: false）

---

### 层级 2：列级 SLOT（中等灵活）

**使用场景**：需要自定义单个列的属性（如动态标题、条件宽度）

**代码示例**：
```vue
<EJ2ColumnsWrapper :columns="columns">
  <template #column="{ column: col, index }">
    <e-column
      :field="col.field"
      :header-text="col.headerText + (col.required ? ' *' : '')"
      :width="col.width"
      :text-align="index === 0 ? 'Center' : 'Left'"
    />
  </template>
</EJ2ColumnsWrapper>
```

**应用场景**：
- 为必填列标题添加 `*`
- 根据索引设置不同对齐方式
- 动态计算列宽
- 添加 tooltip 或其他属性

**优点**：
- ✅ 对每一列有完全控制权
- ✅ 可以访问列数据和索引
- ✅ 保持列的遍历逻辑

---

### 层级 3：列表级 SLOT（最灵活）

**使用场景**：需要完全控制列的渲染逻辑（如分组、动态过滤）

**代码示例**：
```vue
<EJ2ColumnsWrapper :columns="columns">
  <template #default="{ columns: cols }">
    <!-- 只渲染可见列 -->
    <template v-for="col in cols.filter(c => c.visible !== false)">
      <!-- 主键列特殊样式 -->
      <e-column
        v-if="col.isPrimaryKey"
        :key="col.field"
        :field="col.field"
        :header-text="col.headerText"
        :width="80"
        text-align="Center"
        :is-primary-key="true"
      />
      <!-- 普通列 -->
      <e-column
        v-else
        :key="col.field"
        v-bind="col"
      />
    </template>
  </template>
</EJ2ColumnsWrapper>
```

**应用场景**：
- 动态过滤可见列
- 列分组渲染
- 条件渲染不同类型的列
- 复杂的列排序逻辑

**优点**：
- ✅ 完全控制渲染逻辑
- ✅ 可以实现复杂的列管理
- ✅ 支持条件渲染和动态列

---

## 字段标准化

`EJ2ColumnsWrapper` 自动将 form-create 格式转换为 EJ2 格式：

| form-create | EJ2 格式 | 说明 |
|------------|----------|------|
| `value` | `field` | 字段名 |
| `name` | `headerText` | 列标题 |
| `readonly: true` | `allowEditing: false` | 只读列 |

**示例**：
```javascript
// 输入（form-create 格式）
{ value: 'userId', name: '用户ID', readonly: true }

// 输出（EJ2 格式）
{ field: 'userId', headerText: '用户ID', allowEditing: false }
```

---

## 单元格内容自定义

`EJ2ColumnsWrapper` 还支持命名 slot 自定义单元格内容：

```vue
<EJ2ColumnsWrapper :columns="columns">
  <!-- 自定义 status 列的单元格渲染 -->
  <template #column-status="{ column: col }">
    <template #template="{ data }">
      <span :class="data.status === 'active' ? 'success' : 'danger'">
        {{ data.status }}
      </span>
    </template>
  </template>
</EJ2ColumnsWrapper>
```

**命名规则**：`#column-{fieldName}`

---

## 最佳实践

### 1. 选择合适的 SLOT 层级

```javascript
// ✅ 推荐：简单场景用字段级（默认）
<EJ2ColumnsWrapper :columns="columns" />

// ✅ 推荐：需要微调用列级
<EJ2ColumnsWrapper :columns="columns">
  <template #column="{ column }">...</template>
</EJ2ColumnsWrapper>

// ⚠️ 谨慎：只有复杂逻辑才用列表级
<EJ2ColumnsWrapper :columns="columns">
  <template #default="{ columns }">...</template>
</EJ2ColumnsWrapper>
```

### 2. 保持字段名一致性

```javascript
// ✅ 推荐：统一使用 EJ2 格式
{ field: 'userId', headerText: '用户ID' }

// ✅ 也可以：使用 form-create 格式（自动转换）
{ value: 'userId', name: '用户ID' }

// ❌ 避免：混用两种格式
{ field: 'userId', name: '用户ID' }  // 会取 field，忽略 name
```

### 3. 性能优化

```vue
<!-- ✅ 推荐：使用 key 优化渲染 -->
<e-column
  v-for="col in columns"
  :key="col.field"
  v-bind="col"
/>

<!-- ❌ 避免：使用索引作为 key -->
<e-column
  v-for="(col, index) in columns"
  :key="index"
  v-bind="col"
/>
```

---

## 对比 Element Plus

| 特性 | Element Plus | EJ2 + 包装层 |
|------|--------------|--------------|
| SLOT 支持 | ✅ 原生支持 | ✅ 通过包装层支持 |
| 列自定义 | ✅ 简单 | ✅ 三层灵活度 |
| 性能 | ⚠️ 1000 行卡顿 | ✅ 百万行流畅 |
| 企业功能 | ⚠️ 基础 | ✅ Excel/PDF导出 |
| 学习成本 | ✅ 低 | ⚠️ 中等 |

---

## 注意事项

### ⚠️ EJ2 Grid 的限制

1. **不支持 Vue 组件作为列内容**
   ```vue
   <!-- ❌ 不支持 -->
   <e-column>
     <CustomComponent />
   </e-column>
   
   <!-- ✅ 使用 EJ2 template -->
   <e-column>
     <template #template="{ data }">
       <span>{{ data.value }}</span>
     </template>
   </e-column>
   ```

2. **Slot 必须直接生成 VNode**
   - 包装层已处理此问题
   - 不要在 slot 中使用 `<div>` 等包裹元素

3. **指令顺序敏感**
   - `<e-columns>` 必须是 `<ejs-grid>` 的直接子元素
   - 包装层已保证此顺序

---

## 示例页面

访问以下页面查看实际效果：

- `/ej2-slot-test` - 基础 SLOT 测试
- `/ej2-slot-demo` - 多层 SLOT 演示
- `/ej2-demo` - 完整功能演示

---

## 技术原理

### 为什么需要包装层？

EJ2 Grid 使用自己的指令系统（`<e-columns>`），在 `created` 钩子中通过 `resolveArrayDirectives` 直接解析 VNode 子组件：

```javascript
// Syncfusion 内部代码（component-base.js:373）
created() {
  this.bindProperties();  // 解析指令
  this.fetchChildPropValues();  // 期望直接获取 <e-column> VNode
}
```

如果直接使用 Vue slot，会生成 Fragment 节点，破坏 EJ2 的解析逻辑：

```
期望：<e-columns> → [<e-column>, <e-column>, ...]
实际：<e-columns> → <Fragment> → [<e-column>, <e-column>, ...]
```

### 包装层如何解决？

`EJ2ColumnsWrapper` 确保 slot 生成的内容直接作为 `<e-columns>` 的子节点：

```vue
<e-columns>
  <slot>  <!-- slot 渲染后直接替换为子节点 -->
    <e-column />
    <e-column />
  </slot>
</e-columns>
```

最终 DOM 结构：
```
<e-columns>
  <e-column />
  <e-column />
</e-columns>
```

---

## 扩展阅读

- [Syncfusion EJ2 Grid 文档](https://ej2.syncfusion.com/vue/documentation/grid/)
- [Vue 3 Slots 文档](https://vuejs.org/guide/components/slots.html)
- [EJ2 Column Templates](https://ej2.syncfusion.com/vue/documentation/grid/columns/column-template/)
