# SPARK Renderer 统一配置架构 — AI 生成指南

> 版本: 1.0 | 基于源码深度分析
>
> **目标**：为 AI 提供高度结构化、可预测的配置生成规范，使 AI 在理解 SPARK 组件体系后能自动生成 `rule.json` + `pagedata.json` + `script.js` 三件套。

---

## 1. 核心设计哲学：h-like 递归配置树

SPARK 的 `rule.json` 本质上等价于 Vue 的 `h()` 函数 —— 每个节点描述一个组件，通过 `children` 递归构建 UI 树：

```
h(type, props, children)  ←→  { type, props, children }
```

### 1.1 SparkNode 基础接口

```typescript
interface SparkNode {
  type: string                    // 组件类型（kebab-case）
  id?: string                     // 唯一 ID（省略时自动生成）
  dataKey?: string                // 数据绑定键（DataKey 格式）
  name?: string                   // 字段绑定名
  props?: Record<string, unknown> // 组件属性 + HTML 属性
  children?: SparkNode[]    // 子组件配置（递归）
  visible?: boolean               // 可见性
  disabled?: boolean              // 禁用状态
  on?: Record<string, string>     // 事件绑定（值为 script.js 函数名）
}
```

### 1.2 渲染管线总览

```
rule.json (JSON 配置)
  ↓ SparkPageRenderer
  ├─ 1. on / props.on* 字符串 → 可调用函数
  ├─ 2. 规则树保持 SparkNode 结构
  ├─ 3. SparkComponentRenderer 统一解释根级输入 + props
  ├─ 4. 容器组件自行解析 dataKey / children / dock / 权限上下文
    ↓ SparkComponentRenderer
    ├─ 查注册表 → 解析组件类型
  ├─ nodeInputProps(config) → 统一组件输入
    ├─ children 递归渲染
    ↓
渲染后的 Vue 组件树
```

---

## 2. 组件分类体系（四大类）

### 2.1 分类总览

| 类别 | 数量 | 代表 | 核心特征 |
|------|------|------|----------|
| **布局容器** | 12 | `r-table`, `r-form`, `div` | 管理子组件排列、提供数据上下文 |
| **字段组件** | 27 | `r-text`, `r-select` | 单值绑定、权限感知、上下文自适应 |
| **原生元素** | ∞ | `div`, `span`, `el-button` | 直接渲染为 HTML/Vue 组件 |
| **脚本组件** | N | `Render*` | script.js 中 `h()` 函数定义的自定义渲染 |

### 2.2 SPARK 容器组件完整清单

| type | 用途 | 数据绑定 | sparkChildren | 关键特性 |
|------|------|----------|---------------|----------|
| `r-table` | 数据表格 | ✅ dataKey→DataView→rows | ✅ 列节点 | toolbar, filter, actions |
| `r-form` | 编辑表单 | ✅ dataKey→DataView→currentRow | ✅ r-field-* | toolbar, grid, CONTEXT_DATA |
| `r-detail` | 详情展示 | ✅ dataKey→DataView→currentRow | ✅ r-field-* | toolbar, grid, CONTEXT_DATA |
| `r-tree` | 树形控件 | ✅ dataKey→DataView→rows | ✅ | toolbar, nodeActions |
| `r-list` | 列表/卡片 | ✅ dataKey→DataView→rows | ✅ | toolbar, actions, card |
| `r-tabs` | 标签页 | ❌ | ✅ tab panels | toolbar, modelValue |
| `r-collapse` | 折叠面板 | ❌ | ✅ collapse panels | toolbar, modelValue |
| `r-dialog` | 弹窗 | ❌ | ✅ | header/footer docks, grid |
| `r-drawer` | 抽屉 | ❌ | ✅ | header/footer docks, grid |
| `r-steps` | 步骤条 | ❌ | ✅ step panels | toolbar, modelValue |
| `r-section` | 区域块 | ❌ | ✅ | collapsible, card, header dock |
| `r-block` | 纯布局块 | ❌ | ❌ | 最简容器 |

### 2.3 SPARK 字段组件完整清单

| type | 值类型 | 选项源 | 分组 |
|------|--------|--------|------|
| `r-text` | `string` | — | 文本输入 |
| `r-textarea` | `string` | — | 文本输入 |
| `r-html-editor` | `string` | — | 文本输入 |
| `r-number` | `number \| [number, number]` | — | 数值输入 |
| `r-date` | `string \| Date \| Array` | — | 日期输入 |
| `r-color` | `string` | — | 颜色选择 |
| `r-slider` | `number` | — | 数值输入 |
| `r-rate` | `number` | — | 数值输入 |
| `r-switch` | `boolean` | — | 布尔选择 |
| `r-checkbox` | `boolean` | — | 布尔选择 |
| `r-select` | `T` | ✅ options | 单选 |
| `r-radio` | `T` | ✅ options | 单选 |
| `r-icon` | `string` | ✅ options | 单选 |
| `r-multi-select` | `T[]` | ✅ options | 多选 |
| `r-checkbox-group` | `T[]` | ✅ options | 多选 |
| `r-transfer` | `(string\|number)[]` | ✅ options | 多选 |
| `r-tree-select` | `T \| T[]` | ✅ options(树) | 层级选择 |
| `r-cascader` | `path \| path[]` | ✅ options(树) | 层级选择 |
| `r-entity-picker` | `T \| T[] \| string` | 弹窗选择 | 实体选择 |
| `r-user-picker` | 同上 | 弹窗选择 | 实体选择（预设） |
| `r-dept-picker` | 同上 | 弹窗选择 | 实体选择（预设） |
| `r-product-picker` | 同上 | 弹窗选择 | 实体选择（预设） |
| `r-upload` | `string` | — | 文件 |
| `r-image` | `string` | — | 文件 |
| `r-file-path` | `string` | — | 文件 |
| `r-file-browser` | `string` | — | 文件 |
| `r-column-group` | — | — | 结构（表格多级表头） |

---

## 3. 统一属性模型（Unified Props Model）

### 3.1 设计原则

所有 props 按职责分为 **7 个语义域（Semantic Domains）**：

```
SparkNode
├─ 🆔 Identity    : type, id, name
├─ 🔗 DataBinding : dataKey
├─ 👁️ State       : visible, disabled
├─ 🎨 Layout      : grid.*, style, class
├─ 🧱 Structure   : children（含 r-toolbar/r-filter/r-actions/r-header/r-footer/r-tail）
├─ ⚡ Actions     : on.* 与 builtin-action props
├─ 📡 Events      : on.*
└─ 📦 Props       : 组件特有属性（透传）
```

### 3.2 通用属性（所有组件共享）

```jsonc
{
  "type": "组件类型",           // 必填
  "id": "唯一标识",             // 可选，自动生成
  "visible": true,              // 可选，默认 true
  "disabled": false,            // 可选，默认 false
  "props": {                    // 可选，组件特有属性
    "class": "自定义 CSS 类",
    "style": { /* CSSProperties */ }
  },
  "on": {                       // 可选，事件绑定
    "事件名": "script.js 函数名"
  },
  "children": []                // 可选，子组件
}
```

### 3.3 数据绑定属性（数据感知组件）

```jsonc
{
  "type": "r-table",
  "dataKey": "Users@rows",      // DataKey: table@field 或 table@viewId@field
  "children": [
    {
      "type": "el-table-column",
      "name": "userName",        // 字段绑定名
      "props": { "label": "用户名" }
    }
  ]
}
```

### 3.4 容器扩展属性（容器组件共享）

```jsonc
{
  "type": "r-table",
  "dataKey": "Users@rows",
  "props": {
    // ── Grid 网格布局（form/detail/list/section 等）──
    "gridColumns": 24,           // 网格列数（默认 24）
    "gridGap": "16px",           // 列间距
    "gridAutoRows": "minmax(32px, auto)",

    // ── dock 展示参数（仅布局/样式，不承载结构节点）──
    "docks": {
      "toolbar": {
        "position": "top",
        "class": ""
      },
      "actions": {
        "position": "right",
        "label": "操作",
        "width": 150
      },
      "filter": {
        "class": "",
        "gridColumns": 4,
        "collapsible": true,
        "defaultCollapsed": false
      }
    }
  },
  "children": [
    { "type": "r-toolbar", "children": [] },
    { "type": "r-filter", "children": [] },
    { "type": "r-actions", "children": [] }
  ]
}
```

说明：toolbar / filter / actions / header / footer / tail 这类结构区必须通过 children 中的包装节点声明；props.docks.* 只负责这些区域的展示参数。

### 3.5 子项 Grid Span（子组件在父容器中的跨列/跨行）

```jsonc
{
  "type": "r-text",
  "name": "description",
  "props": {
    "label": "描述",
    "colSpan": 24,              // 此字段占满整行
    "rowSpan": 2                // 此字段跨 2 行
  }
}
```

---

## 4. 各容器类型属性速查表

### 4.1 r-table（数据表格，Wrapper 版规范）

> 规范：r-table 默认区只允许列节点。除列以外，工具栏、筛选项、行操作必须写在 children 中，并分别放入 r-toolbar、r-filter、r-actions 包装节点。

```jsonc
{
  "type": "r-table",
  "dataKey": "表名@rows",               // 必填
  "props": {
    // ── Element Plus 表格原生属性 ──
    "border": true,
    "stripe": true,
    "highlightCurrentRow": true,         // ⚠️ 不写则不高亮
    "rowKey": "id",
    "height": "400px",
    "maxHeight": "600px",

    // ── Docks ──
    "docks": {
      "toolbar": { "position": "top" },
      "filter": {
        "collapsible": true,
        "defaultCollapsed": false,
        "autoFitMinWidth": "200px",
        "itemSpan": 6,
        "gridColumns": 4
      },
      "actions": {
        "position": "right",
        "label": "操作",
        "width": 180,
        "align": "center",
        "fixed": "right"
      }
    }
  },
  "children": [
    {
      "type": "r-toolbar",
      "children": [
        { "type": "builtin-action", "props": { "builtinAction": "refresh" } }
      ]
    },
    {
      "type": "r-filter",
      "children": [
        { "type": "r-text", "props": { "field": "name", "label": "名称" } },
        { "type": "r-select", "props": { "field": "type", "label": "类型" } }
      ]
    },
    {
      "type": "r-actions",
      "children": [
        { "type": "el-button", "children": ["编辑"], "on": { "click": "handleEdit" } }
      ]
    },
    // ⚠️ 默认区只允许列节点
    {
      "type": "el-table-column",
      "props": { "prop": "name", "label": "名称", "width": 200 }
    },
    {
      "type": "el-table-column",
      "props": { "prop": "status", "label": "状态" }
    }
  ],
  "on": {
    "rowClick": "handleRowClick",        // (row, column, event)
    "rowDblclick": "handleRowDblclick"
  }
}
```

### 4.2 r-form（编辑表单）

```jsonc
{
  "type": "r-form",
  "dataKey": "表名@currentRow",          // 绑定当前行
  "props": {
    "labelWidth": "100px",
    "gridColumns": 24,
    "gridGap": "16px",
    "gridAutoRows": "minmax(32px, auto)",
    "docks": {
      "toolbar": { "position": "top" }
    }
  },
  "children": [
    {
      "type": "r-toolbar",
      "children": [
        { "type": "el-button", "props": { "type": "primary" }, "children": ["保存"], "on": { "click": "handleSave" } }
      ]
    },
    // r-form 的 children 是字段组件（r-text, r-select 等）
    { "type": "r-text", "name": "userName", "props": { "label": "用户名", "colSpan": 12 } },
    { "type": "r-select", "name": "role", "props": { "label": "角色", "colSpan": 12, "options": [...] } },
    { "type": "r-textarea", "name": "remark", "props": { "label": "备注", "colSpan": 24 } }
  ]
}
```

### 4.3 r-detail（详情展示）

```jsonc
{
  "type": "r-detail",
  "dataKey": "表名@currentRow",
  "props": {
    "gridColumns": 24,
    "gridGap": "16px",
    "gridAutoRows": "minmax(32px, auto)",
    "docks": {
      "toolbar": { "position": "top" }
    }
  },
  "children": [
    {
      "type": "r-toolbar",
      "children": [
        { "type": "builtin-action", "props": { "builtinAction": "refresh" } }
      ]
    },
    // 结构与 r-form 相同，但字段只读
    { "type": "r-text", "name": "userName", "props": { "label": "用户名", "colSpan": 12 } },
    { "type": "r-number", "name": "age", "props": { "label": "年龄", "colSpan": 12 } }
  ]
}
```

### 4.4 r-tree（树形控件）

```jsonc
{
  "type": "r-tree",
  "dataKey": "hierarchicalTreeData@rows", // 嵌套树数据
  "props": {
    "docks": {
      "toolbar": { "position": "top" }
    },

    // ── Node Actions 节点操作 ──
    "nodeActions": [
      { "type": "el-button", "props": { "size": "small" }, "children": ["编辑"] }
    ],
    "nodeActionsPosition": "right",

    // ── 事件回调（on* 属性形式）──
    "onNodeClick": "handleNodeClick",
    "onNodeExpand": "handleNodeExpand"
  },
  "children": [
    {
      "type": "r-toolbar",
      "children": [
        { "type": "builtin-action", "props": { "builtinAction": "refresh" } }
      ]
    }
  ]
}
```

### 4.5 r-list（列表/卡片）

```jsonc
{
  "type": "r-list",
  "dataKey": "表名@rows",
  "props": {
    "columns": 3,                        // 列数
    "gap": "16px",
    "minItemWidth": "250px",
    "useCard": true,                     // 卡片模式
    "cardShadow": "hover",
    "emptyText": "暂无数据",
    "rowKey": "id",

    "docks": {
      "toolbar": { "position": "top" },
      "actions": { "position": "right" }
    }
  },
  "children": [
    {
      "type": "r-toolbar",
      "children": [
        { "type": "builtin-action", "props": { "builtinAction": "append-row" } }
      ]
    },
    {
      "type": "r-actions",
      "children": [
        { "type": "el-button", "children": ["查看"], "on": { "click": "handleInspect" } }
      ]
    },
    // 列表项内的字段组件
    { "type": "r-text", "name": "title", "props": { "label": "标题" } }
  ]
}
```

### 4.6 r-tabs（标签页）

```jsonc
{
  "type": "r-tabs",
  "props": {
    "modelValue": "tab1",               // 默认激活标签
    "docks": {
      "toolbar": { "position": "top" }
    },
    "onTabChange": "handleTabChange",
    "onTabClick": "handleTabClick"
  },
  "children": [
    {
      "type": "r-toolbar",
      "children": [
        { "type": "builtin-action", "props": { "builtinAction": "refresh" } }
      ]
    },
    // 每个 child 代表一个标签面板
    {
      "type": "div",
      "props": { "label": "基本信息", "name": "tab1" },
      "children": [
        { "type": "r-form", "dataKey": "Users@currentRow", "children": [...] }
      ]
    },
    {
      "type": "div",
      "props": { "label": "详细信息", "name": "tab2" },
      "children": [...]
    }
  ]
}
```

### 4.7 r-collapse（折叠面板）

```jsonc
{
  "type": "r-collapse",
  "props": {
    "modelValue": ["panel1"],
    "docks": {
      "toolbar": { "position": "top" }
    },
    "onChange": "handleCollapseChange"
  },
  "children": [
    {
      "type": "r-toolbar",
      "children": [
        { "type": "builtin-action", "props": { "builtinAction": "refresh" } }
      ]
    },
    {
      "type": "div",
      "props": { "title": "面板一", "name": "panel1" },
      "children": [...]
    }
  ]
}
```

### 4.8 r-dialog / r-drawer（弹窗/抽屉）

```jsonc
{
  "type": "r-dialog",                   // 或 "r-drawer"
  "props": {
    "title": "编辑用户",
    "modelValue": false,                // 显示/隐藏

    // ── Dock 展示参数 ──
    "docks": {
      "header": { "class": "dialog-header" },
      "footer": { "class": "dialog-footer" }
    },

    // ── Grid 布局 ──
    "gridColumns": 24,
    "gridGap": "16px",

    // ── 生命周期回调 ──
    "onOpen": "handleDialogOpen",
    "onClose": "handleDialogClose"
  },
  "children": [
    {
      "type": "r-header",
      "children": [
        { "type": "el-button", "children": ["帮助"], "on": { "click": "handleHelp" } }
      ]
    },
    {
      "type": "r-footer",
      "children": [
        { "type": "el-button", "children": ["取消"], "on": { "click": "handleCancel" } },
        { "type": "el-button", "props": { "type": "primary" }, "children": ["确定"], "on": { "click": "handleConfirm" } }
      ]
    },
    { "type": "r-form", "dataKey": "Users@currentRow", "children": [...] }
  ]
}
```

### 4.9 r-steps（步骤条）

```jsonc
{
  "type": "r-steps",
  "props": {
    "modelValue": 0,                    // 当前步骤索引
    "docks": {
      "toolbar": { "position": "top" }
    },
    "onStepChange": "handleStepChange"
  },
  "children": [
    {
      "type": "r-toolbar",
      "children": [
        { "type": "builtin-action", "props": { "builtinAction": "refresh" } }
      ]
    },
    {
      "type": "div",
      "props": { "title": "步骤一", "description": "基本信息" },
      "children": [...]
    },
    {
      "type": "div",
      "props": { "title": "步骤二", "description": "详细配置" },
      "children": [...]
    }
  ]
}
```

### 4.10 r-section（区域块）

```jsonc
{
  "type": "r-section",
  "props": {
    "title": "用户信息",
    "description": "填写用户基本信息",
    "collapsible": true,
    "defaultCollapsed": false,
    "bordered": true,
    "useCard": false,
    "gridColumns": 24,
    "gridGap": "16px",

    "docks": {
      "header": { "class": "section-header" }
    }
  },
  "children": [
    {
      "type": "r-header",
      "children": [
        { "type": "el-button", "children": ["刷新"] }
      ]
    },
    ...
  ]
}
```

---

## 5. 字段组件属性速查表

### 5.1 通用字段属性（所有 r-* 字段共享）

```jsonc
{
  "type": "r-字段类型",
  "name": "字段名",                      // 必填：映射到 DataView 行的字段
  "props": {
    "label": "显示标签",                 // 必填：UI 上的文字标签
    "width": 200,                        // 可选：表格列宽(px)
    "colSpan": 12,                       // 可选：在 grid 容器中的跨列数
    "rowSpan": 1                         // 可选：跨行数
  }
}
```

### 5.2 选项类字段额外属性

适用于：`r-select`, `r-radio`, `r-icon`, `r-multi-select`, `r-checkbox-group`, `r-transfer`, `r-tree-select`, `r-cascader`

```jsonc
{
  "type": "r-select",
  "name": "status",
  "props": {
    "label": "状态",
    "options": [                         // 内联选项
      { "label": "启用", "value": "active" },
      { "label": "禁用", "value": "inactive" }
    ],
    // 或动态字段映射
    "optionLabelField": "name",          // 默认自动探测: label/text/name
    "optionValueField": "id",            // 默认自动探测: value/id/code
    "optionChildrenField": "children",   // 树形选项: children/items/nodes

    // UI 控制
    "placeholder": "请选择",
    "clearable": true,
    "filterable": true
  }
}
```

**选项字段自动探测链**（无需手动指定即可工作）：

| 字段 | 探测链 |
|------|--------|
| label | `[指定字段]` → `label` → `text` → `name` → `[value字段]` → `[值转字符串]` |
| value | `[指定字段]` → `value` → `id` → `code` → `[label字段]` |
| children | `[指定字段]` → `children` → `items` → `nodes` |

### 5.3 特殊字段属性速查

| 字段类型 | 特有属性 | 说明 |
|----------|----------|------|
| `r-textarea` | `rows`, `autosize`, `maxlength`, `showWordLimit` | 长文本 |
| `r-number` | `min`, `max`, `precision` | 数字 |
| `r-date` | （自动根据 filterMode 切换范围选择） | 日期 |
| `r-slider` | `min`(0), `max`(100), `step`(1), `showInput` | 滑块 |
| `r-rate` | `max`(5), `allowHalf` | 评分 |
| `r-switch` | `activeText`('是'), `inactiveText`('否') | 开关 |
| `r-checkbox` | `checkedText`, `uncheckedText`, `checkboxText` | 复选 |
| `r-radio` | `buttonStyle` ('radio'\|'button') | 单选样式 |
| `r-multi-select` | `collapseTags`, `collapseTagsTooltip`, `maxCollapseTags` | 多选标签折叠 |
| `r-transfer` | `titles`, `filterable`, `filterPlaceholder`, `targetOrder` | 穿梭框 |
| `r-tree-select` | `multiple`, `checkStrictly`, `defaultExpandAll`, `renderAfterExpand` | 树选择 |
| `r-cascader` | `emitPath`(true), `multiple`, `checkStrictly` | 级联 |
| `r-entity-picker` | `multiple`, `searchable`, `separator`, `entityName` | 实体弹窗 |
| `r-upload` | `action`, `accept`, `autoUpload`, `limit`, `listType`, `separator`, `buttonText` | 上传 |
| `r-image` | `action`, `accept`('image/*'), `multiple`, `separator` | 图片上传 |
| `r-file-path` | `action`, `accept`, `multiple`, `separator`, `buttonText` | 文件路径 |
| `r-column-group` | `label`, `fixed`, `align` | 多级表头分组 |

---

## 6. 能力注入链路（Capability Chain）

### 6.1 自动注入模型

```
SparkPlugin.install()
  └─ rootContext (空能力 Map)
      ↓
PageRenderer (页面渲染器)
  ├─ sparkProvide(APP_SERVICES, { router, logger })
  ├─ sparkProvide(PAGE_SERVICE, pageUiService)
  └─ sparkProvide(PAGE_DATASET, dataSet)
      ↓
r-table / r-form / r-detail / r-tree / r-list
  ├─ sparkConsume(PAGE_DATASET) → 解析 dataKey → DataView
  ├─ sparkProvide(DATA_SOURCE, dataView)      ← 子组件数据源
  ├─ sparkProvide(FIELD_CONTEXT, '容器类型')   ← 子组件渲染上下文
  └─ sparkProvide(CONTEXT_DATA, reactive({})) ← 仅 form/detail
      ↓
r-text / r-select / r-number / ...（字段组件）
  ├─ sparkConsume(DATA_SOURCE)    → DataView（读取 rows/currentRow）
  ├─ sparkConsume(FIELD_CONTEXT)  → 'table' | 'form' | 'detail'
  └─ sparkConsume(CONTEXT_DATA)   → reactive formModel（form/detail 上下文）
```

### 6.2 字段组件四模式渲染

每个字段组件通过 `FieldContextRenderer` 自动适配 4 种渲染上下文：

| 上下文 | 渲染方式 | 数据来源 |
|--------|----------|----------|
| `table` | el-table-column 内嵌 | `scope.row[fieldName]` |
| `form` | el-form-item + 输入控件 | `contextData[fieldName]` (双向绑定) |
| `detail` | el-descriptions-item | `contextData[fieldName]` (只读) |
| `tree` | 树节点内嵌 | `scope.row[fieldName]` |

### 6.3 权限接入

字段组件会接入统一权限体系，但本文件不再重复定义权限语义。

完整的权限模型、默认值、读写双通道、动作判定与宿主渲染差异，统一以 [PERMISSION_SYSTEM.md](PERMISSION_SYSTEM.md) 为准。

---

## 7. AI 配置生成规则

### 7.1 必须遵守的约束

| # | 约束 | 说明 |
|---|------|------|
| 1 | `r-table` 的 children 只能是 `el-table-column` | r-table 内部包装了 el-table |
| 2 | `el-table-column` 用 `props.prop` 绑定字段 | 不是 `name`，是 `prop` |
| 3 | `r-form` / `r-detail` 的 children 用 `name` 绑定 | 字段组件通过 `name` 映射数据 |
| 4 | `name` ≠ `label` | `name` = 字段键，`label` = 显示文字 |
| 5 | `highlightCurrentRow` 每个需要高亮的表格都要声明 | 框架不提供默认值 |
| 6 | 事件函数名写在 `on` 字段中，值为字符串 | `"on": { "click": "handleClick" }` |
| 7 | r-tree 事件用 `props.on*` 属性 | `"props": { "onNodeClick": "handleNodeClick" }` |
| 8 | dataKey 格式：`表名@字段` 或 `表名@视图ID@字段` | 字段值：`rows`, `currentRow`, `selectedRows`, `summaryRow` |
| 9 | sparkChildren 由框架自动处理 | rule.json 中写 `children` 即可，框架自动提取为 sparkChildren |
| 10 | `colSpan` / `rowSpan` 写在子项的 `props` 中 | Grid 容器内子项的布局控制 |

### 7.2 配置生成决策树

```
需求分析
├─ 展示列表数据？ → r-table + el-table-column + dataKey = "表名@rows"
├─ 编辑单条记录？ → r-form + r-field-* + dataKey = "表名@currentRow"
├─ 查看单条详情？ → r-detail + r-field-* + dataKey = "表名@currentRow"
├─ 树形导航？     → r-tree + dataKey = "树表@rows"
├─ 卡片列表？     → r-list + r-field-* + dataKey = "表名@rows"
├─ 多标签切换？   → r-tabs > children 面板
├─ 分步填写？     → r-steps > children 步骤
├─ 弹窗编辑？     → r-dialog > r-form
├─ 抽屉详情？     → r-drawer > r-detail
├─ 区域分组？     → r-section
└─ 纯布局排列？   → div / el-row + el-col
```

### 7.3 标准页面模板

#### 模板 A：主从表（左树右表）

```jsonc
{
  "type": "div",
  "props": { "style": { "display": "flex", "gap": "16px", "height": "100%" } },
  "children": [
    {
      "type": "r-tree",
      "dataKey": "treeData@rows",
      "props": {
        "style": { "width": "280px", "flexShrink": "0" },
        "docks": { "toolbar": { "position": "top" } },
        "onNodeClick": "handleNodeClick"
      },
      "children": [
        {
          "type": "r-toolbar",
          "children": [
            { "type": "el-button", "props": { "size": "small" }, "children": ["刷新"] }
          ]
        }
      ]
    },
    {
      "type": "r-table",
      "dataKey": "tableData@rows",
      "props": {
        "style": { "flex": "1" },
        "border": true,
        "highlightCurrentRow": true,
        "docks": {
          "toolbar": { "position": "top" },
          "actions": { "width": 150, "position": "right" }
        }
      },
      "children": [
        {
          "type": "r-toolbar",
          "children": [
            { "type": "builtin-action", "props": { "builtinAction": "refresh" } }
          ]
        },
        {
          "type": "r-actions",
          "children": [
            { "type": "el-button", "props": { "type": "primary", "link": true }, "children": ["编辑"], "on": { "click": "handleEdit" } },
            { "type": "el-button", "props": { "type": "danger", "link": true }, "children": ["删除"], "on": { "click": "handleDelete" } }
          ]
        },
        { "type": "el-table-column", "props": { "prop": "name", "label": "名称" } },
        { "type": "el-table-column", "props": { "prop": "type", "label": "类型" } },
        { "type": "el-table-column", "props": { "prop": "status", "label": "状态" } }
      ]
    }
  ]
}
```

#### 模板 B：表格 + 弹窗编辑

```jsonc
[
  {
    "type": "r-table",
    "dataKey": "Users@rows",
    "props": {
      "border": true,
      "highlightCurrentRow": true,
      "docks": {
        "toolbar": { "position": "top" },
        "actions": { "position": "right", "label": "操作" }
      }
    },
    "children": [
      {
        "type": "r-actions",
        "children": [
          { "type": "el-button", "props": { "type": "primary", "link": true }, "children": ["编辑"], "on": { "click": "handleEdit" } }
        ]
      },
      { "type": "el-table-column", "props": { "type": "selection", "width": 50 } },
      { "type": "el-table-column", "props": { "prop": "name", "label": "姓名" } },
      { "type": "el-table-column", "props": { "prop": "email", "label": "邮箱" } }
    ]
  },
  {
    "type": "r-dialog",
    "id": "editDialog",
    "props": {
      "title": "编辑用户",
      "docks": {
        "footer": { "class": "dialog-footer" }
      }
    },
    "children": [
      {
        "type": "r-footer",
        "children": [
          { "type": "el-button", "children": ["取消"], "on": { "click": "handleCancel" } },
          { "type": "el-button", "props": { "type": "primary" }, "children": ["保存"], "on": { "click": "handleSave" } }
        ]
      },
      {
        "type": "r-form",
        "dataKey": "Users@currentRow",
        "props": { "labelWidth": "80px", "gridColumns": 24 },
        "children": [
          { "type": "r-text", "name": "name", "props": { "label": "姓名", "colSpan": 12 } },
          { "type": "r-text", "name": "email", "props": { "label": "邮箱", "colSpan": 12 } },
          { "type": "r-textarea", "name": "remark", "props": { "label": "备注", "colSpan": 24 } }
        ]
      }
    ]
  }
]
```

#### 模板 C：分步表单

```jsonc
{
  "type": "r-steps",
  "props": { "modelValue": 0 },
  "children": [
    {
      "type": "div",
      "props": { "title": "基本信息" },
      "children": [
        {
          "type": "r-form",
          "dataKey": "Users@currentRow",
          "props": { "labelWidth": "100px", "gridColumns": 24 },
          "children": [
            { "type": "r-text", "name": "name", "props": { "label": "姓名", "colSpan": 12 } },
            { "type": "r-date", "name": "birthday", "props": { "label": "生日", "colSpan": 12 } }
          ]
        }
      ]
    },
    {
      "type": "div",
      "props": { "title": "权限配置" },
      "children": [
        {
          "type": "r-form",
          "dataKey": "Users@currentRow",
          "props": { "labelWidth": "100px" },
          "children": [
            { "type": "r-select", "name": "role", "props": { "label": "角色", "options": [...] } },
            { "type": "r-multi-select", "name": "perms", "props": { "label": "权限", "options": [...] } }
          ]
        }
      ]
    }
  ]
}
```

### 7.4 pagedata.json 配套生成规则

```jsonc
{
  "dataSetName": "PageDS",
  "tables": {
    "表名": {
      "tableName": "表名",
      "columns": [
        { "name": "id", "type": "string", "isPrimaryKey": true },
        { "name": "name", "type": "string" },
        { "name": "total", "type": "number", "computeExpression": "price * qty" }
      ],
      "rows": [],                                // 内联数据（可空）
      "api": {                                   // 远程数据源
        "list": { "url": "/api/表名", "method": "GET" }
      },
      "views": {
        "default": {
          "aggregates": {                        // 视图聚合
            "total": { "type": "sum" }
          }
        }
      }
    }
  },
  "tableRelations": [                                 // 父子级联（tableRelations）
    {
      "parentTable": "父表",
      "childTable": "子表",
      "parentField": "id",
      "childField": "parentId"
    }
  ]
}
```

### 7.5 script.js 配套生成规则

```javascript
// ── 模块级状态 ──
let _pageState = { /* 非 DataSet 的 UI 状态 */ }

// ── 页面入口 ──
function __init__() {
  // 1. 订阅数据事件
  const view = $dataSet?.getView('表名', 'default')
  view?.events.on('currentRowChanged', (row) => { /* ... */ })

  // 2. 初始化数据
  // ...
}

// ── 事件处理函数（与 rule.json 的 on.* 对应）──
function handleAdd() {
  $page.showDialog({ /* ... */ })
}

function handleEdit(row, index) {
  // row = 当前行数据, index = 行索引
}

function handleDelete(row, index) {
  $page.showConfirm('确定删除？').then(() => { /* ... */ })
}

// ── 自定义渲染函数 ──
function RenderStatusTag() {
  const row = arguments[0] // scope.row
  return h('span', { class: row.status === 'active' ? 'tag-success' : 'tag-danger' }, row.status)
}
```

---

## 8. 属性模型对照矩阵

### 8.1 容器特性矩阵

| 特性 | r-table | r-form | r-detail | r-tree | r-list | r-tabs | r-collapse | r-dialog | r-drawer | r-steps | r-section |
|------|---------|--------|----------|--------|--------|--------|------------|----------|----------|---------|-----------|
| dataKey | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| toolbar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| grid | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| actions | row | ❌ | ❌ | node | item | ❌ | ❌ | header+footer | header+footer | ❌ | header |
| filter | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| CONTEXT_DATA | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| modelValue | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| collapsible | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### 8.2 shared composable 使用矩阵

| composable | r-table | r-form | r-detail | r-tree | r-list | r-tabs | r-collapse | r-dialog | r-drawer | r-steps | r-section |
|------------|---------|--------|----------|--------|--------|--------|------------|----------|----------|---------|-----------|
| useContainerInput | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| useContainerDataSource | ✅ | — | — | ✅ | ✅ | — | — | — | — | — | — |
| useContainerToolbar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | — |
| useContainerActions | ✅ | — | — | ✅ | ✅ | — | — | ✅ | ✅ | — | ✅ |
| useContainerGrid | — | ✅ | ✅ | — | ✅ | — | — | ✅ | ✅ | — | ✅ |
| useContainerSlots | ✅ | — | — | ✅ | ✅ | — | — | ✅ | ✅ | — | ✅ |
| useFormDetailContainer | — | ✅ | ✅ | — | — | — | — | — | — | — | — |
| useContainerContextData | — | ✅ | ✅ | — | — | — | — | — | — | — | — |
| useTableFilters | ✅ | — | — | — | — | — | — | — | — | — | — |

---

## 9. 改进建议（Optimization Proposals）

### 9.1 配置噪音消减

**现状**：许多常用属性需要显式声明（如 `highlightCurrentRow`、`border`）。

**建议**：为 r-table 定义 **预设（preset）** 机制：

```jsonc
// 方案：r-table 内部默认启用常用属性
// border: true, highlightCurrentRow: true -- 由框架默认
// 只需声明 "不要" 的属性：
{ "type": "r-table", "dataKey": "Users@rows", "props": { "border": false } }
```

### 9.2 字段快捷语法

**现状**：每个字段需要完整的 `{ type, name, props: { label } }` 三层结构。

**建议**：支持字段简写（由渲染器输入解释层展开，而不是新增页面级 bindRules）：

```jsonc
// 完整写法
{ "type": "r-text", "name": "userName", "props": { "label": "用户名", "colSpan": 12 } }

// 简写提案（未实现）
{ "field": "userName", "label": "用户名", "span": 12, "fieldType": "text" }
```

### 9.3 AI 生成的 JSON Schema

建议生成标准 JSON Schema 文件，使 AI 可以在生成时进行自校验：

```jsonc
{
  "$schema": "https://spark-view.dev/schemas/rule.json",
  "type": "r-table",
  "dataKey": "Users@rows",
  // IDE 和 AI 自动补全 + 校验
}
```

---

## 附录 A：组件类型注册表快查

```
容器组件（懒加载）:
  r-table, r-form, r-detail, r-tree, r-list,
  r-tabs, r-collapse, r-dialog, r-drawer, r-steps,
  r-section, r-block

字段组件（同步注册）:
  r-text, r-textarea, r-html-editor, r-number, r-date,
  r-select, r-multi-select, r-radio, r-checkbox, r-checkbox-group,
  r-switch, r-slider, r-rate, r-color, r-icon,
  r-image, r-file-path, r-file-browser, r-upload,
  r-entity-picker, r-user-picker, r-dept-picker, r-product-picker,
  r-cascader, r-tree-select, r-transfer, r-column-group
```

## 附录 B：DataKey 字段值速查

| 字段 | 类型 | 说明 |
|------|------|------|
| `rows` | `IDataRow[]` | 视图当前行集合 |
| `currentRow` | `IDataRow \| null` | 当前聚焦行 |
| `selectedRows` | `IDataRow[]` | 当前选中行 |
| `summaryRow` | `Readonly<IDataRow>` | 全行聚合值 |
| `selectionSummaryRow` | `Readonly<IDataRow>` | 选中行聚合值 |

## 附录 C：事件绑定速查

### rule.json 事件写法

```jsonc
// 方式 1：on 对象（通用）
{ "type": "el-button", "on": { "click": "handleClick" } }

// 方式 2：props.on* 属性（r-tree 等特殊组件）
{ "type": "r-tree", "props": { "onNodeClick": "handleNodeClick" } }

// 方式 3：template 事件（el-table 内置事件，由 delegate 自动绑定）
// currentChange / selectionChange — 无需手动配置
```

### script.js 事件函数签名

| 事件源 | 函数签名 |
|--------|----------|
| el-button click | `handleClick()` |
| r-table actions dock click | `handleAction(row, index)` |
| r-tree nodeClick | `handleNodeClick(nodeData, node, event)` |
| r-list actions dock click | `handleAction(item, index)` |
| r-tabs tabChange | `handleTabChange(tabName)` |
| r-dialog open/close | `handleOpen()` / `handleClose()` |

---

## 10. SparkNode v2 结构化配置（优化版）

### 10.1 设计动机

当前 `SparkNode` 的核心问题：

| 问题 | 现状 | 影响 |
|------|------|------|
| **props 黑盒** | `props: Record<string, unknown>` | AI 无法区分 toolbar/layout/actions/原生属性 |
| **语义扁平** | `dataKey`/`name`/`visible` 散落在顶层和 props 中 | 同一概念有两种写法 |
| **事件混杂** | `on.*`（顶层）与 `props.on*`（属性）两套路径 | 解析逻辑分散在 SparkPageRenderer + SparkComponentRenderer |
| **AI 难以推断** | 所有属性混在 props 里 | 无法自动校验、无法区分输入/输出/控制属性 |

### 10.2 v1 → v2 关键改进

| # | 改进 | v1 | v2 | 理由 |
|---|------|----|----|------|
| 1 | **Filter 提升为独立域** | `meta.data.filter.*`（4 层嵌套） | `meta.filter.*`（3 层嵌套） | filter 有 9 个子属性，独立域提升 AI 发现性 |
| 2 | **DataConfig 瘦身** | DataConfig 包含 filter 子结构 | DataConfig 只管数据绑定 | 单一职责：数据源 + 字段 + 选项 |
| 3 | **BehaviorConfig 统一事件** | `on` + `hooks` + `nodeEvents` 三种分类 | 只有 `on`（统一映射） | 全是 `eventName → fnName` 映射，分类增加认知负担 |
| 4 | **ActionsConfig 支持双区** | 单一 ActionsConfig（dialog 语义不明） | `SimpleActions \| DualActions`（header+footer） | r-dialog/drawer 有两个独立操作区 |
| 5 | **类型 × 域适用矩阵** | 无 | 新增完整矩阵表 | AI 知道每个类型该用/不该用哪些域 |
| 6 | **事件命名规范** | 无 | 按组件类型列出标准事件名 | AI 不需猜测事件名 |
| 7 | **meta 域扩展为 7 个** | 6 个（data/layout/toolbar/actions/state/behavior） | 7 个（+ filter 独立域） | filter 复杂度值得独立命名空间 |

### 10.3 SparkNode v2 完整类型定义

```typescript
/**
 * SparkNode v2 — 7 语义域结构化配置
 *
 * 设计原则：
 * - props 只放组件原生属性（border, size, type, label 等）
 * - meta 放 SPARK 框架语义（数据/布局/工具栏/操作/状态/行为/筛选）
 * - meta 中无内容的域省略不写
 * - children 为递归 SparkNode 数组
 */
type SparkNode = {
  /** 组件类型（kebab-case，如 r-table / el-button / div） */
  type: string
  /** 唯一标识（省略则运行时自动生成 spark-${++counter}） */
  id?: string

  /** 组件原生属性（直接透传到目标组件的 props） */
  props?: Record<string, unknown>

  /** SPARK 语义域配置（7 域） */
  meta?: {
    /** 数据绑定（dataKey / name / options） */
    data?: DataConfig
    /** 布局定位（colSpan / grid 容器） */
    layout?: LayoutConfig
    /** 筛选器（仅数据容器，独立于 data） */
    filter?: FilterConfig
    /** 工具栏（全局操作区） */
    toolbar?: ToolbarConfig
    /** 上下文操作（行/节点/项，或弹窗头尾操作区） */
    actions?: ActionsConfig
    /** 状态控制（visible / disabled / modelValue） */
    state?: StateConfig
    /** 事件绑定（统一 on 映射，无分类） */
    behavior?: BehaviorConfig
  }

  /** 子组件（递归） */
  children?: SparkNode[]
}
```

### 10.4 各子配置类型定义（7 域）

#### DataConfig — 数据绑定

```typescript
interface DataConfig {
  /** DataKey 绑定键（如 Users@rows / Users@currentRow） */
  dataKey?: string
  /** 字段绑定名（映射到 DataView 行字段，如 "userName"） */
  name?: string

  /** 选项数据源（r-select / r-radio / r-checkbox-group 等字段组件用） */
  options?: Array<{ label: string; value: unknown; children?: unknown[] }>
  /** 选项字段映射（当 options 对象的字段名不是 label/value/children 时） */
  optionLabelField?: string
  optionValueField?: string
  optionChildrenField?: string
}
```

**对照迁移**：

| 旧写法 | 新写法 |
|--------|--------|
| `"dataKey": "Users@rows"` | `meta.data.dataKey` |
| `"name": "userName"` | `meta.data.name` |
| `"props": { "options": [...] }` | `meta.data.options` |
| `"props": { "optionLabelField": "text" }` | `meta.data.optionLabelField` |

#### LayoutConfig — 布局控制

```typescript
interface LayoutConfig {
  /** 在父 Grid 中的跨列数（24 列制，如 12 = 半宽） */
  colSpan?: number
  /** 在父 Grid 中的跨行数 */
  rowSpan?: number

  /** Grid 容器属性（当前节点作为父容器时生效） */
  grid?: {
    columns?: number           // 默认 24
    gap?: number | string      // 列间距，如 '16px' 或 12
    autoRows?: string          // 行高规则，如 'minmax(32px, auto)'
  }

  /** 样式快捷方式（定位相关的 style，如 flex/margin/padding） */
  style?: Record<string, string | number>
  /** CSS 类名 */
  class?: string | string[]
}
```

> **style/class 归属规则**：`meta.layout.style` 管「在父容器中的定位和尺寸」，`props.style` 管「组件自身外观」。归一化层自动合并。

**对照迁移**：

| 旧写法 | 新写法 |
|--------|--------|
| `"props": { "colSpan": 12 }` | `meta.layout.colSpan` |
| `"props": { "gridColumns": 24, "gridGap": "16px" }` | `meta.layout.grid: { columns: 24, gap: "16px" }` |

#### FilterConfig — 筛选器（v2 新增独立域）

```typescript
/**
 * 数据筛选配置（当前仅 r-table 消费）
 *
 * 从 v1 的 DataConfig.filter 提升为独立域，原因：
 * 1. 9 个子属性组成完整子系统，嵌套于 data 下增加不必要的层深
 * 2. 语义独立：filter 是「查询条件 UI」，而非「数据源绑定」
 * 3. 未来 r-list / r-tree 也可能支持筛选，独立域便于复用
 */
interface FilterConfig {
  /** 参与筛选的字段名列表 */
  columns?: string[]
  /** 筛选区可折叠 */
  collapsible?: boolean
  /** 默认折叠 */
  defaultCollapsed?: boolean
  /** 响应式自适应最小宽度 */
  autoFitMinWidth?: string       // 如 '220px'
  /** 每个筛选项的跨列数 */
  itemSpan?: number
  /** 筛选区网格列数 */
  gridColumns?: number           // 默认 24
  /** 筛选区网格间距 */
  gridGap?: number | string      // 默认 12
  /** 筛选区网格行高 */
  gridAutoRows?: string
  /** 筛选区自定义 CSS 类 */
  class?: string
}
```

**对照迁移**：

| 旧写法 | 新写法 |
|--------|--------|
| `"props": { "filterColumns": ["name", "status"] }` | legacy，仅迁移参考；当前规范改为 `children` 中的 `r-filter` 包装节点 |
| `"props": { "filterCollapsible": true }` | `props.docks.filter.collapsible` |
| `"props": { "filterGridColumns": 12 }` | `props.docks.filter.gridColumns` |

#### ToolbarConfig — 工具栏

```typescript
interface ToolbarConfig {
  /** 工具栏项（每项为 SparkNode，通常是 el-button） */
  items: SparkNode[]
  /** 位置 */
  position?: 'top' | 'bottom' | 'left' | 'right'  // 默认 'top'
  /** 自定义 CSS 类 */
  class?: string
}
```

**对照迁移**：

| 旧写法 | 新写法 |
|--------|--------|
| `"toolbar": { "items": [...] }` | `children: [{ "type": "r-toolbar", "children": [...] }]` |
| `"props": { "toolbarPosition": "top", "toolbarClass": "my-toolbar" }` | `"props": { "docks": { "toolbar": { "position": "top", "class": "my-toolbar" } } }` |

#### ActionsConfig — 操作区（v2 支持双区）

```typescript
/**
 * 操作区配置
 *
 * 简单模式（r-table / r-tree / r-list）：上下文操作（行/节点/项）
 * 双区模式（r-dialog / r-drawer）：header + footer 两个独立操作区
 *
 * 类型判别：
 * - "items" in actions → SimpleActionsConfig
 * - "header" in actions || "footer" in actions → DualActionsConfig
 */
type ActionsConfig = SimpleActionsConfig | DualActionsConfig

interface SimpleActionsConfig {
  /** 操作项（每项为 SparkNode，通常是 el-button） */
  items: SparkNode[]
  /** 位置（r-table 行操作列） */
  position?: 'left' | 'right'       // 默认 'right'
  /** 列标签（r-table 操作列标题） */
  label?: string                     // 如 '操作'
  /** 列宽度（r-table） */
  width?: number | string            // 默认 160
  /** 对齐方式（r-table） */
  align?: 'left' | 'center' | 'right'
  /** 固定位置（r-table） */
  fixed?: boolean | 'left' | 'right'
  /** 自定义 CSS 类 */
  class?: string
}

interface DualActionsConfig {
  /** 头部操作区（r-dialog/r-drawer 标题栏右侧） */
  header?: SimpleActionsConfig
  /** 底部操作区（r-dialog/r-drawer 底部按钮） */
  footer?: SimpleActionsConfig
}
```

**历史语义映射**（以下为旧模型归档，当前规范统一迁移为 wrapper children + props.docks）：

| 容器类型 | actions 语义 | 映射到现有 props |
|---------|-------------|-----------------|
| r-table | 行操作列 | `children[type='r-actions']` + `props.docks.actions.*` |
| r-tree | 节点操作 | `children[type='r-actions']` |
| r-list | 项操作 | `children[type='r-actions']` + `props.docks.actions.*` |
| r-dialog | 头尾操作区 | `children[type='r-header'/'r-footer']` + `props.docks.header/footer.*` |
| r-drawer | 头尾操作区 | `children[type='r-header'/'r-footer']` + `props.docks.header/footer.*` |

**对照迁移**：

| 旧写法 | 新写法 |
|--------|--------|
| `"props": { "rowActions": [...], "rowActionsWidth": 150 }` | `children[type='r-actions'] + props.docks.actions.width` |
| `"props": { "nodeActions": [...] }` | `children[type='r-actions']` |
| `"props": { "headerActions": [...], "footerActions": [...] }` | `children[type='r-header'/'r-footer'] + props.docks.header/footer` |

#### StateConfig — 状态控制

```typescript
interface StateConfig {
  /** 可见性 */
  visible?: boolean               // 默认 true
  /** 禁用 */
  disabled?: boolean              // 默认 false
  /** 双向绑定值 */
  modelValue?: unknown
  //   r-dialog/drawer: boolean（显示/隐藏）
  //   r-tabs: string（活跃标签名）
  //   r-steps: number（当前步骤索引）
  //   r-collapse: string | string[]（展开面板名）
  /** 是否折叠（r-section） */
  collapsed?: boolean
}
```

**对照迁移**：

| 旧写法 | 新写法 |
|--------|--------|
| `"visible": false` | `meta.state.visible` |
| `"disabled": true` | `meta.state.disabled` |
| `"props": { "modelValue": "tab1" }` | `meta.state.modelValue` |

#### BehaviorConfig — 事件绑定（v2 简化版）

```typescript
/**
 * 事件绑定（v2 统一模型）
 *
 * v1 将事件分为 on / hooks / nodeEvents 三类——实际上它们的底层机制完全相同：
 * 全部是 eventName → script.js 函数名 的字符串映射。AI 需要学习三种分类规则，
 * 增加认知负担但不增加表达力。
 *
 * v2 合并为统一的 on 映射。事件名遵循各组件的标准命名（见 10.6 事件命名规范）。
 */
interface BehaviorConfig {
  /** 事件绑定（key = 事件名，value = script.js 函数名） */
  on?: Record<string, string>
}
```

**v1 → v2 事件迁移对照**：

| v1 写法 | v2 写法 |
|---------|---------|
| `meta.behavior.on.click` | `meta.behavior.on.click`（不变） |
| `meta.behavior.on.rowDblclick` | `meta.behavior.on.rowDblclick`（不变） |
| `meta.behavior.hooks.onOpen` | `meta.behavior.on.open` |
| `meta.behavior.hooks.onClose` | `meta.behavior.on.close` |
| `meta.behavior.hooks.onOpened` | `meta.behavior.on.opened` |
| `meta.behavior.hooks.onClosed` | `meta.behavior.on.closed` |
| `meta.behavior.hooks.onTabChange` | `meta.behavior.on.tabChange` |
| `meta.behavior.hooks.onStepChange` | `meta.behavior.on.stepChange` |
| `meta.behavior.hooks.onChange` | `meta.behavior.on.change` |
| `meta.behavior.nodeEvents.onNodeClick` | `meta.behavior.on.nodeClick` |
| `meta.behavior.nodeEvents.onNodeExpand` | `meta.behavior.on.nodeExpand` |
| `meta.behavior.nodeEvents.onNodeCollapse` | `meta.behavior.on.nodeCollapse` |

> **命名规则**：去掉 `on` 前缀，首字母小写。`onNodeClick` → `nodeClick`。

### 10.5 类型 × 域 适用矩阵

明确每个组件类型可使用的 meta 域（AI 生成时必须遵守，未标记的域**不得出现**）：

| 组件类型 | data | layout | filter | toolbar | actions | state | behavior |
|---------|:----:|:------:|:------:|:-------:|:-------:|:-----:|:--------:|
| **r-table** | ✅ dataKey | ✅ grid | ✅ 完整 | ✅ | ✅ Simple | — | ✅ |
| **r-form** | ✅ dataKey | ✅ grid | — | ✅ | — | — | — |
| **r-detail** | ✅ dataKey | ✅ grid | — | ✅ | — | — | — |
| **r-tree** | ✅ dataKey | — | — | ✅ | ✅ Simple | — | ✅ nodeClick/Expand |
| **r-list** | ✅ dataKey | ✅ grid | — | ✅ | ✅ Simple | — | — |
| **r-dialog** | — | — | — | — | ✅ Dual | ✅ modelValue | ✅ open/close |
| **r-drawer** | — | — | — | — | ✅ Dual | ✅ modelValue | ✅ open/close |
| **r-tabs** | — | — | — | — | — | ✅ modelValue | ✅ tabChange |
| **r-steps** | — | — | — | — | — | ✅ modelValue | ✅ stepChange |
| **r-section** | — | — | — | — | — | ✅ collapsed | — |
| **r-collapse** | — | — | — | — | — | ✅ modelValue | — |
| **r-block** | — | ✅ grid | — | — | — | — | — |
| **r-text/field** | ✅ name+options | ✅ colSpan | — | — | — | ✅ disabled | ✅ change |
| **el-button** | — | — | — | — | — | ✅ disabled | ✅ click |
| **el-table-column** | — | — | — | — | — | — | — |
| **div/span/原生** | — | ✅ style/class | — | — | — | ✅ visible | ✅ click |

> **规则**：`—` 表示该域不应出现。AI 生成时如果为某组件添加了不适用的域，属于配置错误。

### 10.6 事件命名规范

每个容器类型的标准事件名（用于 `meta.behavior.on`）：

#### r-table 事件

| 事件名 | 回调签名 | 说明 |
|--------|---------|------|
| `rowClick` | `(row, column, event)` | 行单击 |
| `rowDblclick` | `(row, column, event)` | 行双击 |
| `currentChange` | `(currentRow, oldRow)` | 当前行变化（需 highlightCurrentRow） |
| `selectionChange` | `(selectedRows)` | 选中行变化（需 selection 列） |
| `sortChange` | `({ column, prop, order })` | 排序变化 |

#### r-tree 事件

| 事件名 | 回调签名 | 说明 |
|--------|---------|------|
| `nodeClick` | `(nodeData, node, treeNode)` | 节点点击 |
| `nodeExpand` | `(nodeData, node, treeNode)` | 节点展开 |
| `nodeCollapse` | `(nodeData, node, treeNode)` | 节点折叠 |
| `checkChange` | `(nodeData, checked, indeterminate)` | 复选变化 |

#### r-dialog / r-drawer 事件

| 事件名 | 回调签名 | 说明 |
|--------|---------|------|
| `open` | `()` | 打开前 |
| `opened` | `()` | 打开动画完成 |
| `close` | `()` | 关闭前 |
| `closed` | `()` | 关闭动画完成 |

#### r-tabs 事件

| 事件名 | 回调签名 | 说明 |
|--------|---------|------|
| `tabChange` | `(tabName)` | 活跃标签切换 |
| `tabClick` | `(pane, event)` | 标签被点击 |

#### r-steps 事件

| 事件名 | 回调签名 | 说明 |
|--------|---------|------|
| `stepChange` | `(stepIndex)` | 步骤切换 |

#### 字段组件通用事件

| 事件名 | 回调签名 | 说明 |
|--------|---------|------|
| `change` | `(value)` | 值变化 |
| `blur` | `(event)` | 失焦 |
| `focus` | `(event)` | 获焦 |

### 10.7 完整示例对照

> **r-table children 列组件选择策略**
>
> | 场景 | 使用组件 | 示例 |
> |------|---------|------|
> | **数据列**（展示/编辑字段值） | r-* 字段组件 | `r-text` / `r-number` / `r-select` / `r-date` … |
> | **特殊列**（选择框/序号/展开行） | `el-table-column` | `"props": { "type": "selection" }` |
> | **自定义列**（Render* 渲染函数） | `el-table-column` | 需要完全自定义 slot 内容时 |
>
> r-* 字段组件在 `r-table` 内通过 `FIELD_CONTEXT='table'` 自动渲染为 `el-table-column`，同时获得：
> - **统一语义**：`meta.data.name` 绑定字段，`props.label` 显示标签，与 r-form / r-detail 完全一致
> - **权限感知**：表格字段权限统一遵循 [PERMISSION_SYSTEM.md](PERMISSION_SYSTEM.md)，此处不再展开
> - **跨上下文复用**：同一个 `r-text` 节点放入 r-table=列、r-form=输入框、r-detail=只读展示

#### 示例 A：数据表格（r-table）

**当前规范写法**：

```jsonc
{
  "type": "r-table",
  "dataKey": "Users@rows",
  "props": {
    "border": true,
    "highlightCurrentRow": true,
    "docks": {
      "toolbar": { "position": "top" },
      "actions": {
        "label": "操作",
        "width": 150,
        "position": "right"
      },
      "filter": {
        "collapsible": true
      }
    },
  },
  "children": [
    {
      "type": "r-toolbar",
      "children": [
        { "type": "el-button", "props": { "type": "primary" }, "children": ["新增"], "on": { "click": "handleAdd" } }
      ]
    },
    {
      "type": "r-filter",
      "children": [
        { "type": "r-text", "props": { "field": "name", "label": "名称" } },
        { "type": "r-select", "props": { "field": "status", "label": "状态" } }
      ]
    },
    {
      "type": "r-actions",
      "children": [
        { "type": "el-button", "props": { "type": "primary", "link": true }, "children": ["编辑"], "on": { "click": "handleEdit" } },
        { "type": "el-button", "props": { "type": "danger", "link": true }, "children": ["删除"], "on": { "click": "handleDelete" } }
      ]
    },
    { "type": "el-table-column", "props": { "prop": "name", "label": "名称" } },
    { "type": "el-table-column", "props": { "prop": "status", "label": "状态" } }
  ],
  "on": { "rowDblclick": "handleRowDblclick" }
}
```

#### 示例 B：编辑表单（r-form）

**旧写法**：

```jsonc
{
  "type": "r-form",
  "dataKey": "Users@currentRow",
  "props": {
    "labelWidth": "100px",
    "gridColumns": 24,
    "gridGap": "16px",
    "docks": { "toolbar": { "position": "top" } }
  },
  "children": [
    {
      "type": "r-toolbar",
      "children": [
        { "type": "el-button", "props": { "type": "primary" }, "children": ["保存"], "on": { "click": "handleSave" } }
      ]
    },
    { "type": "r-text", "name": "userName", "props": { "label": "用户名", "colSpan": 12 } },
    { "type": "r-select", "name": "role", "props": { "label": "角色", "colSpan": 12, "options": [] } }
  ]
}
```

**新写法（SparkNode v2）**：

```jsonc
{
  "type": "r-form",
  "props": { "labelWidth": "100px" },
  "meta": {
    "data": { "dataKey": "Users@currentRow" },
    "layout": { "grid": { "columns": 24, "gap": "16px" } },
    "toolbar": {
      "items": [
        { "type": "el-button", "props": { "type": "primary" }, "children": ["保存"],
          "meta": { "behavior": { "on": { "click": "handleSave" } } } }
      ]
    }
  },
  "children": [
    { "type": "r-text",
      "meta": { "data": { "name": "userName" }, "layout": { "colSpan": 12 } },
      "props": { "label": "用户名" } },
    { "type": "r-select",
      "meta": { "data": { "name": "role", "options": [] }, "layout": { "colSpan": 12 } },
      "props": { "label": "角色" } }
  ]
}
```

#### 示例 C：弹窗 + 表单（双区 actions）

**新写法（SparkNode v2）**：

```jsonc
{
  "type": "r-dialog",
  "props": { "title": "编辑用户", "width": "600px" },
  "meta": {
    "state": { "modelValue": false },
    "actions": {
      "footer": {
        "items": [
          { "type": "el-button", "children": ["取消"],
            "meta": { "behavior": { "on": { "click": "handleCancel" } } } },
          { "type": "el-button", "props": { "type": "primary" }, "children": ["保存"],
            "meta": { "behavior": { "on": { "click": "handleSave" } } } }
        ]
      }
    },
    "behavior": { "on": { "open": "handleOpen", "close": "handleClose" } }
  },
  "children": [
    {
      "type": "r-form",
      "meta": {
        "data": { "dataKey": "Users@currentRow" },
        "layout": { "grid": { "columns": 24, "gap": "16px" } }
      },
      "children": [
        { "type": "r-text", "meta": { "data": { "name": "userName" } }, "props": { "label": "用户名" } },
        { "type": "r-number", "meta": { "data": { "name": "age" }, "layout": { "colSpan": 12 } }, "props": { "label": "年龄" } },
        { "type": "r-select",
          "meta": { "data": { "name": "role", "options": [{"label":"管理员","value":"admin"},{"label":"用户","value":"user"}] }, "layout": { "colSpan": 12 } },
          "props": { "label": "角色" } }
      ]
    }
  ]
}
```

#### 示例 D：树 + 详情联动

**新写法（SparkNode v2）**：

```jsonc
[
  {
    "type": "r-tree",
    "meta": {
      "data": { "dataKey": "Departments@rows" },
      "toolbar": {
        "items": [
          { "type": "el-button", "props": { "type": "primary", "size": "small" }, "children": ["新增"],
            "meta": { "behavior": { "on": { "click": "handleAddNode" } } } }
        ]
      },
      "actions": {
        "items": [
          { "type": "el-button", "props": { "link": true, "size": "small" }, "children": ["编辑"],
            "meta": { "behavior": { "on": { "click": "handleEditNode" } } } }
        ]
      },
      "behavior": { "on": { "nodeClick": "handleNodeClick" } }
    },
    "props": { "nodeKey": "id", "defaultExpandAll": true }
  },
  {
    "type": "r-detail",
    "meta": {
      "data": { "dataKey": "Departments@currentRow" },
      "layout": { "grid": { "columns": 24, "gap": "12px" } }
    },
    "children": [
      { "type": "r-text", "meta": { "data": { "name": "name" } }, "props": { "label": "部门名称" } },
      { "type": "r-text", "meta": { "data": { "name": "manager" } }, "props": { "label": "负责人" } }
    ]
  }
]
```

### 10.8 架构影响分析

#### 改动面评估（历史方案，已归档）

> 下面这段是早期“保留 BindRule 归一化层”的方案记录。
> 当前代码已移除 bindRules/BindRule 运行链，现行实现改为：SparkNode 直接进入 SparkPageRenderer / SparkComponentRenderer，由渲染器与容器组件解释输入。

| 模块 | 改动量 | 说明 |
|------|--------|------|
| **types.ts** | 低 | 新增 `SparkNode` 接口 + 7 个子类型 |
| **binding/normalize.ts** | 新增 | `normalizeSparkNode()` 归一化函数（纯映射，无业务逻辑） |
| **bindRules.ts** | 已移除 | 旧方案曾计划在入口增加 `'meta' in rule ? normalizeSparkNode(rule) : rule` |
| **SparkComponentRenderer.vue** | 现行主路径 | 当前由渲染器直接消费 SparkNode，并统一解释根级输入 + props |
| **容器/字段组件** | 无 | 归一化层已将 meta 展开为现有 props 格式 |
| **pagedata.json** | 无 | 不受影响 |
| **script.js** | 无 | 不受影响 |

#### 历史归档：normalizeSparkNode v2

```typescript
// 历史归档片段：展示过往的 BindRule 归一化思路。
// 当前实现已切换到 SparkNode + wrapper children + props.docks 展示参数规范，本段仅保留迁移背景，不作为新实现依据。

import type { SparkNode } from '../types'

/** 容器类型 → actions props 键名映射 */
const ACTION_KEY_MAP: Record<string, string> = {
  'r-table': 'rowActions',
  'r-tree':  'nodeActions',
  'r-list':  'itemActions',
  // r-dialog / r-drawer 使用特殊双区逻辑
}

/** 双区 actions 容器 */
const DUAL_ACTION_TYPES = new Set(['r-dialog', 'r-drawer'])

/**
 * SparkNode v2 → BindRule 归一化
 *
 * 纯映射函数，将 meta.* 展开到现有 BindRule 扁平结构，
 * 使所有下游管线（delegate / 容器组件 / 字段组件）零改动。
 */
export function normalizeSparkNode(node: SparkNode) {
  const rule = { type: node.type, props: { ...node.props } }
  if (node.id) rule['id'] = node.id
  if (node.children) rule.children = node.children.map(normalizeSparkNode)

  const m = node.meta
  if (!m) return rule

  // ── data → 顶层 + props ─────────────────────────────────────
  if (m.data?.dataKey) rule['dataKey'] = m.data.dataKey
  if (m.data?.name)    rule.name = m.data.name
  if (m.data?.options) setRuleProp(rule, 'options', m.data.options)
  if (m.data?.optionLabelField)    setRuleProp(rule, 'optionLabelField', m.data.optionLabelField)
  if (m.data?.optionValueField)    setRuleProp(rule, 'optionValueField', m.data.optionValueField)
  if (m.data?.optionChildrenField) setRuleProp(rule, 'optionChildrenField', m.data.optionChildrenField)

  // ── filter → props（独立域） ─────────────────────────────────
  if (m.filter) {
    const f = m.filter
    // 旧方案曾将 filter.columns 扁平化为 props.filterColumns；当前 r-table 已改为 r-filter 包装节点
    if (f.collapsible != null)      setRuleProp(rule, 'filterCollapsible', f.collapsible)
    if (f.defaultCollapsed != null) setRuleProp(rule, 'filterDefaultCollapsed', f.defaultCollapsed)
    if (f.autoFitMinWidth)  setRuleProp(rule, 'filterAutoFitMinWidth', f.autoFitMinWidth)
    if (f.itemSpan != null) setRuleProp(rule, 'filterItemSpan', f.itemSpan)
    if (f.gridColumns != null) setRuleProp(rule, 'filterGridColumns', f.gridColumns)
    if (f.gridGap != null)     setRuleProp(rule, 'filterGridGap', f.gridGap)
    if (f.gridAutoRows)     setRuleProp(rule, 'filterGridAutoRows', f.gridAutoRows)
    if (f.class)            setRuleProp(rule, 'filterClass', f.class)
  }

  // ── layout → props ───────────────────────────────────────────
  if (m.layout?.colSpan != null) setRuleProp(rule, 'colSpan', m.layout.colSpan)
  if (m.layout?.rowSpan != null) setRuleProp(rule, 'rowSpan', m.layout.rowSpan)
  if (m.layout?.grid) {
    if (m.layout.grid.columns != null)  setRuleProp(rule, 'gridColumns', m.layout.grid.columns)
    if (m.layout.grid.gap != null)      setRuleProp(rule, 'gridGap', m.layout.grid.gap)
    if (m.layout.grid.autoRows)  setRuleProp(rule, 'gridAutoRows', m.layout.grid.autoRows)
  }
  if (m.layout?.style) setRuleProp(rule, 'style', m.layout.style)
  if (m.layout?.class) setRuleProp(rule, 'class', m.layout.class)

  // ── toolbar → children + props.docks.toolbar ─────────────────
  if (m.toolbar) {
    rule.children = [
      ...(rule.children ?? []),
      ...m.toolbar.items.map(item => ({ ...item, dock: 'toolbar' })),
    ]
    setRuleProp(rule, 'docks', {
      ...(rule.props?.docks ?? {}),
      toolbar: {
        ...(m.toolbar.position ? { position: m.toolbar.position } : {}),
        ...(m.toolbar.class ? { class: m.toolbar.class } : {}),
      },
    })
  }

  // ── actions → props（按容器类型分派） ────────────────────────
  if (m.actions) {
    if (DUAL_ACTION_TYPES.has(rule.type)) {
      // 双区模式（r-dialog / r-drawer）
      const dual = m.actions as DualActionsConfig
      if ('header' in dual || 'footer' in dual) {
        if (dual.header?.items) setRuleProp(rule, 'headerActions', dual.header.items)
        if (dual.footer?.items) setRuleProp(rule, 'footerActions', dual.footer.items)
      } else {
        // 兼容：dialog 若传的是 SimpleActionsConfig → 视为 footerActions
        const simple = m.actions as SimpleActionsConfig
        if (simple.items) setRuleProp(rule, 'footerActions', simple.items)
      }
    } else {
      // 简单模式（r-table / r-tree / r-list）
      const simple = m.actions as SimpleActionsConfig
      const actionKey = ACTION_KEY_MAP[rule.type] ?? 'rowActions'
      if (simple.items)    setRuleProp(rule, actionKey, simple.items)
      if (simple.position) setRuleProp(rule, `${actionKey}Position`, simple.position)
      if (simple.label)    setRuleProp(rule, `${actionKey}Label`, simple.label)
      if (simple.width != null)  setRuleProp(rule, `${actionKey}Width`, simple.width)
      if (simple.align)    setRuleProp(rule, `${actionKey}Align`, simple.align)
      if (simple.fixed != null)  setRuleProp(rule, `${actionKey}Fixed`, simple.fixed)
      if (simple.class)    setRuleProp(rule, `${actionKey}Class`, simple.class)
    }
  }

  // ── state → 顶层 + props ────────────────────────────────────
  if (m.state?.visible != null)  rule['visible'] = m.state.visible
  if (m.state?.disabled != null) rule['disabled'] = m.state.disabled
  if (m.state?.modelValue !== undefined) setRuleProp(rule, 'modelValue', m.state.modelValue)
  if (m.state?.collapsed != null) setRuleProp(rule, 'collapsed', m.state.collapsed)

  // ── behavior.on → rule.on（统一事件映射） ────────────────────
  if (m.behavior?.on) {
    const eventMap: Record<string, string> = {}
    for (const [eventName, fnName] of Object.entries(m.behavior.on)) {
      // 生命周期事件（open/close/...）和组件特定事件（nodeClick/tabChange/...）
      // 需要加 on 前缀才能被渲染器 props.on* 通道识别
      if (isLifecycleOrComponentEvent(eventName)) {
        const propName = `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`
        setRuleProp(rule, propName, fnName)
      } else {
        // 标准 DOM/组件事件走 rule.on 通道
        eventMap[eventName] = fnName
      }
    }
    if (Object.keys(eventMap).length > 0) {
      rule.on = { ...rule.on, ...eventMap }
    }
  }

  return rule
}

/** 判断事件名是否为生命周期/组件特定事件（需走 props.on* 通道而非 rule.on 通道） */
const LIFECYCLE_EVENTS = new Set([
  'open', 'opened', 'close', 'closed',           // dialog/drawer
  'nodeClick', 'nodeExpand', 'nodeCollapse',       // tree
  'checkChange',                                    // tree
  'tabChange', 'tabClick',                          // tabs
  'stepChange',                                     // steps
  'change', 'blur', 'focus',                        // fields
])

function isLifecycleOrComponentEvent(eventName: string): boolean {
  return LIFECYCLE_EVENTS.has(eventName)
}
```

**历史说明**：这套方案的核心思路是保留中间归一化层；当前代码已改为直接由渲染器和容器组件解释 SparkNode，不再采用 BindRule 中间层。

### 10.9 双格式共存（渐进迁移，历史方案）

```typescript
// 历史提案：曾计划在 bindDataToRules 入口做双格式归一化。
// 当前现行方案已删除 bindDataToRules，改为 SparkNode 直接进入渲染器路径。
```

**效果**：
- 现有所有 `rule.json` 零改动继续工作（无 `meta` → 跳过归一化）
- 新页面可以用 SparkNode v2 格式编写
- AI 优先生成 SparkNode v2 格式，人工维护的老页面无需迁移
- 同一个 `rule.json` 中可以混用两种格式（逐节点判定）

### 10.10 优劣分析

#### 优势

| 维度 | 分析 |
|------|------|
| **AI 可预测性** | 7 个语义域有明确职责边界 + 类型适用矩阵明确约束 |
| **事件模型清晰** | 统一 `on` 映射 + 事件命名规范表，无需学习分类规则 |
| **类型安全** | 每个子配置强类型 + JSON Schema 可校验 |
| **props 纯净** | `props` 只剩组件原生属性，不再混入框架属性 |
| **双区支持** | dialog/drawer 的 header+footer 操作区有明确结构 |
| **向后兼容** | 归一化层 = 纯映射函数，不改现有管线，无回归风险 |

#### 需要注意的点

| 点 | 分析 | 建议 |
|----|------|------|
| **嵌套深度** | `meta.behavior.on.click` 比 `on.click` 多两层 | 接受——可读性收益 > 书写代价 |
| **el-button 简单组件** | 只需 `props` + `children` + 一个 `meta.behavior.on.click` | 允许 `meta` 省略简写（归一化兼容） |
| **style/class 两处可写** | `meta.layout.style` 和 `props.style` | `meta.layout` 管定位，`props` 管外观，归一化层合并 |
| **filter 仅 r-table 用** | 独立域但只有一个消费者 | 未来 r-list/r-tree 可能复用，且减少了嵌套深度，值得独立 |

### 10.11 AI 生成模板（SparkNode v2 格式）

#### 决策极简化

| 需求 | SparkNode v2 核心结构 |
|------|----------------------|
| 展示表格 | `type:"r-table"` + `meta.data.dataKey` + `meta.filter?` + `children: el-table-column` |
| 编辑表单 | `type:"r-form"` + `meta.data.dataKey` + `meta.layout.grid` + `children: r-field-*` |
| 树形导航 | `type:"r-tree"` + `meta.data.dataKey` + `meta.behavior.on.nodeClick` |
| 弹窗编辑 | `type:"r-dialog"` + `meta.state.modelValue` + `meta.actions.footer` + `children: r-form` |
| 按钮 | `type:"el-button"` + `props:{type}` + `meta.behavior.on.click` |
| 字段 | `type:"r-text"` + `meta.data.name` + `meta.layout.colSpan` + `props.label` |

**AI 生成 9 条规则**：

1. `type` 必填，使用 kebab-case
2. `props` 只放目标组件的原生属性（border/size/type/label/placeholder 等）
3. 数据绑定 → `meta.data`（dataKey / name / options）
4. 布局 → `meta.layout`（colSpan / grid）
5. 筛选 → `meta.filter`（仅 r-table）
6. 工具栏 → `meta.toolbar`
7. 操作 → `meta.actions`（Simple 或 Dual 模式）
8. 事件 → `meta.behavior.on`（参考 10.6 事件命名规范）
9. 状态 → `meta.state`（visible / disabled / modelValue）
10. **域约束**：必须遵循 10.5 类型适用矩阵，不适用的域不得出现

### 10.12 spark-app 与 SparkNode 的关系

通过深度阅读 `packages/spark-app/` 全部模块，确认 **spark-app 层不影响 SparkNode 模型设计**：

| spark-app 模块 | 职责层级 | 与 SparkNode 关系 |
|---------------|---------|------------------|
| AuthService / TokenManager | 应用启动层 | 无关：认证是全局基础设施，不是节点配置 |
| ConfigLoader / AppConfig | 应用配置层 | 无关：加载机制不影响节点结构 |
| PluginManager / PluginRegistry | 插件系统 | 无关：插件注册 UI 框架组件，不改节点格式 |
| DynamicRouter / RouterGuards | 路由层 | 无关：路由将 pageId → 页面，SparkNode 在页面内部 |
| useNavigation / useTabPages | 导航 UI | 无关：导航驱动路由跳转，不影响页面内组件配置 |
| ThemeService / useTheme | 主题系统 | 无关：全局 CSS 变量，不在节点级配置 |
| PAGE_SERVICE capability | 运行时能力 | 无关：showMessage/showDialog 等是脚本 API，不是 JSON 配置 |
| APP_SERVICES capability | 运行时能力 | 无关：router/logger 等由框架注入，非用户配置 |
| Logger / ErrorHandler | 基础设施 | 无关：跨切面服务 |

> **结论**：SparkNode 7 语义域（data/layout/filter/toolbar/actions/state/behavior）完整覆盖了所有组件级配置需求。应用层（认证/路由/插件/主题/导航）运行在更高层级，通过能力系统隐式注入，不在节点 JSON 中显式配置。

### 10.13 实施路线图

```
Phase 0 — 类型定义 + 归一化函数（历史方案，未作为现行路径落地）
  ├─ 新增 SparkNode + 7 个域类型到 spark-component/src/core/types.ts
  ├─ 新增 normalizeSparkNode() 到 binding/normalize-spark-node.ts
  ├─ 历史上曾计划在 bindDataToRules() 入口调用归一化；现已改为渲染器直接解释 SparkNode
  └─ 单元测试：
       - 旧格式输入 → 等价 SparkNode 输入解释（零改动验证）
       - SparkNode v2 输入 → 渲染器/容器行为一致（新格式验证）
       - 混合格式 → 正确处理（兼容性验证）
      - 双区 actions → children[type='r-header'/'r-footer'] + props.docks.header/footer（dialog/drawer 验证）

Phase 1 — AI 生成入口切换
  ├─ AI system-prompt 指定生成 SparkNode v2 格式
  ├─ 附带类型适用矩阵 + 事件命名规范
  ├─ AiPageService 输出 SparkNode v2 JSON
  └─ 旧页面保持 SparkNode，互不干扰

Phase 2 — JSON Schema + IDE 支持
  ├─ 生成 spark-node.schema.json（含 7 域 + 类型约束）
  ├─ IDE rule.json 文件关联 Schema
  └─ 属性补全 + 约束校验 + 事件名自动完成

Phase 3 — 渐进迁移（可选）
  ├─ 迁移工具：旧 rule.json → SparkNode v2（可逆转换）
  └─ 组件直接读 config.meta（绕过归一化，性能微优化）
```
