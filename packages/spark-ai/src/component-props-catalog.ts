/**
 * SPARK AI 配置组件目录
 *
 * ⚠️ 自动生成 — 请勿手动编辑
 *
 * 由 vite-plugin-spark-catalog 在 build / dev 时生成。
 * 数据来源：vue-component-meta 类型提取 + supplement.ts 手工补充
 *
 * 重新生成：pnpm run dev 或 pnpm run build
 * 生成时间：2026-03-26T06:45:53.073Z
 * 条目数量：83
 */
import type { ComponentCatalog } from './catalog-types'

/**
 * AI 配置目录（精简版）
 *
 * 仅保留 AI 生成配置相关字段：registry / components(props, rootFields, emits,
 * binding, notes) / constraints。
 *
 * 完整 SSoT 位于 component-catalog.json；此文件专供 spark-ai 运行时查询，避免把
 * sharedTypes、schema、slots、exposed、source 等非配置信息带进模型上下文。
 */
export const COMPONENT_CATALOG: ComponentCatalog = {
  "version": "2.0.0",
  "buildTime": "2026-03-26T06:45:53.066Z",
  "componentCount": 83,
  "registry": {
    "containers": [
      "r-block",
      "r-collapse",
      "r-detail",
      "r-dialog",
      "r-drawer",
      "r-form",
      "r-list",
      "r-section",
      "r-steps",
      "r-table",
      "r-tabs",
      "r-tree"
    ],
    "fields": [
      "r-cascader",
      "r-checkbox",
      "r-checkbox-group",
      "r-collapse-item",
      "r-color",
      "r-context-renderer",
      "r-date",
      "r-dept-picker",
      "r-entity-picker",
      "r-file-browser",
      "r-file-path",
      "r-html-editor",
      "r-icon",
      "r-image",
      "r-multi-select",
      "r-number",
      "r-product-picker",
      "r-radio",
      "r-rate",
      "r-select",
      "r-slider",
      "r-step-item",
      "r-switch",
      "r-tab-pane",
      "r-text",
      "r-textarea",
      "r-toolbar",
      "r-transfer",
      "r-tree-select",
      "r-upload",
      "r-user-picker"
    ],
    "groups": [
      "r-column-group"
    ],
    "meta": [
      "builtin-action",
      "context-aware-fields-api"
    ]
  },
  "components": {
    "context-aware-fields-api": {
      "type": "context-aware-fields-api",
      "category": "meta",
      "description": "语境感知字段渲染能力总览",
      "props": [],
      "notes": "**context-aware-fields-api** — 语境感知字段渲染能力总览\n\n【核心能力】\n- 子组件渲染由父容器语境决定：r-table(table) / r-form(form) / r-detail(detail) / r-list(list) / r-tree(tree)\n- 同一 r-* 字段组件可跨语境复用，不复制多套组件\n- 字段组件必须处于容器 children 中，禁止顶层裸放（会丢失语境）\n\n【关键约束】\n- r-table children 仅放 r-* 字段组件，禁止 el-table-column\n- 事件逻辑优先用根级 on + script.js 函数，不在组件层硬编码父级判断\n- 字段绑定用根级 field\n\n【建议组合查询】\n- r-table, r-form, r-detail, r-text, r-number, r-select, builtin-action"
    },
    "builtin-action": {
      "type": "builtin-action",
      "category": "meta",
      "description": "声明式动作节点（零代码优先）",
      "props": [],
      "rootFields": [
        {
          "name": "type",
          "type": "\"builtin-action\"",
          "description": ""
        },
        {
          "name": "props.builtinAction",
          "type": "string",
          "description": "动作类型"
        }
      ],
      "notes": "**builtin-action** — 声明式动作节点（零代码优先）\n\n【节点形态】\ntype: \"builtin-action\"\nprops.builtinAction: string — 动作类型\nprops.label?: string — 按钮文案\nprops.type?: 'primary'|'success'|'warning'|'danger'|'info'\nprops.confirmTitle?: string — 删除类动作确认标题\nprops.confirmMessage?: string — 删除类动作确认文案\nprops.silent?: boolean — true 时关闭默认消息提示\n\n【常用动作】\nappend-row | refresh | patch-row | patch-current | patch-selected | delete-row | delete-selected | message-row\n\n【放置位置】\n- toolbar.items（工具栏动作）\n- actions.items（行内动作）\n\n适用于 r-table / r-list / r-form / r-detail 的常见 CRUD 场景"
    },
    "r-table": {
      "type": "r-table",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-table\" 组织子组件。",
      "props": [
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-table\"",
          "description": "组件类型（运行时缺省回落为 r-table）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性透传占位（兼容 SparkNode 结构）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识"
        },
        {
          "name": "dataKey",
          "type": "string",
          "required": false,
          "description": "DataKey 格式：tableName@field"
        },
        {
          "name": "docks",
          "type": "ContainerDocks",
          "required": false,
          "default": "{}",
          "description": "停靠区域显示配置"
        }
      ],
      "rootFields": [
        {
          "name": "dataKey",
          "type": "string",
          "description": "数据绑定键，如 \"Users@rows\"（根级）"
        },
        {
          "name": "on.rowDblclick",
          "type": "string",
          "description": "行双击（→ script.js 函数名）"
        },
        {
          "name": "filter.columns",
          "type": "Array<string | FilterItem>",
          "description": "筛选项列表"
        },
        {
          "name": "filter.collapsible",
          "type": "boolean",
          "description": "可折叠，默认 false"
        },
        {
          "name": "filter.defaultCollapsed",
          "type": "boolean",
          "description": "默认折叠，默认 false"
        },
        {
          "name": "filter.autoFitMinWidth",
          "type": "string",
          "description": "最小宽度，默认 '220px'"
        },
        {
          "name": "filter.class",
          "type": "string",
          "description": "筛选区 CSS 类名"
        },
        {
          "name": "filter.itemSpan",
          "type": "number",
          "description": "每项跨列数，默认 1"
        },
        {
          "name": "filter.gridColumns",
          "type": "number",
          "description": "栅格总列数，默认 24"
        },
        {
          "name": "filter.gridGap",
          "type": "number | string",
          "description": "间距，默认 12"
        },
        {
          "name": "filter.gridAutoRows",
          "type": "string",
          "description": "行高，默认 'minmax(32px, auto)'"
        },
        {
          "name": "actions.items",
          "type": "SparkNode[]",
          "description": "行操作按钮（优先 builtin-action）"
        },
        {
          "name": "actions.position",
          "type": "'left' | 'right'",
          "description": "默认 'right'"
        },
        {
          "name": "actions.label",
          "type": "string",
          "description": "操作列标题，默认 '操作'"
        },
        {
          "name": "actions.width",
          "type": "number",
          "description": "操作列宽度，默认 160"
        },
        {
          "name": "actions.align",
          "type": "'left' | 'center' | 'right'",
          "description": "默认 'left'"
        },
        {
          "name": "actions.fixed",
          "type": "boolean | 'left' | 'right'",
          "description": "固定方向"
        },
        {
          "name": "actions.class",
          "type": "string",
          "description": "操作列 CSS 类名"
        }
      ],
      "notes": "**r-table** — 数据表格容器\n\n【props — 透传到 el-table】\nborder: boolean — 边框\nstripe: boolean — 斑马纹\nhighlightCurrentRow: boolean — 当前行高亮（⚠️ 必须显式声明才生效）\nheight / maxHeight: string | number — 表格高度\nstyle: object — 行内样式\nclass: string — CSS 类名\n\n【根级字段 — 数据绑定】\ndataKey: string — 数据绑定键，如 \"Users@rows\"（根级）\n\n【根级字段 — 事件绑定】\non.rowDblclick: string — 行双击（→ script.js 函数名）\n（其他组件事件同理，key 为 camelCase 事件名）\n\n【根级字段 — filter 筛选配置】\nfilter.columns: Array<string | FilterItem> — 筛选项列表\n  字符串简写：\"fieldName\" 等价于 { field: \"fieldName\", component: \"text\" }\n  完整 FilterItem：{ field, label?, component?, options?, logic?, span?, props? }\n  component 内置值：text | select | date | date-range | number | number-range | checkbox | radio\nfilter.collapsible: boolean — 可折叠，默认 false\nfilter.defaultCollapsed: boolean — 默认折叠，默认 false\nfilter.autoFitMinWidth: string — 最小宽度，默认 '220px'\nfilter.class: string — 筛选区 CSS 类名\nfilter.itemSpan: number — 每项跨列数，默认 1\nfilter.gridColumns: number — 栅格总列数，默认 24\nfilter.gridGap: number | string — 间距，默认 12\nfilter.gridAutoRows: string — 行高，默认 'minmax(32px, auto)'\n\n【工具栏】\nchildren 中声明 dock: 'toolbar' 的节点会渲染到工具栏区域。\nprops.docks.toolbar.position: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'\nprops.docks.toolbar.class: string — 工具栏 CSS 类名\n\n【根级字段 — actions 行操作列】\nactions.items: SparkNode[] — 行操作按钮（优先 builtin-action）\nactions.position: 'left' | 'right' — 默认 'right'\nactions.label: string — 操作列标题，默认 '操作'\nactions.width: number — 操作列宽度，默认 160\nactions.align: 'left' | 'center' | 'right' — 默认 'left'\nactions.fixed: boolean | 'left' | 'right' — 固定方向\nactions.class: string — 操作列 CSS 类名\n\n【能力链】\nconsumes: PAGE_DATASET, PAGE_SERVICE, PAGE_COMPONENT_REGISTRY, MODULE_CONTEXT\nprovides: DATA_SOURCE\n\nchildren 内仅用 r-* 字段组件做列，禁止 el-table-column",
      "binding": {
        "selfResolving": true
      }
    },
    "r-form": {
      "type": "r-form",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-form\" 组织子组件。",
      "props": [
        {
          "name": "dataKey",
          "type": "string",
          "required": false,
          "description": "数据绑定键，如 \"Users@currentRow\""
        },
        {
          "name": "docks",
          "type": "ContainerDocks",
          "required": false,
          "default": "{}",
          "description": "停靠区域显示配置"
        },
        {
          "name": "labelWidth",
          "type": "string",
          "required": false,
          "default": "\"100px\"",
          "description": "表单标签宽度"
        },
        {
          "name": "gridColumns",
          "type": "number",
          "required": false,
          "default": "24",
          "description": "CSS Grid 列数"
        },
        {
          "name": "gridGap",
          "type": "string | number",
          "required": false,
          "default": "0",
          "description": "栅格间距"
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "required": false,
          "default": "\"minmax(32px, auto)\"",
          "description": "栅格行高"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-form\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "rootFields": [
        {
          "name": "dataKey",
          "type": "string",
          "description": "数据绑定键，如 \"Users@currentRow\""
        },
        {
          "name": "props.docks.toolbar.position",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "description": "默认 'top'"
        },
        {
          "name": "props.docks.toolbar.class",
          "type": "string",
          "description": "工具栏 CSS 类名"
        },
        {
          "name": "labelWidth",
          "type": "string",
          "description": "标签宽度，默认 '100px'"
        },
        {
          "name": "gridColumns",
          "type": "number",
          "description": "CSS Grid 列数，默认 24"
        },
        {
          "name": "gridGap",
          "type": "number | string",
          "description": "栅格间距，默认 0"
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "description": "行高定义，默认 'minmax(32px, auto)'"
        }
      ],
      "notes": "**r-form** — 数据表单容器（读写 currentRow）\ndataKey: string — 数据绑定键，如 \"Users@currentRow\"\ndock='toolbar' children — 工具栏节点\nprops.docks.toolbar.position: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'\nprops.docks.toolbar.class: string — 工具栏 CSS 类名\nlabelWidth: string — 标签宽度，默认 '100px'\ngridColumns: number — CSS Grid 列数，默认 24\ngridGap: number | string — 栅格间距，默认 0\ngridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'\n\n【能力链】\nconsumes: PAGE_DATASET\nprovides: DATA_SOURCE, CONTEXT_DATA\n\nchildren 内放 r-* 字段组件",
      "binding": {
        "selfResolving": true
      }
    },
    "r-detail": {
      "type": "r-detail",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-detail\" 组织子组件。",
      "props": [
        {
          "name": "dataKey",
          "type": "string",
          "required": false,
          "description": "数据绑定键"
        },
        {
          "name": "docks",
          "type": "ContainerDocks",
          "required": false,
          "default": "{}",
          "description": "停靠区域显示配置"
        },
        {
          "name": "gridColumns",
          "type": "number",
          "required": false,
          "default": "24",
          "description": "CSS Grid 列数"
        },
        {
          "name": "gridGap",
          "type": "string | number",
          "required": false,
          "default": "0",
          "description": "栅格间距"
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "required": false,
          "default": "\"minmax(32px, auto)\"",
          "description": "栅格行高"
        },
        {
          "name": "titleAlign",
          "type": "\"left\" | \"right\" | \"center\"",
          "required": false,
          "default": "\"left\"",
          "description": "标题对齐"
        },
        {
          "name": "valueAlign",
          "type": "\"left\" | \"right\" | \"center\"",
          "required": false,
          "default": "\"left\"",
          "description": "值对齐"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-detail\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "rootFields": [
        {
          "name": "dataKey",
          "type": "string",
          "description": "数据绑定键"
        },
        {
          "name": "props.docks.toolbar.position",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "description": "默认 'top'"
        },
        {
          "name": "props.docks.toolbar.class",
          "type": "string",
          "description": "工具栏 CSS 类名"
        },
        {
          "name": "gridColumns",
          "type": "number",
          "description": "CSS Grid 列数，默认 24"
        },
        {
          "name": "gridGap",
          "type": "number | string",
          "description": "栅格间距，默认 0"
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "description": "行高定义，默认 'minmax(32px, auto)'"
        }
      ],
      "notes": "**r-detail** — 只读详情容器（展示 currentRow）\ndataKey: string — 数据绑定键\ndock='toolbar' children — 工具栏节点\nprops.docks.toolbar.position: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'\nprops.docks.toolbar.class: string — 工具栏 CSS 类名\ngridColumns: number — CSS Grid 列数，默认 24\ngridGap: number | string — 栅格间距，默认 0\ngridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'\n\n【能力链】\nconsumes: PAGE_DATASET\nprovides: DATA_SOURCE, CONTEXT_DATA\n\nchildren 内放 r-* 字段组件（只读模式）",
      "binding": {
        "selfResolving": true
      }
    },
    "r-tree": {
      "type": "r-tree",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-tree\" 组织子组件。",
      "props": [
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-tree\"",
          "description": "组件类型（运行时缺省回落为 r-tree）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性透传占位（兼容 SparkNode 结构）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识"
        },
        {
          "name": "dataKey",
          "type": "string",
          "required": false,
          "description": "数据绑定键，如 \"TreeData@rows\""
        },
        {
          "name": "docks",
          "type": "ContainerDocks",
          "required": false,
          "description": "停靠区域显示配置"
        },
        {
          "name": "allowAppend",
          "type": "boolean",
          "required": false,
          "description": "允许追加子节点（自动生成追加按钮）"
        },
        {
          "name": "allowDelete",
          "type": "boolean",
          "required": false,
          "description": "允许删除节点（自动生成删除按钮）"
        }
      ],
      "rootFields": [
        {
          "name": "dataKey",
          "type": "string",
          "description": "数据绑定键，如 \"TreeData@rows\""
        },
        {
          "name": "dataView",
          "type": "DataView",
          "description": "直接传入的 DataView（与 Table/List/Form/Detail 一致）"
        },
        {
          "name": "props.docks.toolbar.position",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "description": "工具栏位置"
        },
        {
          "name": "props.docks.toolbar.class",
          "type": "string",
          "description": "工具栏 CSS 类名"
        },
        {
          "name": "allowAppend",
          "type": "boolean",
          "description": "允许追加子节点（自动生成追加按钮）"
        },
        {
          "name": "allowDelete",
          "type": "boolean",
          "description": "允许删除节点（自动生成删除按钮）"
        },
        {
          "name": "onNodeClick",
          "type": "string",
          "description": "script.js 节点点击回调函数名"
        },
        {
          "name": "onNodeExpand",
          "type": "string",
          "description": "节点展开回调"
        },
        {
          "name": "onNodeCollapse",
          "type": "string",
          "description": "节点折叠回调"
        }
      ],
      "notes": "**r-tree** — 树形组件容器\ndataKey: string — 数据绑定键，如 \"TreeData@rows\"\ndataView: DataView — 直接传入的 DataView（与 Table/List/Form/Detail 一致）\ndock='toolbar' children — 工具栏节点\nprops.docks.toolbar.position: 'top' | 'bottom' | 'left' | 'right' — 工具栏位置\nprops.docks.toolbar.class: string — 工具栏 CSS 类名\nallowAppend: boolean — 允许追加子节点（自动生成追加按钮）\nallowDelete: boolean — 允许删除节点（自动生成删除按钮）\nonNodeClick: string — script.js 节点点击回调函数名\nonNodeExpand: string — 节点展开回调\nonNodeCollapse: string — 节点折叠回调\n其他 props 透传到 el-tree（node-key, default-expand-all, show-checkbox 等）\n\n【能力链】\nconsumes: PAGE_DATASET\nprovides: DATA_SOURCE, CONTEXT_DATA",
      "binding": {
        "selfResolving": true
      }
    },
    "r-list": {
      "type": "r-list",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-list\" 组织子组件。",
      "props": [
        {
          "name": "dataKey",
          "type": "string",
          "required": false,
          "description": "数据绑定键"
        },
        {
          "name": "docks",
          "type": "ContainerDocks",
          "required": false,
          "default": "{}",
          "description": "停靠区域显示配置"
        },
        {
          "name": "columns",
          "type": "number",
          "required": false,
          "default": "1",
          "description": "列数"
        },
        {
          "name": "gap",
          "type": "string | number",
          "required": false,
          "default": "0",
          "description": "列表项间距"
        },
        {
          "name": "minItemWidth",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "最小项宽度"
        },
        {
          "name": "rowKey",
          "type": "string",
          "required": false,
          "default": "\"id\"",
          "description": "行唯一键字段"
        },
        {
          "name": "emptyText",
          "type": "string",
          "required": false,
          "default": "\"\\u6682\\u65E0\\u6570\\u636E\"",
          "description": "空数据提示文案"
        },
        {
          "name": "itemClass",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "列表项 CSS 类名"
        },
        {
          "name": "itemStyle",
          "type": "CSSProperties",
          "required": false,
          "default": "{}",
          "description": "列表项行内样式"
        },
        {
          "name": "useCard",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "使用卡片包裹"
        },
        {
          "name": "cardShadow",
          "type": "\"never\" | \"always\" | \"hover\"",
          "required": false,
          "default": "\"hover\"",
          "description": "卡片阴影模式"
        },
        {
          "name": "gridColumns",
          "type": "number",
          "required": false,
          "default": "24",
          "description": "CSS Grid 列数"
        },
        {
          "name": "gridGap",
          "type": "string | number",
          "required": false,
          "default": "0",
          "description": "栅格间距"
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "required": false,
          "default": "\"minmax(32px, auto)\"",
          "description": "栅格行高"
        },
        {
          "name": "itemColSpan",
          "type": "number",
          "required": false,
          "description": "项跨列数"
        },
        {
          "name": "itemRowSpan",
          "type": "number",
          "required": false,
          "default": "1",
          "description": "项跨行数"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-list\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "rootFields": [
        {
          "name": "dataKey",
          "type": "string",
          "description": "数据绑定键"
        },
        {
          "name": "props.docks.toolbar.position",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "description": "默认 'top'"
        },
        {
          "name": "props.docks.toolbar.class",
          "type": "string",
          "description": "工具栏 CSS 类名"
        },
        {
          "name": "itemActions",
          "type": "Rule[]",
          "description": "列表项操作区"
        },
        {
          "name": "itemActionsPosition",
          "type": "'left' | 'right'",
          "description": "默认 'right'"
        },
        {
          "name": "itemActionsClass",
          "type": "string",
          "description": "操作区 CSS 类名"
        },
        {
          "name": "columns",
          "type": "number",
          "description": "列数，默认 1"
        },
        {
          "name": "gap",
          "type": "number | string",
          "description": "间距，默认 0"
        },
        {
          "name": "minItemWidth",
          "type": "string",
          "description": "最小项宽度"
        },
        {
          "name": "rowKey",
          "type": "string",
          "description": "行唯一键，默认 'id'"
        },
        {
          "name": "emptyText",
          "type": "string",
          "description": "空数据文案，默认 '暂无数据'"
        },
        {
          "name": "itemClass",
          "type": "string",
          "description": "列表项 CSS 类名"
        },
        {
          "name": "itemStyle",
          "type": "CSSProperties",
          "description": "列表项行内样式"
        },
        {
          "name": "useCard",
          "type": "boolean",
          "description": "使用卡片包裹，默认 false"
        },
        {
          "name": "cardShadow",
          "type": "'always' | 'hover' | 'never'",
          "description": "默认 'hover'"
        },
        {
          "name": "gridColumns",
          "type": "number",
          "description": "默认 24"
        },
        {
          "name": "gridGap",
          "type": "number | string",
          "description": "默认 0"
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "description": "行高定义，默认 'minmax(32px, auto)'"
        },
        {
          "name": "itemColSpan",
          "type": "number",
          "description": "项跨列数"
        },
        {
          "name": "itemRowSpan",
          "type": "number",
          "description": "项跨行数，默认 1"
        }
      ],
      "notes": "**r-list** — 列表容器\ndataKey: string — 数据绑定键\ndock='toolbar' children — 工具栏节点\nprops.docks.toolbar.position: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'\nprops.docks.toolbar.class: string — 工具栏 CSS 类名\nitemActions: Rule[] — 列表项操作区\nitemActionsPosition: 'left' | 'right' — 默认 'right'\nitemActionsClass: string — 操作区 CSS 类名\ncolumns: number — 列数，默认 1\ngap: number | string — 间距，默认 0\nminItemWidth: string — 最小项宽度\nrowKey: string — 行唯一键，默认 'id'\nemptyText: string — 空数据文案，默认 '暂无数据'\nitemClass: string — 列表项 CSS 类名\nitemStyle: CSSProperties — 列表项行内样式\nuseCard: boolean — 使用卡片包裹，默认 false\ncardShadow: 'always' | 'hover' | 'never' — 默认 'hover'\ngridColumns: number — 默认 24\ngridGap: number | string — 默认 0\ngridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'\nitemColSpan: number — 项跨列数\nitemRowSpan: number — 项跨行数，默认 1\n\n【能力链】\nconsumes: PAGE_DATASET\nprovides: DATA_SOURCE",
      "binding": {
        "selfResolving": true
      }
    },
    "r-tabs": {
      "type": "r-tabs",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-tabs\" 组织子组件。",
      "props": [
        {
          "name": "docks",
          "type": "ContainerDocks",
          "required": false,
          "default": "{}",
          "description": "停靠区域显示配置"
        },
        {
          "name": "modelValue",
          "type": "string | number",
          "required": false,
          "description": "当前激活标签页"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-tabs\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string | number]",
          "schema": [
            {
              "kind": "enum",
              "type": "string | number",
              "variants": [
                "string",
                "number"
              ]
            }
          ]
        }
      ],
      "rootFields": [
        {
          "name": "props.docks.toolbar.position",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "description": "默认 'top'"
        },
        {
          "name": "props.docks.toolbar.class",
          "type": "string",
          "description": "工具栏 CSS 类名"
        },
        {
          "name": "modelValue",
          "type": "string | number",
          "description": "当前激活 tab"
        },
        {
          "name": "onTabChange",
          "type": "string",
          "description": "切换回调"
        },
        {
          "name": "onTabClick",
          "type": "string",
          "description": "点击回调"
        }
      ],
      "notes": "**r-tabs** — 标签页容器\ndock='toolbar' children — 工具栏节点\nprops.docks.toolbar.position: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'\nprops.docks.toolbar.class: string — 工具栏 CSS 类名\nmodelValue: string | number — 当前激活 tab\nonTabChange: string — 切换回调\nonTabClick: string — 点击回调\nchildren 内放 r-tab-pane（每个 tab-pane 内可嵌套任意组件）",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-collapse": {
      "type": "r-collapse",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-collapse\" 组织子组件。",
      "props": [
        {
          "name": "docks",
          "type": "ContainerDocks",
          "required": false,
          "default": "{}",
          "description": "停靠区域显示配置"
        },
        {
          "name": "modelValue",
          "type": "CollapseValue",
          "required": false,
          "description": "当前展开的面板"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-collapse\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: CollapseValue]",
          "schema": [
            {
              "kind": "enum",
              "type": "CollapseValue",
              "variants": [
                "string",
                "number",
                "(string | number)[]"
              ]
            }
          ]
        }
      ],
      "rootFields": [
        {
          "name": "props.docks.toolbar.position",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "description": "默认 'top'"
        },
        {
          "name": "props.docks.toolbar.class",
          "type": "string",
          "description": "工具栏 CSS 类名"
        },
        {
          "name": "modelValue",
          "type": "string | number | Array",
          "description": "展开的面板"
        },
        {
          "name": "onChange",
          "type": "string",
          "description": "切换回调"
        }
      ],
      "notes": "**r-collapse** — 折叠面板容器\ndock='toolbar' children — 工具栏节点\nprops.docks.toolbar.position: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'\nprops.docks.toolbar.class: string — 工具栏 CSS 类名\nmodelValue: string | number | Array — 展开的面板\nonChange: string — 切换回调\nchildren 内放 r-collapse-item",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-steps": {
      "type": "r-steps",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-steps\" 组织子组件。",
      "props": [
        {
          "name": "docks",
          "type": "ContainerDocks",
          "required": false,
          "default": "{}",
          "description": "停靠区域显示配置"
        },
        {
          "name": "modelValue",
          "type": "string | number",
          "required": false,
          "description": "当前步骤"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-steps\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string | number]",
          "schema": [
            {
              "kind": "enum",
              "type": "string | number",
              "variants": [
                "string",
                "number"
              ]
            }
          ]
        }
      ],
      "rootFields": [
        {
          "name": "props.docks.toolbar.position",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "description": "默认 'top'"
        },
        {
          "name": "props.docks.toolbar.class",
          "type": "string",
          "description": "工具栏 CSS 类名"
        },
        {
          "name": "modelValue",
          "type": "string | number",
          "description": "当前步骤"
        },
        {
          "name": "onStepChange",
          "type": "string",
          "description": "步骤切换回调"
        }
      ],
      "notes": "**r-steps** — 步骤条容器\ndock='toolbar' children — 工具栏节点\nprops.docks.toolbar.position: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'\nprops.docks.toolbar.class: string — 工具栏 CSS 类名\nmodelValue: string | number — 当前步骤\nonStepChange: string — 步骤切换回调\nchildren 内放 r-step",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-dialog": {
      "type": "r-dialog",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-dialog\" 组织子组件。",
      "props": [
        {
          "name": "docks",
          "type": "ContainerDocks",
          "required": false,
          "description": "dock 布局配置"
        },
        {
          "name": "title",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "对话框标题"
        },
        {
          "name": "modelValue",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "控制显隐（v-model）"
        },
        {
          "name": "headerClass",
          "type": "string",
          "required": false,
          "default": "\"\""
        },
        {
          "name": "bodyClass",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "内容区 CSS 类名"
        },
        {
          "name": "footerClass",
          "type": "string",
          "required": false,
          "default": "\"\""
        },
        {
          "name": "gridColumns",
          "type": "number",
          "required": false,
          "default": "24",
          "description": "CSS Grid 列数"
        },
        {
          "name": "gridGap",
          "type": "string | number",
          "required": false,
          "default": "0",
          "description": "栅格间距"
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "required": false,
          "default": "\"minmax(32px, auto)\"",
          "description": "栅格行高"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-dialog\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: boolean]",
          "schema": [
            {
              "kind": "enum",
              "type": "boolean",
              "variants": [
                "false",
                "true"
              ]
            }
          ]
        }
      ],
      "rootFields": [
        {
          "name": "title",
          "type": "string",
          "description": "标题"
        },
        {
          "name": "modelValue",
          "type": "boolean",
          "description": "控制显隐"
        },
        {
          "name": "headerActions",
          "type": "Rule[]",
          "description": "头部操作区"
        },
        {
          "name": "footerActions",
          "type": "Rule[]",
          "description": "底部操作区"
        },
        {
          "name": "headerClass",
          "type": "string",
          "description": "头部 CSS 类名"
        },
        {
          "name": "headerActionsClass",
          "type": "string",
          "description": "头部操作区 CSS 类名"
        },
        {
          "name": "bodyClass",
          "type": "string",
          "description": "内容区 CSS 类名"
        },
        {
          "name": "footerClass",
          "type": "string",
          "description": "底部 CSS 类名"
        },
        {
          "name": "gridColumns",
          "type": "number",
          "description": "默认 24"
        },
        {
          "name": "gridGap",
          "type": "number | string",
          "description": "默认 0"
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "description": "行高定义，默认 'minmax(32px, auto)'"
        },
        {
          "name": "onOpen",
          "type": "string",
          "description": "打开回调"
        },
        {
          "name": "onClose",
          "type": "string",
          "description": "关闭回调"
        },
        {
          "name": "onOpened",
          "type": "string",
          "description": "打开动画结束回调"
        },
        {
          "name": "onClosed",
          "type": "string",
          "description": "关闭动画结束回调"
        }
      ],
      "notes": "**r-dialog** — 对话框容器\ntitle: string — 标题\nmodelValue: boolean — 控制显隐\nheaderActions: Rule[] — 头部操作区\nfooterActions: Rule[] — 底部操作区\nheaderClass: string — 头部 CSS 类名\nheaderActionsClass: string — 头部操作区 CSS 类名\nbodyClass: string — 内容区 CSS 类名\nfooterClass: string — 底部 CSS 类名\ngridColumns: number — 默认 24\ngridGap: number | string — 默认 0\ngridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'\nonOpen: string — 打开回调\nonClose: string — 关闭回调\nonOpened: string — 打开动画结束回调\nonClosed: string — 关闭动画结束回调",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "boolean"
      }
    },
    "r-drawer": {
      "type": "r-drawer",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-drawer\" 组织子组件。",
      "props": [
        {
          "name": "docks",
          "type": "ContainerDocks",
          "required": false,
          "description": "dock 布局配置"
        },
        {
          "name": "title",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "抽屉标题"
        },
        {
          "name": "modelValue",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "控制显隐（v-model）"
        },
        {
          "name": "headerClass",
          "type": "string",
          "required": false,
          "default": "\"\""
        },
        {
          "name": "bodyClass",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "内容区 CSS 类名"
        },
        {
          "name": "footerClass",
          "type": "string",
          "required": false,
          "default": "\"\""
        },
        {
          "name": "gridColumns",
          "type": "number",
          "required": false,
          "default": "24",
          "description": "CSS Grid 列数"
        },
        {
          "name": "gridGap",
          "type": "string | number",
          "required": false,
          "default": "0",
          "description": "栅格间距"
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "required": false,
          "default": "\"minmax(32px, auto)\"",
          "description": "栅格行高"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-drawer\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: boolean]",
          "schema": [
            {
              "kind": "enum",
              "type": "boolean",
              "variants": [
                "false",
                "true"
              ]
            }
          ]
        }
      ],
      "rootFields": [
        {
          "name": "title",
          "type": "string",
          "description": "标题"
        },
        {
          "name": "modelValue",
          "type": "boolean",
          "description": "控制显隐"
        },
        {
          "name": "headerActions",
          "type": "Rule[]",
          "description": "头部操作区"
        },
        {
          "name": "footerActions",
          "type": "Rule[]",
          "description": "底部操作区"
        },
        {
          "name": "headerClass",
          "type": "string",
          "description": "头部 CSS 类名"
        },
        {
          "name": "headerActionsClass",
          "type": "string",
          "description": "头部操作区 CSS 类名"
        },
        {
          "name": "bodyClass",
          "type": "string",
          "description": "内容区 CSS 类名"
        },
        {
          "name": "footerClass",
          "type": "string",
          "description": "底部 CSS 类名"
        },
        {
          "name": "gridColumns",
          "type": "number",
          "description": "默认 24"
        },
        {
          "name": "gridGap",
          "type": "number | string",
          "description": "默认 0"
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "description": "行高定义，默认 'minmax(32px, auto)'"
        }
      ],
      "notes": "**r-drawer** — 抽屉容器\ntitle: string — 标题\nmodelValue: boolean — 控制显隐\nheaderActions: Rule[] — 头部操作区\nfooterActions: Rule[] — 底部操作区\nheaderClass: string — 头部 CSS 类名\nheaderActionsClass: string — 头部操作区 CSS 类名\nbodyClass: string — 内容区 CSS 类名\nfooterClass: string — 底部 CSS 类名\ngridColumns: number — 默认 24\ngridGap: number | string — 默认 0\ngridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'\nonOpen / onClose / onOpened / onClosed: string — 生命周期回调",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "boolean"
      }
    },
    "r-section": {
      "type": "r-section",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-section\" 组织子组件。",
      "props": [
        {
          "name": "title",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "分区标题"
        },
        {
          "name": "description",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "分区描述"
        },
        {
          "name": "collapsible",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "是否可折叠"
        },
        {
          "name": "defaultCollapsed",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "默认折叠"
        },
        {
          "name": "bordered",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "显示边框"
        },
        {
          "name": "useCard",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "使用卡片样式"
        },
        {
          "name": "cardShadow",
          "type": "\"never\" | \"always\" | \"hover\"",
          "required": false,
          "default": "\"never\"",
          "description": "卡片阴影模式"
        },
        {
          "name": "headerClass",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "头部 CSS 类名"
        },
        {
          "name": "bodyClass",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "内容区 CSS 类名"
        },
        {
          "name": "expandText",
          "type": "string",
          "required": false,
          "default": "\"\\u5C55\\u5F00\"",
          "description": "展开文案"
        },
        {
          "name": "collapseText",
          "type": "string",
          "required": false,
          "default": "\"\\u6536\\u8D77\"",
          "description": "收起文案"
        },
        {
          "name": "showToggleIcon",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "显示切换图标"
        },
        {
          "name": "expandIconText",
          "type": "string",
          "required": false,
          "default": "\">\"",
          "description": "展开图标文案"
        },
        {
          "name": "collapseIconText",
          "type": "string",
          "required": false,
          "default": "\"v\"",
          "description": "收起图标文案"
        },
        {
          "name": "gridColumns",
          "type": "number",
          "required": false,
          "default": "24",
          "description": "CSS Grid 列数"
        },
        {
          "name": "gridGap",
          "type": "string | number",
          "required": false,
          "default": "0",
          "description": "栅格间距"
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "required": false,
          "default": "\"minmax(32px, auto)\"",
          "description": "栅格行高"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-section\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "rootFields": [
        {
          "name": "title",
          "type": "string",
          "description": "标题"
        },
        {
          "name": "description",
          "type": "string",
          "description": "描述"
        },
        {
          "name": "collapsible",
          "type": "boolean",
          "description": "是否可折叠"
        },
        {
          "name": "defaultCollapsed",
          "type": "boolean",
          "description": "默认折叠"
        },
        {
          "name": "bordered",
          "type": "boolean",
          "description": "显示边框，默认 true"
        },
        {
          "name": "useCard",
          "type": "boolean",
          "description": "使用卡片样式，默认 false"
        },
        {
          "name": "cardShadow",
          "type": "string",
          "description": "卡片阴影"
        },
        {
          "name": "headerActions",
          "type": "Rule[]",
          "description": "头部操作区"
        },
        {
          "name": "expandText",
          "type": "string",
          "description": "展开文案，默认 '展开'"
        },
        {
          "name": "collapseText",
          "type": "string",
          "description": "收起文案，默认 '收起'"
        },
        {
          "name": "showToggleIcon",
          "type": "boolean",
          "description": "显示切换图标，默认 true"
        },
        {
          "name": "gridColumns",
          "type": "number",
          "description": "默认 24"
        },
        {
          "name": "gridGap",
          "type": "number",
          "description": "默认 0"
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "description": "行高"
        }
      ],
      "notes": "**r-section** — 分区容器\ntitle: string — 标题\ndescription: string — 描述\ncollapsible: boolean — 是否可折叠\ndefaultCollapsed: boolean — 默认折叠\nbordered: boolean — 显示边框，默认 true\nuseCard: boolean — 使用卡片样式，默认 false\ncardShadow: string — 卡片阴影\nheaderActions: Rule[] — 头部操作区\nexpandText: string — 展开文案，默认 '展开'\ncollapseText: string — 收起文案，默认 '收起'\nshowToggleIcon: boolean — 显示切换图标，默认 true\ngridColumns: number — 默认 24\ngridGap: number — 默认 0\ngridAutoRows: string — 行高"
    },
    "r-block": {
      "type": "r-block",
      "category": "container",
      "description": "块容器（轻量分区）",
      "props": [],
      "rootFields": [
        {
          "name": "title",
          "type": "string",
          "description": "标题"
        },
        {
          "name": "description",
          "type": "string",
          "description": "描述"
        },
        {
          "name": "headerActions",
          "type": "Rule[]",
          "description": "头部操作区"
        },
        {
          "name": "bordered",
          "type": "boolean",
          "description": "边框，默认 true"
        },
        {
          "name": "useCard",
          "type": "boolean",
          "description": "卡片样式，默认 false"
        },
        {
          "name": "gridColumns",
          "type": "number",
          "description": "默认 24"
        },
        {
          "name": "gridGap",
          "type": "number",
          "description": "默认 0"
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "description": "行高定义"
        }
      ],
      "notes": "**r-block** — 块容器（轻量分区）\ntitle: string — 标题\ndescription: string — 描述\nheaderActions: Rule[] — 头部操作区\nbordered: boolean — 边框，默认 true\nuseCard: boolean — 卡片样式，默认 false\ngridColumns: number — 默认 24\ngridGap: number — 默认 0\ngridAutoRows: string — 行高定义\n适合做页面中的局部块，不强制数据绑定"
    },
    "r-user-picker": {
      "type": "r-user-picker",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-user-picker\" 使用。",
      "props": [
        {
          "name": "label",
          "type": "string",
          "required": false
        },
        {
          "name": "modelValue",
          "type": "EntityPickerValue",
          "required": false
        },
        {
          "name": "name",
          "type": "string",
          "required": false
        },
        {
          "name": "field",
          "type": "string",
          "required": false
        },
        {
          "name": "width",
          "type": "number",
          "required": false
        },
        {
          "name": "options",
          "type": "unknown[]",
          "required": false
        },
        {
          "name": "optionKey",
          "type": "string",
          "required": false
        },
        {
          "name": "optionLabelField",
          "type": "string",
          "required": false
        },
        {
          "name": "optionValueField",
          "type": "string",
          "required": false
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false
        },
        {
          "name": "buttonText",
          "type": "string",
          "required": false
        },
        {
          "name": "readonlyButtonText",
          "type": "string",
          "required": false
        },
        {
          "name": "clearable",
          "type": "boolean",
          "required": false
        },
        {
          "name": "multiple",
          "type": "boolean",
          "required": false
        },
        {
          "name": "searchable",
          "type": "boolean",
          "required": false
        },
        {
          "name": "separator",
          "type": "string",
          "required": false
        },
        {
          "name": "valueMode",
          "type": "\"auto\" | \"array\" | \"comma-string\"",
          "required": false
        },
        {
          "name": "entityName",
          "type": "string",
          "required": false
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "any[]",
          "schema": []
        }
      ],
      "rootFields": [
        {
          "name": "multiple",
          "type": "boolean",
          "description": "多选"
        },
        {
          "name": "deptScope",
          "type": "string",
          "description": "部门范围"
        },
        {
          "name": "includeDisabled",
          "type": "boolean",
          "description": "包含禁用用户"
        }
      ],
      "notes": "**r-user-picker** — 用户选择器\nfield / label / width — 同 r-text\nmultiple: boolean — 多选\ndeptScope: string — 部门范围\nincludeDisabled: boolean — 包含禁用用户",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-dept-picker": {
      "type": "r-dept-picker",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-dept-picker\" 使用。",
      "props": [
        {
          "name": "label",
          "type": "string",
          "required": false
        },
        {
          "name": "modelValue",
          "type": "EntityPickerValue",
          "required": false
        },
        {
          "name": "name",
          "type": "string",
          "required": false
        },
        {
          "name": "field",
          "type": "string",
          "required": false
        },
        {
          "name": "width",
          "type": "number",
          "required": false
        },
        {
          "name": "options",
          "type": "unknown[]",
          "required": false
        },
        {
          "name": "optionKey",
          "type": "string",
          "required": false
        },
        {
          "name": "optionLabelField",
          "type": "string",
          "required": false
        },
        {
          "name": "optionValueField",
          "type": "string",
          "required": false
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false
        },
        {
          "name": "buttonText",
          "type": "string",
          "required": false
        },
        {
          "name": "readonlyButtonText",
          "type": "string",
          "required": false
        },
        {
          "name": "clearable",
          "type": "boolean",
          "required": false
        },
        {
          "name": "multiple",
          "type": "boolean",
          "required": false
        },
        {
          "name": "searchable",
          "type": "boolean",
          "required": false
        },
        {
          "name": "separator",
          "type": "string",
          "required": false
        },
        {
          "name": "valueMode",
          "type": "\"auto\" | \"array\" | \"comma-string\"",
          "required": false
        },
        {
          "name": "entityName",
          "type": "string",
          "required": false
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "any[]",
          "schema": []
        }
      ],
      "rootFields": [
        {
          "name": "multiple",
          "type": "boolean",
          "description": "多选"
        },
        {
          "name": "checkStrictly",
          "type": "boolean",
          "description": "父子不关联勾选"
        },
        {
          "name": "showPath",
          "type": "boolean",
          "description": "展示完整路径"
        }
      ],
      "notes": "**r-dept-picker** — 部门选择器\nfield / label / width — 同 r-text\nmultiple: boolean — 多选\ncheckStrictly: boolean — 父子不关联勾选\nshowPath: boolean — 展示完整路径",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-product-picker": {
      "type": "r-product-picker",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-product-picker\" 使用。",
      "props": [
        {
          "name": "label",
          "type": "string",
          "required": false
        },
        {
          "name": "modelValue",
          "type": "EntityPickerValue",
          "required": false
        },
        {
          "name": "name",
          "type": "string",
          "required": false
        },
        {
          "name": "field",
          "type": "string",
          "required": false
        },
        {
          "name": "width",
          "type": "number",
          "required": false
        },
        {
          "name": "options",
          "type": "unknown[]",
          "required": false
        },
        {
          "name": "optionKey",
          "type": "string",
          "required": false
        },
        {
          "name": "optionLabelField",
          "type": "string",
          "required": false
        },
        {
          "name": "optionValueField",
          "type": "string",
          "required": false
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false
        },
        {
          "name": "buttonText",
          "type": "string",
          "required": false
        },
        {
          "name": "readonlyButtonText",
          "type": "string",
          "required": false
        },
        {
          "name": "clearable",
          "type": "boolean",
          "required": false
        },
        {
          "name": "multiple",
          "type": "boolean",
          "required": false
        },
        {
          "name": "searchable",
          "type": "boolean",
          "required": false
        },
        {
          "name": "separator",
          "type": "string",
          "required": false
        },
        {
          "name": "valueMode",
          "type": "\"auto\" | \"array\" | \"comma-string\"",
          "required": false
        },
        {
          "name": "entityName",
          "type": "string",
          "required": false
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "any[]",
          "schema": []
        }
      ],
      "rootFields": [
        {
          "name": "multiple",
          "type": "boolean",
          "description": "多选"
        },
        {
          "name": "categoryFilter",
          "type": "string[]",
          "description": "类目过滤"
        },
        {
          "name": "showStock",
          "type": "boolean",
          "description": "显示库存"
        }
      ],
      "notes": "**r-product-picker** — 产品选择器\nfield / label / width — 同 r-text\nmultiple: boolean — 多选\ncategoryFilter: string[] — 类目过滤\nshowStock: boolean — 显示库存",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-toolbar": {
      "type": "r-toolbar",
      "category": "field",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-toolbar\" 组织子组件。",
      "props": [
        {
          "name": "docks",
          "type": "ContainerDocks",
          "required": false,
          "default": "{}",
          "description": "dock 显示描述符。\r\n\r\n这里只读取区域级 class，用于给 default/tail 区域挂样式钩子；\r\n不在第一版里引入更多位置/交互语义，避免重新把结构做重。"
        },
        {
          "name": "gap",
          "type": "string | number",
          "required": false,
          "default": "8",
          "description": "单个子项之间的间距（同一区域内部）"
        },
        {
          "name": "zoneGap",
          "type": "string | number",
          "required": false,
          "default": "12",
          "description": "主区与尾区之间的间距（区域级）"
        },
        {
          "name": "align",
          "type": "InlineAlign",
          "required": false,
          "default": "\"center\"",
          "description": "区域内部子项的交叉轴对齐"
        },
        {
          "name": "justify",
          "type": "InlineJustify",
          "required": false,
          "default": "\"start\"",
          "description": "主区内部子项的主轴分布方式"
        },
        {
          "name": "tailDock",
          "type": "string",
          "required": false,
          "default": "\"tail\"",
          "description": "尾区使用的 dock 名称，默认 tail，保留未来自定义命名空间能力"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-toolbar\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ]
    },
    "r-tab-pane": {
      "type": "r-tab-pane",
      "category": "field",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-tab-pane\" 组织子组件。",
      "props": [
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-tab-pane\""
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false
        },
        {
          "name": "id",
          "type": "string",
          "required": false
        },
        {
          "name": "name",
          "type": "string | number",
          "required": false
        },
        {
          "name": "value",
          "type": "string | number",
          "required": false
        },
        {
          "name": "label",
          "type": "string",
          "required": false
        },
        {
          "name": "title",
          "type": "string",
          "required": false
        },
        {
          "name": "disabled",
          "type": "boolean",
          "required": false
        },
        {
          "name": "lazy",
          "type": "boolean",
          "required": false
        },
        {
          "name": "closable",
          "type": "boolean",
          "required": false
        },
        {
          "name": "bodyClass",
          "type": "string",
          "required": false
        },
        {
          "name": "gridColumns",
          "type": "string | number",
          "required": false
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "required": false
        },
        {
          "name": "gridGap",
          "type": "string | number",
          "required": false
        },
        {
          "name": "index",
          "type": "number",
          "required": true
        }
      ]
    },
    "r-step-item": {
      "type": "r-step-item",
      "category": "field",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-step-item\" 组织子组件。",
      "props": [
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-step\""
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false
        },
        {
          "name": "id",
          "type": "string",
          "required": false
        },
        {
          "name": "title",
          "type": "string",
          "required": false
        },
        {
          "name": "label",
          "type": "string",
          "required": false
        },
        {
          "name": "description",
          "type": "string",
          "required": false
        },
        {
          "name": "status",
          "type": "string",
          "required": false
        },
        {
          "name": "disabled",
          "type": "boolean",
          "required": false
        },
        {
          "name": "bodyClass",
          "type": "string",
          "required": false
        },
        {
          "name": "gridColumns",
          "type": "string | number",
          "required": false
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "required": false
        },
        {
          "name": "gridGap",
          "type": "string | number",
          "required": false
        },
        {
          "name": "index",
          "type": "number",
          "required": true
        },
        {
          "name": "mode",
          "type": "\"header\" | \"content\"",
          "required": true
        }
      ],
      "emits": [
        {
          "name": "activate",
          "type": "[index: number]",
          "schema": []
        }
      ]
    },
    "r-collapse-item": {
      "type": "r-collapse-item",
      "category": "field",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-collapse-item\" 组织子组件。",
      "props": [
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-collapse-item\""
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false
        },
        {
          "name": "id",
          "type": "string",
          "required": false
        },
        {
          "name": "name",
          "type": "string | number",
          "required": false
        },
        {
          "name": "title",
          "type": "string",
          "required": false
        },
        {
          "name": "label",
          "type": "string",
          "required": false
        },
        {
          "name": "disabled",
          "type": "boolean",
          "required": false
        },
        {
          "name": "bodyClass",
          "type": "string",
          "required": false
        },
        {
          "name": "gridColumns",
          "type": "string | number",
          "required": false
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "required": false
        },
        {
          "name": "gridGap",
          "type": "string | number",
          "required": false
        },
        {
          "name": "index",
          "type": "number",
          "required": true
        }
      ]
    },
    "r-upload": {
      "type": "r-upload",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-upload\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "string",
          "required": false,
          "description": "双向绑定值（文件路径）"
        },
        {
          "name": "action",
          "type": "string",
          "required": false,
          "default": "\"#\"",
          "description": "上传 URL"
        },
        {
          "name": "accept",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "接受文件类型"
        },
        {
          "name": "buttonText",
          "type": "string",
          "required": false,
          "default": "\"\\u70B9\\u51FB\\u4E0A\\u4F20\"",
          "description": "上传按钮文案"
        },
        {
          "name": "autoUpload",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "自动上传"
        },
        {
          "name": "showFileList",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "显示文件列表"
        },
        {
          "name": "limit",
          "type": "number",
          "required": false,
          "default": "1",
          "description": "最大文件数"
        },
        {
          "name": "listType",
          "type": "\"picture\" | \"text\" | \"picture-card\"",
          "required": false,
          "default": "\"text\"",
          "description": "列表展示类型"
        },
        {
          "name": "separator",
          "type": "string",
          "required": false,
          "default": "\", \"",
          "description": "多文件分隔符"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"\\u8BF7\\u9009\\u62E9\\u6587\\u4EF6\"",
          "description": "占位提示"
        },
        {
          "name": "readonlyButtonText",
          "type": "string",
          "required": false,
          "default": "\"\\u6D4F\\u89C8\"",
          "description": "只读模式按钮文案"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-upload\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]",
          "schema": []
        }
      ],
      "notes": "透传到 el-upload: autoUpload(默认 true), showFileList(默认 true), limit(默认 1), listType('text'|'picture'|'picture-card')",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-tree-select": {
      "type": "r-tree-select",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-tree-select\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "TreeSelectValue",
          "required": false,
          "description": "双向绑定值"
        },
        {
          "name": "options",
          "type": "unknown[]",
          "required": false,
          "description": "树形选项（嵌套结构）"
        },
        {
          "name": "optionKey",
          "type": "string",
          "required": false,
          "description": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项"
        },
        {
          "name": "optionLabelField",
          "type": "string",
          "required": false,
          "description": "选项标签字段"
        },
        {
          "name": "optionValueField",
          "type": "string",
          "required": false,
          "description": "选项值字段"
        },
        {
          "name": "optionChildrenField",
          "type": "string",
          "required": false,
          "description": "子节点字段"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"\\u8BF7\\u9009\\u62E9\"",
          "description": "占位提示"
        },
        {
          "name": "clearable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可清除"
        },
        {
          "name": "filterable",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "可搜索"
        },
        {
          "name": "multiple",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "多选模式"
        },
        {
          "name": "checkStrictly",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "父子不关联勾选"
        },
        {
          "name": "defaultExpandAll",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "默认展开所有节点"
        },
        {
          "name": "renderAfterExpand",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "展开后才渲染子节点"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-tree-select\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: TreeSelectValue]",
          "schema": [
            {
              "kind": "enum",
              "type": "TreeSelectValue",
              "variants": [
                "string",
                "number",
                "false",
                "true",
                "FieldPrimitive[]"
              ]
            }
          ]
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-transfer": {
      "type": "r-transfer",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-transfer\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "TransferValue",
          "required": false,
          "description": "双向绑定值（已选值数组）"
        },
        {
          "name": "options",
          "type": "unknown[]",
          "required": false,
          "description": "数据源（左侧候选列表）"
        },
        {
          "name": "optionKey",
          "type": "string",
          "required": false,
          "description": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项"
        },
        {
          "name": "optionLabelField",
          "type": "string",
          "required": false,
          "description": "选项标签字段"
        },
        {
          "name": "optionValueField",
          "type": "string",
          "required": false,
          "description": "选项值字段"
        },
        {
          "name": "titles",
          "type": "[string, string]",
          "required": false,
          "default": "[\"\\u5F85\\u9009\", \"\\u5DF2\\u9009\"] as [\n    string,\n    string\n]",
          "description": "左右面板标题"
        },
        {
          "name": "filterable",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "可搜索"
        },
        {
          "name": "filterPlaceholder",
          "type": "string",
          "required": false,
          "default": "\"\\u8BF7\\u8F93\\u5165\\u5173\\u952E\\u8BCD\"",
          "description": "搜索框占位符"
        },
        {
          "name": "targetOrder",
          "type": "\"push\" | \"unshift\" | \"original\"",
          "required": false,
          "default": "\"original\"",
          "description": "右侧排序方式"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-transfer\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: TransferValue]",
          "schema": [
            {
              "kind": "array",
              "type": "TransferValue",
              "items": [
                {
                  "kind": "enum",
                  "type": "string | number",
                  "variants": [
                    "string",
                    "number"
                  ]
                }
              ]
            }
          ]
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-textarea": {
      "type": "r-textarea",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-textarea\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "string",
          "required": false,
          "description": "双向绑定值"
        },
        {
          "name": "rows",
          "type": "number",
          "required": false,
          "default": "4",
          "description": "行数"
        },
        {
          "name": "autosize",
          "type": "boolean | { minRows?: number; maxRows?: number; }",
          "required": false,
          "default": "false",
          "description": "自适应高度"
        },
        {
          "name": "maxlength",
          "type": "number",
          "required": false,
          "description": "最大长度"
        },
        {
          "name": "showWordLimit",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "显示字数统计"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"\\u8BF7\\u8F93\\u5165\\u5185\\u5BB9\"",
          "description": "占位提示"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-textarea\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]",
          "schema": []
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-text": {
      "type": "r-text",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-text\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名，映射到 DataView 行字段"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "string",
          "required": false,
          "description": "双向绑定值"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-text\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]",
          "schema": []
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-switch": {
      "type": "r-switch",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-switch\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "boolean",
          "required": false,
          "description": "双向绑定值"
        },
        {
          "name": "activeText",
          "type": "string",
          "required": false,
          "default": "\"\\u662F\"",
          "description": "激活时文案"
        },
        {
          "name": "inactiveText",
          "type": "string",
          "required": false,
          "default": "\"\\u5426\"",
          "description": "未激活时文案"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-switch\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: boolean]",
          "schema": [
            {
              "kind": "enum",
              "type": "boolean",
              "variants": [
                "false",
                "true"
              ]
            }
          ]
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "boolean"
      }
    },
    "r-slider": {
      "type": "r-slider",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-slider\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "number",
          "required": false,
          "description": "双向绑定值"
        },
        {
          "name": "min",
          "type": "number",
          "required": false,
          "default": "0",
          "description": "最小值"
        },
        {
          "name": "max",
          "type": "number",
          "required": false,
          "default": "100",
          "description": "最大值"
        },
        {
          "name": "step",
          "type": "number",
          "required": false,
          "default": "1",
          "description": "步长"
        },
        {
          "name": "showInput",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "显示输入框"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-slider\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: number]",
          "schema": []
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-select": {
      "type": "r-select",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-select\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "string | number",
          "required": false,
          "description": "双向绑定值"
        },
        {
          "name": "options",
          "type": "unknown[]",
          "required": false,
          "description": "选项列表"
        },
        {
          "name": "optionKey",
          "type": "string",
          "required": false,
          "description": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项"
        },
        {
          "name": "optionLabelField",
          "type": "string",
          "required": false,
          "description": "选项标签字段"
        },
        {
          "name": "optionValueField",
          "type": "string",
          "required": false,
          "description": "选项值字段"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"\\u8BF7\\u9009\\u62E9\"",
          "description": "占位提示"
        },
        {
          "name": "clearable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可清除"
        },
        {
          "name": "filterable",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "可搜索"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-select\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string | number]",
          "schema": [
            {
              "kind": "enum",
              "type": "string | number",
              "variants": [
                "string",
                "number"
              ]
            }
          ]
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-rate": {
      "type": "r-rate",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-rate\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "number",
          "required": false,
          "description": "双向绑定值"
        },
        {
          "name": "max",
          "type": "number",
          "required": false,
          "default": "5",
          "description": "最大值"
        },
        {
          "name": "allowHalf",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "允许半星"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-rate\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: number]",
          "schema": []
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-radio": {
      "type": "r-radio",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-radio\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "string | number",
          "required": false,
          "description": "双向绑定值"
        },
        {
          "name": "options",
          "type": "unknown[]",
          "required": false,
          "description": "选项列表"
        },
        {
          "name": "optionKey",
          "type": "string",
          "required": false,
          "description": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项"
        },
        {
          "name": "optionLabelField",
          "type": "string",
          "required": false,
          "description": "选项标签字段"
        },
        {
          "name": "optionValueField",
          "type": "string",
          "required": false,
          "description": "选项值字段"
        },
        {
          "name": "buttonStyle",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "按钮风格"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-radio\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string | number]",
          "schema": [
            {
              "kind": "enum",
              "type": "string | number",
              "variants": [
                "string",
                "number"
              ]
            }
          ]
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-number": {
      "type": "r-number",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-number\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "number | [number | undefined, number | undefined]",
          "required": false,
          "description": "双向绑定值，范围模式时为元组"
        },
        {
          "name": "min",
          "type": "number",
          "required": false,
          "description": "最小值"
        },
        {
          "name": "max",
          "type": "number",
          "required": false,
          "description": "最大值"
        },
        {
          "name": "precision",
          "type": "number",
          "required": false,
          "description": "小数精度"
        },
        {
          "name": "filterMode",
          "type": "string",
          "required": false,
          "description": "筛选模式（'range' 启用范围输入）"
        },
        {
          "name": "filterVariant",
          "type": "string",
          "required": false,
          "description": "筛选变体"
        },
        {
          "name": "filterRange",
          "type": "boolean",
          "required": false,
          "description": "范围筛选标记"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-number\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: number | [number | undefined, number | undefined]]",
          "schema": [
            {
              "kind": "enum",
              "type": "number | [number | undefined, number | undefined]",
              "variants": [
                "number",
                "[number | undefined, number | undefined]"
              ]
            }
          ]
        }
      ],
      "notes": "filterMode: 'range' — 启用范围过滤模式",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-multi-select": {
      "type": "r-multi-select",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-multi-select\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "MultiValue",
          "required": false,
          "description": "双向绑定值（数组）"
        },
        {
          "name": "options",
          "type": "unknown[]",
          "required": false,
          "description": "选项列表"
        },
        {
          "name": "optionKey",
          "type": "string",
          "required": false,
          "description": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项"
        },
        {
          "name": "optionLabelField",
          "type": "string",
          "required": false,
          "description": "选项标签字段"
        },
        {
          "name": "optionValueField",
          "type": "string",
          "required": false,
          "description": "选项值字段"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"\\u8BF7\\u9009\\u62E9\"",
          "description": "占位提示"
        },
        {
          "name": "clearable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可清除"
        },
        {
          "name": "filterable",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "可搜索"
        },
        {
          "name": "collapseTags",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "折叠已选标签"
        },
        {
          "name": "collapseTagsTooltip",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "折叠标签提示"
        },
        {
          "name": "maxCollapseTags",
          "type": "number",
          "required": false,
          "default": "1",
          "description": "最大显示标签数"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-multi-select\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: MultiValue]",
          "schema": [
            {
              "kind": "array",
              "type": "MultiValue",
              "items": [
                {
                  "kind": "enum",
                  "type": "string | number | boolean",
                  "variants": [
                    "string",
                    "number",
                    "false",
                    "true"
                  ]
                }
              ]
            }
          ]
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-image": {
      "type": "r-image",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-image\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "string",
          "required": false,
          "description": "双向绑定值（图片路径）"
        },
        {
          "name": "action",
          "type": "string",
          "required": false,
          "default": "\"#\"",
          "description": "上传 URL"
        },
        {
          "name": "accept",
          "type": "string",
          "required": false,
          "default": "\"image/*\"",
          "description": "接受文件类型"
        },
        {
          "name": "multiple",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "多选"
        },
        {
          "name": "separator",
          "type": "string",
          "required": false,
          "default": "\", \"",
          "description": "多图分隔符"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"\\u8BF7\\u9009\\u62E9\\u56FE\\u7247\"",
          "description": "占位提示"
        },
        {
          "name": "buttonText",
          "type": "string",
          "required": false,
          "default": "\"\\u4E0A\\u4F20\\u56FE\\u7247\"",
          "description": "上传按钮文案"
        },
        {
          "name": "readonlyButtonText",
          "type": "string",
          "required": false,
          "default": "\"\\u6D4F\\u89C8\"",
          "description": "只读模式按钮文案"
        },
        {
          "name": "clearable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可清除"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-image\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]",
          "schema": []
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-icon": {
      "type": "r-icon",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-icon\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "string",
          "required": false,
          "description": "双向绑定值（图标名）"
        },
        {
          "name": "options",
          "type": "unknown[]",
          "required": false,
          "description": "图标选项列表"
        },
        {
          "name": "optionKey",
          "type": "string",
          "required": false,
          "description": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项"
        },
        {
          "name": "optionLabelField",
          "type": "string",
          "required": false,
          "description": "选项标签字段"
        },
        {
          "name": "optionValueField",
          "type": "string",
          "required": false,
          "description": "选项值字段"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"\\u8BF7\\u9009\\u62E9\\u56FE\\u6807\"",
          "description": "占位提示"
        },
        {
          "name": "clearable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可清除"
        },
        {
          "name": "filterable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可搜索"
        },
        {
          "name": "classPrefix",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "图标 CSS 类名前缀"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-icon\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]",
          "schema": []
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-html-editor": {
      "type": "r-html-editor",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-html-editor\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "string",
          "required": false,
          "description": "双向绑定值（HTML 字符串）"
        },
        {
          "name": "rows",
          "type": "number",
          "required": false,
          "default": "10",
          "description": "编辑器高度行数"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-html-editor\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]",
          "schema": []
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-file-path": {
      "type": "r-file-path",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-file-path\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "string",
          "required": false,
          "description": "双向绑定值（文件路径）"
        },
        {
          "name": "action",
          "type": "string",
          "required": false,
          "default": "\"#\"",
          "description": "上传 URL"
        },
        {
          "name": "accept",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "接受文件类型"
        },
        {
          "name": "multiple",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "多选"
        },
        {
          "name": "separator",
          "type": "string",
          "required": false,
          "default": "\", \"",
          "description": "多文件分隔符"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"\\u8BF7\\u9009\\u62E9\\u6587\\u4EF6\\u8DEF\\u5F84\"",
          "description": "占位提示"
        },
        {
          "name": "buttonText",
          "type": "string",
          "required": false,
          "default": "\"\\u4E0A\\u4F20\"",
          "description": "上传按钮文案"
        },
        {
          "name": "readonlyButtonText",
          "type": "string",
          "required": false,
          "default": "\"\\u6D4F\\u89C8\"",
          "description": "只读模式按钮文案"
        },
        {
          "name": "clearable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可清除"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-file-path\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]",
          "schema": []
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-file-browser": {
      "type": "r-file-browser",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-file-browser\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "string",
          "required": false,
          "description": "双向绑定值（文件路径）"
        },
        {
          "name": "accept",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "接受文件类型"
        },
        {
          "name": "multiple",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "多选"
        },
        {
          "name": "clearable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可清除"
        },
        {
          "name": "separator",
          "type": "string",
          "required": false,
          "default": "\", \"",
          "description": "多文件分隔符"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"\\u8BF7\\u9009\\u62E9\\u6587\\u4EF6\"",
          "description": "占位提示"
        },
        {
          "name": "buttonText",
          "type": "string",
          "required": false,
          "default": "\"\\u6D4F\\u89C8\"",
          "description": "上传按钮文案"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-file-browser\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]",
          "schema": []
        }
      ],
      "notes": "⚠️ 与 r-file-path 基本一致，差异在于内置的浏览器 UI 体验",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-entity-picker": {
      "type": "r-entity-picker",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-entity-picker\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "EntityPickerValue",
          "required": false,
          "description": "双向绑定值"
        },
        {
          "name": "options",
          "type": "unknown[]",
          "required": false,
          "description": "选项列表"
        },
        {
          "name": "optionKey",
          "type": "string",
          "required": false,
          "description": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项"
        },
        {
          "name": "optionLabelField",
          "type": "string",
          "required": false,
          "description": "选项标签字段"
        },
        {
          "name": "optionValueField",
          "type": "string",
          "required": false,
          "description": "选项值字段"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"\\u8BF7\\u9009\\u62E9\"",
          "description": "占位提示"
        },
        {
          "name": "buttonText",
          "type": "string",
          "required": false,
          "default": "\"\\u9009\\u62E9\"",
          "description": "选择按钮文案"
        },
        {
          "name": "readonlyButtonText",
          "type": "string",
          "required": false,
          "default": "\"\\u67E5\\u770B\"",
          "description": "只读模式按钮文案"
        },
        {
          "name": "clearable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可清除"
        },
        {
          "name": "multiple",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "多选"
        },
        {
          "name": "searchable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可搜索"
        },
        {
          "name": "separator",
          "type": "string",
          "required": false,
          "default": "\", \"",
          "description": "多值分隔符"
        },
        {
          "name": "valueMode",
          "type": "\"auto\" | \"array\" | \"comma-string\"",
          "required": false,
          "default": "\"auto\"",
          "description": "值模式"
        },
        {
          "name": "entityName",
          "type": "string",
          "required": false,
          "default": "\"\\u9879\\u76EE\"",
          "description": "实体名称"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-entity-picker\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: EntityPickerValue]",
          "schema": [
            {
              "kind": "enum",
              "type": "EntityPickerValue",
              "variants": [
                "string",
                "number",
                "false",
                "true",
                "PageSelectableValue[]"
              ]
            }
          ]
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-date": {
      "type": "r-date",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-date\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "string | Date | (string | Date)[]",
          "required": false,
          "description": "双向绑定值，日期范围时为数组"
        },
        {
          "name": "filterMode",
          "type": "string",
          "required": false,
          "description": "筛选模式"
        },
        {
          "name": "filterVariant",
          "type": "string",
          "required": false,
          "description": "筛选变体"
        },
        {
          "name": "filterRange",
          "type": "boolean",
          "required": false,
          "description": "范围筛选标记"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-date\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string | Date | (string | Date)[]]",
          "schema": [
            {
              "kind": "enum",
              "type": "string | Date | (string | Date)[]",
              "variants": [
                "string",
                "Date",
                "(string | Date)[]"
              ]
            }
          ]
        }
      ],
      "notes": "透传到 el-date-picker: type('date'/'datetime'/'daterange'), format, valueFormat 等",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "array"
      }
    },
    "r-color": {
      "type": "r-color",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-color\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "string",
          "required": false,
          "description": "双向绑定值（颜色字符串，透传 el-color-picker）"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-color\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]",
          "schema": []
        }
      ],
      "notes": "透传到 el-color-picker: showAlpha, colorFormat('hex'|'rgb'|'hsl'|'hsv'), predefine(string[])",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-checkbox-group": {
      "type": "r-checkbox-group",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-checkbox-group\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "MultiValue",
          "required": false,
          "description": "双向绑定值（数组）"
        },
        {
          "name": "options",
          "type": "unknown[]",
          "required": false,
          "description": "选项列表"
        },
        {
          "name": "optionKey",
          "type": "string",
          "required": false,
          "description": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项"
        },
        {
          "name": "optionLabelField",
          "type": "string",
          "required": false,
          "description": "选项标签字段"
        },
        {
          "name": "optionValueField",
          "type": "string",
          "required": false,
          "description": "选项值字段"
        },
        {
          "name": "buttonStyle",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "按钮风格"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-checkbox-group\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: MultiValue]",
          "schema": [
            {
              "kind": "array",
              "type": "MultiValue",
              "items": [
                {
                  "kind": "enum",
                  "type": "string | number | boolean",
                  "variants": [
                    "string",
                    "number",
                    "false",
                    "true"
                  ]
                }
              ]
            }
          ]
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-checkbox": {
      "type": "r-checkbox",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-checkbox\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "boolean",
          "required": false,
          "description": "双向绑定值"
        },
        {
          "name": "checkedText",
          "type": "string",
          "required": false,
          "default": "\"\\u662F\"",
          "description": "选中时显示文案"
        },
        {
          "name": "uncheckedText",
          "type": "string",
          "required": false,
          "default": "\"\\u5426\"",
          "description": "未选时显示文案"
        },
        {
          "name": "checkboxText",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "复选框右侧文案"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-checkbox\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: boolean]",
          "schema": [
            {
              "kind": "enum",
              "type": "boolean",
              "variants": [
                "false",
                "true"
              ]
            }
          ]
        }
      ],
      "notes": "⚠️ 用 checkedText / uncheckedText 代替 trueLabel / falseLabel",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "boolean"
      }
    },
    "r-cascader": {
      "type": "r-cascader",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-cascader\" 使用。",
      "props": [
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "width",
          "type": "number",
          "required": false,
          "description": "r-table 内列宽"
        },
        {
          "name": "modelValue",
          "type": "CascaderValue",
          "required": false,
          "description": "双向绑定值"
        },
        {
          "name": "options",
          "type": "unknown[]",
          "required": false,
          "description": "树形选项（嵌套结构）"
        },
        {
          "name": "optionKey",
          "type": "string",
          "required": false,
          "description": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项"
        },
        {
          "name": "optionLabelField",
          "type": "string",
          "required": false,
          "description": "选项标签字段"
        },
        {
          "name": "optionValueField",
          "type": "string",
          "required": false,
          "description": "选项值字段"
        },
        {
          "name": "optionChildrenField",
          "type": "string",
          "required": false,
          "description": "子节点字段"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"\\u8BF7\\u9009\\u62E9\"",
          "description": "占位提示"
        },
        {
          "name": "clearable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可清除"
        },
        {
          "name": "filterable",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "可搜索"
        },
        {
          "name": "multiple",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "多选模式"
        },
        {
          "name": "checkStrictly",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "父子不关联勾选"
        },
        {
          "name": "emitPath",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "值是否为完整路径数组"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-cascader\"",
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: CascaderValue]",
          "schema": [
            {
              "kind": "enum",
              "type": "CascaderValue",
              "variants": [
                "CascaderPath",
                "CascaderPath[]"
              ]
            }
          ]
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "sap-chat-panel": {
      "type": "sap-chat-panel",
      "category": "feature",
      "description": "SPARK 组件，可在注册表中通过 type=\"sap-chat-panel\" 使用。",
      "props": [
        {
          "name": "embedded",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "forceOpen",
          "type": "boolean",
          "required": false,
          "default": "false"
        }
      ]
    },
    "nav-icon": {
      "type": "nav-icon",
      "category": "feature",
      "description": "SPARK 组件，可在注册表中通过 type=\"nav-icon\" 使用。",
      "props": [
        {
          "name": "name",
          "type": "string | undefined",
          "required": false
        },
        {
          "name": "size",
          "type": "number | undefined",
          "required": false
        }
      ]
    },
    "module-context-badge": {
      "type": "module-context-badge",
      "category": "feature",
      "description": "SPARK 组件，可在注册表中通过 type=\"module-context-badge\" 使用。",
      "props": [
        {
          "name": "label",
          "type": "string",
          "required": false,
          "default": "\"\\u4E0A\\u4E0B\\u6587\""
        },
        {
          "name": "emptyText",
          "type": "string",
          "required": false,
          "default": "\"\\u672A\\u9009\\u62E9\""
        }
      ]
    },
    "icon-picker": {
      "type": "icon-picker",
      "category": "feature",
      "description": "SPARK 组件，可在注册表中通过 type=\"icon-picker\" 使用。",
      "props": [
        {
          "name": "modelValue",
          "type": "string",
          "required": false,
          "default": "\"\""
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"\\u9009\\u62E9\\u56FE\\u6807\""
        },
        {
          "name": "width",
          "type": "string | number",
          "required": false,
          "default": "60"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]",
          "schema": []
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "error-fallback": {
      "type": "error-fallback",
      "category": "feature",
      "description": "SPARK 组件，可在注册表中通过 type=\"error-fallback\" 使用。",
      "props": [
        {
          "name": "error",
          "type": "Error",
          "required": false,
          "description": "错误对象\r\n包含错误消息（message）和堆栈信息（stack）"
        }
      ]
    },
    "ai-proposal-card": {
      "type": "ai-proposal-card",
      "category": "feature",
      "description": "SPARK 组件，可在注册表中通过 type=\"ai-proposal-card\" 使用。",
      "props": [
        {
          "name": "proposal",
          "type": "DesignProposal",
          "required": true
        }
      ],
      "emits": [
        {
          "name": "accept",
          "type": "[id: string]",
          "schema": []
        },
        {
          "name": "reject",
          "type": "[id: string]",
          "schema": []
        },
        {
          "name": "discuss",
          "type": "[proposal: DesignProposal]",
          "schema": [
            {
              "kind": "object",
              "type": "DesignProposal",
              "properties": {
                "id": {
                  "name": "id",
                  "type": "string",
                  "required": true
                },
                "type": {
                  "name": "type",
                  "type": "ProposalType",
                  "required": true,
                  "schema": {
                    "kind": "enum",
                    "type": "ProposalType",
                    "variants": [
                      "\"style\"",
                      "\"data-model\"",
                      "\"view-plan\"",
                      "\"ui-structure\"",
                      "\"interaction\"",
                      "\"api-config\"",
                      "\"db-schema\"",
                      "\"dict-entry\"",
                      "\"function-plan\"",
                      "\"navigation\""
                    ]
                  }
                },
                "title": {
                  "name": "title",
                  "type": "string",
                  "required": true
                },
                "content": {
                  "name": "content",
                  "type": "string",
                  "required": true,
                  "description": "提案核心内容（JSON 或代码）"
                },
                "status": {
                  "name": "status",
                  "type": "ProposalStatus",
                  "required": true,
                  "schema": {
                    "kind": "enum",
                    "type": "ProposalStatus",
                    "variants": [
                      "\"pending\"",
                      "\"accepted\"",
                      "\"rejected\""
                    ]
                  }
                },
                "messageId": {
                  "name": "messageId",
                  "type": "string",
                  "required": true,
                  "description": "所属聊天消息 ID"
                },
                "stage": {
                  "name": "stage",
                  "type": "string",
                  "required": true,
                  "description": "提案所属工作流阶段"
                },
                "timestamp": {
                  "name": "timestamp",
                  "type": "Date",
                  "required": true,
                  "schema": {
                    "kind": "object",
                    "type": "Date",
                    "properties": {
                      "toString": {
                        "name": "toString",
                        "type": "() => string",
                        "required": true,
                        "description": "Returns a string representation of a date. The format of the string depends on the locale."
                      },
                      "toDateString": {
                        "name": "toDateString",
                        "type": "() => string",
                        "required": true,
                        "description": "Returns a date as a string value."
                      },
                      "toTimeString": {
                        "name": "toTimeString",
                        "type": "() => string",
                        "required": true,
                        "description": "Returns a time as a string value."
                      },
                      "toLocaleString": {
                        "name": "toLocaleString",
                        "type": "{ (): string; (locales?: string | string[] | undefined, options?: DateTimeFormatOptions | undefined): string; (locales?: LocalesArgument, options?: DateTimeFormatOptions | undefined): string; }",
                        "required": true,
                        "description": "Returns a value as a string value appropriate to the host environment's current locale.\nConverts a date and time to a string by using the current or specified locale."
                      },
                      "toLocaleDateString": {
                        "name": "toLocaleDateString",
                        "type": "{ (): string; (locales?: string | string[] | undefined, options?: DateTimeFormatOptions | undefined): string; (locales?: LocalesArgument, options?: DateTimeFormatOptions | undefined): string; }",
                        "required": true,
                        "description": "Returns a date as a string value appropriate to the host environment's current locale.\nConverts a date to a string by using the current or specified locale."
                      },
                      "toLocaleTimeString": {
                        "name": "toLocaleTimeString",
                        "type": "{ (): string; (locales?: string | string[] | undefined, options?: DateTimeFormatOptions | undefined): string; (locales?: LocalesArgument, options?: DateTimeFormatOptions | undefined): string; }",
                        "required": true,
                        "description": "Returns a time as a string value appropriate to the host environment's current locale.\nConverts a time to a string by using the current or specified locale."
                      },
                      "valueOf": {
                        "name": "valueOf",
                        "type": "() => number",
                        "required": true,
                        "description": "Returns the stored time value in milliseconds since midnight, January 1, 1970 UTC."
                      },
                      "getTime": {
                        "name": "getTime",
                        "type": "() => number",
                        "required": true,
                        "description": "Returns the stored time value in milliseconds since midnight, January 1, 1970 UTC."
                      },
                      "getFullYear": {
                        "name": "getFullYear",
                        "type": "() => number",
                        "required": true,
                        "description": "Gets the year, using local time."
                      },
                      "getUTCFullYear": {
                        "name": "getUTCFullYear",
                        "type": "() => number",
                        "required": true,
                        "description": "Gets the year using Universal Coordinated Time (UTC)."
                      },
                      "getMonth": {
                        "name": "getMonth",
                        "type": "() => number",
                        "required": true,
                        "description": "Gets the month, using local time."
                      },
                      "getUTCMonth": {
                        "name": "getUTCMonth",
                        "type": "() => number",
                        "required": true,
                        "description": "Gets the month of a Date object using Universal Coordinated Time (UTC)."
                      },
                      "getDate": {
                        "name": "getDate",
                        "type": "() => number",
                        "required": true,
                        "description": "Gets the day-of-the-month, using local time."
                      },
                      "getUTCDate": {
                        "name": "getUTCDate",
                        "type": "() => number",
                        "required": true,
                        "description": "Gets the day-of-the-month, using Universal Coordinated Time (UTC)."
                      },
                      "getDay": {
                        "name": "getDay",
                        "type": "() => number",
                        "required": true,
                        "description": "Gets the day of the week, using local time."
                      },
                      "getUTCDay": {
                        "name": "getUTCDay",
                        "type": "() => number",
                        "required": true,
                        "description": "Gets the day of the week using Universal Coordinated Time (UTC)."
                      },
                      "getHours": {
                        "name": "getHours",
                        "type": "() => number",
                        "required": true,
                        "description": "Gets the hours in a date, using local time."
                      },
                      "getUTCHours": {
                        "name": "getUTCHours",
                        "type": "() => number",
                        "required": true,
                        "description": "Gets the hours value in a Date object using Universal Coordinated Time (UTC)."
                      },
                      "getMinutes": {
                        "name": "getMinutes",
                        "type": "() => number",
                        "required": true,
                        "description": "Gets the minutes of a Date object, using local time."
                      },
                      "getUTCMinutes": {
                        "name": "getUTCMinutes",
                        "type": "() => number",
                        "required": true,
                        "description": "Gets the minutes of a Date object using Universal Coordinated Time (UTC)."
                      },
                      "getSeconds": {
                        "name": "getSeconds",
                        "type": "() => number",
                        "required": true,
                        "description": "Gets the seconds of a Date object, using local time."
                      },
                      "getUTCSeconds": {
                        "name": "getUTCSeconds",
                        "type": "() => number",
                        "required": true,
                        "description": "Gets the seconds of a Date object using Universal Coordinated Time (UTC)."
                      },
                      "getMilliseconds": {
                        "name": "getMilliseconds",
                        "type": "() => number",
                        "required": true,
                        "description": "Gets the milliseconds of a Date, using local time."
                      },
                      "getUTCMilliseconds": {
                        "name": "getUTCMilliseconds",
                        "type": "() => number",
                        "required": true,
                        "description": "Gets the milliseconds of a Date object using Universal Coordinated Time (UTC)."
                      },
                      "getTimezoneOffset": {
                        "name": "getTimezoneOffset",
                        "type": "() => number",
                        "required": true,
                        "description": "Gets the difference in minutes between Universal Coordinated Time (UTC) and the time on the local computer."
                      },
                      "setTime": {
                        "name": "setTime",
                        "type": "(time: number) => number",
                        "required": true,
                        "description": "Sets the date and time value in the Date object."
                      },
                      "setMilliseconds": {
                        "name": "setMilliseconds",
                        "type": "(ms: number) => number",
                        "required": true,
                        "description": "Sets the milliseconds value in the Date object using local time."
                      },
                      "setUTCMilliseconds": {
                        "name": "setUTCMilliseconds",
                        "type": "(ms: number) => number",
                        "required": true,
                        "description": "Sets the milliseconds value in the Date object using Universal Coordinated Time (UTC)."
                      },
                      "setSeconds": {
                        "name": "setSeconds",
                        "type": "(sec: number, ms?: number | undefined) => number",
                        "required": true,
                        "description": "Sets the seconds value in the Date object using local time."
                      },
                      "setUTCSeconds": {
                        "name": "setUTCSeconds",
                        "type": "(sec: number, ms?: number | undefined) => number",
                        "required": true,
                        "description": "Sets the seconds value in the Date object using Universal Coordinated Time (UTC)."
                      },
                      "setMinutes": {
                        "name": "setMinutes",
                        "type": "(min: number, sec?: number | undefined, ms?: number | undefined) => number",
                        "required": true,
                        "description": "Sets the minutes value in the Date object using local time."
                      },
                      "setUTCMinutes": {
                        "name": "setUTCMinutes",
                        "type": "(min: number, sec?: number | undefined, ms?: number | undefined) => number",
                        "required": true,
                        "description": "Sets the minutes value in the Date object using Universal Coordinated Time (UTC)."
                      },
                      "setHours": {
                        "name": "setHours",
                        "type": "(hours: number, min?: number | undefined, sec?: number | undefined, ms?: number | undefined) => number",
                        "required": true,
                        "description": "Sets the hour value in the Date object using local time."
                      },
                      "setUTCHours": {
                        "name": "setUTCHours",
                        "type": "(hours: number, min?: number | undefined, sec?: number | undefined, ms?: number | undefined) => number",
                        "required": true,
                        "description": "Sets the hours value in the Date object using Universal Coordinated Time (UTC)."
                      },
                      "setDate": {
                        "name": "setDate",
                        "type": "(date: number) => number",
                        "required": true,
                        "description": "Sets the numeric day-of-the-month value of the Date object using local time."
                      },
                      "setUTCDate": {
                        "name": "setUTCDate",
                        "type": "(date: number) => number",
                        "required": true,
                        "description": "Sets the numeric day of the month in the Date object using Universal Coordinated Time (UTC)."
                      },
                      "setMonth": {
                        "name": "setMonth",
                        "type": "(month: number, date?: number | undefined) => number",
                        "required": true,
                        "description": "Sets the month value in the Date object using local time."
                      },
                      "setUTCMonth": {
                        "name": "setUTCMonth",
                        "type": "(month: number, date?: number | undefined) => number",
                        "required": true,
                        "description": "Sets the month value in the Date object using Universal Coordinated Time (UTC)."
                      },
                      "setFullYear": {
                        "name": "setFullYear",
                        "type": "(year: number, month?: number | undefined, date?: number | undefined) => number",
                        "required": true,
                        "description": "Sets the year of the Date object using local time."
                      },
                      "setUTCFullYear": {
                        "name": "setUTCFullYear",
                        "type": "(year: number, month?: number | undefined, date?: number | undefined) => number",
                        "required": true,
                        "description": "Sets the year value in the Date object using Universal Coordinated Time (UTC)."
                      },
                      "toUTCString": {
                        "name": "toUTCString",
                        "type": "() => string",
                        "required": true,
                        "description": "Returns a date converted to a string using Universal Coordinated Time (UTC)."
                      },
                      "toISOString": {
                        "name": "toISOString",
                        "type": "() => string",
                        "required": true,
                        "description": "Returns a date as a string value in ISO format."
                      },
                      "toJSON": {
                        "name": "toJSON",
                        "type": "(key?: any) => string",
                        "required": true,
                        "description": "Used by the JSON.stringify method to enable the transformation of an object's data for JavaScript Object Notation (JSON) serialization."
                      },
                      "__@toPrimitive@937": {
                        "name": "__@toPrimitive@937",
                        "type": "{ (hint: \"default\"): string; (hint: \"string\"): string; (hint: \"number\"): number; (hint: string): string | number; }",
                        "required": true,
                        "description": "Converts a Date object to a string.\nConverts a Date object to a number.\nConverts a Date object to a string or number."
                      }
                    }
                  }
                }
              }
            }
          ]
        },
        {
          "name": "editContent",
          "type": "[id: string, content: string]",
          "schema": []
        },
        {
          "name": "editTitle",
          "type": "[id: string, title: string]",
          "schema": []
        }
      ]
    },
    "ai-design-studio": {
      "type": "ai-design-studio",
      "category": "feature",
      "description": "SPARK 组件，可在注册表中通过 type=\"ai-design-studio\" 使用。",
      "props": [
        {
          "name": "modelValue",
          "type": "boolean",
          "required": false,
          "default": "false"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: boolean]",
          "schema": [
            {
              "kind": "enum",
              "type": "boolean",
              "variants": [
                "false",
                "true"
              ]
            }
          ]
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "boolean"
      }
    },
    "ai-chat-widget": {
      "type": "ai-chat-widget",
      "category": "feature",
      "description": "SPARK 组件，可在注册表中通过 type=\"ai-chat-widget\" 使用。",
      "props": [
        {
          "name": "mode",
          "type": "ChatMode",
          "required": false
        },
        {
          "name": "systemPrompt",
          "type": "string",
          "required": false
        },
        {
          "name": "title",
          "type": "string",
          "required": false
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false
        },
        {
          "name": "compact",
          "type": "boolean",
          "required": false
        }
      ]
    },
    "ai-chat-panel": {
      "type": "ai-chat-panel",
      "category": "feature",
      "description": "SPARK 组件，可在注册表中通过 type=\"ai-chat-panel\" 使用。",
      "props": [
        {
          "name": "embedded",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "forceOpen",
          "type": "boolean",
          "required": false,
          "default": "false"
        }
      ]
    },
    "ai-assistant-hub": {
      "type": "ai-assistant-hub",
      "category": "feature",
      "description": "SPARK 组件，可在注册表中通过 type=\"ai-assistant-hub\" 使用。",
      "props": []
    },
    "tenant-config": {
      "type": "tenant-config",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"tenant-config\" 引用。",
      "props": []
    },
    "settings": {
      "type": "settings",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"settings\" 引用。",
      "props": []
    },
    "cache-manager": {
      "type": "cache-manager",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"cache-manager\" 引用。",
      "props": []
    },
    "app-list": {
      "type": "app-list",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"app-list\" 引用。",
      "props": []
    },
    "login-view": {
      "type": "login-view",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"login-view\" 引用。",
      "props": []
    },
    "home-page": {
      "type": "home-page",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"home-page\" 引用。",
      "props": []
    },
    "about": {
      "type": "about",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"about\" 引用。",
      "props": []
    },
    "dashboard": {
      "type": "dashboard",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"dashboard\" 引用。",
      "props": []
    },
    "capability-demo": {
      "type": "capability-demo",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"capability-demo\" 引用。",
      "props": []
    },
    "dev-workbench": {
      "type": "dev-workbench",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"dev-workbench\" 引用。",
      "props": []
    },
    "dev-system": {
      "type": "dev-system",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"dev-system\" 引用。",
      "props": []
    },
    "dev-site-tree": {
      "type": "dev-site-tree",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"dev-site-tree\" 引用。",
      "props": [
        {
          "name": "state",
          "type": "{ treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[], StatusMessage[] | { text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<\"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\", \"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: \"error\" | \"success\" | \"warning\" | \"info\") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }",
          "required": true
        }
      ]
    },
    "dev-page-overview": {
      "type": "dev-page-overview",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"dev-page-overview\" 引用。",
      "props": [
        {
          "name": "state",
          "type": "{ treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[], StatusMessage[] | { text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<\"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\", \"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: \"error\" | \"success\" | \"warning\" | \"info\") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }",
          "required": true
        }
      ],
      "emits": [
        {
          "name": "createPage",
          "type": "[]"
        },
        {
          "name": "locateNode",
          "type": "[pageId: string]",
          "schema": []
        },
        {
          "name": "editPage",
          "type": "[pageId: string]",
          "schema": []
        }
      ]
    },
    "dev-node-props": {
      "type": "dev-node-props",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"dev-node-props\" 引用。",
      "props": [
        {
          "name": "state",
          "type": "{ treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[], StatusMessage[] | { text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<\"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\", \"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: \"error\" | \"success\" | \"warning\" | \"info\") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }",
          "required": true
        }
      ],
      "emits": [
        {
          "name": "createPage",
          "type": "[]"
        }
      ]
    },
    "dev-file-editor": {
      "type": "dev-file-editor",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"dev-file-editor\" 引用。",
      "props": [
        {
          "name": "state",
          "type": "{ treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[], StatusMessage[] | { text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<\"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\", \"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: \"error\" | \"success\" | \"warning\" | \"info\") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }",
          "required": true
        }
      ]
    },
    "dev-ai-panel": {
      "type": "dev-ai-panel",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"dev-ai-panel\" 引用。",
      "props": [
        {
          "name": "state",
          "type": "{ treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[], StatusMessage[] | { text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<\"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\", \"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: \"error\" | \"success\" | \"warning\" | \"info\") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }",
          "required": true
        }
      ]
    },
    "workspace-panel": {
      "type": "workspace-panel",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"workspace-panel\" 引用。",
      "props": [
        {
          "name": "nodeId",
          "type": "string | null",
          "required": true
        }
      ]
    },
    "wbs-node-editor": {
      "type": "wbs-node-editor",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"wbs-node-editor\" 引用。",
      "props": [
        {
          "name": "nodeId",
          "type": "string",
          "required": true
        }
      ]
    },
    "project-tree": {
      "type": "project-tree",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"project-tree\" 引用。",
      "props": [
        {
          "name": "state",
          "type": "ProjectState",
          "required": true
        }
      ],
      "emits": [
        {
          "name": "nodeClick",
          "type": "[nodeId: string]",
          "schema": []
        },
        {
          "name": "addGroup",
          "type": "[]"
        },
        {
          "name": "addPage",
          "type": "[]"
        }
      ]
    },
    "page-config-editor": {
      "type": "page-config-editor",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"page-config-editor\" 引用。",
      "props": [
        {
          "name": "pageId",
          "type": "string",
          "required": true
        }
      ]
    },
    "node-target-config": {
      "type": "node-target-config",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"node-target-config\" 引用。",
      "props": [
        {
          "name": "state",
          "type": "{ treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[], StatusMessage[] | { text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<\"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\", \"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: \"error\" | \"success\" | \"warning\" | \"info\") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }",
          "required": true
        }
      ]
    },
    "node-state-config": {
      "type": "node-state-config",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"node-state-config\" 引用。",
      "props": [
        {
          "name": "state",
          "type": "{ treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[], StatusMessage[] | { text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<\"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\", \"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: \"error\" | \"success\" | \"warning\" | \"info\") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }",
          "required": true
        }
      ]
    },
    "node-layout-config": {
      "type": "node-layout-config",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"node-layout-config\" 引用。",
      "props": [
        {
          "name": "state",
          "type": "{ treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[], StatusMessage[] | { text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<\"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\", \"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: \"error\" | \"success\" | \"warning\" | \"info\") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }",
          "required": true
        }
      ]
    },
    "node-context-config": {
      "type": "node-context-config",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"node-context-config\" 引用。",
      "props": [
        {
          "name": "state",
          "type": "{ treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[], StatusMessage[] | { text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<\"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\", \"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: \"error\" | \"success\" | \"warning\" | \"info\") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }",
          "required": true
        }
      ]
    },
    "node-basic-info": {
      "type": "node-basic-info",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"node-basic-info\" 引用。",
      "props": [
        {
          "name": "state",
          "type": "{ treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[], StatusMessage[] | { text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<\"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\", \"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: \"error\" | \"success\" | \"warning\" | \"info\") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }",
          "required": true
        },
        {
          "name": "moduleKindDisabled",
          "type": "boolean",
          "required": true
        }
      ]
    },
    "ai-studio-panel": {
      "type": "ai-studio-panel",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"ai-studio-panel\" 引用。",
      "props": []
    },
    "spark-component-renderer": {
      "type": "spark-component-renderer",
      "category": "feature",
      "description": "SPARK 包组件，可在 rule.json 中通过 type=\"spark-component-renderer\" 使用。",
      "props": [
        {
          "name": "parentContext",
          "type": "ICapabilityContext",
          "required": false,
          "description": "显式父上下文（可选）\r\n仅用于根节点 / 测试场景：将其注入 DI 链，子业务组件 inject 时自动获取。\r\n普通递归渲染无需传递，子组件继承已有的 DI 链。"
        }
      ]
    },
    "r-context-renderer": {
      "type": "r-context-renderer",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-context-renderer\" 使用。",
      "props": [
        {
          "name": "displayLabel",
          "type": "string | undefined",
          "required": false,
          "description": "显示标签"
        },
        {
          "name": "label",
          "type": "string | undefined",
          "required": false,
          "description": "直接传入的标签（供 r-column-group 直连使用）"
        },
        {
          "name": "fieldName",
          "type": "string | undefined",
          "required": false,
          "description": "字段绑定名"
        },
        {
          "name": "field",
          "type": "string | undefined",
          "required": false,
          "description": "直接传入的字段名（供裸列节点使用）"
        },
        {
          "name": "width",
          "type": "string | number | undefined",
          "required": false,
          "description": "列宽"
        },
        {
          "name": "minWidth",
          "type": "string | number | undefined",
          "required": false,
          "description": "最小列宽"
        },
        {
          "name": "fixed",
          "type": "boolean | \"left\" | \"right\" | undefined",
          "required": false,
          "description": "固定列方向"
        },
        {
          "name": "align",
          "type": "TextAlign | undefined",
          "required": false,
          "description": "列对齐"
        },
        {
          "name": "headerAlign",
          "type": "TextAlign | undefined",
          "required": false,
          "description": "表头对齐"
        },
        {
          "name": "isCurrentFieldHidden",
          "type": "boolean | undefined",
          "required": false,
          "description": "当前字段是否隐藏"
        },
        {
          "name": "currentDisplayValue",
          "type": "string | undefined",
          "required": false,
          "description": "当前显示值"
        },
        {
          "name": "isTableCellHidden",
          "type": "((row: IDataRow) => boolean) | undefined",
          "required": false,
          "description": "表格行级隐藏判断"
        },
        {
          "name": "getTableCellDisplayValue",
          "type": "((row: IDataRow) => string) | undefined",
          "required": false,
          "description": "表格行级显示值获取"
        },
        {
          "name": "validationRules",
          "type": "FormItemRule[] | undefined",
          "required": false,
          "description": "表单验证规则"
        },
        {
          "name": "titleAlign",
          "type": "TextAlign | undefined",
          "required": false,
          "description": "标题对齐（table/detail）"
        },
        {
          "name": "valueAlign",
          "type": "TextAlign | undefined",
          "required": false,
          "description": "值对齐（table/detail）"
        },
        {
          "name": "headerCellClassName",
          "type": "string | undefined",
          "required": false,
          "description": "表头 class（table）"
        },
        {
          "name": "labelClassName",
          "type": "string | undefined",
          "required": false,
          "description": "兼容直接传入的列头 class"
        },
        {
          "name": "cellClassName",
          "type": "string | undefined",
          "required": false,
          "description": "单元格 class（table）"
        },
        {
          "name": "className",
          "type": "string | undefined",
          "required": false,
          "description": "兼容直接传入的列 class"
        },
        {
          "name": "titleClassName",
          "type": "string | undefined",
          "required": false,
          "description": "标题 class（detail）"
        },
        {
          "name": "valueClassName",
          "type": "string | undefined",
          "required": false,
          "description": "值 class（detail/table value）"
        },
        {
          "name": "type",
          "type": "string",
          "required": true,
          "description": "组件类型（对应 ComponentDefinition.type）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "required": false,
          "description": "组件属性（所有组件可见的数据均通过 props 传递）"
        },
        {
          "name": "id",
          "type": "string",
          "required": false,
          "description": "节点唯一标识\r\n\r\n用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。\r\n绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。"
        },
        {
          "name": "dock",
          "type": "string",
          "required": false,
          "description": "停靠区域 — 子节点在父容器中的渲染目标区域\r\n\r\n容器组件按 dock 值过滤 children，分区渲染：\r\n - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）\r\n- `'toolbar'` — 顶部工具栏\r\n- `'actions'` — 行操作列\r\n- `'filter'`  — 筛选区\r\n- `'header'`  — 头部区域\r\n- `'footer'`  — 底部区域\r\n- 自定义字符串 — 容器自行扩展\r\n\r\n 兼容：历史 `'default'` 会在运行时归一化为默认区域。"
        },
        {
          "name": "order",
          "type": "number",
          "required": false,
          "description": "排序权重 — 同一 dock 区域内的渲染顺序\r\n\r\n升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。"
        }
      ]
    },
    "r-column-group": {
      "type": "r-column-group",
      "category": "group",
      "description": "",
      "props": [],
      "notes": "【使用场景】复杂表格需要多级表头分组，例如「基本信息」下包含「姓名」「年龄」「邮箱」\n\n【示例】\n{ \"type\": \"r-column-group\", \"props\": { \"label\": \"基本信息\" }, \"children\": [\n  { \"type\": \"r-text\", \"field\": \"name\", \"props\": { \"label\": \"姓名\" } },\n  { \"type\": \"r-number\", \"field\": \"age\", \"props\": { \"label\": \"年龄\" } }\n]}\nchildren 内放 r-* 字段组件作为实际数据列"
    }
  },
  "constraints": {
    "dataKeyPattern": "^(#[\\w-]+@)?[\\w-]+@([\\w-]+@)?(rows|currentRow|selectedRows|summaryRow|selectionSummaryRow)(\\.[\\w.]+)?$",
    "htmlTypes": [
      "a",
      "article",
      "aside",
      "b",
      "blockquote",
      "br",
      "button",
      "code",
      "del",
      "details",
      "div",
      "em",
      "figcaption",
      "figure",
      "footer",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "header",
      "hr",
      "i",
      "img",
      "input",
      "label",
      "li",
      "main",
      "nav",
      "ol",
      "option",
      "p",
      "pre",
      "section",
      "select",
      "small",
      "span",
      "strong",
      "summary",
      "table",
      "tbody",
      "td",
      "textarea",
      "tfoot",
      "th",
      "thead",
      "tr",
      "u",
      "ul"
    ],
    "validTypePrefixes": [
      "r-",
      "el-",
      "Render",
      "spark-"
    ],
    "validAggregateTypes": [
      "sum",
      "count",
      "avg",
      "min",
      "max",
      "join"
    ],
    "nonFieldRTypes": [
      "r-table",
      "r-form",
      "r-detail",
      "r-list",
      "r-tree",
      "r-tabs",
      "r-collapse",
      "r-dialog",
      "r-drawer",
      "r-steps",
      "r-section",
      "r-block",
      "r-column-group"
    ],
    "containerContextMap": {
      "r-table": "table",
      "r-form": "form",
      "r-detail": "detail",
      "r-list": "list",
      "r-tree": "tree"
    },
    "nestingRules": {
      "el-table": {
        "allowedChildren": [
          "el-table-column",
          "Render*"
        ],
        "forbiddenChildren": [
          "r-*"
        ],
        "note": "el-table 内只能用 el-table-column 或 Render* 函数"
      },
      "r-table": {
        "allowedChildren": [
          "r-*",
          "r-column-group"
        ],
        "forbiddenChildren": [
          "el-table-column"
        ],
        "note": "r-table 内强制使用 r-* 字段组件，禁止 el-table-column"
      },
      "r-form": {
        "allowedChildren": [
          "r-*"
        ],
        "note": "r-form 内放 r-* 字段组件"
      },
      "r-detail": {
        "allowedChildren": [
          "r-*"
        ],
        "note": "r-detail 内放 r-* 字段组件"
      },
      "r-tabs": {
        "allowedChildren": [
          "r-tab-pane"
        ],
        "note": "r-tabs 内放 r-tab-pane"
      }
    }
  }
}
