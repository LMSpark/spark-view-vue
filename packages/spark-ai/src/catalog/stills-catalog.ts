/**
 * Stills 组件目录（轻量版）
 *
 * ⚠️ 自动生成 — 请勿手动编辑
 *
 * 由 vite-plugin-spark-catalog 在 build / dev 时生成。
 * 重新生成：pnpm run dev 或 pnpm run build
 * 生成时间：2026-04-08T05:35:22.829Z
 * 条目数量：121
 */
import type { StillsCatalog } from './stills-catalog-types'

export const STILLS_CATALOG: StillsCatalog = {
  "version": "1.0.0",
  "buildTime": "2026-04-08T05:35:22.829Z",
  "componentCount": 121,
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
      "r-anchor",
      "r-anchor-link",
      "r-autocomplete",
      "r-button",
      "r-card",
      "r-cascader",
      "r-check-tag",
      "r-checkbox",
      "r-checkbox-group",
      "r-collapse-item",
      "r-color",
      "r-context-renderer",
      "r-date",
      "r-dept-picker",
      "r-divider",
      "r-dropdown",
      "r-entity-picker",
      "r-file-browser",
      "r-file-path",
      "r-html-editor",
      "r-icon",
      "r-image",
      "r-link",
      "r-mention",
      "r-multi-select",
      "r-number",
      "r-page-header",
      "r-popconfirm",
      "r-popover",
      "r-product-picker",
      "r-radio",
      "r-rate",
      "r-segmented",
      "r-select",
      "r-slider",
      "r-space",
      "r-step-item",
      "r-switch",
      "r-tab-pane",
      "r-text",
      "r-textarea",
      "r-time-picker",
      "r-time-select",
      "r-toolbar",
      "r-tooltip",
      "r-tour",
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
      "category": "meta",
      "description": "语境感知字段渲染能力总览",
      "props": [],
      "notes": "**context-aware-fields-api** — 语境感知字段渲染能力总览\n\n【核心能力】\n- 子组件渲染由父容器语境决定：r-table(table) / r-form(form) / r-detail(detail) / r-list(list) / r-tree(tree)\n- 同一 r-* 字段组件可跨语境复用，不复制多套组件\n- 字段组件必须处于容器 children 中，禁止顶层裸放（会丢失语境）\n\n【关键约束】\n- r-table children 仅放 r-* 字段组件，禁止 el-table-column\n- 事件逻辑优先用根级 on + script.js 函数，不在组件层硬编码父级判断\n- 字段绑定用根级 field\n\n【建议组合查询】\n- r-table, r-form, r-detail, r-text, r-number, r-select, builtin-action"
    },
    "builtin-action": {
      "category": "meta",
      "description": "声明式动作节点（零代码优先）",
      "props": [
        {
          "name": "type",
          "type": "\"builtin-action\"",
          "required": false
        },
        {
          "name": "props.builtinAction",
          "type": "string",
          "required": false,
          "description": "动作类型"
        }
      ],
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
      "notes": "**builtin-action** — 声明式动作节点（零代码优先）\n\n【节点形态】\ntype: \"builtin-action\"\nprops.builtinAction: string — 动作类型\nprops.label?: string — 按钮文案\nprops.type?: 'primary'|'success'|'warning'|'danger'|'info'\nprops.confirmTitle?: string — 删除类动作确认标题\nprops.confirmMessage?: string — 删除类动作确认文案\nprops.silent?: boolean — true 时关闭默认消息提示\n\n【常用动作】\nappend-row | refresh | patch-row | patch-current | patch-selected | delete-row | delete-selected | message-row\n\n【放置位置】\n- children + dock: 'toolbar'（工具栏动作）\n- children + dock: 'actions'（行/项动作）\n\n适用于 r-table / r-list / r-form / r-detail 的常见 CRUD 场景"
    },
    "r-table": {
      "category": "container",
      "description": "数据表格容器，基于 el-table 绑定 DataView 渲染行数据，支持工具栏/筛选区/行操作等 dock 区域，自动同步当前行和选中行状态。",
      "props": [
        {
          "name": "dataKey",
          "type": "string",
          "required": false,
          "description": "DataKey 格式：tableName@field"
        },
        {
          "name": "actions",
          "type": "unknown",
          "required": false,
          "description": "结构化行动作 dock"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-table\"",
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
          "name": "on.rowDblclick",
          "type": "string",
          "required": false,
          "description": "行双击（→ script.js 函数名）"
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
        }
      ],
      "notes": "**r-table** — 数据表格容器\n\n【props — 透传到 el-table】\nborder: boolean — 边框\nstripe: boolean — 斑马纹\nhighlightCurrentRow: boolean — 当前行高亮（⚠️ 必须显式声明才生效）\nheight / maxHeight: string | number — 表格高度\nstyle: object — 行内样式\nclass: string — CSS 类名\n\n【根级字段 — 数据绑定】\ndataKey: string — 数据绑定键，如 \"Users@rows\"（根级）\n\n【根级字段 — 事件绑定】\non.rowDblclick: string — 行双击（→ script.js 函数名）\n（其他组件事件同理，key 为 camelCase 事件名）\n\n【筛选区】\nchildren 中声明 dock: 'filter' 的字段节点会渲染到筛选区。\nprops.docks.filter.collapsible: boolean — 可折叠，默认 false\nprops.docks.filter.defaultCollapsed: boolean — 默认折叠，默认 false\nprops.docks.filter.autoFitMinWidth: string — 最小宽度，默认 '220px'\nprops.docks.filter.class: string — 筛选区 CSS 类名\nprops.docks.filter.itemSpan: number — 每项跨列数，默认 1\nprops.docks.filter.gridColumns: number — 栅格总列数，默认 24\nprops.docks.filter.gridGap: number | string — 间距，默认 12\nprops.docks.filter.gridAutoRows: string — 行高，默认 'minmax(32px, auto)'\n\n【工具栏】\nchildren 中声明 dock: 'toolbar' 的节点会渲染到工具栏区域。\nprops.docks.toolbar.position: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'\nprops.docks.toolbar.class: string — 工具栏 CSS 类名\n\n【行操作区】\nchildren 中声明 dock: 'actions' 的节点会渲染为行操作区（优先 builtin-action）。\nprops.docks.actions.position: 'left' | 'right' — 默认 'right'\nprops.docks.actions.label: string — 操作列标题，默认 '操作'\nprops.docks.actions.width: number — 操作列宽度，默认 160\nprops.docks.actions.align: 'left' | 'center' | 'right' — 默认 'left'\nprops.docks.actions.fixed: boolean | 'left' | 'right' — 固定方向\nprops.docks.actions.class: string — 操作列 CSS 类名\n\n【能力链】\nconsumes: PAGE_DATASET, PAGE_SERVICE, PAGE_COMPONENT_REGISTRY, MODULE_CONTEXT\nprovides: DATA_SOURCE\n\nchildren 内仅用 r-* 字段组件做列，禁止 el-table-column",
      "binding": {
        "selfResolving": true
      },
      "nestingRule": {
        "allowedChildren": [
          "r-*",
          "r-column-group"
        ],
        "forbiddenChildren": [
          "el-table-column"
        ],
        "note": "r-table 内强制使用 r-* 字段组件，禁止 el-table-column"
      }
    },
    "r-form": {
      "category": "container",
      "description": "数据表单容器，基于 el-form 绑定 DataView.currentRow 实现字段双向编辑，通过 CONTEXT_DATA 能力向子组件暴露表单数据。",
      "props": [
        {
          "name": "dataKey",
          "type": "string",
          "required": false,
          "description": "数据绑定键，如 \"Users@currentRow\""
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
          "name": "props.docks.toolbar.position",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "required": false,
          "description": "默认 'top'"
        },
        {
          "name": "props.docks.toolbar.class",
          "type": "string",
          "required": false,
          "description": "工具栏 CSS 类名"
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
      },
      "nestingRule": {
        "allowedChildren": [
          "r-*"
        ],
        "note": "r-form 内放 r-* 字段组件"
      }
    },
    "r-detail": {
      "category": "container",
      "description": "数据详情容器，基于 el-form 以只读模式展示 DataView.currentRow 字段值，与 r-form 结构一致但不可编辑。",
      "props": [
        {
          "name": "dataKey",
          "type": "string",
          "required": false,
          "description": "数据绑定键"
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
          "type": "\"center\" | \"left\" | \"right\"",
          "required": false,
          "default": "\"left\"",
          "description": "标题对齐"
        },
        {
          "name": "valueAlign",
          "type": "\"center\" | \"left\" | \"right\"",
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
          "name": "props.docks.toolbar.position",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "required": false,
          "description": "默认 'top'"
        },
        {
          "name": "props.docks.toolbar.class",
          "type": "string",
          "required": false,
          "description": "工具栏 CSS 类名"
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
      },
      "nestingRule": {
        "allowedChildren": [
          "r-*"
        ],
        "note": "r-detail 内放 r-* 字段组件"
      }
    },
    "r-tree": {
      "category": "container",
      "description": "树形容器，基于 el-tree 绑定 DataView 渲染嵌套树结构，支持懒加载、节点操作和编辑器（r-editor dock）侧面板。",
      "props": [
        {
          "name": "dataKey",
          "type": "string",
          "required": false,
          "description": "数据绑定键，如 \"TreeData@rows\""
        },
        {
          "name": "actions",
          "type": "unknown",
          "required": false,
          "description": "结构化节点动作 dock"
        },
        {
          "name": "editor",
          "type": "unknown",
          "required": false,
          "description": "结构化编辑区 dock"
        },
        {
          "name": "nodeKey",
          "type": "string",
          "required": false,
          "description": "节点主键字段名，默认取 treeConfig.idField"
        },
        {
          "name": "currentKey",
          "type": "string | number | null",
          "required": false,
          "description": "当前选中节点 ID"
        },
        {
          "name": "expandToKey",
          "type": "string | number | null",
          "required": false,
          "description": "初始化展开并定位到目标节点 ID"
        },
        {
          "name": "expandLevel",
          "type": "number",
          "required": false,
          "description": "初始化自动展开到指定层级（根节点为第 1 层）"
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
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-tree\"",
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
          "name": "dataView",
          "type": "DataView",
          "required": false,
          "description": "直接传入的 DataView（与 Table/List/Form/Detail 一致）"
        },
        {
          "name": "props.docks.toolbar.position",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "required": false,
          "description": "工具栏位置"
        },
        {
          "name": "props.docks.toolbar.class",
          "type": "string",
          "required": false,
          "description": "工具栏 CSS 类名"
        },
        {
          "name": "onNodeClick",
          "type": "string",
          "required": false,
          "description": "script.js 节点点击回调函数名"
        },
        {
          "name": "onNodeExpand",
          "type": "string",
          "required": false,
          "description": "节点展开回调"
        },
        {
          "name": "onNodeCollapse",
          "type": "string",
          "required": false,
          "description": "节点折叠回调"
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
      "category": "container",
      "description": "列表容器，绑定 DataView.rows 以 CSS Grid 网格卡片布局渲染数据项，支持项选择和操作区域。",
      "props": [
        {
          "name": "dataKey",
          "type": "string",
          "required": false,
          "description": "数据绑定键"
        },
        {
          "name": "actions",
          "type": "unknown",
          "required": false,
          "description": "结构化列表项动作 dock"
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
          "type": "\"hover\" | \"always\" | \"never\"",
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
          "name": "props.docks.toolbar.position",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "required": false,
          "description": "默认 'top'"
        },
        {
          "name": "props.docks.toolbar.class",
          "type": "string",
          "required": false,
          "description": "工具栏 CSS 类名"
        },
        {
          "name": "props.docks.actions.position",
          "type": "'left' | 'right'",
          "required": false,
          "description": "默认 'right'"
        },
        {
          "name": "props.docks.actions.class",
          "type": "string",
          "required": false,
          "description": "操作区 CSS 类名"
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
          "name": "props.docks.actions.position",
          "type": "'left' | 'right'",
          "description": "默认 'right'"
        },
        {
          "name": "props.docks.actions.class",
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
      "notes": "**r-list** — 列表容器\ndataKey: string — 数据绑定键\ndock='toolbar' children — 工具栏节点\ndock='actions' children — 列表项动作节点\nprops.docks.toolbar.position: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'\nprops.docks.toolbar.class: string — 工具栏 CSS 类名\nprops.docks.actions.position: 'left' | 'right' — 默认 'right'\nprops.docks.actions.class: string — 操作区 CSS 类名\ncolumns: number — 列数，默认 1\ngap: number | string — 间距，默认 0\nminItemWidth: string — 最小项宽度\nrowKey: string — 行唯一键，默认 'id'\nemptyText: string — 空数据文案，默认 '暂无数据'\nitemClass: string — 列表项 CSS 类名\nitemStyle: CSSProperties — 列表项行内样式\nuseCard: boolean — 使用卡片包裹，默认 false\ncardShadow: 'always' | 'hover' | 'never' — 默认 'hover'\ngridColumns: number — 默认 24\ngridGap: number | string — 默认 0\ngridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'\nitemColSpan: number — 项跨列数\nitemRowSpan: number — 项跨行数，默认 1\n\n【能力链】\nconsumes: PAGE_DATASET\nprovides: DATA_SOURCE",
      "binding": {
        "selfResolving": true
      }
    },
    "r-tabs": {
      "category": "container",
      "description": "标签页容器，基于 el-tabs 管理多标签切换和激活状态，支持工具栏 dock。",
      "props": [
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
          "name": "props.docks.toolbar.position",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "required": false,
          "description": "默认 'top'"
        },
        {
          "name": "props.docks.toolbar.class",
          "type": "string",
          "required": false,
          "description": "工具栏 CSS 类名"
        },
        {
          "name": "onTabChange",
          "type": "string",
          "required": false,
          "description": "切换回调"
        },
        {
          "name": "onTabClick",
          "type": "string",
          "required": false,
          "description": "点击回调"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string | number]"
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
      },
      "nestingRule": {
        "allowedChildren": [
          "r-tab-pane"
        ],
        "note": "r-tabs 内放 r-tab-pane"
      }
    },
    "r-collapse": {
      "category": "container",
      "description": "折叠面板容器，基于 el-collapse 管理子面板（r-collapse-item）的展开与折叠状态。",
      "props": [
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
          "name": "props.docks.toolbar.position",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "required": false,
          "description": "默认 'top'"
        },
        {
          "name": "props.docks.toolbar.class",
          "type": "string",
          "required": false,
          "description": "工具栏 CSS 类名"
        },
        {
          "name": "onChange",
          "type": "string",
          "required": false,
          "description": "切换回调"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: CollapseValue]"
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
      "category": "container",
      "description": "步骤条容器，基于 el-steps 管理多步骤流程的激活状态，支持工具栏 dock 和步骤内容切换。",
      "props": [
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
          "name": "props.docks.toolbar.position",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "required": false,
          "description": "默认 'top'"
        },
        {
          "name": "props.docks.toolbar.class",
          "type": "string",
          "required": false,
          "description": "工具栏 CSS 类名"
        },
        {
          "name": "onStepChange",
          "type": "string",
          "required": false,
          "description": "步骤切换回调"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string | number]"
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
      "category": "container",
      "description": "对话框容器，基于 el-dialog 弹出模态窗口，支持 r-header/r-footer dock 和网格主体布局。",
      "props": [
        {
          "name": "header",
          "type": "unknown",
          "required": false,
          "description": "结构化头部 dock"
        },
        {
          "name": "footer",
          "type": "unknown",
          "required": false,
          "description": "结构化底部 dock"
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
          "name": "bodyClass",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "内容区 CSS 类名"
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
          "name": "props.docks.header.class",
          "type": "string",
          "required": false,
          "description": "头部 CSS 类名"
        },
        {
          "name": "props.docks.footer.class",
          "type": "string",
          "required": false,
          "description": "底部 CSS 类名"
        },
        {
          "name": "onOpen",
          "type": "string",
          "required": false,
          "description": "打开回调"
        },
        {
          "name": "onClose",
          "type": "string",
          "required": false,
          "description": "关闭回调"
        },
        {
          "name": "onOpened",
          "type": "string",
          "required": false,
          "description": "打开动画结束回调"
        },
        {
          "name": "onClosed",
          "type": "string",
          "required": false,
          "description": "关闭动画结束回调"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: boolean]"
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
          "name": "props.docks.header.class",
          "type": "string",
          "description": "头部 CSS 类名"
        },
        {
          "name": "bodyClass",
          "type": "string",
          "description": "内容区 CSS 类名"
        },
        {
          "name": "props.docks.footer.class",
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
      "notes": "**r-dialog** — 对话框容器\ntitle: string — 标题\nmodelValue: boolean — 控制显隐\ndock='header' children — 头部动作区\ndock='footer' children — 底部动作区\nprops.docks.header.class: string — 头部 CSS 类名\nbodyClass: string — 内容区 CSS 类名\nprops.docks.footer.class: string — 底部 CSS 类名\ngridColumns: number — 默认 24\ngridGap: number | string — 默认 0\ngridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'\nonOpen: string — 打开回调\nonClose: string — 关闭回调\nonOpened: string — 打开动画结束回调\nonClosed: string — 关闭动画结束回调",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "boolean"
      }
    },
    "r-drawer": {
      "category": "container",
      "description": "抽屉容器，基于 el-drawer 侧滑面板，支持 r-header/r-footer dock 和网格主体布局。",
      "props": [
        {
          "name": "header",
          "type": "unknown",
          "required": false,
          "description": "结构化头部 dock"
        },
        {
          "name": "footer",
          "type": "unknown",
          "required": false,
          "description": "结构化底部 dock"
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
          "name": "bodyClass",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "内容区 CSS 类名"
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
          "name": "props.docks.header.class",
          "type": "string",
          "required": false,
          "description": "头部 CSS 类名"
        },
        {
          "name": "props.docks.footer.class",
          "type": "string",
          "required": false,
          "description": "底部 CSS 类名"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: boolean]"
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
          "name": "props.docks.header.class",
          "type": "string",
          "description": "头部 CSS 类名"
        },
        {
          "name": "bodyClass",
          "type": "string",
          "description": "内容区 CSS 类名"
        },
        {
          "name": "props.docks.footer.class",
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
      "notes": "**r-drawer** — 抽屉容器\ntitle: string — 标题\nmodelValue: boolean — 控制显隐\ndock='header' children — 头部动作区\ndock='footer' children — 底部动作区\nprops.docks.header.class: string — 头部 CSS 类名\nbodyClass: string — 内容区 CSS 类名\nprops.docks.footer.class: string — 底部 CSS 类名\ngridColumns: number — 默认 24\ngridGap: number | string — 默认 0\ngridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'\nonOpen / onClose / onOpened / onClosed: string — 生命周期回调",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "boolean"
      }
    },
    "r-section": {
      "category": "container",
      "description": "分区容器（别名 r-block），可选 el-card 包装，支持标题/描述/折叠/头部操作 dock。",
      "props": [
        {
          "name": "header",
          "type": "unknown",
          "required": false,
          "description": "结构化头部 dock"
        },
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
          "type": "\"hover\" | \"always\" | \"never\"",
          "required": false,
          "default": "\"never\"",
          "description": "卡片阴影模式"
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
          "name": "props.docks.header.class",
          "type": "string",
          "required": false,
          "description": "头部 CSS 类名"
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
          "name": "props.docks.header.class",
          "type": "string",
          "description": "头部 CSS 类名"
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
      "notes": "**r-section** — 分区容器\ntitle: string — 标题\ndescription: string — 描述\ncollapsible: boolean — 是否可折叠\ndefaultCollapsed: boolean — 默认折叠\nbordered: boolean — 显示边框，默认 true\nuseCard: boolean — 使用卡片样式，默认 false\ncardShadow: string — 卡片阴影\ndock='header' children — 头部动作区\nprops.docks.header.class: string — 头部 CSS 类名\nexpandText: string — 展开文案，默认 '展开'\ncollapseText: string — 收起文案，默认 '收起'\nshowToggleIcon: boolean — 显示切换图标，默认 true\ngridColumns: number — 默认 24\ngridGap: number — 默认 0\ngridAutoRows: string — 行高"
    },
    "r-block": {
      "category": "container",
      "description": "块容器（轻量分区）",
      "props": [
        {
          "name": "title",
          "type": "string",
          "required": false,
          "description": "标题"
        },
        {
          "name": "description",
          "type": "string",
          "required": false,
          "description": "描述"
        },
        {
          "name": "props.docks.header.class",
          "type": "string",
          "required": false,
          "description": "头部 CSS 类名"
        },
        {
          "name": "bordered",
          "type": "boolean",
          "required": false,
          "description": "边框，默认 true"
        },
        {
          "name": "useCard",
          "type": "boolean",
          "required": false,
          "description": "卡片样式，默认 false"
        },
        {
          "name": "gridColumns",
          "type": "number",
          "required": false,
          "description": "默认 24"
        },
        {
          "name": "gridGap",
          "type": "number",
          "required": false,
          "description": "默认 0"
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "required": false,
          "description": "行高定义"
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
          "name": "props.docks.header.class",
          "type": "string",
          "description": "头部 CSS 类名"
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
      "notes": "**r-block** — 块容器（轻量分区）\ntitle: string — 标题\ndescription: string — 描述\ndock='header' children — 头部动作区\nprops.docks.header.class: string — 头部 CSS 类名\nbordered: boolean — 边框，默认 true\nuseCard: boolean — 卡片样式，默认 false\ngridColumns: number — 默认 24\ngridGap: number — 默认 0\ngridAutoRows: string — 行高定义\n适合做页面中的局部块，不强制数据绑定"
    },
    "r-user-picker": {
      "category": "field",
      "description": "用户选择器字段，基于实体选择器预设工厂（createPickerPreset），弹窗选择用户。",
      "props": [
        {
          "name": "name",
          "type": "string",
          "required": false
        },
        {
          "name": "label",
          "type": "string",
          "required": false
        },
        {
          "name": "width",
          "type": "number",
          "required": false
        },
        {
          "name": "modelValue",
          "type": "EntityPickerValue",
          "required": false
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false
        },
        {
          "name": "field",
          "type": "string",
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
        },
        {
          "name": "deptScope",
          "type": "string",
          "required": false,
          "description": "部门范围"
        },
        {
          "name": "includeDisabled",
          "type": "boolean",
          "required": false,
          "description": "包含禁用用户"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "any[]"
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
      "category": "field",
      "description": "部门选择器字段，基于实体选择器预设工厂（createPickerPreset），弹窗选择部门。",
      "props": [
        {
          "name": "name",
          "type": "string",
          "required": false
        },
        {
          "name": "label",
          "type": "string",
          "required": false
        },
        {
          "name": "width",
          "type": "number",
          "required": false
        },
        {
          "name": "modelValue",
          "type": "EntityPickerValue",
          "required": false
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false
        },
        {
          "name": "field",
          "type": "string",
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
        },
        {
          "name": "checkStrictly",
          "type": "boolean",
          "required": false,
          "description": "父子不关联勾选"
        },
        {
          "name": "showPath",
          "type": "boolean",
          "required": false,
          "description": "展示完整路径"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "any[]"
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
      "category": "field",
      "description": "产品选择器字段，基于实体选择器预设工厂（createPickerPreset），弹窗选择产品。",
      "props": [
        {
          "name": "name",
          "type": "string",
          "required": false
        },
        {
          "name": "label",
          "type": "string",
          "required": false
        },
        {
          "name": "width",
          "type": "number",
          "required": false
        },
        {
          "name": "modelValue",
          "type": "EntityPickerValue",
          "required": false
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false
        },
        {
          "name": "field",
          "type": "string",
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
        },
        {
          "name": "categoryFilter",
          "type": "string[]",
          "required": false,
          "description": "类目过滤"
        },
        {
          "name": "showStock",
          "type": "boolean",
          "required": false,
          "description": "显示库存"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "any[]"
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
    "r-tour": {
      "category": "field",
      "description": "引导流程组件，基于 el-tour 定义多步骤引导目标和说明文字，管理引导打开/关闭状态。",
      "props": [
        {
          "name": "steps",
          "type": "TourStep[]",
          "required": false,
          "description": "步骤配置列表"
        },
        {
          "name": "open",
          "type": "boolean",
          "required": false,
          "description": "是否显示"
        },
        {
          "name": "placement",
          "type": "string",
          "required": false,
          "description": "弹出位置（默认）"
        },
        {
          "name": "showArrow",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "是否显示箭头"
        },
        {
          "name": "mask",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "是否显示遮罩"
        },
        {
          "name": "tourType",
          "type": "\"default\" | \"primary\"",
          "required": false,
          "default": "\"default\"",
          "description": "引导类型"
        },
        {
          "name": "closeOnPressEscape",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "ESC 关闭"
        },
        {
          "name": "scrollIntoViewOptions",
          "type": "boolean | ScrollIntoViewOptions",
          "required": false,
          "description": "滚动选项"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-tour\"",
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
        }
      ],
      "emits": [
        {
          "name": "close",
          "type": "[current: number]"
        },
        {
          "name": "finish",
          "type": "[]"
        },
        {
          "name": "change",
          "type": "[current: number]"
        },
        {
          "name": "update:open",
          "type": "[value: boolean]"
        }
      ]
    },
    "r-tooltip": {
      "category": "field",
      "description": "文字提示组件，基于 el-tooltip 为子组件添加悬浮提示信息，支持位置和延迟配置。",
      "props": [
        {
          "name": "content",
          "type": "string",
          "required": false
        },
        {
          "name": "placement",
          "type": "string",
          "required": false,
          "default": "\"bottom\""
        },
        {
          "name": "effect",
          "type": "\"dark\" | \"light\"",
          "required": false,
          "default": "\"dark\""
        },
        {
          "name": "offset",
          "type": "number",
          "required": false
        },
        {
          "name": "showAfter",
          "type": "number",
          "required": false
        },
        {
          "name": "hideAfter",
          "type": "number",
          "required": false
        },
        {
          "name": "showArrow",
          "type": "boolean",
          "required": false,
          "default": "true"
        },
        {
          "name": "enterable",
          "type": "boolean",
          "required": false,
          "default": "true"
        },
        {
          "name": "popperClass",
          "type": "string",
          "required": false
        },
        {
          "name": "rawContent",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-tooltip\"",
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
        }
      ]
    },
    "r-toolbar": {
      "category": "field",
      "description": "工具栏容器，flex 水平布局分为起始区（默认 children）和尾部区（r-tail dock），组织操作按钮。",
      "props": [
        {
          "name": "tail",
          "type": "unknown",
          "required": false,
          "description": "结构化尾区 dock"
        },
        {
          "name": "gap",
          "type": "string | number",
          "required": false,
          "description": "单个子项之间的间距（同一区域内部）"
        },
        {
          "name": "zoneGap",
          "type": "string | number",
          "required": false,
          "description": "主区与尾区之间的间距（区域级）"
        },
        {
          "name": "align",
          "type": "InlineAlign",
          "required": false,
          "description": "区域内部子项的交叉轴对齐"
        },
        {
          "name": "justify",
          "type": "InlineJustify",
          "required": false,
          "description": "主区内部子项的主轴分布方式"
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
        }
      ]
    },
    "r-tab-pane": {
      "category": "field",
      "description": "标签页面板（r-tabs 内部），基于 el-tab-pane 在标签页体内以 24 列网格渲染子组件。",
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
      "category": "field",
      "description": "步骤项组件（r-steps 内部），双模式渲染：步骤头部（el-step）和步骤内容区（24 列网格）。",
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
          "type": "\"content\" | \"header\"",
          "required": true
        }
      ],
      "emits": [
        {
          "name": "activate",
          "type": "[index: number]"
        }
      ]
    },
    "r-space": {
      "category": "field",
      "description": "间距容器，使用 flex 布局为子组件提供均匀的水平或垂直间距，支持换行和填充。",
      "props": [
        {
          "name": "direction",
          "type": "\"horizontal\" | \"vertical\"",
          "required": false,
          "default": "\"horizontal\""
        },
        {
          "name": "size",
          "type": "string | number",
          "required": false,
          "default": "12"
        },
        {
          "name": "wrap",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "fill",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "alignment",
          "type": "\"center\" | \"stretch\" | \"flex-start\" | \"flex-end\" | \"baseline\"",
          "required": false,
          "default": "\"center\""
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-space\"",
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
        }
      ]
    },
    "r-popover": {
      "category": "field",
      "description": "弹出提示容器，基于 el-popover 为触发元素显示浮层内容，支持多种触发方式和位置。",
      "props": [
        {
          "name": "title",
          "type": "string",
          "required": false
        },
        {
          "name": "content",
          "type": "string",
          "required": false
        },
        {
          "name": "placement",
          "type": "string",
          "required": false,
          "default": "\"bottom\""
        },
        {
          "name": "width",
          "type": "string | number",
          "required": false,
          "default": "150"
        },
        {
          "name": "trigger",
          "type": "\"click\" | \"hover\" | \"focus\" | \"contextmenu\"",
          "required": false,
          "default": "\"click\""
        },
        {
          "name": "effect",
          "type": "\"dark\" | \"light\"",
          "required": false,
          "default": "\"light\""
        },
        {
          "name": "offset",
          "type": "number",
          "required": false
        },
        {
          "name": "showAfter",
          "type": "number",
          "required": false
        },
        {
          "name": "hideAfter",
          "type": "number",
          "required": false
        },
        {
          "name": "showArrow",
          "type": "boolean",
          "required": false,
          "default": "true"
        },
        {
          "name": "popperClass",
          "type": "string",
          "required": false
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-popover\"",
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
        }
      ]
    },
    "r-popconfirm": {
      "category": "field",
      "description": "确认气泡组件，基于 el-popconfirm 在目标元素上弹出确认/取消操作提示。",
      "props": [
        {
          "name": "title",
          "type": "string",
          "required": false
        },
        {
          "name": "confirmButtonText",
          "type": "string",
          "required": false
        },
        {
          "name": "cancelButtonText",
          "type": "string",
          "required": false
        },
        {
          "name": "confirmButtonType",
          "type": "\"\" | \"default\" | \"primary\" | \"success\" | \"warning\" | \"info\" | \"danger\"",
          "required": false,
          "default": "\"primary\""
        },
        {
          "name": "cancelButtonType",
          "type": "\"\" | \"default\" | \"primary\" | \"success\" | \"warning\" | \"info\" | \"danger\"",
          "required": false,
          "default": "\"\""
        },
        {
          "name": "icon",
          "type": "string",
          "required": false
        },
        {
          "name": "iconColor",
          "type": "string",
          "required": false,
          "default": "\"#f90\""
        },
        {
          "name": "hideIcon",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "hideAfter",
          "type": "number",
          "required": false
        },
        {
          "name": "width",
          "type": "string | number",
          "required": false,
          "default": "150"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-popconfirm\"",
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
        }
      ],
      "emits": [
        {
          "name": "confirm",
          "type": "[]"
        },
        {
          "name": "cancel",
          "type": "[]"
        }
      ]
    },
    "r-page-header": {
      "category": "field",
      "description": "页面头部组件，基于 el-page-header 提供标题区、返回按钮和内容区域。",
      "props": [
        {
          "name": "title",
          "type": "string",
          "required": false,
          "default": "\"\\u8FD4\\u56DE\""
        },
        {
          "name": "icon",
          "type": "string",
          "required": false
        },
        {
          "name": "content",
          "type": "string",
          "required": false
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-page-header\"",
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
        }
      ],
      "emits": [
        {
          "name": "back",
          "type": "[]"
        }
      ]
    },
    "r-link": {
      "category": "field",
      "description": "链接组件，基于 el-link 提供带样式的超链接，可渲染子内容。",
      "props": [
        {
          "name": "label",
          "type": "string",
          "required": false
        },
        {
          "name": "linkType",
          "type": "\"\" | \"default\" | \"primary\" | \"success\" | \"warning\" | \"info\" | \"danger\"",
          "required": false,
          "default": "\"default\""
        },
        {
          "name": "underline",
          "type": "boolean",
          "required": false,
          "default": "true"
        },
        {
          "name": "href",
          "type": "string",
          "required": false
        },
        {
          "name": "target",
          "type": "\"_self\" | \"_blank\" | \"_parent\" | \"_top\"",
          "required": false,
          "default": "\"_self\""
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-link\"",
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
        }
      ]
    },
    "r-dropdown": {
      "category": "field",
      "description": "下拉菜单容器，基于 el-dropdown 渲染触发器和菜单项，支持分裂按钮模式和命令事件。",
      "props": [
        {
          "name": "items",
          "type": "DropdownItem[]",
          "required": false
        },
        {
          "name": "trigger",
          "type": "\"click\" | \"hover\" | \"contextmenu\"",
          "required": false,
          "default": "\"hover\""
        },
        {
          "name": "effect",
          "type": "\"dark\" | \"light\"",
          "required": false,
          "default": "\"light\""
        },
        {
          "name": "placement",
          "type": "string",
          "required": false,
          "default": "\"bottom\""
        },
        {
          "name": "hideOnClick",
          "type": "boolean",
          "required": false,
          "default": "true"
        },
        {
          "name": "showTimeout",
          "type": "number",
          "required": false
        },
        {
          "name": "hideTimeout",
          "type": "number",
          "required": false
        },
        {
          "name": "splitButton",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "popperClass",
          "type": "string",
          "required": false
        },
        {
          "name": "maxHeight",
          "type": "string | number",
          "required": false
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-dropdown\"",
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
        }
      ]
    },
    "r-divider": {
      "category": "field",
      "description": "分割线组件，基于 el-divider 在布局中插入水平或垂直分隔，支持文字内容定位。",
      "props": [
        {
          "name": "direction",
          "type": "\"horizontal\" | \"vertical\"",
          "required": false,
          "default": "\"horizontal\""
        },
        {
          "name": "borderStyle",
          "type": "\"solid\" | \"dashed\" | \"dotted\" | \"double\" | \"none\"",
          "required": false,
          "default": "\"solid\""
        },
        {
          "name": "contentPosition",
          "type": "\"center\" | \"left\" | \"right\"",
          "required": false,
          "default": "\"center\""
        },
        {
          "name": "content",
          "type": "string",
          "required": false
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-divider\"",
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
        }
      ]
    },
    "r-collapse-item": {
      "category": "field",
      "description": "折叠面板项，基于 el-collapse-item 提供可折叠区块，面板体内以 24 列网格渲染子组件。",
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
    "r-card": {
      "category": "field",
      "description": "卡片容器，基于 el-card 提供带可选头部的容器，在卡片体内渲染子组件。",
      "props": [
        {
          "name": "header",
          "type": "string",
          "required": false
        },
        {
          "name": "shadow",
          "type": "\"hover\" | \"always\" | \"never\"",
          "required": false,
          "default": "\"always\""
        },
        {
          "name": "bodyStyle",
          "type": "string | Record<string, string>",
          "required": false
        },
        {
          "name": "bodyClass",
          "type": "string",
          "required": false
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-card\"",
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
        }
      ]
    },
    "r-button": {
      "category": "field",
      "description": "按钮组件，基于 el-button 可渲染子内容，支持 type/size/icon 等样式属性和点击事件。",
      "props": [
        {
          "name": "label",
          "type": "string",
          "required": false
        },
        {
          "name": "buttonType",
          "type": "\"\" | \"default\" | \"primary\" | \"success\" | \"warning\" | \"info\" | \"danger\" | \"text\"",
          "required": false,
          "default": "\"default\""
        },
        {
          "name": "buttonSize",
          "type": "\"default\" | \"large\" | \"small\"",
          "required": false,
          "default": "\"default\""
        },
        {
          "name": "plain",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "textMode",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "bg",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "linkMode",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "round",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "circle",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "loading",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "autoInsertSpace",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "color",
          "type": "string",
          "required": false
        },
        {
          "name": "dark",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-button\"",
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
        }
      ]
    },
    "r-anchor-link": {
      "category": "field",
      "description": "锚点链接项，基于 el-anchor-link 定义锚点 href 和显示标题，支持嵌套子链接。",
      "props": [
        {
          "name": "href",
          "type": "string",
          "required": false,
          "description": "锚点链接"
        },
        {
          "name": "title",
          "type": "string",
          "required": false,
          "description": "链接标题"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-anchor-link\"",
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
        }
      ]
    },
    "r-anchor": {
      "category": "field",
      "description": "锚点导航容器，基于 el-anchor 提供页面内锚点定位和跟随滚动高亮。",
      "props": [
        {
          "name": "container",
          "type": "string",
          "required": false,
          "description": "滚动容器选择器"
        },
        {
          "name": "offset",
          "type": "number",
          "required": false,
          "default": "0",
          "description": "偏移量"
        },
        {
          "name": "bound",
          "type": "number",
          "required": false,
          "default": "15",
          "description": "边界值"
        },
        {
          "name": "duration",
          "type": "number",
          "required": false,
          "default": "300",
          "description": "滚动动画时长"
        },
        {
          "name": "marker",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "是否显示标记"
        },
        {
          "name": "direction",
          "type": "\"horizontal\" | \"vertical\"",
          "required": false,
          "default": "\"vertical\"",
          "description": "排列方向"
        },
        {
          "name": "anchorType",
          "type": "\"default\" | \"underline\"",
          "required": false,
          "default": "\"default\"",
          "description": "锚点类型（避免与 SparkNode.type 冲突）"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-anchor\"",
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
        }
      ],
      "emits": [
        {
          "name": "change",
          "type": "[href: string]"
        },
        {
          "name": "click",
          "type": "[e: MouseEvent, href?: string]"
        }
      ]
    },
    "r-upload": {
      "category": "field",
      "description": "文件上传字段，绑定文件路径字符串，基于 el-upload 支持列表/图片/卡片等多种文件展示模式。",
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
          "type": "\"text\" | \"picture\" | \"picture-card\"",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]"
        }
      ],
      "notes": "透传到 el-upload: autoUpload(默认 true), showFileList(默认 true), limit(默认 1), listType('text'|'picture'|'picture-card')",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-tree-select": {
      "category": "field",
      "description": "树形选择字段，绑定单值或数组，基于 el-tree-select 支持树形层级结构选择、多选和懒加载。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: TreeSelectValue]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-transfer": {
      "category": "field",
      "description": "穿梭框字段，绑定数组值，基于 el-transfer 提供双面板列表项转移选择，支持搜索过滤。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: TransferValue]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-time-select": {
      "category": "field",
      "description": "时间间隔选择字段，绑定时间字符串值，基于 el-time-select 提供固定间隔的时间列表选择。",
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
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"\\u9009\\u62E9\\u65F6\\u95F4\"",
          "description": "占位文本"
        },
        {
          "name": "start",
          "type": "string",
          "required": false,
          "default": "\"08:30\"",
          "description": "起始时间"
        },
        {
          "name": "end",
          "type": "string",
          "required": false,
          "default": "\"18:30\"",
          "description": "结束时间"
        },
        {
          "name": "step",
          "type": "string",
          "required": false,
          "default": "\"00:15\"",
          "description": "时间间隔步长"
        },
        {
          "name": "minTime",
          "type": "string",
          "required": false,
          "description": "最小可选时间"
        },
        {
          "name": "maxTime",
          "type": "string",
          "required": false,
          "description": "最大可选时间"
        },
        {
          "name": "clearable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可清空"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-time-select\"",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-time-picker": {
      "category": "field",
      "description": "时间选择字段，绑定时间字符串或 Date 值，基于 el-time-picker 支持时间范围选择。",
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
          "type": "string | Date",
          "required": false,
          "description": "双向绑定值"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"\\u9009\\u62E9\\u65F6\\u95F4\"",
          "description": "占位文本"
        },
        {
          "name": "isRange",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "是否为范围选择"
        },
        {
          "name": "rangeSeparator",
          "type": "string",
          "required": false,
          "default": "\"\\u81F3\"",
          "description": "范围分隔符"
        },
        {
          "name": "startPlaceholder",
          "type": "string",
          "required": false,
          "default": "\"\\u5F00\\u59CB\\u65F6\\u95F4\"",
          "description": "范围开始占位"
        },
        {
          "name": "endPlaceholder",
          "type": "string",
          "required": false,
          "default": "\"\\u7ED3\\u675F\\u65F6\\u95F4\"",
          "description": "范围结束占位"
        },
        {
          "name": "arrowControl",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "箭头控制"
        },
        {
          "name": "format",
          "type": "string",
          "required": false,
          "default": "\"HH:mm:ss\"",
          "description": "时间格式"
        },
        {
          "name": "clearable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可清空"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-time-picker\"",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string | Date]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-textarea": {
      "category": "field",
      "description": "多行文本字段，绑定 string 值，基于 el-input textarea 模式，支持自动高度和字数限制。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-text": {
      "category": "field",
      "description": "文本输入字段，绑定 string 值，基于 el-input 提供单行文本编辑能力。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-switch": {
      "category": "field",
      "description": "开关字段，绑定 boolean 值，基于 el-switch 提供状态切换，支持自定义开/关文本说明。",
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
          "type": "boolean | null",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: boolean | null]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "boolean"
      }
    },
    "r-slider": {
      "category": "field",
      "description": "滑块字段，绑定 number 值，基于 el-slider 支持最小/最大/步长控制及输入框辅助。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: number]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-select": {
      "category": "field",
      "description": "单选下拉字段，绑定 string/number 值，基于 el-select，支持静态选项列表或 optionKey 动态数据源绑定。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string | number]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-segmented": {
      "category": "field",
      "description": "分段选择器字段，绑定 string/number 值，基于 el-segmented 提供紧凑的互斥选项切换。",
      "props": [
        {
          "name": "modelValue",
          "type": "string | number",
          "required": false,
          "description": "当前选中值"
        },
        {
          "name": "options",
          "type": "SegmentedOption[]",
          "required": false,
          "description": "选项列表"
        },
        {
          "name": "size",
          "type": "\"default\" | \"large\" | \"small\"",
          "required": false,
          "default": "\"default\"",
          "description": "尺寸"
        },
        {
          "name": "block",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "是否撑满父容器"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-segmented\"",
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
        }
      ],
      "emits": [
        {
          "name": "change",
          "type": "[value: string | number]"
        },
        {
          "name": "update:modelValue",
          "type": "[value: string | number]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-rate": {
      "category": "field",
      "description": "评分字段，绑定 number 值，基于 el-rate 提供星级评分交互，支持半星模式。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: number]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-radio": {
      "category": "field",
      "description": "单选按钮组字段，绑定 string/number 值，基于 el-radio-group，可切换按钮样式渲染。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string | number]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-number": {
      "category": "field",
      "description": "数字输入字段，绑定 number 值，基于 el-input-number，筛选模式下支持范围（最小-最大）双输入。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: number | [number | undefined, number | undefined]]"
        }
      ],
      "notes": "filterMode: 'range' — 启用范围过滤模式",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-multi-select": {
      "category": "field",
      "description": "多选下拉字段，绑定数组值，基于 el-select multiple 模式，支持标签折叠（collapseTags）显示。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: MultiValue]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-mention": {
      "category": "field",
      "description": "提及输入字段，绑定 string 值，基于 el-mention 支持 @ 前缀触发用户或实体搜索选择。",
      "props": [
        {
          "name": "modelValue",
          "type": "string",
          "required": false,
          "description": "文本内容"
        },
        {
          "name": "options",
          "type": "MentionOption[]",
          "required": false,
          "description": "选项列表"
        },
        {
          "name": "prefix",
          "type": "string | string[]",
          "required": false,
          "default": "\"@\"",
          "description": "触发前缀字符"
        },
        {
          "name": "split",
          "type": "string",
          "required": false,
          "default": "\" \"",
          "description": "分隔符"
        },
        {
          "name": "filterOption",
          "type": "boolean | ((pattern: string, option: MentionOption) => boolean)",
          "required": false,
          "description": "自定义过滤"
        },
        {
          "name": "placement",
          "type": "\"bottom\" | \"top\"",
          "required": false,
          "default": "\"bottom\"",
          "description": "弹出位置"
        },
        {
          "name": "showArrow",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "显示箭头"
        },
        {
          "name": "offset",
          "type": "number",
          "required": false,
          "description": "偏移量"
        },
        {
          "name": "whole",
          "type": "boolean",
          "required": false,
          "description": "匹配整体"
        },
        {
          "name": "checkIsWhole",
          "type": "(pattern: string, prefix: string) => boolean",
          "required": false,
          "description": "校验整体函数"
        },
        {
          "name": "loading",
          "type": "boolean",
          "required": false,
          "description": "加载状态"
        },
        {
          "name": "inputType",
          "type": "\"text\" | \"textarea\"",
          "required": false,
          "default": "\"text\"",
          "description": "输入类型"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "description": "占位提示"
        },
        {
          "name": "rows",
          "type": "number",
          "required": false,
          "default": "3",
          "description": "textarea 行数"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-mention\"",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]"
        },
        {
          "name": "search",
          "type": "[pattern: string, prefix: string]"
        },
        {
          "name": "select",
          "type": "[option: MentionOption, prefix: string]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-image": {
      "category": "field",
      "description": "图片上传字段，绑定图片路径字符串，支持图片上传和缩略图预览显示。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-icon": {
      "category": "field",
      "description": "图标选择字段，绑定图标名称字符串，基于 el-select 在下拉列表中提供可视化图标预览选择。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-html-editor": {
      "category": "field",
      "description": "富文本编辑器字段，绑定 HTML 字符串值，内置加粗/斜体/列表工具栏和 HTML 源码编辑模式。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-file-path": {
      "category": "field",
      "description": "文件上传路径字段，绑定文件路径字符串，支持单/多文件上传并返回服务端路径。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-file-browser": {
      "category": "field",
      "description": "文件浏览器字段，绑定文件路径字符串，弹窗式文件选择，支持 MIME 类型过滤和目录浏览。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]"
        }
      ],
      "notes": "⚠️ 与 r-file-path 基本一致，差异在于内置的浏览器 UI 体验",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-entity-picker": {
      "category": "field",
      "description": "通用实体选择器字段，绑定实体对象或 ID 值，弹窗选择单个或多个实体记录。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: EntityPickerValue]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-date": {
      "category": "field",
      "description": "日期选择字段，绑定日期/字符串值，基于 el-date-picker 支持年/月/日/日期时间/范围等多种模式。",
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
          "name": "dateType",
          "type": "DatePickerType",
          "required": false,
          "description": "日期选择器类型"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"\\u9009\\u62E9\\u65E5\\u671F\"",
          "description": "占位文本"
        },
        {
          "name": "startPlaceholder",
          "type": "string",
          "required": false,
          "default": "\"\\u5F00\\u59CB\\u65E5\\u671F\"",
          "description": "范围开始占位"
        },
        {
          "name": "endPlaceholder",
          "type": "string",
          "required": false,
          "default": "\"\\u7ED3\\u675F\\u65E5\\u671F\"",
          "description": "范围结束占位"
        },
        {
          "name": "rangeSeparator",
          "type": "string",
          "required": false,
          "default": "\"\\u81F3\"",
          "description": "范围分隔符"
        },
        {
          "name": "format",
          "type": "string",
          "required": false,
          "description": "显示格式"
        },
        {
          "name": "valueFormat",
          "type": "string",
          "required": false,
          "description": "值格式"
        },
        {
          "name": "clearable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可清空"
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string | Date | (string | Date)[]]"
        }
      ],
      "notes": "透传到 el-date-picker: type('date'/'datetime'/'daterange'), format, valueFormat 等",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "array"
      }
    },
    "r-color": {
      "category": "field",
      "description": "颜色选择字段，绑定十六进制颜色字符串，基于 el-color-picker，表格/详情模式显示色块预览。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]"
        }
      ],
      "notes": "透传到 el-color-picker: showAlpha, colorFormat('hex'|'rgb'|'hsl'|'hsv'), predefine(string[])",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "r-check-tag": {
      "category": "field",
      "description": "标签选择字段，绑定 boolean 值，基于 el-check-tag 提供可切换的标签选中状态。",
      "props": [
        {
          "name": "checked",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "是否选中"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "标签文本"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-check-tag\"",
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
        }
      ],
      "emits": [
        {
          "name": "change",
          "type": "[checked: boolean]"
        },
        {
          "name": "update:checked",
          "type": "[checked: boolean]"
        }
      ]
    },
    "r-checkbox-group": {
      "category": "field",
      "description": "复选框组字段，绑定数组值，基于 el-checkbox-group 支持多选，可切换按钮样式。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: MultiValue]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-checkbox": {
      "category": "field",
      "description": "单个复选框字段，绑定 boolean 值，基于 el-checkbox，支持自定义选中/未选中显示文本。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: boolean]"
        }
      ],
      "notes": "⚠️ 用 checkedText / uncheckedText 代替 trueLabel / falseLabel",
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "boolean"
      }
    },
    "r-cascader": {
      "category": "field",
      "description": "级联选择字段，绑定路径数组值，基于 el-cascader 支持多级分类选择、多选和搜索过滤。",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: CascaderValue]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string",
        "hasOptions": true
      }
    },
    "r-autocomplete": {
      "category": "field",
      "description": "自动补全输入字段，绑定 string 值，基于 el-autocomplete 提供输入建议和搜索匹配。",
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
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"\\u8BF7\\u8F93\\u5165\"",
          "description": "占位文本"
        },
        {
          "name": "fetchSuggestions",
          "type": "(queryString: string, cb: FetchSuggestionsCallback) => void",
          "required": false,
          "description": "获取建议的回调函数"
        },
        {
          "name": "triggerOnFocus",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "聚焦时是否触发建议"
        },
        {
          "name": "highlightFirstItem",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "高亮第一项"
        },
        {
          "name": "clearable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可清空"
        },
        {
          "name": "valueKey",
          "type": "string",
          "required": false,
          "default": "\"value\"",
          "description": "建议项的取值键"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-autocomplete\"",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]"
        },
        {
          "name": "select",
          "type": "[item: SuggestionItem]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "nav-icon": {
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
          "type": "[value: string]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "error-fallback": {
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
    "ai-chat-widget": {
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
      "category": "feature",
      "description": "SPARK 组件，可在注册表中通过 type=\"ai-assistant-hub\" 使用。",
      "props": []
    },
    "tenant-config": {
      "category": "feature",
      "description": "多租户配置管理页面，展示和编辑租户级别的系统配置项。",
      "props": []
    },
    "settings": {
      "category": "feature",
      "description": "系统设置面板，提供全局参数配置和偏好设置管理界面。",
      "props": []
    },
    "cache-manager": {
      "category": "feature",
      "description": "缓存管理页面，查看缓存统计信息并支持手动清理元数据缓存。",
      "props": []
    },
    "app-list": {
      "category": "feature",
      "description": "应用列表页面，以卡片网格展示已创建的项目/应用及入口。",
      "props": []
    },
    "login-view": {
      "category": "feature",
      "description": "多租户登录页面，提供用户名/密码认证和租户选择入口。",
      "props": []
    },
    "home-page": {
      "category": "feature",
      "description": "平台首页，展示系统介绍、功能亮点和快速开始入口。",
      "props": []
    },
    "about": {
      "category": "feature",
      "description": "关于页面，展示系统版本、技术栈和项目信息。",
      "props": []
    },
    "template-dsl-demo": {
      "category": "feature",
      "description": "Vue 模板 DSL 演示页，展示通过 Vue SFC 模板直接使用 SPARK 组件的用法。",
      "props": []
    },
    "rform-compare-demo": {
      "category": "feature",
      "description": "表单渲染对比演示，对比配置驱动 r-form 与手写模板两种表单实现方式。",
      "props": []
    },
    "dashboard": {
      "category": "feature",
      "description": "管理仪表盘，聚合展示关键业务指标、统计图表和快速操作入口。",
      "props": []
    },
    "custom-rtable-demo": {
      "category": "feature",
      "description": "自定义表格演示，展示 r-table children 桥接机制和自定义列渲染能力。",
      "props": []
    },
    "capability-demo": {
      "category": "feature",
      "description": "能力系统演示页，展示 sparkProvide/sparkConsume 能力链的运行时行为。",
      "props": []
    },
    "dev-system": {
      "category": "feature",
      "description": "集成开发环境，提供页面配置可视化编辑、代码编辑、预览和版本管理。",
      "props": []
    },
    "ai-studio-panel": {
      "category": "feature",
      "description": "AI 工作室面板，提供 AI 对话驱动的页面生成、迭代和预览功能。",
      "props": []
    },
    "spark-component-renderer": {
      "category": "feature",
      "description": "通用组件渲染器，将 SparkNode 配置递归解析并动态渲染为已注册的 Vue 组件，是 SPARK 渲染引擎的核心入口。",
      "props": [
        {
          "name": "parentContext",
          "type": "ICapabilityContext",
          "required": false,
          "description": "显式父上下文（可选）。\r\n\r\n仅用于根节点 / 测试场景：将其挂到当前 renderer 实例，子业务组件沿父实例链自动发现。\r\n普通递归渲染无需传递，子组件继承已有的 SparkContext 结构树。"
        }
      ]
    },
    "unregistered-node-fallback": {
      "category": "feature",
      "description": "未注册组件兜底渲染器，在开发阶段显示未找到对应注册的组件类型名称，辅助排查配置错误。",
      "props": [
        {
          "name": "title",
          "type": "string",
          "required": false,
          "default": "\"\\u672A\\u6CE8\\u518C\\u7684\\u7EC4\\u4EF6\\u7C7B\\u578B\""
        },
        {
          "name": "description",
          "type": "string",
          "required": false,
          "default": "\"\""
        }
      ]
    },
    "spark-json-editor": {
      "category": "feature",
      "description": "JSON 编辑器组件，基于 CodeMirror 集成 JSON Schema 校验和树形视图，用于配置数据编辑。",
      "props": [
        {
          "name": "modelValue",
          "type": "string",
          "required": false,
          "default": "\"\""
        },
        {
          "name": "readOnly",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "height",
          "type": "string | number",
          "required": false,
          "default": "360"
        },
        {
          "name": "mode",
          "type": "SparkJsonEditorMode",
          "required": false,
          "default": "\"text\""
        },
        {
          "name": "indentation",
          "type": "string | number",
          "required": false,
          "default": "2"
        },
        {
          "name": "tabSize",
          "type": "number",
          "required": false,
          "default": "2"
        },
        {
          "name": "mainMenuBar",
          "type": "boolean",
          "required": false,
          "default": "true"
        },
        {
          "name": "navigationBar",
          "type": "boolean",
          "required": false,
          "default": "true"
        },
        {
          "name": "statusBar",
          "type": "boolean",
          "required": false,
          "default": "true"
        },
        {
          "name": "askToFormat",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "schema",
          "type": "SparkJsonSchema | null",
          "required": false,
          "default": "null"
        },
        {
          "name": "schemaDefinitions",
          "type": "SparkJsonSchema | null",
          "required": false,
          "default": "null"
        },
        {
          "name": "enableSchemaValidation",
          "type": "boolean",
          "required": false,
          "default": "true"
        },
        {
          "name": "enableSchemaEnumRenderer",
          "type": "boolean",
          "required": false,
          "default": "true"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "spark-code-editor": {
      "category": "feature",
      "description": "代码编辑器组件，基于 CodeMirror 6 提供语法高亮编辑，加载失败时回退为 textarea。",
      "props": [
        {
          "name": "modelValue",
          "type": "string",
          "required": false,
          "default": "\"\""
        },
        {
          "name": "language",
          "type": "SparkCodeLanguage",
          "required": false,
          "default": "\"javascript\""
        },
        {
          "name": "readOnly",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "height",
          "type": "string | number",
          "required": false,
          "default": "360"
        },
        {
          "name": "tabSize",
          "type": "number",
          "required": false,
          "default": "2"
        },
        {
          "name": "lineWrapping",
          "type": "boolean",
          "required": false,
          "default": "false"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "spark-child": {
      "category": "feature",
      "description": "子节点渲染包装器，渲染单个 SparkNode 子节点，支持 CSS Grid 项包装以兼容 el-table-column 嵌套。",
      "props": [
        {
          "name": "type",
          "type": "string",
          "required": true
        },
        {
          "name": "id",
          "type": "string",
          "required": false
        },
        {
          "name": "nodeId",
          "type": "string",
          "required": false
        },
        {
          "name": "colSpan",
          "type": "string | number",
          "required": false
        },
        {
          "name": "rowSpan",
          "type": "string | number",
          "required": false
        }
      ]
    },
    "json-tree-editor": {
      "category": "feature",
      "description": "JSON 树形编辑器，基于 VXE-Table 以可折叠/展开的树结构编辑 JSON 数据。",
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
          "default": "\"\""
        },
        {
          "name": "documentValue",
          "type": "JsonDocument | null",
          "required": false,
          "default": "null"
        },
        {
          "name": "height",
          "type": "string | number",
          "required": false,
          "default": "420"
        },
        {
          "name": "readOnly",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "schema",
          "type": "Record<string, unknown> | null",
          "required": false,
          "default": "null"
        },
        {
          "name": "filterPlaceholder",
          "type": "string",
          "required": false,
          "default": "\"\\u7B5B\\u9009\\u8DEF\\u5F84 / \\u952E\\u540D / \\u503C\""
        },
        {
          "name": "policy",
          "type": "Partial<JsonTreePolicy>",
          "required": false
        },
        {
          "name": "rootLabel",
          "type": "string",
          "required": false
        },
        {
          "name": "isProtected",
          "type": "(path: JsonPath) => boolean",
          "required": false
        },
        {
          "name": "canEditKey",
          "type": "(path: JsonPath) => boolean",
          "required": false
        },
        {
          "name": "canEditType",
          "type": "(path: JsonPath) => boolean",
          "required": false
        },
        {
          "name": "suggestChildKey",
          "type": "(target: JsonObject, parentPath: JsonPath) => string",
          "required": false
        },
        {
          "name": "createDefaultArrayItem",
          "type": "(parentPath: JsonPath) => JsonValue",
          "required": false
        },
        {
          "name": "createDefaultObjectValue",
          "type": "(parentPath: JsonPath, key: string) => JsonValue",
          "required": false
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"json-tree-editor\"",
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]"
        },
        {
          "name": "update:documentValue",
          "type": "[value: JsonDocument]"
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "tree-node-summary": {
      "category": "feature",
      "description": "树节点摘要展示组件，在 r-tree 场景中渲染节点名称、类型、状态等多字段信息。",
      "props": [
        {
          "name": "nameField",
          "type": "string",
          "required": false,
          "default": "\"name\""
        },
        {
          "name": "typeField",
          "type": "string",
          "required": false,
          "default": "\"type\""
        },
        {
          "name": "statusField",
          "type": "string",
          "required": false,
          "default": "\"status\""
        },
        {
          "name": "ownerField",
          "type": "string",
          "required": false,
          "default": "\"owner\""
        },
        {
          "name": "metaField",
          "type": "string",
          "required": false,
          "default": "\"route\""
        },
        {
          "name": "extraField",
          "type": "string",
          "required": false,
          "default": "\"childPlacement\""
        },
        {
          "name": "showType",
          "type": "boolean",
          "required": false,
          "default": "true"
        },
        {
          "name": "showStatus",
          "type": "boolean",
          "required": false,
          "default": "true"
        },
        {
          "name": "showOwner",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "showMeta",
          "type": "boolean",
          "required": false,
          "default": "true"
        },
        {
          "name": "showExtra",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-tree-node-summary\"",
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
        }
      ]
    },
    "r-context-renderer": {
      "category": "field",
      "description": "语境感知字段渲染代理，根据父容器类型（table/form/detail/tree）自动切换渲染模板，统一处理权限控制和校验规则。",
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
          "name": "sortable",
          "type": "boolean | \"custom\" | undefined",
          "required": false,
          "description": "Element Plus 表格列排序能力"
        },
        {
          "name": "filterable",
          "type": "boolean | undefined",
          "required": false,
          "description": "表格字段是否可参与过滤区生成；由上层容器消费，此处仅声明避免 fallthrough warning"
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
          "name": "shouldRenderCurrentField",
          "type": "boolean | undefined",
          "required": false,
          "description": "当前宿主下字段是否应渲染"
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
        }
      ]
    },
    "display-timeline-item": {
      "category": "feature",
      "description": "时间线项，基于 el-timeline-item 定义时间戳、内容和状态标记点。",
      "props": [
        {
          "name": "timestamp",
          "type": "string",
          "required": false
        },
        {
          "name": "hideTimestamp",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "center",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "placement",
          "type": "\"bottom\" | \"top\"",
          "required": false,
          "default": "\"bottom\""
        },
        {
          "name": "itemType",
          "type": "\"primary\" | \"success\" | \"warning\" | \"info\" | \"danger\"",
          "required": false,
          "default": "\"primary\""
        },
        {
          "name": "color",
          "type": "string",
          "required": false
        },
        {
          "name": "itemSize",
          "type": "\"large\" | \"normal\"",
          "required": false,
          "default": "\"normal\""
        },
        {
          "name": "hollow",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "content",
          "type": "string",
          "required": false
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-timeline-item\"",
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
        }
      ]
    },
    "display-timeline": {
      "category": "feature",
      "description": "时间线容器，基于 el-timeline 以垂直时间轴渲染事件序列。",
      "props": [
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-timeline\"",
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
        }
      ]
    },
    "display-skeleton": {
      "category": "feature",
      "description": "骨架屏加载占位组件，基于 el-skeleton 显示内容加载中的占位动画效果。",
      "props": [
        {
          "name": "rows",
          "type": "number",
          "required": false,
          "default": "3"
        },
        {
          "name": "count",
          "type": "number",
          "required": false,
          "default": "1"
        },
        {
          "name": "loading",
          "type": "boolean",
          "required": false,
          "default": "true"
        },
        {
          "name": "animated",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "throttle",
          "type": "number",
          "required": false,
          "default": "0"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-skeleton\"",
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
        }
      ]
    },
    "display-result": {
      "category": "feature",
      "description": "结果页组件，基于 el-result 显示操作结果状态（成功/警告/信息/错误），含标题、副标题和按钮区。",
      "props": [
        {
          "name": "icon",
          "type": "\"success\" | \"warning\" | \"info\" | \"error\"",
          "required": false,
          "default": "\"info\""
        },
        {
          "name": "title",
          "type": "string",
          "required": false
        },
        {
          "name": "subTitle",
          "type": "string",
          "required": false
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-result\"",
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
        }
      ]
    },
    "display-icon": {
      "category": "feature",
      "description": "图标展示组件，解析图标名称渲染为 Element Plus 图标组件，支持尺寸和颜色配置。",
      "props": [
        {
          "name": "icon",
          "type": "string",
          "required": false,
          "description": "图标名称（Element Plus 图标名，如 'Edit', 'Delete', 'Search'）"
        },
        {
          "name": "iconSize",
          "type": "string | number",
          "required": false,
          "description": "图标大小"
        },
        {
          "name": "color",
          "type": "string",
          "required": false,
          "description": "图标颜色"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"display-icon\"",
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
        }
      ]
    },
    "display-empty": {
      "category": "feature",
      "description": "空状态占位组件，基于 el-empty 显示自定义空状态图片和描述文字。",
      "props": [
        {
          "name": "image",
          "type": "string",
          "required": false
        },
        {
          "name": "imageSize",
          "type": "number",
          "required": false
        },
        {
          "name": "description",
          "type": "string",
          "required": false
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-empty\"",
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
        }
      ]
    },
    "display-descriptions-item": {
      "category": "feature",
      "description": "描述列表项，基于 el-descriptions-item 定义标签和内容值，支持字段绑定。",
      "props": [
        {
          "name": "label",
          "type": "string",
          "required": false
        },
        {
          "name": "span",
          "type": "number",
          "required": false,
          "default": "1"
        },
        {
          "name": "labelAlign",
          "type": "\"center\" | \"left\" | \"right\"",
          "required": false
        },
        {
          "name": "contentAlign",
          "type": "\"center\" | \"left\" | \"right\"",
          "required": false
        },
        {
          "name": "labelClassName",
          "type": "string",
          "required": false
        },
        {
          "name": "className",
          "type": "string",
          "required": false
        },
        {
          "name": "content",
          "type": "string",
          "required": false
        },
        {
          "name": "value",
          "type": "unknown",
          "required": false
        },
        {
          "name": "field",
          "type": "string",
          "required": false
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-descriptions-item\"",
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
        }
      ]
    },
    "display-descriptions": {
      "category": "feature",
      "description": "描述列表容器，基于 el-descriptions 以键值对布局展示结构化信息。",
      "props": [
        {
          "name": "title",
          "type": "string",
          "required": false
        },
        {
          "name": "extra",
          "type": "string",
          "required": false
        },
        {
          "name": "border",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "column",
          "type": "number",
          "required": false,
          "default": "3"
        },
        {
          "name": "direction",
          "type": "\"horizontal\" | \"vertical\"",
          "required": false,
          "default": "\"horizontal\""
        },
        {
          "name": "descriptionsSize",
          "type": "\"default\" | \"large\" | \"small\"",
          "required": false,
          "default": "\"default\""
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-descriptions\"",
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
        }
      ]
    },
    "display-countdown": {
      "category": "feature",
      "description": "倒计时组件，基于 el-countdown 显示目标时间倒计时，支持自定义格式和结束事件。",
      "props": [
        {
          "name": "value",
          "type": "number | Date",
          "required": false,
          "description": "目标时间（时间戳或 Date）"
        },
        {
          "name": "format",
          "type": "string",
          "required": false,
          "default": "\"HH:mm:ss\"",
          "description": "格式化字符串，如 HH:mm:ss"
        },
        {
          "name": "prefix",
          "type": "string",
          "required": false,
          "description": "前缀文本"
        },
        {
          "name": "suffix",
          "type": "string",
          "required": false,
          "description": "后缀文本"
        },
        {
          "name": "title",
          "type": "string",
          "required": false,
          "description": "标题"
        },
        {
          "name": "valueStyle",
          "type": "CSSProperties",
          "required": false,
          "description": "值样式"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"display-countdown\"",
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
        }
      ],
      "emits": [
        {
          "name": "finish",
          "type": "[]"
        },
        {
          "name": "change",
          "type": "[value: number]"
        }
      ]
    },
    "display-calendar": {
      "category": "feature",
      "description": "日历展示组件，基于 el-calendar 显示月历视图，支持日期范围和选中绑定。",
      "props": [
        {
          "name": "modelValue",
          "type": "Date",
          "required": false,
          "description": "当前日期"
        },
        {
          "name": "range",
          "type": "[Date, Date]",
          "required": false,
          "description": "日期范围 [start, end]"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"display-calendar\"",
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
        }
      ],
      "binding": {
        "bindingDelegate": "form-element",
        "valueType": "string"
      }
    },
    "display-breadcrumb-item": {
      "category": "feature",
      "description": "面包屑导航项，基于 el-breadcrumb-item 定义单个导航节点，支持链接跳转。",
      "props": [
        {
          "name": "label",
          "type": "string",
          "required": false
        },
        {
          "name": "to",
          "type": "string | Record<string, unknown>",
          "required": false
        },
        {
          "name": "replace",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-breadcrumb-item\"",
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
        }
      ]
    },
    "display-breadcrumb": {
      "category": "feature",
      "description": "面包屑导航容器，基于 el-breadcrumb 渲染多级导航路径，支持自定义分隔符。",
      "props": [
        {
          "name": "separator",
          "type": "string",
          "required": false,
          "default": "\"/\""
        },
        {
          "name": "separatorIcon",
          "type": "string",
          "required": false
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-breadcrumb\"",
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
        }
      ]
    },
    "display-alert": {
      "category": "feature",
      "description": "警告提示组件，基于 el-alert 显示带图标的提示信息，支持 success/warning/info/error 四种类型。",
      "props": [
        {
          "name": "title",
          "type": "string",
          "required": false
        },
        {
          "name": "description",
          "type": "string",
          "required": false
        },
        {
          "name": "alertType",
          "type": "\"success\" | \"warning\" | \"info\" | \"error\"",
          "required": false,
          "default": "\"info\""
        },
        {
          "name": "closable",
          "type": "boolean",
          "required": false,
          "default": "true"
        },
        {
          "name": "closeText",
          "type": "string",
          "required": false
        },
        {
          "name": "center",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "showIcon",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "effect",
          "type": "\"dark\" | \"light\"",
          "required": false,
          "default": "\"light\""
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-alert\"",
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
        }
      ],
      "emits": [
        {
          "name": "close",
          "type": "[]"
        }
      ]
    },
    "display-text": {
      "category": "feature",
      "description": "文本展示组件，以 div/span/p 等 HTML 元素渲染文本值，支持前后缀和数字/货币/百分比/日期格式化。",
      "props": [
        {
          "name": "value",
          "type": "unknown",
          "required": false
        },
        {
          "name": "field",
          "type": "string",
          "required": false
        },
        {
          "name": "tag",
          "type": "string",
          "required": false,
          "default": "\"span\""
        },
        {
          "name": "prefix",
          "type": "string",
          "required": false
        },
        {
          "name": "suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "format",
          "type": "\"number\" | \"date\" | \"currency\" | \"percent\"",
          "required": false
        },
        {
          "name": "precision",
          "type": "number",
          "required": false,
          "default": "2"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"-\""
        },
        {
          "name": "textClass",
          "type": "string",
          "required": false
        },
        {
          "name": "textStyle",
          "type": "string | Record<string, string>",
          "required": false
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-text-display\"",
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
        }
      ]
    },
    "display-tag": {
      "category": "feature",
      "description": "标签展示组件，基于 el-tag 以彩色标签显示字段值，支持类型/尺寸/主题样式和可关闭功能。",
      "props": [
        {
          "name": "content",
          "type": "string",
          "required": false
        },
        {
          "name": "value",
          "type": "string",
          "required": false
        },
        {
          "name": "field",
          "type": "string",
          "required": false
        },
        {
          "name": "tagType",
          "type": "\"\" | \"success\" | \"warning\" | \"info\" | \"danger\"",
          "required": false,
          "default": "\"\""
        },
        {
          "name": "closable",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "disableTransitions",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "hit",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "round",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "color",
          "type": "string",
          "required": false
        },
        {
          "name": "size",
          "type": "\"default\" | \"large\" | \"small\"",
          "required": false,
          "default": "\"default\""
        },
        {
          "name": "effect",
          "type": "\"dark\" | \"light\" | \"plain\"",
          "required": false,
          "default": "\"light\""
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-tag\"",
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
        }
      ],
      "emits": [
        {
          "name": "close",
          "type": "[]"
        }
      ]
    },
    "display-statistic": {
      "category": "feature",
      "description": "统计数值展示组件，基于 el-statistic 格式化显示数字/字符串值，支持精度、前后缀和千分位分隔。",
      "props": [
        {
          "name": "title",
          "type": "string",
          "required": false
        },
        {
          "name": "value",
          "type": "string | number",
          "required": false
        },
        {
          "name": "dataKey",
          "type": "string",
          "required": false
        },
        {
          "name": "field",
          "type": "string",
          "required": false
        },
        {
          "name": "precision",
          "type": "number",
          "required": false,
          "default": "0"
        },
        {
          "name": "decimalSeparator",
          "type": "string",
          "required": false,
          "default": "\".\""
        },
        {
          "name": "groupSeparator",
          "type": "string",
          "required": false,
          "default": "\",\""
        },
        {
          "name": "prefix",
          "type": "string",
          "required": false
        },
        {
          "name": "suffix",
          "type": "string",
          "required": false
        },
        {
          "name": "valueStyle",
          "type": "string | Record<string, string>",
          "required": false
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-statistic\"",
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
        }
      ],
      "binding": {
        "selfResolving": true
      }
    },
    "display-progress": {
      "category": "feature",
      "description": "进度条展示组件，基于 el-progress 以条形或圆形显示百分比进度值，支持动态颜色。",
      "props": [
        {
          "name": "percentage",
          "type": "number",
          "required": false
        },
        {
          "name": "value",
          "type": "number",
          "required": false
        },
        {
          "name": "field",
          "type": "string",
          "required": false
        },
        {
          "name": "progressType",
          "type": "\"circle\" | \"line\" | \"dashboard\"",
          "required": false,
          "default": "\"line\""
        },
        {
          "name": "strokeWidth",
          "type": "number",
          "required": false,
          "default": "6"
        },
        {
          "name": "textInside",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "status",
          "type": "\"success\" | \"warning\" | \"exception\"",
          "required": false
        },
        {
          "name": "indeterminate",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "duration",
          "type": "number",
          "required": false,
          "default": "3"
        },
        {
          "name": "color",
          "type": "ProgressColor",
          "required": false
        },
        {
          "name": "circleWidth",
          "type": "number",
          "required": false
        },
        {
          "name": "showText",
          "type": "boolean",
          "required": false,
          "default": "true"
        },
        {
          "name": "strokeLinecap",
          "type": "\"round\" | \"butt\" | \"square\"",
          "required": false,
          "default": "\"round\""
        },
        {
          "name": "formatText",
          "type": "string",
          "required": false
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-progress\"",
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
        }
      ]
    },
    "display-pagination": {
      "category": "feature",
      "description": "分页控制组件，基于 el-pagination 从 DataView 同步分页状态，触发页码/页大小变更事件。",
      "props": [
        {
          "name": "total",
          "type": "number",
          "required": false
        },
        {
          "name": "pageSize",
          "type": "number",
          "required": false,
          "default": "10"
        },
        {
          "name": "currentPage",
          "type": "number",
          "required": false,
          "default": "1"
        },
        {
          "name": "pageSizes",
          "type": "number[]",
          "required": false,
          "default": "[10, 20, 50, 100]"
        },
        {
          "name": "pagerCount",
          "type": "number",
          "required": false,
          "default": "7"
        },
        {
          "name": "layout",
          "type": "string",
          "required": false,
          "default": "\"total, sizes, prev, pager, next, jumper\""
        },
        {
          "name": "background",
          "type": "boolean",
          "required": false,
          "default": "true"
        },
        {
          "name": "small",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "hideOnSinglePage",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-pagination\"",
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
        }
      ],
      "emits": [
        {
          "name": "update:currentPage",
          "type": "[page: number]"
        },
        {
          "name": "update:pageSize",
          "type": "[size: number]"
        }
      ]
    },
    "display-image": {
      "category": "feature",
      "description": "图片展示组件，基于 el-image 显示图片，支持懒加载、预览画廊和加载占位。",
      "props": [
        {
          "name": "src",
          "type": "string",
          "required": false,
          "description": "图片 URL（静态传入）"
        },
        {
          "name": "field",
          "type": "string",
          "required": false,
          "description": "字段名（从当前行读取 URL）"
        },
        {
          "name": "value",
          "type": "string",
          "required": false,
          "description": "静态值"
        },
        {
          "name": "fit",
          "type": "\"fill\" | \"none\" | \"cover\" | \"contain\" | \"scale-down\"",
          "required": false,
          "default": "\"cover\"",
          "description": "图片适应模式"
        },
        {
          "name": "alt",
          "type": "string",
          "required": false,
          "description": "替代文本"
        },
        {
          "name": "lazy",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "是否懒加载"
        },
        {
          "name": "previewSrcList",
          "type": "string[]",
          "required": false,
          "description": "预览图列表（静态传入）"
        },
        {
          "name": "previewField",
          "type": "string",
          "required": false,
          "description": "预览图字段名（从当前行读取数组）"
        },
        {
          "name": "initialIndex",
          "type": "number",
          "required": false,
          "default": "0",
          "description": "初始预览索引"
        },
        {
          "name": "zIndex",
          "type": "number",
          "required": false,
          "description": "预览层级"
        },
        {
          "name": "hideOnClickModal",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "点击蒙层关闭预览"
        },
        {
          "name": "previewTeleported",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "预览传送至 body"
        },
        {
          "name": "closeOnPressEscape",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "ESC 关闭预览"
        },
        {
          "name": "width",
          "type": "string | number",
          "required": false,
          "description": "图片宽度"
        },
        {
          "name": "height",
          "type": "string | number",
          "required": false,
          "description": "图片高度"
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"display-image\"",
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
        }
      ]
    },
    "display-badge": {
      "category": "feature",
      "description": "徽章展示组件，基于 el-badge 在子内容上叠加数字或状态点标记。",
      "props": [
        {
          "name": "badgeValue",
          "type": "string | number",
          "required": false
        },
        {
          "name": "value",
          "type": "string | number",
          "required": false
        },
        {
          "name": "field",
          "type": "string",
          "required": false
        },
        {
          "name": "max",
          "type": "number",
          "required": false,
          "default": "99"
        },
        {
          "name": "isDot",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "hiddenBadge",
          "type": "boolean",
          "required": false,
          "default": "false"
        },
        {
          "name": "badgeType",
          "type": "\"\" | \"primary\" | \"success\" | \"warning\" | \"info\" | \"danger\"",
          "required": false,
          "default": "\"danger\""
        },
        {
          "name": "showZero",
          "type": "boolean",
          "required": false,
          "default": "true"
        },
        {
          "name": "color",
          "type": "string",
          "required": false
        },
        {
          "name": "offset",
          "type": "[number, number]",
          "required": false
        },
        {
          "name": "badgeStyle",
          "type": "Record<string, string>",
          "required": false
        },
        {
          "name": "badgeClass",
          "type": "string",
          "required": false
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-badge\"",
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
        }
      ]
    },
    "display-avatar": {
      "category": "feature",
      "description": "头像展示组件，基于 el-avatar 显示用户头像或文字缩写，支持图片/图标/文字多种模式和尺寸配置。",
      "props": [
        {
          "name": "avatarSize",
          "type": "number | \"default\" | \"large\" | \"small\"",
          "required": false,
          "default": "\"default\""
        },
        {
          "name": "shape",
          "type": "\"circle\" | \"square\"",
          "required": false,
          "default": "\"circle\""
        },
        {
          "name": "src",
          "type": "string",
          "required": false
        },
        {
          "name": "value",
          "type": "string",
          "required": false
        },
        {
          "name": "field",
          "type": "string",
          "required": false
        },
        {
          "name": "srcSet",
          "type": "string",
          "required": false
        },
        {
          "name": "alt",
          "type": "string",
          "required": false
        },
        {
          "name": "fit",
          "type": "\"fill\" | \"none\" | \"cover\" | \"contain\" | \"scale-down\"",
          "required": false,
          "default": "\"cover\""
        },
        {
          "name": "text",
          "type": "string",
          "required": false
        },
        {
          "name": "icon",
          "type": "string",
          "required": false
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-avatar\"",
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
        }
      ]
    },
    "builtin-action-button": {
      "category": "feature",
      "description": "内置操作按钮，基于 el-button 根据 action 类型（create/edit/delete/refresh 等）自动映射标签、图标和样式。",
      "props": [
        {
          "name": "builtinAction",
          "type": "string",
          "required": false
        },
        {
          "name": "label",
          "type": "string",
          "required": false
        },
        {
          "name": "buttonType",
          "type": "string",
          "required": false
        },
        {
          "name": "buttonSize",
          "type": "string",
          "required": false
        },
        {
          "name": "buttonPlain",
          "type": "boolean",
          "required": false
        },
        {
          "name": "buttonText",
          "type": "boolean",
          "required": false
        },
        {
          "name": "buttonLink",
          "type": "boolean",
          "required": false
        },
        {
          "name": "buttonClass",
          "type": "string",
          "required": false
        },
        {
          "name": "buttonDisabled",
          "type": "boolean",
          "required": false
        },
        {
          "name": "disabled",
          "type": "boolean",
          "required": false
        },
        {
          "name": "disabledWhenRow",
          "type": "Record<string, unknown>",
          "required": false
        },
        {
          "name": "row",
          "type": "IDataRow",
          "required": false
        },
        {
          "name": "rowIndex",
          "type": "number",
          "required": false
        },
        {
          "name": "data",
          "type": "unknown",
          "required": false
        },
        {
          "name": "dataSource",
          "type": "unknown",
          "required": false
        },
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"builtin-action\"",
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
        }
      ],
      "emits": [
        {
          "name": "click",
          "type": "[event: MouseEvent]"
        }
      ]
    },
    "dock-tail": {
      "category": "feature",
      "description": "尾部 dock，在 r-toolbar 中作为工具栏末尾区域提取渲染。",
      "props": [
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-tail\""
        },
        {
          "name": "id",
          "type": "string",
          "required": false
        },
        {
          "name": "width",
          "type": "string | number",
          "required": false,
          "description": "尾区宽度"
        }
      ]
    },
    "dock-header": {
      "category": "feature",
      "description": "头部 dock，在 r-dialog/r-drawer/r-section 中作为顶部操作区域提取渲染。",
      "props": [
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-header\""
        },
        {
          "name": "id",
          "type": "string",
          "required": false
        },
        {
          "name": "width",
          "type": "string | number",
          "required": false,
          "description": "区域宽度"
        }
      ]
    },
    "dock-footer": {
      "category": "feature",
      "description": "底部 dock，在 r-dialog/r-drawer 中作为底部操作区域提取渲染。",
      "props": [
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-footer\""
        },
        {
          "name": "id",
          "type": "string",
          "required": false
        },
        {
          "name": "width",
          "type": "string | number",
          "required": false,
          "description": "区域宽度"
        }
      ]
    },
    "dock-filter": {
      "category": "feature",
      "description": "筛选区 dock，在 r-table 中作为筛选表单区域提取渲染，支持折叠和网格布局。",
      "props": [
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-filter\""
        },
        {
          "name": "id",
          "type": "string",
          "required": false
        },
        {
          "name": "columns",
          "type": "(string | DockFilterItem)[]",
          "required": false,
          "description": "筛选列"
        },
        {
          "name": "collapsible",
          "type": "boolean",
          "required": false,
          "description": "是否可折叠"
        },
        {
          "name": "defaultCollapsed",
          "type": "boolean",
          "required": false,
          "description": "默认折叠"
        },
        {
          "name": "autoFitMinWidth",
          "type": "string",
          "required": false,
          "description": "自适应最小宽度"
        },
        {
          "name": "itemSpan",
          "type": "number",
          "required": false,
          "description": "单项跨列数"
        },
        {
          "name": "gridColumns",
          "type": "number",
          "required": false,
          "description": "网格列数"
        },
        {
          "name": "gridGap",
          "type": "string | number",
          "required": false,
          "description": "网格间距"
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "required": false,
          "description": "网格行高"
        }
      ]
    },
    "dock-editor": {
      "category": "feature",
      "description": "编辑面板 dock，在 r-tree 中作为侧边编辑面板提取渲染，用于节点详情编辑。",
      "props": [
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-editor\""
        },
        {
          "name": "id",
          "type": "string",
          "required": false
        },
        {
          "name": "position",
          "type": "\"bottom\" | \"left\" | \"right\" | \"top\"",
          "required": false,
          "description": "编辑区位置"
        },
        {
          "name": "width",
          "type": "string | number",
          "required": false,
          "description": "编辑区宽度"
        }
      ]
    },
    "dock-actions": {
      "category": "feature",
      "description": "操作列/区域 dock，在 r-table 中作为操作列提取渲染，独立使用时以 flex 布局渲染操作按钮。",
      "props": [
        {
          "name": "type",
          "type": "string",
          "required": false,
          "default": "\"r-actions\""
        },
        {
          "name": "id",
          "type": "string",
          "required": false
        },
        {
          "name": "position",
          "type": "\"left\" | \"right\"",
          "required": false,
          "description": "操作列位置"
        },
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "列标题"
        },
        {
          "name": "width",
          "type": "string | number",
          "required": false,
          "description": "列宽"
        },
        {
          "name": "align",
          "type": "\"center\" | \"left\" | \"right\"",
          "required": false,
          "description": "对齐方式"
        },
        {
          "name": "fixed",
          "type": "boolean | \"left\" | \"right\"",
          "required": false,
          "description": "固定列"
        }
      ]
    },
    "r-column-group": {
      "category": "group",
      "description": "",
      "props": [],
      "notes": "【使用场景】复杂表格需要多级表头分组，例如「基本信息」下包含「姓名」「年龄」「邮箱」\n\n【示例】\n{ \"type\": \"r-column-group\", \"props\": { \"label\": \"基本信息\" }, \"children\": [\n  { \"type\": \"r-text\", \"field\": \"name\", \"props\": { \"label\": \"姓名\" } },\n  { \"type\": \"r-number\", \"field\": \"age\", \"props\": { \"label\": \"年龄\" } }\n]}\nchildren 内放 r-* 字段组件作为实际数据列"
    }
  }
} as const
