/**
 * DevSystem 组件目录（自动生成）
 *
 * ⚠️ 请勿手动编辑 — 由 vite-plugin-spark-catalog 构建时生成
 * 重新生成：pnpm run dev 或 pnpm run build
 * 生成时间：2026-04-07T15:32:46.875Z
 * 条目数量：122
 */

/** 全部已注册组件类型（排序后，用于 type 字段下拉） */
export const COMPONENT_TYPES: string[] = [
  "about",
  "ai-assistant-hub",
  "ai-chat-panel",
  "ai-chat-widget",
  "ai-studio-panel",
  "app-list",
  "builtin-action",
  "builtin-action-button",
  "cache-manager",
  "capability-demo",
  "context-aware-fields-api",
  "custom-rtable-demo",
  "dashboard",
  "dev-system",
  "display-alert",
  "display-avatar",
  "display-badge",
  "display-breadcrumb",
  "display-breadcrumb-item",
  "display-calendar",
  "display-countdown",
  "display-descriptions",
  "display-descriptions-item",
  "display-empty",
  "display-icon",
  "display-image",
  "display-pagination",
  "display-progress",
  "display-result",
  "display-skeleton",
  "display-statistic",
  "display-tag",
  "display-text",
  "display-timeline",
  "display-timeline-item",
  "dock-actions",
  "dock-editor",
  "dock-filter",
  "dock-footer",
  "dock-header",
  "dock-tail",
  "error-fallback",
  "home-page",
  "icon-picker",
  "json-tree-editor",
  "login-view",
  "module-context-badge",
  "nav-icon",
  "r-anchor",
  "r-anchor-link",
  "r-autocomplete",
  "r-block",
  "r-button",
  "r-card",
  "r-cascader",
  "r-check-tag",
  "r-checkbox",
  "r-checkbox-group",
  "r-collapse",
  "r-collapse-item",
  "r-color",
  "r-column-group",
  "r-context-renderer",
  "r-date",
  "r-dept-picker",
  "r-detail",
  "r-dialog",
  "r-divider",
  "r-drawer",
  "r-dropdown",
  "r-entity-picker",
  "r-file-browser",
  "r-file-path",
  "r-form",
  "r-html-editor",
  "r-icon",
  "r-image",
  "r-link",
  "r-list",
  "r-mention",
  "r-multi-select",
  "r-number",
  "r-page-header",
  "r-popconfirm",
  "r-popover",
  "r-product-picker",
  "r-radio",
  "r-rate",
  "r-section",
  "r-segmented",
  "r-select",
  "r-slider",
  "r-space",
  "r-step-item",
  "r-steps",
  "r-switch",
  "r-tab-pane",
  "r-table",
  "r-tabs",
  "r-text",
  "r-textarea",
  "r-time-picker",
  "r-time-select",
  "r-toolbar",
  "r-tooltip",
  "r-tour",
  "r-transfer",
  "r-tree",
  "r-tree-select",
  "r-upload",
  "r-user-picker",
  "rform-compare-demo",
  "settings",
  "spark-child",
  "spark-code-editor",
  "spark-component-renderer",
  "spark-json-editor",
  "template-dsl-demo",
  "tenant-config",
  "tree-node-summary",
  "unregistered-node-fallback"
]

/** 各组件的元信息（分类、描述、事件、根级字段、注释、数据绑定配置） */
export const COMPONENT_DESCRIPTIONS: Record<string, {
  category: string
  description: string
  emits?: Array<{ name: string; description?: string; type?: string }>
  rootFields?: Array<{ name: string; type: string; description: string }>
  notes?: string
  binding?: Record<string, unknown>
}> = {
  "context-aware-fields-api": {
    "category": "meta",
    "description": "语境感知字段渲染能力总览",
    "notes": "**context-aware-fields-api** — 语境感知字段渲染能力总览\n\n【核心能力】\n- 子组件渲染由父容器语境决定：r-table(table) / r-form(form) / r-detail(detail) / r-list(list) / r-tree(tree)\n- 同一 r-* 字段组件可跨语境复用，不复制多套组件\n- 字段组件必须处于容器 children 中，禁止顶层裸放（会丢失语境）\n\n【关键约束】\n- r-table children 仅放 r-* 字段组件，禁止 el-table-column\n- 事件逻辑优先用根级 on + script.js 函数，不在组件层硬编码父级判断\n- 字段绑定用根级 field\n\n【建议组合查询】\n- r-table, r-form, r-detail, r-text, r-number, r-select, builtin-action"
  },
  "builtin-action": {
    "category": "meta",
    "description": "声明式动作节点（零代码优先）",
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
    }
  },
  "r-form": {
    "category": "container",
    "description": "数据表单容器，基于 el-form 绑定 DataView.currentRow 实现字段双向编辑，通过 CONTEXT_DATA 能力向子组件暴露表单数据。",
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
    "category": "container",
    "description": "数据详情容器，基于 el-form 以只读模式展示 DataView.currentRow 字段值，与 r-form 结构一致但不可编辑。",
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
    "category": "container",
    "description": "树形容器，基于 el-tree 绑定 DataView 渲染嵌套树结构，支持懒加载、节点操作和编辑器（r-editor dock）侧面板。",
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
    }
  },
  "r-collapse": {
    "category": "container",
    "description": "折叠面板容器，基于 el-collapse 管理子面板（r-collapse-item）的展开与折叠状态。",
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
    "description": "文字提示组件，基于 el-tooltip 为子组件添加悬浮提示信息，支持位置和延迟配置。"
  },
  "r-toolbar": {
    "category": "field",
    "description": "工具栏容器，flex 水平布局分为起始区（默认 children）和尾部区（r-tail dock），组织操作按钮。"
  },
  "r-tab-pane": {
    "category": "field",
    "description": "标签页面板（r-tabs 内部），基于 el-tab-pane 在标签页体内以 24 列网格渲染子组件。"
  },
  "r-step-item": {
    "category": "field",
    "description": "步骤项组件（r-steps 内部），双模式渲染：步骤头部（el-step）和步骤内容区（24 列网格）。",
    "emits": [
      {
        "name": "activate",
        "type": "[index: number]"
      }
    ]
  },
  "r-space": {
    "category": "field",
    "description": "间距容器，使用 flex 布局为子组件提供均匀的水平或垂直间距，支持换行和填充。"
  },
  "r-popover": {
    "category": "field",
    "description": "弹出提示容器，基于 el-popover 为触发元素显示浮层内容，支持多种触发方式和位置。"
  },
  "r-popconfirm": {
    "category": "field",
    "description": "确认气泡组件，基于 el-popconfirm 在目标元素上弹出确认/取消操作提示。",
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
    "emits": [
      {
        "name": "back",
        "type": "[]"
      }
    ]
  },
  "r-link": {
    "category": "field",
    "description": "链接组件，基于 el-link 提供带样式的超链接，可渲染子内容。"
  },
  "r-dropdown": {
    "category": "field",
    "description": "下拉菜单容器，基于 el-dropdown 渲染触发器和菜单项，支持分裂按钮模式和命令事件。"
  },
  "r-divider": {
    "category": "field",
    "description": "分割线组件，基于 el-divider 在布局中插入水平或垂直分隔，支持文字内容定位。"
  },
  "r-collapse-item": {
    "category": "field",
    "description": "折叠面板项，基于 el-collapse-item 提供可折叠区块，面板体内以 24 列网格渲染子组件。"
  },
  "r-card": {
    "category": "field",
    "description": "卡片容器，基于 el-card 提供带可选头部的容器，在卡片体内渲染子组件。"
  },
  "r-button": {
    "category": "field",
    "description": "按钮组件，基于 el-button 可渲染子内容，支持 type/size/icon 等样式属性和点击事件。"
  },
  "r-anchor-link": {
    "category": "field",
    "description": "锚点链接项，基于 el-anchor-link 定义锚点 href 和显示标题，支持嵌套子链接。"
  },
  "r-anchor": {
    "category": "field",
    "description": "锚点导航容器，基于 el-anchor 提供页面内锚点定位和跟随滚动高亮。",
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
    "description": "SPARK 组件，可在注册表中通过 type=\"nav-icon\" 使用。"
  },
  "module-context-badge": {
    "category": "feature",
    "description": "SPARK 组件，可在注册表中通过 type=\"module-context-badge\" 使用。"
  },
  "icon-picker": {
    "category": "feature",
    "description": "SPARK 组件，可在注册表中通过 type=\"icon-picker\" 使用。",
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
    "description": "SPARK 组件，可在注册表中通过 type=\"error-fallback\" 使用。"
  },
  "ai-chat-widget": {
    "category": "feature",
    "description": "SPARK 组件，可在注册表中通过 type=\"ai-chat-widget\" 使用。"
  },
  "ai-chat-panel": {
    "category": "feature",
    "description": "SPARK 组件，可在注册表中通过 type=\"ai-chat-panel\" 使用。"
  },
  "ai-assistant-hub": {
    "category": "feature",
    "description": "SPARK 组件，可在注册表中通过 type=\"ai-assistant-hub\" 使用。"
  },
  "tenant-config": {
    "category": "feature",
    "description": "多租户配置管理页面，展示和编辑租户级别的系统配置项。"
  },
  "settings": {
    "category": "feature",
    "description": "系统设置面板，提供全局参数配置和偏好设置管理界面。"
  },
  "cache-manager": {
    "category": "feature",
    "description": "缓存管理页面，查看缓存统计信息并支持手动清理元数据缓存。"
  },
  "app-list": {
    "category": "feature",
    "description": "应用列表页面，以卡片网格展示已创建的项目/应用及入口。"
  },
  "login-view": {
    "category": "feature",
    "description": "多租户登录页面，提供用户名/密码认证和租户选择入口。"
  },
  "home-page": {
    "category": "feature",
    "description": "平台首页，展示系统介绍、功能亮点和快速开始入口。"
  },
  "about": {
    "category": "feature",
    "description": "关于页面，展示系统版本、技术栈和项目信息。"
  },
  "template-dsl-demo": {
    "category": "feature",
    "description": "Vue 模板 DSL 演示页，展示通过 Vue SFC 模板直接使用 SPARK 组件的用法。"
  },
  "rform-compare-demo": {
    "category": "feature",
    "description": "表单渲染对比演示，对比配置驱动 r-form 与手写模板两种表单实现方式。"
  },
  "dashboard": {
    "category": "feature",
    "description": "管理仪表盘，聚合展示关键业务指标、统计图表和快速操作入口。"
  },
  "custom-rtable-demo": {
    "category": "feature",
    "description": "自定义表格演示，展示 r-table children 桥接机制和自定义列渲染能力。"
  },
  "capability-demo": {
    "category": "feature",
    "description": "能力系统演示页，展示 sparkProvide/sparkConsume 能力链的运行时行为。"
  },
  "dev-system": {
    "category": "feature",
    "description": "集成开发环境，提供页面配置可视化编辑、代码编辑、预览和版本管理。"
  },
  "ai-studio-panel": {
    "category": "feature",
    "description": "AI 工作室面板，提供 AI 对话驱动的页面生成、迭代和预览功能。"
  },
  "spark-component-renderer": {
    "category": "feature",
    "description": "通用组件渲染器，将 SparkNode 配置递归解析并动态渲染为已注册的 Vue 组件，是 SPARK 渲染引擎的核心入口。"
  },
  "unregistered-node-fallback": {
    "category": "feature",
    "description": "未注册组件兜底渲染器，在开发阶段显示未找到对应注册的组件类型名称，辅助排查配置错误。"
  },
  "spark-json-editor": {
    "category": "feature",
    "description": "JSON 编辑器组件，基于 CodeMirror 集成 JSON Schema 校验和树形视图，用于配置数据编辑。",
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
    "description": "子节点渲染包装器，渲染单个 SparkNode 子节点，支持 CSS Grid 项包装以兼容 el-table-column 嵌套。"
  },
  "json-tree-editor": {
    "category": "feature",
    "description": "JSON 树形编辑器，基于 VXE-Table 以可折叠/展开的树结构编辑 JSON 数据。",
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
    "description": "树节点摘要展示组件，在 r-tree 场景中渲染节点名称、类型、状态等多字段信息。"
  },
  "r-context-renderer": {
    "category": "field",
    "description": "语境感知字段渲染代理，根据父容器类型（table/form/detail/tree）自动切换渲染模板，统一处理权限控制和校验规则。"
  },
  "display-timeline-item": {
    "category": "feature",
    "description": "时间线项，基于 el-timeline-item 定义时间戳、内容和状态标记点。"
  },
  "display-timeline": {
    "category": "feature",
    "description": "时间线容器，基于 el-timeline 以垂直时间轴渲染事件序列。"
  },
  "display-skeleton": {
    "category": "feature",
    "description": "骨架屏加载占位组件，基于 el-skeleton 显示内容加载中的占位动画效果。"
  },
  "display-result": {
    "category": "feature",
    "description": "结果页组件，基于 el-result 显示操作结果状态（成功/警告/信息/错误），含标题、副标题和按钮区。"
  },
  "display-icon": {
    "category": "feature",
    "description": "图标展示组件，解析图标名称渲染为 Element Plus 图标组件，支持尺寸和颜色配置。"
  },
  "display-empty": {
    "category": "feature",
    "description": "空状态占位组件，基于 el-empty 显示自定义空状态图片和描述文字。"
  },
  "display-descriptions-item": {
    "category": "feature",
    "description": "描述列表项，基于 el-descriptions-item 定义标签和内容值，支持字段绑定。"
  },
  "display-descriptions": {
    "category": "feature",
    "description": "描述列表容器，基于 el-descriptions 以键值对布局展示结构化信息。"
  },
  "display-countdown": {
    "category": "feature",
    "description": "倒计时组件，基于 el-countdown 显示目标时间倒计时，支持自定义格式和结束事件。",
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
    "binding": {
      "bindingDelegate": "form-element",
      "valueType": "string"
    }
  },
  "display-breadcrumb-item": {
    "category": "feature",
    "description": "面包屑导航项，基于 el-breadcrumb-item 定义单个导航节点，支持链接跳转。"
  },
  "display-breadcrumb": {
    "category": "feature",
    "description": "面包屑导航容器，基于 el-breadcrumb 渲染多级导航路径，支持自定义分隔符。"
  },
  "display-alert": {
    "category": "feature",
    "description": "警告提示组件，基于 el-alert 显示带图标的提示信息，支持 success/warning/info/error 四种类型。",
    "emits": [
      {
        "name": "close",
        "type": "[]"
      }
    ]
  },
  "display-text": {
    "category": "feature",
    "description": "文本展示组件，以 div/span/p 等 HTML 元素渲染文本值，支持前后缀和数字/货币/百分比/日期格式化。"
  },
  "display-tag": {
    "category": "feature",
    "description": "标签展示组件，基于 el-tag 以彩色标签显示字段值，支持类型/尺寸/主题样式和可关闭功能。",
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
    "binding": {
      "selfResolving": true
    }
  },
  "display-progress": {
    "category": "feature",
    "description": "进度条展示组件，基于 el-progress 以条形或圆形显示百分比进度值，支持动态颜色。"
  },
  "display-pagination": {
    "category": "feature",
    "description": "分页控制组件，基于 el-pagination 从 DataView 同步分页状态，触发页码/页大小变更事件。",
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
    "description": "图片展示组件，基于 el-image 显示图片，支持懒加载、预览画廊和加载占位。"
  },
  "display-badge": {
    "category": "feature",
    "description": "徽章展示组件，基于 el-badge 在子内容上叠加数字或状态点标记。"
  },
  "display-avatar": {
    "category": "feature",
    "description": "头像展示组件，基于 el-avatar 显示用户头像或文字缩写，支持图片/图标/文字多种模式和尺寸配置。"
  },
  "builtin-action-button": {
    "category": "feature",
    "description": "内置操作按钮，基于 el-button 根据 action 类型（create/edit/delete/refresh 等）自动映射标签、图标和样式。",
    "emits": [
      {
        "name": "click",
        "type": "[event: MouseEvent]"
      }
    ]
  },
  "dock-tail": {
    "category": "feature",
    "description": "尾部 dock，在 r-toolbar 中作为工具栏末尾区域提取渲染。"
  },
  "dock-header": {
    "category": "feature",
    "description": "头部 dock，在 r-dialog/r-drawer/r-section 中作为顶部操作区域提取渲染。"
  },
  "dock-footer": {
    "category": "feature",
    "description": "底部 dock，在 r-dialog/r-drawer 中作为底部操作区域提取渲染。"
  },
  "dock-filter": {
    "category": "feature",
    "description": "筛选区 dock，在 r-table 中作为筛选表单区域提取渲染，支持折叠和网格布局。"
  },
  "dock-editor": {
    "category": "feature",
    "description": "编辑面板 dock，在 r-tree 中作为侧边编辑面板提取渲染，用于节点详情编辑。"
  },
  "dock-actions": {
    "category": "feature",
    "description": "操作列/区域 dock，在 r-table 中作为操作列提取渲染，独立使用时以 flex 布局渲染操作按钮。"
  },
  "r-column-group": {
    "category": "group",
    "description": "",
    "notes": "【使用场景】复杂表格需要多级表头分组，例如「基本信息」下包含「姓名」「年龄」「邮箱」\n\n【示例】\n{ \"type\": \"r-column-group\", \"props\": { \"label\": \"基本信息\" }, \"children\": [\n  { \"type\": \"r-text\", \"field\": \"name\", \"props\": { \"label\": \"姓名\" } },\n  { \"type\": \"r-number\", \"field\": \"age\", \"props\": { \"label\": \"年龄\" } }\n]}\nchildren 内放 r-* 字段组件作为实际数据列"
  }
}

/** 各组件类型的可用属性名列表（不含结构键 type/props/children/id） */
export const COMPONENT_PROP_NAMES: Record<string, string[]> = {
  "context-aware-fields-api": [],
  "builtin-action": [],
  "r-table": [
    "dataKey",
    "actions"
  ],
  "r-form": [
    "dataKey",
    "labelWidth",
    "gridColumns",
    "gridGap",
    "gridAutoRows"
  ],
  "r-detail": [
    "dataKey",
    "gridColumns",
    "gridGap",
    "gridAutoRows",
    "titleAlign",
    "valueAlign"
  ],
  "r-tree": [
    "dataKey",
    "actions",
    "editor",
    "nodeKey",
    "currentKey",
    "expandToKey",
    "expandLevel",
    "allowAppend",
    "allowDelete"
  ],
  "r-list": [
    "dataKey",
    "actions",
    "columns",
    "gap",
    "minItemWidth",
    "rowKey",
    "emptyText",
    "itemClass",
    "itemStyle",
    "useCard",
    "cardShadow",
    "gridColumns",
    "gridGap",
    "gridAutoRows",
    "itemColSpan",
    "itemRowSpan"
  ],
  "r-tabs": [
    "modelValue"
  ],
  "r-collapse": [
    "modelValue"
  ],
  "r-steps": [
    "modelValue"
  ],
  "r-dialog": [
    "header",
    "footer",
    "title",
    "modelValue",
    "bodyClass",
    "gridColumns",
    "gridGap",
    "gridAutoRows"
  ],
  "r-drawer": [
    "header",
    "footer",
    "title",
    "modelValue",
    "bodyClass",
    "gridColumns",
    "gridGap",
    "gridAutoRows"
  ],
  "r-section": [
    "header",
    "title",
    "description",
    "collapsible",
    "defaultCollapsed",
    "bordered",
    "useCard",
    "cardShadow",
    "bodyClass",
    "expandText",
    "collapseText",
    "showToggleIcon",
    "expandIconText",
    "collapseIconText",
    "gridColumns",
    "gridGap",
    "gridAutoRows"
  ],
  "r-block": [],
  "r-user-picker": [
    "name",
    "label",
    "width",
    "modelValue",
    "placeholder",
    "field",
    "options",
    "optionKey",
    "optionLabelField",
    "optionValueField",
    "buttonText",
    "readonlyButtonText",
    "clearable",
    "multiple",
    "searchable",
    "separator",
    "valueMode",
    "entityName"
  ],
  "r-dept-picker": [
    "name",
    "label",
    "width",
    "modelValue",
    "placeholder",
    "field",
    "options",
    "optionKey",
    "optionLabelField",
    "optionValueField",
    "buttonText",
    "readonlyButtonText",
    "clearable",
    "multiple",
    "searchable",
    "separator",
    "valueMode",
    "entityName"
  ],
  "r-product-picker": [
    "name",
    "label",
    "width",
    "modelValue",
    "placeholder",
    "field",
    "options",
    "optionKey",
    "optionLabelField",
    "optionValueField",
    "buttonText",
    "readonlyButtonText",
    "clearable",
    "multiple",
    "searchable",
    "separator",
    "valueMode",
    "entityName"
  ],
  "r-tour": [
    "steps",
    "open",
    "placement",
    "showArrow",
    "mask",
    "tourType",
    "closeOnPressEscape",
    "scrollIntoViewOptions"
  ],
  "r-tooltip": [
    "content",
    "placement",
    "effect",
    "offset",
    "showAfter",
    "hideAfter",
    "showArrow",
    "enterable",
    "popperClass",
    "rawContent"
  ],
  "r-toolbar": [
    "tail",
    "gap",
    "zoneGap",
    "align",
    "justify"
  ],
  "r-tab-pane": [
    "name",
    "value",
    "label",
    "title",
    "disabled",
    "lazy",
    "closable",
    "bodyClass",
    "gridColumns",
    "gridAutoRows",
    "gridGap",
    "index"
  ],
  "r-step-item": [
    "title",
    "label",
    "description",
    "status",
    "disabled",
    "bodyClass",
    "gridColumns",
    "gridAutoRows",
    "gridGap",
    "index",
    "mode"
  ],
  "r-space": [
    "direction",
    "size",
    "wrap",
    "fill",
    "alignment"
  ],
  "r-popover": [
    "title",
    "content",
    "placement",
    "width",
    "trigger",
    "effect",
    "offset",
    "showAfter",
    "hideAfter",
    "showArrow",
    "popperClass"
  ],
  "r-popconfirm": [
    "title",
    "confirmButtonText",
    "cancelButtonText",
    "confirmButtonType",
    "cancelButtonType",
    "icon",
    "iconColor",
    "hideIcon",
    "hideAfter",
    "width"
  ],
  "r-page-header": [
    "title",
    "icon",
    "content"
  ],
  "r-link": [
    "label",
    "linkType",
    "underline",
    "href",
    "target"
  ],
  "r-dropdown": [
    "items",
    "trigger",
    "effect",
    "placement",
    "hideOnClick",
    "showTimeout",
    "hideTimeout",
    "splitButton",
    "popperClass",
    "maxHeight"
  ],
  "r-divider": [
    "direction",
    "borderStyle",
    "contentPosition",
    "content"
  ],
  "r-collapse-item": [
    "name",
    "title",
    "label",
    "disabled",
    "bodyClass",
    "gridColumns",
    "gridAutoRows",
    "gridGap",
    "index"
  ],
  "r-card": [
    "header",
    "shadow",
    "bodyStyle",
    "bodyClass"
  ],
  "r-button": [
    "label",
    "buttonType",
    "buttonSize",
    "plain",
    "textMode",
    "bg",
    "linkMode",
    "round",
    "circle",
    "loading",
    "autoInsertSpace",
    "color",
    "dark"
  ],
  "r-anchor-link": [
    "href",
    "title"
  ],
  "r-anchor": [
    "container",
    "offset",
    "bound",
    "duration",
    "marker",
    "direction",
    "anchorType"
  ],
  "r-upload": [
    "field",
    "label",
    "width",
    "modelValue",
    "action",
    "accept",
    "buttonText",
    "autoUpload",
    "showFileList",
    "limit",
    "listType",
    "separator",
    "placeholder",
    "readonlyButtonText"
  ],
  "r-tree-select": [
    "field",
    "label",
    "width",
    "modelValue",
    "options",
    "optionKey",
    "optionLabelField",
    "optionValueField",
    "optionChildrenField",
    "placeholder",
    "clearable",
    "filterable",
    "multiple",
    "checkStrictly",
    "defaultExpandAll",
    "renderAfterExpand"
  ],
  "r-transfer": [
    "field",
    "label",
    "width",
    "modelValue",
    "options",
    "optionKey",
    "optionLabelField",
    "optionValueField",
    "titles",
    "filterable",
    "filterPlaceholder",
    "targetOrder"
  ],
  "r-time-select": [
    "field",
    "label",
    "width",
    "modelValue",
    "placeholder",
    "start",
    "end",
    "step",
    "minTime",
    "maxTime",
    "clearable"
  ],
  "r-time-picker": [
    "field",
    "label",
    "width",
    "modelValue",
    "placeholder",
    "isRange",
    "rangeSeparator",
    "startPlaceholder",
    "endPlaceholder",
    "arrowControl",
    "format",
    "clearable"
  ],
  "r-textarea": [
    "field",
    "label",
    "width",
    "modelValue",
    "rows",
    "autosize",
    "maxlength",
    "showWordLimit",
    "placeholder"
  ],
  "r-text": [
    "field",
    "label",
    "width",
    "modelValue"
  ],
  "r-switch": [
    "field",
    "label",
    "width",
    "modelValue",
    "activeText",
    "inactiveText"
  ],
  "r-slider": [
    "field",
    "label",
    "width",
    "modelValue",
    "min",
    "max",
    "step",
    "showInput"
  ],
  "r-select": [
    "field",
    "label",
    "width",
    "modelValue",
    "options",
    "optionKey",
    "optionLabelField",
    "optionValueField",
    "placeholder",
    "clearable",
    "filterable"
  ],
  "r-segmented": [
    "modelValue",
    "options",
    "size",
    "block"
  ],
  "r-rate": [
    "field",
    "label",
    "width",
    "modelValue",
    "max",
    "allowHalf"
  ],
  "r-radio": [
    "field",
    "label",
    "width",
    "modelValue",
    "options",
    "optionKey",
    "optionLabelField",
    "optionValueField",
    "buttonStyle"
  ],
  "r-number": [
    "field",
    "label",
    "width",
    "modelValue",
    "min",
    "max",
    "precision",
    "filterMode",
    "filterVariant",
    "filterRange"
  ],
  "r-multi-select": [
    "field",
    "label",
    "width",
    "modelValue",
    "options",
    "optionKey",
    "optionLabelField",
    "optionValueField",
    "placeholder",
    "clearable",
    "filterable",
    "collapseTags",
    "collapseTagsTooltip",
    "maxCollapseTags"
  ],
  "r-mention": [
    "modelValue",
    "options",
    "prefix",
    "split",
    "filterOption",
    "placement",
    "showArrow",
    "offset",
    "whole",
    "checkIsWhole",
    "loading",
    "inputType",
    "placeholder",
    "rows"
  ],
  "r-image": [
    "field",
    "label",
    "width",
    "modelValue",
    "action",
    "accept",
    "multiple",
    "separator",
    "placeholder",
    "buttonText",
    "readonlyButtonText",
    "clearable"
  ],
  "r-icon": [
    "field",
    "label",
    "width",
    "modelValue",
    "options",
    "optionKey",
    "optionLabelField",
    "optionValueField",
    "placeholder",
    "clearable",
    "filterable",
    "classPrefix"
  ],
  "r-html-editor": [
    "field",
    "label",
    "width",
    "modelValue",
    "rows"
  ],
  "r-file-path": [
    "field",
    "label",
    "width",
    "modelValue",
    "action",
    "accept",
    "multiple",
    "separator",
    "placeholder",
    "buttonText",
    "readonlyButtonText",
    "clearable"
  ],
  "r-file-browser": [
    "field",
    "label",
    "width",
    "modelValue",
    "accept",
    "multiple",
    "clearable",
    "separator",
    "placeholder",
    "buttonText"
  ],
  "r-entity-picker": [
    "field",
    "label",
    "width",
    "modelValue",
    "options",
    "optionKey",
    "optionLabelField",
    "optionValueField",
    "placeholder",
    "buttonText",
    "readonlyButtonText",
    "clearable",
    "multiple",
    "searchable",
    "separator",
    "valueMode",
    "entityName"
  ],
  "r-date": [
    "field",
    "label",
    "width",
    "modelValue",
    "dateType",
    "placeholder",
    "startPlaceholder",
    "endPlaceholder",
    "rangeSeparator",
    "format",
    "valueFormat",
    "clearable",
    "filterMode",
    "filterVariant",
    "filterRange"
  ],
  "r-color": [
    "field",
    "label",
    "width",
    "modelValue"
  ],
  "r-check-tag": [
    "checked",
    "label"
  ],
  "r-checkbox-group": [
    "field",
    "label",
    "width",
    "modelValue",
    "options",
    "optionKey",
    "optionLabelField",
    "optionValueField",
    "buttonStyle"
  ],
  "r-checkbox": [
    "field",
    "label",
    "width",
    "modelValue",
    "checkedText",
    "uncheckedText",
    "checkboxText"
  ],
  "r-cascader": [
    "field",
    "label",
    "width",
    "modelValue",
    "options",
    "optionKey",
    "optionLabelField",
    "optionValueField",
    "optionChildrenField",
    "placeholder",
    "clearable",
    "filterable",
    "multiple",
    "checkStrictly",
    "emitPath"
  ],
  "r-autocomplete": [
    "field",
    "label",
    "width",
    "modelValue",
    "placeholder",
    "fetchSuggestions",
    "triggerOnFocus",
    "highlightFirstItem",
    "clearable",
    "valueKey"
  ],
  "nav-icon": [
    "name",
    "size"
  ],
  "module-context-badge": [
    "label",
    "emptyText"
  ],
  "icon-picker": [
    "modelValue",
    "placeholder",
    "width"
  ],
  "error-fallback": [
    "error"
  ],
  "ai-chat-widget": [
    "mode",
    "systemPrompt",
    "title",
    "placeholder",
    "compact"
  ],
  "ai-chat-panel": [
    "embedded",
    "forceOpen"
  ],
  "ai-assistant-hub": [],
  "tenant-config": [],
  "settings": [],
  "cache-manager": [],
  "app-list": [],
  "login-view": [],
  "home-page": [],
  "about": [],
  "template-dsl-demo": [],
  "rform-compare-demo": [],
  "dashboard": [],
  "custom-rtable-demo": [],
  "capability-demo": [],
  "dev-system": [],
  "ai-studio-panel": [],
  "spark-component-renderer": [
    "parentContext"
  ],
  "unregistered-node-fallback": [
    "title",
    "description"
  ],
  "spark-json-editor": [
    "modelValue",
    "readOnly",
    "height",
    "mode",
    "indentation",
    "tabSize",
    "mainMenuBar",
    "navigationBar",
    "statusBar",
    "askToFormat",
    "schema",
    "schemaDefinitions",
    "enableSchemaValidation",
    "enableSchemaEnumRenderer"
  ],
  "spark-code-editor": [
    "modelValue",
    "language",
    "readOnly",
    "height",
    "tabSize",
    "lineWrapping"
  ],
  "spark-child": [
    "nodeId",
    "colSpan",
    "rowSpan"
  ],
  "json-tree-editor": [
    "field",
    "label",
    "width",
    "modelValue",
    "documentValue",
    "height",
    "readOnly",
    "schema",
    "filterPlaceholder",
    "policy",
    "rootLabel",
    "isProtected",
    "canEditKey",
    "canEditType",
    "suggestChildKey",
    "createDefaultArrayItem",
    "createDefaultObjectValue"
  ],
  "tree-node-summary": [
    "nameField",
    "typeField",
    "statusField",
    "ownerField",
    "metaField",
    "extraField",
    "showType",
    "showStatus",
    "showOwner",
    "showMeta",
    "showExtra"
  ],
  "r-context-renderer": [
    "displayLabel",
    "label",
    "fieldName",
    "field",
    "width",
    "sortable",
    "filterable",
    "minWidth",
    "fixed",
    "align",
    "headerAlign",
    "isCurrentFieldHidden",
    "shouldRenderCurrentField",
    "currentDisplayValue",
    "isTableCellHidden",
    "getTableCellDisplayValue",
    "validationRules",
    "titleAlign",
    "valueAlign",
    "headerCellClassName",
    "labelClassName",
    "cellClassName",
    "className",
    "titleClassName",
    "valueClassName"
  ],
  "display-timeline-item": [
    "timestamp",
    "hideTimestamp",
    "center",
    "placement",
    "itemType",
    "color",
    "itemSize",
    "hollow",
    "content"
  ],
  "display-timeline": [],
  "display-skeleton": [
    "rows",
    "count",
    "loading",
    "animated",
    "throttle"
  ],
  "display-result": [
    "icon",
    "title",
    "subTitle"
  ],
  "display-icon": [
    "icon",
    "iconSize",
    "color"
  ],
  "display-empty": [
    "image",
    "imageSize",
    "description"
  ],
  "display-descriptions-item": [
    "label",
    "span",
    "labelAlign",
    "contentAlign",
    "labelClassName",
    "className",
    "content",
    "value",
    "field"
  ],
  "display-descriptions": [
    "title",
    "extra",
    "border",
    "column",
    "direction",
    "descriptionsSize"
  ],
  "display-countdown": [
    "value",
    "format",
    "prefix",
    "suffix",
    "title",
    "valueStyle"
  ],
  "display-calendar": [
    "modelValue",
    "range"
  ],
  "display-breadcrumb-item": [
    "label",
    "to",
    "replace"
  ],
  "display-breadcrumb": [
    "separator",
    "separatorIcon"
  ],
  "display-alert": [
    "title",
    "description",
    "alertType",
    "closable",
    "closeText",
    "center",
    "showIcon",
    "effect"
  ],
  "display-text": [
    "value",
    "field",
    "tag",
    "prefix",
    "suffix",
    "format",
    "precision",
    "placeholder",
    "textClass",
    "textStyle"
  ],
  "display-tag": [
    "content",
    "value",
    "field",
    "tagType",
    "closable",
    "disableTransitions",
    "hit",
    "round",
    "color",
    "size",
    "effect"
  ],
  "display-statistic": [
    "title",
    "value",
    "dataKey",
    "field",
    "precision",
    "decimalSeparator",
    "groupSeparator",
    "prefix",
    "suffix",
    "valueStyle"
  ],
  "display-progress": [
    "percentage",
    "value",
    "field",
    "progressType",
    "strokeWidth",
    "textInside",
    "status",
    "indeterminate",
    "duration",
    "color",
    "circleWidth",
    "showText",
    "strokeLinecap",
    "formatText"
  ],
  "display-pagination": [
    "total",
    "pageSize",
    "currentPage",
    "pageSizes",
    "pagerCount",
    "layout",
    "background",
    "small",
    "hideOnSinglePage"
  ],
  "display-image": [
    "src",
    "field",
    "value",
    "fit",
    "alt",
    "lazy",
    "previewSrcList",
    "previewField",
    "initialIndex",
    "zIndex",
    "hideOnClickModal",
    "previewTeleported",
    "closeOnPressEscape",
    "width",
    "height"
  ],
  "display-badge": [
    "badgeValue",
    "value",
    "field",
    "max",
    "isDot",
    "hiddenBadge",
    "badgeType",
    "showZero",
    "color",
    "offset",
    "badgeStyle",
    "badgeClass"
  ],
  "display-avatar": [
    "avatarSize",
    "shape",
    "src",
    "value",
    "field",
    "srcSet",
    "alt",
    "fit",
    "text",
    "icon"
  ],
  "builtin-action-button": [
    "builtinAction",
    "label",
    "buttonType",
    "buttonSize",
    "buttonPlain",
    "buttonText",
    "buttonLink",
    "buttonClass",
    "buttonDisabled",
    "disabled",
    "disabledWhenRow",
    "row",
    "rowIndex",
    "data",
    "dataSource"
  ],
  "dock-tail": [
    "width"
  ],
  "dock-header": [
    "width"
  ],
  "dock-footer": [
    "width"
  ],
  "dock-filter": [
    "columns",
    "collapsible",
    "defaultCollapsed",
    "autoFitMinWidth",
    "itemSpan",
    "gridColumns",
    "gridGap",
    "gridAutoRows"
  ],
  "dock-editor": [
    "position",
    "width"
  ],
  "dock-actions": [
    "position",
    "label",
    "width",
    "align",
    "fixed"
  ],
  "r-column-group": []
}

/** 各组件各属性的枚举值选项（仅限有明确枚举值的属性） */
export const COMPONENT_PROP_ENUMS: Record<string, Record<string, string[]>> = {
  "r-detail": {
    "titleAlign": [
      "center",
      "left",
      "right"
    ],
    "valueAlign": [
      "center",
      "left",
      "right"
    ]
  },
  "r-list": {
    "cardShadow": [
      "hover",
      "always",
      "never"
    ]
  },
  "r-section": {
    "cardShadow": [
      "hover",
      "always",
      "never"
    ]
  },
  "r-user-picker": {
    "valueMode": [
      "auto",
      "array",
      "comma-string"
    ]
  },
  "r-dept-picker": {
    "valueMode": [
      "auto",
      "array",
      "comma-string"
    ]
  },
  "r-product-picker": {
    "valueMode": [
      "auto",
      "array",
      "comma-string"
    ]
  },
  "r-tour": {
    "tourType": [
      "default",
      "primary"
    ]
  },
  "r-tooltip": {
    "effect": [
      "dark",
      "light"
    ]
  },
  "r-step-item": {
    "mode": [
      "content",
      "header"
    ]
  },
  "r-space": {
    "direction": [
      "horizontal",
      "vertical"
    ],
    "alignment": [
      "center",
      "stretch",
      "flex-start",
      "flex-end",
      "baseline"
    ]
  },
  "r-popover": {
    "trigger": [
      "click",
      "hover",
      "focus",
      "contextmenu"
    ],
    "effect": [
      "dark",
      "light"
    ]
  },
  "r-popconfirm": {
    "confirmButtonType": [
      "default",
      "primary",
      "success",
      "warning",
      "info",
      "danger"
    ],
    "cancelButtonType": [
      "default",
      "primary",
      "success",
      "warning",
      "info",
      "danger"
    ]
  },
  "r-link": {
    "linkType": [
      "default",
      "primary",
      "success",
      "warning",
      "info",
      "danger"
    ],
    "target": [
      "_self",
      "_blank",
      "_parent",
      "_top"
    ]
  },
  "r-dropdown": {
    "trigger": [
      "click",
      "hover",
      "contextmenu"
    ],
    "effect": [
      "dark",
      "light"
    ]
  },
  "r-divider": {
    "direction": [
      "horizontal",
      "vertical"
    ],
    "borderStyle": [
      "solid",
      "dashed",
      "dotted",
      "double",
      "none"
    ],
    "contentPosition": [
      "center",
      "left",
      "right"
    ]
  },
  "r-card": {
    "shadow": [
      "hover",
      "always",
      "never"
    ]
  },
  "r-button": {
    "buttonType": [
      "default",
      "primary",
      "success",
      "warning",
      "info",
      "danger",
      "text"
    ],
    "buttonSize": [
      "default",
      "large",
      "small"
    ]
  },
  "r-anchor": {
    "direction": [
      "horizontal",
      "vertical"
    ],
    "anchorType": [
      "default",
      "underline"
    ]
  },
  "r-upload": {
    "listType": [
      "text",
      "picture",
      "picture-card"
    ]
  },
  "r-transfer": {
    "targetOrder": [
      "push",
      "unshift",
      "original"
    ]
  },
  "r-segmented": {
    "size": [
      "default",
      "large",
      "small"
    ]
  },
  "r-mention": {
    "placement": [
      "bottom",
      "top"
    ],
    "inputType": [
      "text",
      "textarea"
    ]
  },
  "r-entity-picker": {
    "valueMode": [
      "auto",
      "array",
      "comma-string"
    ]
  },
  "r-context-renderer": {
    "fixed": [
      "left",
      "right"
    ]
  },
  "display-timeline-item": {
    "placement": [
      "bottom",
      "top"
    ],
    "itemType": [
      "primary",
      "success",
      "warning",
      "info",
      "danger"
    ],
    "itemSize": [
      "large",
      "normal"
    ]
  },
  "display-result": {
    "icon": [
      "success",
      "warning",
      "info",
      "error"
    ]
  },
  "display-descriptions-item": {
    "labelAlign": [
      "center",
      "left",
      "right"
    ],
    "contentAlign": [
      "center",
      "left",
      "right"
    ]
  },
  "display-descriptions": {
    "direction": [
      "horizontal",
      "vertical"
    ],
    "descriptionsSize": [
      "default",
      "large",
      "small"
    ]
  },
  "display-alert": {
    "alertType": [
      "success",
      "warning",
      "info",
      "error"
    ],
    "effect": [
      "dark",
      "light"
    ]
  },
  "display-text": {
    "format": [
      "number",
      "date",
      "currency",
      "percent"
    ]
  },
  "display-tag": {
    "tagType": [
      "success",
      "warning",
      "info",
      "danger"
    ],
    "size": [
      "default",
      "large",
      "small"
    ],
    "effect": [
      "dark",
      "light",
      "plain"
    ]
  },
  "display-progress": {
    "progressType": [
      "circle",
      "line",
      "dashboard"
    ],
    "status": [
      "success",
      "warning",
      "exception"
    ],
    "strokeLinecap": [
      "round",
      "butt",
      "square"
    ]
  },
  "display-image": {
    "fit": [
      "fill",
      "none",
      "cover",
      "contain",
      "scale-down"
    ]
  },
  "display-badge": {
    "badgeType": [
      "primary",
      "success",
      "warning",
      "info",
      "danger"
    ]
  },
  "display-avatar": {
    "avatarSize": [
      "default",
      "large",
      "small"
    ],
    "shape": [
      "circle",
      "square"
    ],
    "fit": [
      "fill",
      "none",
      "cover",
      "contain",
      "scale-down"
    ]
  },
  "dock-editor": {
    "position": [
      "bottom",
      "left",
      "right",
      "top"
    ]
  },
  "dock-actions": {
    "position": [
      "left",
      "right"
    ],
    "align": [
      "center",
      "left",
      "right"
    ],
    "fixed": [
      "left",
      "right"
    ]
  }
}

/** 各组件各属性的 TypeScript 类型字符串 */
export const COMPONENT_PROP_TYPES: Record<string, Record<string, string>> = {
  "r-table": {
    "dataKey": "string",
    "actions": "unknown"
  },
  "r-form": {
    "dataKey": "string",
    "labelWidth": "string",
    "gridColumns": "number",
    "gridGap": "string | number",
    "gridAutoRows": "string"
  },
  "r-detail": {
    "dataKey": "string",
    "gridColumns": "number",
    "gridGap": "string | number",
    "gridAutoRows": "string",
    "titleAlign": "\"center\" | \"left\" | \"right\"",
    "valueAlign": "\"center\" | \"left\" | \"right\""
  },
  "r-tree": {
    "dataKey": "string",
    "actions": "unknown",
    "editor": "unknown",
    "nodeKey": "string",
    "currentKey": "string | number | null",
    "expandToKey": "string | number | null",
    "expandLevel": "number",
    "allowAppend": "boolean",
    "allowDelete": "boolean"
  },
  "r-list": {
    "dataKey": "string",
    "actions": "unknown",
    "columns": "number",
    "gap": "string | number",
    "minItemWidth": "string",
    "rowKey": "string",
    "emptyText": "string",
    "itemClass": "string",
    "itemStyle": "CSSProperties",
    "useCard": "boolean",
    "cardShadow": "\"hover\" | \"always\" | \"never\"",
    "gridColumns": "number",
    "gridGap": "string | number",
    "gridAutoRows": "string",
    "itemColSpan": "number",
    "itemRowSpan": "number"
  },
  "r-tabs": {
    "modelValue": "string | number"
  },
  "r-collapse": {
    "modelValue": "CollapseValue"
  },
  "r-steps": {
    "modelValue": "string | number"
  },
  "r-dialog": {
    "header": "unknown",
    "footer": "unknown",
    "title": "string",
    "modelValue": "boolean",
    "bodyClass": "string",
    "gridColumns": "number",
    "gridGap": "string | number",
    "gridAutoRows": "string"
  },
  "r-drawer": {
    "header": "unknown",
    "footer": "unknown",
    "title": "string",
    "modelValue": "boolean",
    "bodyClass": "string",
    "gridColumns": "number",
    "gridGap": "string | number",
    "gridAutoRows": "string"
  },
  "r-section": {
    "header": "unknown",
    "title": "string",
    "description": "string",
    "collapsible": "boolean",
    "defaultCollapsed": "boolean",
    "bordered": "boolean",
    "useCard": "boolean",
    "cardShadow": "\"hover\" | \"always\" | \"never\"",
    "bodyClass": "string",
    "expandText": "string",
    "collapseText": "string",
    "showToggleIcon": "boolean",
    "expandIconText": "string",
    "collapseIconText": "string",
    "gridColumns": "number",
    "gridGap": "string | number",
    "gridAutoRows": "string"
  },
  "r-user-picker": {
    "name": "string",
    "label": "string",
    "width": "number",
    "modelValue": "EntityPickerValue",
    "placeholder": "string",
    "field": "string",
    "options": "unknown[]",
    "optionKey": "string",
    "optionLabelField": "string",
    "optionValueField": "string",
    "buttonText": "string",
    "readonlyButtonText": "string",
    "clearable": "boolean",
    "multiple": "boolean",
    "searchable": "boolean",
    "separator": "string",
    "valueMode": "\"auto\" | \"array\" | \"comma-string\"",
    "entityName": "string"
  },
  "r-dept-picker": {
    "name": "string",
    "label": "string",
    "width": "number",
    "modelValue": "EntityPickerValue",
    "placeholder": "string",
    "field": "string",
    "options": "unknown[]",
    "optionKey": "string",
    "optionLabelField": "string",
    "optionValueField": "string",
    "buttonText": "string",
    "readonlyButtonText": "string",
    "clearable": "boolean",
    "multiple": "boolean",
    "searchable": "boolean",
    "separator": "string",
    "valueMode": "\"auto\" | \"array\" | \"comma-string\"",
    "entityName": "string"
  },
  "r-product-picker": {
    "name": "string",
    "label": "string",
    "width": "number",
    "modelValue": "EntityPickerValue",
    "placeholder": "string",
    "field": "string",
    "options": "unknown[]",
    "optionKey": "string",
    "optionLabelField": "string",
    "optionValueField": "string",
    "buttonText": "string",
    "readonlyButtonText": "string",
    "clearable": "boolean",
    "multiple": "boolean",
    "searchable": "boolean",
    "separator": "string",
    "valueMode": "\"auto\" | \"array\" | \"comma-string\"",
    "entityName": "string"
  },
  "r-tour": {
    "steps": "TourStep[]",
    "open": "boolean",
    "placement": "string",
    "showArrow": "boolean",
    "mask": "boolean",
    "tourType": "\"default\" | \"primary\"",
    "closeOnPressEscape": "boolean",
    "scrollIntoViewOptions": "boolean | ScrollIntoViewOptions"
  },
  "r-tooltip": {
    "content": "string",
    "placement": "string",
    "effect": "\"dark\" | \"light\"",
    "offset": "number",
    "showAfter": "number",
    "hideAfter": "number",
    "showArrow": "boolean",
    "enterable": "boolean",
    "popperClass": "string",
    "rawContent": "boolean"
  },
  "r-toolbar": {
    "tail": "unknown",
    "gap": "string | number",
    "zoneGap": "string | number",
    "align": "InlineAlign",
    "justify": "InlineJustify"
  },
  "r-tab-pane": {
    "name": "string | number",
    "value": "string | number",
    "label": "string",
    "title": "string",
    "disabled": "boolean",
    "lazy": "boolean",
    "closable": "boolean",
    "bodyClass": "string",
    "gridColumns": "string | number",
    "gridAutoRows": "string",
    "gridGap": "string | number",
    "index": "number"
  },
  "r-step-item": {
    "title": "string",
    "label": "string",
    "description": "string",
    "status": "string",
    "disabled": "boolean",
    "bodyClass": "string",
    "gridColumns": "string | number",
    "gridAutoRows": "string",
    "gridGap": "string | number",
    "index": "number",
    "mode": "\"content\" | \"header\""
  },
  "r-space": {
    "direction": "\"horizontal\" | \"vertical\"",
    "size": "string | number",
    "wrap": "boolean",
    "fill": "boolean",
    "alignment": "\"center\" | \"stretch\" | \"flex-start\" | \"flex-end\" | \"baseline\""
  },
  "r-popover": {
    "title": "string",
    "content": "string",
    "placement": "string",
    "width": "string | number",
    "trigger": "\"click\" | \"hover\" | \"focus\" | \"contextmenu\"",
    "effect": "\"dark\" | \"light\"",
    "offset": "number",
    "showAfter": "number",
    "hideAfter": "number",
    "showArrow": "boolean",
    "popperClass": "string"
  },
  "r-popconfirm": {
    "title": "string",
    "confirmButtonText": "string",
    "cancelButtonText": "string",
    "confirmButtonType": "\"\" | \"default\" | \"primary\" | \"success\" | \"warning\" | \"info\" | \"danger\"",
    "cancelButtonType": "\"\" | \"default\" | \"primary\" | \"success\" | \"warning\" | \"info\" | \"danger\"",
    "icon": "string",
    "iconColor": "string",
    "hideIcon": "boolean",
    "hideAfter": "number",
    "width": "string | number"
  },
  "r-page-header": {
    "title": "string",
    "icon": "string",
    "content": "string"
  },
  "r-link": {
    "label": "string",
    "linkType": "\"\" | \"default\" | \"primary\" | \"success\" | \"warning\" | \"info\" | \"danger\"",
    "underline": "boolean",
    "href": "string",
    "target": "\"_self\" | \"_blank\" | \"_parent\" | \"_top\""
  },
  "r-dropdown": {
    "items": "DropdownItem[]",
    "trigger": "\"click\" | \"hover\" | \"contextmenu\"",
    "effect": "\"dark\" | \"light\"",
    "placement": "string",
    "hideOnClick": "boolean",
    "showTimeout": "number",
    "hideTimeout": "number",
    "splitButton": "boolean",
    "popperClass": "string",
    "maxHeight": "string | number"
  },
  "r-divider": {
    "direction": "\"horizontal\" | \"vertical\"",
    "borderStyle": "\"solid\" | \"dashed\" | \"dotted\" | \"double\" | \"none\"",
    "contentPosition": "\"center\" | \"left\" | \"right\"",
    "content": "string"
  },
  "r-collapse-item": {
    "name": "string | number",
    "title": "string",
    "label": "string",
    "disabled": "boolean",
    "bodyClass": "string",
    "gridColumns": "string | number",
    "gridAutoRows": "string",
    "gridGap": "string | number",
    "index": "number"
  },
  "r-card": {
    "header": "string",
    "shadow": "\"hover\" | \"always\" | \"never\"",
    "bodyStyle": "string | Record<string, string>",
    "bodyClass": "string"
  },
  "r-button": {
    "label": "string",
    "buttonType": "\"\" | \"default\" | \"primary\" | \"success\" | \"warning\" | \"info\" | \"danger\" | \"text\"",
    "buttonSize": "\"default\" | \"large\" | \"small\"",
    "plain": "boolean",
    "textMode": "boolean",
    "bg": "boolean",
    "linkMode": "boolean",
    "round": "boolean",
    "circle": "boolean",
    "loading": "boolean",
    "autoInsertSpace": "boolean",
    "color": "string",
    "dark": "boolean"
  },
  "r-anchor-link": {
    "href": "string",
    "title": "string"
  },
  "r-anchor": {
    "container": "string",
    "offset": "number",
    "bound": "number",
    "duration": "number",
    "marker": "boolean",
    "direction": "\"horizontal\" | \"vertical\"",
    "anchorType": "\"default\" | \"underline\""
  },
  "r-upload": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "string",
    "action": "string",
    "accept": "string",
    "buttonText": "string",
    "autoUpload": "boolean",
    "showFileList": "boolean",
    "limit": "number",
    "listType": "\"text\" | \"picture\" | \"picture-card\"",
    "separator": "string",
    "placeholder": "string",
    "readonlyButtonText": "string"
  },
  "r-tree-select": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "TreeSelectValue",
    "options": "unknown[]",
    "optionKey": "string",
    "optionLabelField": "string",
    "optionValueField": "string",
    "optionChildrenField": "string",
    "placeholder": "string",
    "clearable": "boolean",
    "filterable": "boolean",
    "multiple": "boolean",
    "checkStrictly": "boolean",
    "defaultExpandAll": "boolean",
    "renderAfterExpand": "boolean"
  },
  "r-transfer": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "TransferValue",
    "options": "unknown[]",
    "optionKey": "string",
    "optionLabelField": "string",
    "optionValueField": "string",
    "titles": "[string, string]",
    "filterable": "boolean",
    "filterPlaceholder": "string",
    "targetOrder": "\"push\" | \"unshift\" | \"original\""
  },
  "r-time-select": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "string",
    "placeholder": "string",
    "start": "string",
    "end": "string",
    "step": "string",
    "minTime": "string",
    "maxTime": "string",
    "clearable": "boolean"
  },
  "r-time-picker": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "string | Date",
    "placeholder": "string",
    "isRange": "boolean",
    "rangeSeparator": "string",
    "startPlaceholder": "string",
    "endPlaceholder": "string",
    "arrowControl": "boolean",
    "format": "string",
    "clearable": "boolean"
  },
  "r-textarea": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "string",
    "rows": "number",
    "autosize": "boolean | { minRows?: number; maxRows?: number; }",
    "maxlength": "number",
    "showWordLimit": "boolean",
    "placeholder": "string"
  },
  "r-text": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "string"
  },
  "r-switch": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "boolean | null",
    "activeText": "string",
    "inactiveText": "string"
  },
  "r-slider": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "number",
    "min": "number",
    "max": "number",
    "step": "number",
    "showInput": "boolean"
  },
  "r-select": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "string | number",
    "options": "unknown[]",
    "optionKey": "string",
    "optionLabelField": "string",
    "optionValueField": "string",
    "placeholder": "string",
    "clearable": "boolean",
    "filterable": "boolean"
  },
  "r-segmented": {
    "modelValue": "string | number",
    "options": "SegmentedOption[]",
    "size": "\"default\" | \"large\" | \"small\"",
    "block": "boolean"
  },
  "r-rate": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "number",
    "max": "number",
    "allowHalf": "boolean"
  },
  "r-radio": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "string | number",
    "options": "unknown[]",
    "optionKey": "string",
    "optionLabelField": "string",
    "optionValueField": "string",
    "buttonStyle": "boolean"
  },
  "r-number": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "number | [number | undefined, number | undefined]",
    "min": "number",
    "max": "number",
    "precision": "number",
    "filterMode": "string",
    "filterVariant": "string",
    "filterRange": "boolean"
  },
  "r-multi-select": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "MultiValue",
    "options": "unknown[]",
    "optionKey": "string",
    "optionLabelField": "string",
    "optionValueField": "string",
    "placeholder": "string",
    "clearable": "boolean",
    "filterable": "boolean",
    "collapseTags": "boolean",
    "collapseTagsTooltip": "boolean",
    "maxCollapseTags": "number"
  },
  "r-mention": {
    "modelValue": "string",
    "options": "MentionOption[]",
    "prefix": "string | string[]",
    "split": "string",
    "filterOption": "boolean | ((pattern: string, option: MentionOption) => boolean)",
    "placement": "\"bottom\" | \"top\"",
    "showArrow": "boolean",
    "offset": "number",
    "whole": "boolean",
    "checkIsWhole": "(pattern: string, prefix: string) => boolean",
    "loading": "boolean",
    "inputType": "\"text\" | \"textarea\"",
    "placeholder": "string",
    "rows": "number"
  },
  "r-image": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "string",
    "action": "string",
    "accept": "string",
    "multiple": "boolean",
    "separator": "string",
    "placeholder": "string",
    "buttonText": "string",
    "readonlyButtonText": "string",
    "clearable": "boolean"
  },
  "r-icon": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "string",
    "options": "unknown[]",
    "optionKey": "string",
    "optionLabelField": "string",
    "optionValueField": "string",
    "placeholder": "string",
    "clearable": "boolean",
    "filterable": "boolean",
    "classPrefix": "string"
  },
  "r-html-editor": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "string",
    "rows": "number"
  },
  "r-file-path": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "string",
    "action": "string",
    "accept": "string",
    "multiple": "boolean",
    "separator": "string",
    "placeholder": "string",
    "buttonText": "string",
    "readonlyButtonText": "string",
    "clearable": "boolean"
  },
  "r-file-browser": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "string",
    "accept": "string",
    "multiple": "boolean",
    "clearable": "boolean",
    "separator": "string",
    "placeholder": "string",
    "buttonText": "string"
  },
  "r-entity-picker": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "EntityPickerValue",
    "options": "unknown[]",
    "optionKey": "string",
    "optionLabelField": "string",
    "optionValueField": "string",
    "placeholder": "string",
    "buttonText": "string",
    "readonlyButtonText": "string",
    "clearable": "boolean",
    "multiple": "boolean",
    "searchable": "boolean",
    "separator": "string",
    "valueMode": "\"auto\" | \"array\" | \"comma-string\"",
    "entityName": "string"
  },
  "r-date": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "string | Date | (string | Date)[]",
    "dateType": "DatePickerType",
    "placeholder": "string",
    "startPlaceholder": "string",
    "endPlaceholder": "string",
    "rangeSeparator": "string",
    "format": "string",
    "valueFormat": "string",
    "clearable": "boolean",
    "filterMode": "string",
    "filterVariant": "string",
    "filterRange": "boolean"
  },
  "r-color": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "string"
  },
  "r-check-tag": {
    "checked": "boolean",
    "label": "string"
  },
  "r-checkbox-group": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "MultiValue",
    "options": "unknown[]",
    "optionKey": "string",
    "optionLabelField": "string",
    "optionValueField": "string",
    "buttonStyle": "boolean"
  },
  "r-checkbox": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "boolean",
    "checkedText": "string",
    "uncheckedText": "string",
    "checkboxText": "string"
  },
  "r-cascader": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "CascaderValue",
    "options": "unknown[]",
    "optionKey": "string",
    "optionLabelField": "string",
    "optionValueField": "string",
    "optionChildrenField": "string",
    "placeholder": "string",
    "clearable": "boolean",
    "filterable": "boolean",
    "multiple": "boolean",
    "checkStrictly": "boolean",
    "emitPath": "boolean"
  },
  "r-autocomplete": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "string",
    "placeholder": "string",
    "fetchSuggestions": "(queryString: string, cb: FetchSuggestionsCallback) => void",
    "triggerOnFocus": "boolean",
    "highlightFirstItem": "boolean",
    "clearable": "boolean",
    "valueKey": "string"
  },
  "nav-icon": {
    "name": "string | undefined",
    "size": "number | undefined"
  },
  "module-context-badge": {
    "label": "string",
    "emptyText": "string"
  },
  "icon-picker": {
    "modelValue": "string",
    "placeholder": "string",
    "width": "string | number"
  },
  "error-fallback": {
    "error": "Error"
  },
  "ai-chat-widget": {
    "mode": "ChatMode",
    "systemPrompt": "string",
    "title": "string",
    "placeholder": "string",
    "compact": "boolean"
  },
  "ai-chat-panel": {
    "embedded": "boolean",
    "forceOpen": "boolean"
  },
  "spark-component-renderer": {
    "parentContext": "ICapabilityContext"
  },
  "unregistered-node-fallback": {
    "title": "string",
    "description": "string"
  },
  "spark-json-editor": {
    "modelValue": "string",
    "readOnly": "boolean",
    "height": "string | number",
    "mode": "SparkJsonEditorMode",
    "indentation": "string | number",
    "tabSize": "number",
    "mainMenuBar": "boolean",
    "navigationBar": "boolean",
    "statusBar": "boolean",
    "askToFormat": "boolean",
    "schema": "SparkJsonSchema | null",
    "schemaDefinitions": "SparkJsonSchema | null",
    "enableSchemaValidation": "boolean",
    "enableSchemaEnumRenderer": "boolean"
  },
  "spark-code-editor": {
    "modelValue": "string",
    "language": "SparkCodeLanguage",
    "readOnly": "boolean",
    "height": "string | number",
    "tabSize": "number",
    "lineWrapping": "boolean"
  },
  "spark-child": {
    "nodeId": "string",
    "colSpan": "string | number",
    "rowSpan": "string | number"
  },
  "json-tree-editor": {
    "field": "string",
    "label": "string",
    "width": "number",
    "modelValue": "string",
    "documentValue": "JsonDocument | null",
    "height": "string | number",
    "readOnly": "boolean",
    "schema": "Record<string, unknown> | null",
    "filterPlaceholder": "string",
    "policy": "Partial<JsonTreePolicy>",
    "rootLabel": "string",
    "isProtected": "(path: JsonPath) => boolean",
    "canEditKey": "(path: JsonPath) => boolean",
    "canEditType": "(path: JsonPath) => boolean",
    "suggestChildKey": "(target: JsonObject, parentPath: JsonPath) => string",
    "createDefaultArrayItem": "(parentPath: JsonPath) => JsonValue",
    "createDefaultObjectValue": "(parentPath: JsonPath, key: string) => JsonValue"
  },
  "tree-node-summary": {
    "nameField": "string",
    "typeField": "string",
    "statusField": "string",
    "ownerField": "string",
    "metaField": "string",
    "extraField": "string",
    "showType": "boolean",
    "showStatus": "boolean",
    "showOwner": "boolean",
    "showMeta": "boolean",
    "showExtra": "boolean"
  },
  "r-context-renderer": {
    "displayLabel": "string | undefined",
    "label": "string | undefined",
    "fieldName": "string | undefined",
    "field": "string | undefined",
    "width": "string | number | undefined",
    "sortable": "boolean | \"custom\" | undefined",
    "filterable": "boolean | undefined",
    "minWidth": "string | number | undefined",
    "fixed": "boolean | \"left\" | \"right\" | undefined",
    "align": "TextAlign | undefined",
    "headerAlign": "TextAlign | undefined",
    "isCurrentFieldHidden": "boolean | undefined",
    "shouldRenderCurrentField": "boolean | undefined",
    "currentDisplayValue": "string | undefined",
    "isTableCellHidden": "((row: IDataRow) => boolean) | undefined",
    "getTableCellDisplayValue": "((row: IDataRow) => string) | undefined",
    "validationRules": "FormItemRule[] | undefined",
    "titleAlign": "TextAlign | undefined",
    "valueAlign": "TextAlign | undefined",
    "headerCellClassName": "string | undefined",
    "labelClassName": "string | undefined",
    "cellClassName": "string | undefined",
    "className": "string | undefined",
    "titleClassName": "string | undefined",
    "valueClassName": "string | undefined"
  },
  "display-timeline-item": {
    "timestamp": "string",
    "hideTimestamp": "boolean",
    "center": "boolean",
    "placement": "\"bottom\" | \"top\"",
    "itemType": "\"primary\" | \"success\" | \"warning\" | \"info\" | \"danger\"",
    "color": "string",
    "itemSize": "\"large\" | \"normal\"",
    "hollow": "boolean",
    "content": "string"
  },
  "display-skeleton": {
    "rows": "number",
    "count": "number",
    "loading": "boolean",
    "animated": "boolean",
    "throttle": "number"
  },
  "display-result": {
    "icon": "\"success\" | \"warning\" | \"info\" | \"error\"",
    "title": "string",
    "subTitle": "string"
  },
  "display-icon": {
    "icon": "string",
    "iconSize": "string | number",
    "color": "string"
  },
  "display-empty": {
    "image": "string",
    "imageSize": "number",
    "description": "string"
  },
  "display-descriptions-item": {
    "label": "string",
    "span": "number",
    "labelAlign": "\"center\" | \"left\" | \"right\"",
    "contentAlign": "\"center\" | \"left\" | \"right\"",
    "labelClassName": "string",
    "className": "string",
    "content": "string",
    "value": "unknown",
    "field": "string"
  },
  "display-descriptions": {
    "title": "string",
    "extra": "string",
    "border": "boolean",
    "column": "number",
    "direction": "\"horizontal\" | \"vertical\"",
    "descriptionsSize": "\"default\" | \"large\" | \"small\""
  },
  "display-countdown": {
    "value": "number | Date",
    "format": "string",
    "prefix": "string",
    "suffix": "string",
    "title": "string",
    "valueStyle": "CSSProperties"
  },
  "display-calendar": {
    "modelValue": "Date",
    "range": "[Date, Date]"
  },
  "display-breadcrumb-item": {
    "label": "string",
    "to": "string | Record<string, unknown>",
    "replace": "boolean"
  },
  "display-breadcrumb": {
    "separator": "string",
    "separatorIcon": "string"
  },
  "display-alert": {
    "title": "string",
    "description": "string",
    "alertType": "\"success\" | \"warning\" | \"info\" | \"error\"",
    "closable": "boolean",
    "closeText": "string",
    "center": "boolean",
    "showIcon": "boolean",
    "effect": "\"dark\" | \"light\""
  },
  "display-text": {
    "value": "unknown",
    "field": "string",
    "tag": "string",
    "prefix": "string",
    "suffix": "string",
    "format": "\"number\" | \"date\" | \"currency\" | \"percent\"",
    "precision": "number",
    "placeholder": "string",
    "textClass": "string",
    "textStyle": "string | Record<string, string>"
  },
  "display-tag": {
    "content": "string",
    "value": "string",
    "field": "string",
    "tagType": "\"\" | \"success\" | \"warning\" | \"info\" | \"danger\"",
    "closable": "boolean",
    "disableTransitions": "boolean",
    "hit": "boolean",
    "round": "boolean",
    "color": "string",
    "size": "\"default\" | \"large\" | \"small\"",
    "effect": "\"dark\" | \"light\" | \"plain\""
  },
  "display-statistic": {
    "title": "string",
    "value": "string | number",
    "dataKey": "string",
    "field": "string",
    "precision": "number",
    "decimalSeparator": "string",
    "groupSeparator": "string",
    "prefix": "string",
    "suffix": "string",
    "valueStyle": "string | Record<string, string>"
  },
  "display-progress": {
    "percentage": "number",
    "value": "number",
    "field": "string",
    "progressType": "\"circle\" | \"line\" | \"dashboard\"",
    "strokeWidth": "number",
    "textInside": "boolean",
    "status": "\"success\" | \"warning\" | \"exception\"",
    "indeterminate": "boolean",
    "duration": "number",
    "color": "ProgressColor",
    "circleWidth": "number",
    "showText": "boolean",
    "strokeLinecap": "\"round\" | \"butt\" | \"square\"",
    "formatText": "string"
  },
  "display-pagination": {
    "total": "number",
    "pageSize": "number",
    "currentPage": "number",
    "pageSizes": "number[]",
    "pagerCount": "number",
    "layout": "string",
    "background": "boolean",
    "small": "boolean",
    "hideOnSinglePage": "boolean"
  },
  "display-image": {
    "src": "string",
    "field": "string",
    "value": "string",
    "fit": "\"fill\" | \"none\" | \"cover\" | \"contain\" | \"scale-down\"",
    "alt": "string",
    "lazy": "boolean",
    "previewSrcList": "string[]",
    "previewField": "string",
    "initialIndex": "number",
    "zIndex": "number",
    "hideOnClickModal": "boolean",
    "previewTeleported": "boolean",
    "closeOnPressEscape": "boolean",
    "width": "string | number",
    "height": "string | number"
  },
  "display-badge": {
    "badgeValue": "string | number",
    "value": "string | number",
    "field": "string",
    "max": "number",
    "isDot": "boolean",
    "hiddenBadge": "boolean",
    "badgeType": "\"\" | \"primary\" | \"success\" | \"warning\" | \"info\" | \"danger\"",
    "showZero": "boolean",
    "color": "string",
    "offset": "[number, number]",
    "badgeStyle": "Record<string, string>",
    "badgeClass": "string"
  },
  "display-avatar": {
    "avatarSize": "number | \"default\" | \"large\" | \"small\"",
    "shape": "\"circle\" | \"square\"",
    "src": "string",
    "value": "string",
    "field": "string",
    "srcSet": "string",
    "alt": "string",
    "fit": "\"fill\" | \"none\" | \"cover\" | \"contain\" | \"scale-down\"",
    "text": "string",
    "icon": "string"
  },
  "builtin-action-button": {
    "builtinAction": "string",
    "label": "string",
    "buttonType": "string",
    "buttonSize": "string",
    "buttonPlain": "boolean",
    "buttonText": "boolean",
    "buttonLink": "boolean",
    "buttonClass": "string",
    "buttonDisabled": "boolean",
    "disabled": "boolean",
    "disabledWhenRow": "Record<string, unknown>",
    "row": "IDataRow",
    "rowIndex": "number",
    "data": "unknown",
    "dataSource": "unknown"
  },
  "dock-tail": {
    "width": "string | number"
  },
  "dock-header": {
    "width": "string | number"
  },
  "dock-footer": {
    "width": "string | number"
  },
  "dock-filter": {
    "columns": "(string | DockFilterItem)[]",
    "collapsible": "boolean",
    "defaultCollapsed": "boolean",
    "autoFitMinWidth": "string",
    "itemSpan": "number",
    "gridColumns": "number",
    "gridGap": "string | number",
    "gridAutoRows": "string"
  },
  "dock-editor": {
    "position": "\"bottom\" | \"left\" | \"right\" | \"top\"",
    "width": "string | number"
  },
  "dock-actions": {
    "position": "\"left\" | \"right\"",
    "label": "string",
    "width": "string | number",
    "align": "\"center\" | \"left\" | \"right\"",
    "fixed": "boolean | \"left\" | \"right\""
  }
}

/** 各组件各属性的描述文本（仅含有描述的属性） */
export const COMPONENT_PROP_DESCRIPTIONS: Record<string, Record<string, string>> = {
  "r-table": {
    "dataKey": "DataKey 格式：tableName@field",
    "actions": "结构化行动作 dock"
  },
  "r-form": {
    "dataKey": "数据绑定键，如 \"Users@currentRow\"",
    "labelWidth": "表单标签宽度",
    "gridColumns": "CSS Grid 列数",
    "gridGap": "栅格间距",
    "gridAutoRows": "栅格行高"
  },
  "r-detail": {
    "dataKey": "数据绑定键",
    "gridColumns": "CSS Grid 列数",
    "gridGap": "栅格间距",
    "gridAutoRows": "栅格行高",
    "titleAlign": "标题对齐",
    "valueAlign": "值对齐"
  },
  "r-tree": {
    "dataKey": "数据绑定键，如 \"TreeData@rows\"",
    "actions": "结构化节点动作 dock",
    "editor": "结构化编辑区 dock",
    "nodeKey": "节点主键字段名，默认取 treeConfig.idField",
    "currentKey": "当前选中节点 ID",
    "expandToKey": "初始化展开并定位到目标节点 ID",
    "expandLevel": "初始化自动展开到指定层级（根节点为第 1 层）",
    "allowAppend": "允许追加子节点（自动生成追加按钮）",
    "allowDelete": "允许删除节点（自动生成删除按钮）"
  },
  "r-list": {
    "dataKey": "数据绑定键",
    "actions": "结构化列表项动作 dock",
    "columns": "列数",
    "gap": "列表项间距",
    "minItemWidth": "最小项宽度",
    "rowKey": "行唯一键字段",
    "emptyText": "空数据提示文案",
    "itemClass": "列表项 CSS 类名",
    "itemStyle": "列表项行内样式",
    "useCard": "使用卡片包裹",
    "cardShadow": "卡片阴影模式",
    "gridColumns": "CSS Grid 列数",
    "gridGap": "栅格间距",
    "gridAutoRows": "栅格行高",
    "itemColSpan": "项跨列数",
    "itemRowSpan": "项跨行数"
  },
  "r-tabs": {
    "modelValue": "当前激活标签页"
  },
  "r-collapse": {
    "modelValue": "当前展开的面板"
  },
  "r-steps": {
    "modelValue": "当前步骤"
  },
  "r-dialog": {
    "header": "结构化头部 dock",
    "footer": "结构化底部 dock",
    "title": "对话框标题",
    "modelValue": "控制显隐（v-model）",
    "bodyClass": "内容区 CSS 类名",
    "gridColumns": "CSS Grid 列数",
    "gridGap": "栅格间距",
    "gridAutoRows": "栅格行高"
  },
  "r-drawer": {
    "header": "结构化头部 dock",
    "footer": "结构化底部 dock",
    "title": "抽屉标题",
    "modelValue": "控制显隐（v-model）",
    "bodyClass": "内容区 CSS 类名",
    "gridColumns": "CSS Grid 列数",
    "gridGap": "栅格间距",
    "gridAutoRows": "栅格行高"
  },
  "r-section": {
    "header": "结构化头部 dock",
    "title": "分区标题",
    "description": "分区描述",
    "collapsible": "是否可折叠",
    "defaultCollapsed": "默认折叠",
    "bordered": "显示边框",
    "useCard": "使用卡片样式",
    "cardShadow": "卡片阴影模式",
    "bodyClass": "内容区 CSS 类名",
    "expandText": "展开文案",
    "collapseText": "收起文案",
    "showToggleIcon": "显示切换图标",
    "expandIconText": "展开图标文案",
    "collapseIconText": "收起图标文案",
    "gridColumns": "CSS Grid 列数",
    "gridGap": "栅格间距",
    "gridAutoRows": "栅格行高"
  },
  "r-tour": {
    "steps": "步骤配置列表",
    "open": "是否显示",
    "placement": "弹出位置（默认）",
    "showArrow": "是否显示箭头",
    "mask": "是否显示遮罩",
    "tourType": "引导类型",
    "closeOnPressEscape": "ESC 关闭",
    "scrollIntoViewOptions": "滚动选项"
  },
  "r-toolbar": {
    "tail": "结构化尾区 dock",
    "gap": "单个子项之间的间距（同一区域内部）",
    "zoneGap": "主区与尾区之间的间距（区域级）",
    "align": "区域内部子项的交叉轴对齐",
    "justify": "主区内部子项的主轴分布方式"
  },
  "r-anchor-link": {
    "href": "锚点链接",
    "title": "链接标题"
  },
  "r-anchor": {
    "container": "滚动容器选择器",
    "offset": "偏移量",
    "bound": "边界值",
    "duration": "滚动动画时长",
    "marker": "是否显示标记",
    "direction": "排列方向",
    "anchorType": "锚点类型（避免与 SparkNode.type 冲突）"
  },
  "r-upload": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值（文件路径）",
    "action": "上传 URL",
    "accept": "接受文件类型",
    "buttonText": "上传按钮文案",
    "autoUpload": "自动上传",
    "showFileList": "显示文件列表",
    "limit": "最大文件数",
    "listType": "列表展示类型",
    "separator": "多文件分隔符",
    "placeholder": "占位提示",
    "readonlyButtonText": "只读模式按钮文案"
  },
  "r-tree-select": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值",
    "options": "树形选项（嵌套结构）",
    "optionKey": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项",
    "optionLabelField": "选项标签字段",
    "optionValueField": "选项值字段",
    "optionChildrenField": "子节点字段",
    "placeholder": "占位提示",
    "clearable": "可清除",
    "filterable": "可搜索",
    "multiple": "多选模式",
    "checkStrictly": "父子不关联勾选",
    "defaultExpandAll": "默认展开所有节点",
    "renderAfterExpand": "展开后才渲染子节点"
  },
  "r-transfer": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值（已选值数组）",
    "options": "数据源（左侧候选列表）",
    "optionKey": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项",
    "optionLabelField": "选项标签字段",
    "optionValueField": "选项值字段",
    "titles": "左右面板标题",
    "filterable": "可搜索",
    "filterPlaceholder": "搜索框占位符",
    "targetOrder": "右侧排序方式"
  },
  "r-time-select": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值",
    "placeholder": "占位文本",
    "start": "起始时间",
    "end": "结束时间",
    "step": "时间间隔步长",
    "minTime": "最小可选时间",
    "maxTime": "最大可选时间",
    "clearable": "可清空"
  },
  "r-time-picker": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值",
    "placeholder": "占位文本",
    "isRange": "是否为范围选择",
    "rangeSeparator": "范围分隔符",
    "startPlaceholder": "范围开始占位",
    "endPlaceholder": "范围结束占位",
    "arrowControl": "箭头控制",
    "format": "时间格式",
    "clearable": "可清空"
  },
  "r-textarea": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值",
    "rows": "行数",
    "autosize": "自适应高度",
    "maxlength": "最大长度",
    "showWordLimit": "显示字数统计",
    "placeholder": "占位提示"
  },
  "r-text": {
    "field": "字段绑定名，映射到 DataView 行字段",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值"
  },
  "r-switch": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值",
    "activeText": "激活时文案",
    "inactiveText": "未激活时文案"
  },
  "r-slider": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值",
    "min": "最小值",
    "max": "最大值",
    "step": "步长",
    "showInput": "显示输入框"
  },
  "r-select": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值",
    "options": "选项列表",
    "optionKey": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项",
    "optionLabelField": "选项标签字段",
    "optionValueField": "选项值字段",
    "placeholder": "占位提示",
    "clearable": "可清除",
    "filterable": "可搜索"
  },
  "r-segmented": {
    "modelValue": "当前选中值",
    "options": "选项列表",
    "size": "尺寸",
    "block": "是否撑满父容器"
  },
  "r-rate": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值",
    "max": "最大值",
    "allowHalf": "允许半星"
  },
  "r-radio": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值",
    "options": "选项列表",
    "optionKey": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项",
    "optionLabelField": "选项标签字段",
    "optionValueField": "选项值字段",
    "buttonStyle": "按钮风格"
  },
  "r-number": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值，范围模式时为元组",
    "min": "最小值",
    "max": "最大值",
    "precision": "小数精度",
    "filterMode": "筛选模式（'range' 启用范围输入）",
    "filterVariant": "筛选变体",
    "filterRange": "范围筛选标记"
  },
  "r-multi-select": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值（数组）",
    "options": "选项列表",
    "optionKey": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项",
    "optionLabelField": "选项标签字段",
    "optionValueField": "选项值字段",
    "placeholder": "占位提示",
    "clearable": "可清除",
    "filterable": "可搜索",
    "collapseTags": "折叠已选标签",
    "collapseTagsTooltip": "折叠标签提示",
    "maxCollapseTags": "最大显示标签数"
  },
  "r-mention": {
    "modelValue": "文本内容",
    "options": "选项列表",
    "prefix": "触发前缀字符",
    "split": "分隔符",
    "filterOption": "自定义过滤",
    "placement": "弹出位置",
    "showArrow": "显示箭头",
    "offset": "偏移量",
    "whole": "匹配整体",
    "checkIsWhole": "校验整体函数",
    "loading": "加载状态",
    "inputType": "输入类型",
    "placeholder": "占位提示",
    "rows": "textarea 行数"
  },
  "r-image": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值（图片路径）",
    "action": "上传 URL",
    "accept": "接受文件类型",
    "multiple": "多选",
    "separator": "多图分隔符",
    "placeholder": "占位提示",
    "buttonText": "上传按钮文案",
    "readonlyButtonText": "只读模式按钮文案",
    "clearable": "可清除"
  },
  "r-icon": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值（图标名）",
    "options": "图标选项列表",
    "optionKey": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项",
    "optionLabelField": "选项标签字段",
    "optionValueField": "选项值字段",
    "placeholder": "占位提示",
    "clearable": "可清除",
    "filterable": "可搜索",
    "classPrefix": "图标 CSS 类名前缀"
  },
  "r-html-editor": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值（HTML 字符串）",
    "rows": "编辑器高度行数"
  },
  "r-file-path": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值（文件路径）",
    "action": "上传 URL",
    "accept": "接受文件类型",
    "multiple": "多选",
    "separator": "多文件分隔符",
    "placeholder": "占位提示",
    "buttonText": "上传按钮文案",
    "readonlyButtonText": "只读模式按钮文案",
    "clearable": "可清除"
  },
  "r-file-browser": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值（文件路径）",
    "accept": "接受文件类型",
    "multiple": "多选",
    "clearable": "可清除",
    "separator": "多文件分隔符",
    "placeholder": "占位提示",
    "buttonText": "上传按钮文案"
  },
  "r-entity-picker": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值",
    "options": "选项列表",
    "optionKey": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项",
    "optionLabelField": "选项标签字段",
    "optionValueField": "选项值字段",
    "placeholder": "占位提示",
    "buttonText": "选择按钮文案",
    "readonlyButtonText": "只读模式按钮文案",
    "clearable": "可清除",
    "multiple": "多选",
    "searchable": "可搜索",
    "separator": "多值分隔符",
    "valueMode": "值模式",
    "entityName": "实体名称"
  },
  "r-date": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值，日期范围时为数组",
    "dateType": "日期选择器类型",
    "placeholder": "占位文本",
    "startPlaceholder": "范围开始占位",
    "endPlaceholder": "范围结束占位",
    "rangeSeparator": "范围分隔符",
    "format": "显示格式",
    "valueFormat": "值格式",
    "clearable": "可清空",
    "filterMode": "筛选模式",
    "filterVariant": "筛选变体",
    "filterRange": "范围筛选标记"
  },
  "r-color": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值（颜色字符串，透传 el-color-picker）"
  },
  "r-check-tag": {
    "checked": "是否选中",
    "label": "标签文本"
  },
  "r-checkbox-group": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值（数组）",
    "options": "选项列表",
    "optionKey": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项",
    "optionLabelField": "选项标签字段",
    "optionValueField": "选项值字段",
    "buttonStyle": "按钮风格"
  },
  "r-checkbox": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值",
    "checkedText": "选中时显示文案",
    "uncheckedText": "未选时显示文案",
    "checkboxText": "复选框右侧文案"
  },
  "r-cascader": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值",
    "options": "树形选项（嵌套结构）",
    "optionKey": "选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项",
    "optionLabelField": "选项标签字段",
    "optionValueField": "选项值字段",
    "optionChildrenField": "子节点字段",
    "placeholder": "占位提示",
    "clearable": "可清除",
    "filterable": "可搜索",
    "multiple": "多选模式",
    "checkStrictly": "父子不关联勾选",
    "emitPath": "值是否为完整路径数组"
  },
  "r-autocomplete": {
    "field": "字段绑定名",
    "label": "显示标签",
    "width": "r-table 内列宽",
    "modelValue": "双向绑定值",
    "placeholder": "占位文本",
    "fetchSuggestions": "获取建议的回调函数",
    "triggerOnFocus": "聚焦时是否触发建议",
    "highlightFirstItem": "高亮第一项",
    "clearable": "可清空",
    "valueKey": "建议项的取值键"
  },
  "error-fallback": {
    "error": "错误对象\r\n包含错误消息（message）和堆栈信息（stack）"
  },
  "spark-component-renderer": {
    "parentContext": "显式父上下文（可选）。\r\n\r\n仅用于根节点 / 测试场景：将其挂到当前 renderer 实例，子业务组件沿父实例链自动发现。\r\n普通递归渲染无需传递，子组件继承已有的 SparkContext 结构树。"
  },
  "json-tree-editor": {
    "field": "字段绑定名，映射到 DataView 行字段",
    "label": "显示标签",
    "width": "r-table 内列宽"
  },
  "r-context-renderer": {
    "displayLabel": "显示标签",
    "label": "直接传入的标签（供 r-column-group 直连使用）",
    "fieldName": "字段绑定名",
    "field": "直接传入的字段名（供裸列节点使用）",
    "width": "列宽",
    "sortable": "Element Plus 表格列排序能力",
    "filterable": "表格字段是否可参与过滤区生成；由上层容器消费，此处仅声明避免 fallthrough warning",
    "minWidth": "最小列宽",
    "fixed": "固定列方向",
    "align": "列对齐",
    "headerAlign": "表头对齐",
    "isCurrentFieldHidden": "当前字段是否隐藏",
    "shouldRenderCurrentField": "当前宿主下字段是否应渲染",
    "currentDisplayValue": "当前显示值",
    "isTableCellHidden": "表格行级隐藏判断",
    "getTableCellDisplayValue": "表格行级显示值获取",
    "validationRules": "表单验证规则",
    "titleAlign": "标题对齐（table/detail）",
    "valueAlign": "值对齐（table/detail）",
    "headerCellClassName": "表头 class（table）",
    "labelClassName": "兼容直接传入的列头 class",
    "cellClassName": "单元格 class（table）",
    "className": "兼容直接传入的列 class",
    "titleClassName": "标题 class（detail）",
    "valueClassName": "值 class（detail/table value）"
  },
  "display-icon": {
    "icon": "图标名称（Element Plus 图标名，如 'Edit', 'Delete', 'Search'）",
    "iconSize": "图标大小",
    "color": "图标颜色"
  },
  "display-countdown": {
    "value": "目标时间（时间戳或 Date）",
    "format": "格式化字符串，如 HH:mm:ss",
    "prefix": "前缀文本",
    "suffix": "后缀文本",
    "title": "标题",
    "valueStyle": "值样式"
  },
  "display-calendar": {
    "modelValue": "当前日期",
    "range": "日期范围 [start, end]"
  },
  "display-image": {
    "src": "图片 URL（静态传入）",
    "field": "字段名（从当前行读取 URL）",
    "value": "静态值",
    "fit": "图片适应模式",
    "alt": "替代文本",
    "lazy": "是否懒加载",
    "previewSrcList": "预览图列表（静态传入）",
    "previewField": "预览图字段名（从当前行读取数组）",
    "initialIndex": "初始预览索引",
    "zIndex": "预览层级",
    "hideOnClickModal": "点击蒙层关闭预览",
    "previewTeleported": "预览传送至 body",
    "closeOnPressEscape": "ESC 关闭预览",
    "width": "图片宽度",
    "height": "图片高度"
  },
  "dock-tail": {
    "width": "尾区宽度"
  },
  "dock-header": {
    "width": "区域宽度"
  },
  "dock-footer": {
    "width": "区域宽度"
  },
  "dock-filter": {
    "columns": "筛选列",
    "collapsible": "是否可折叠",
    "defaultCollapsed": "默认折叠",
    "autoFitMinWidth": "自适应最小宽度",
    "itemSpan": "单项跨列数",
    "gridColumns": "网格列数",
    "gridGap": "网格间距",
    "gridAutoRows": "网格行高"
  },
  "dock-editor": {
    "position": "编辑区位置",
    "width": "编辑区宽度"
  },
  "dock-actions": {
    "position": "操作列位置",
    "label": "列标题",
    "width": "列宽",
    "align": "对齐方式",
    "fixed": "固定列"
  }
}

/** 组件嵌套规则（哪些组件内可放哪些子组件类型） */
export const COMPONENT_NESTING_RULES: Record<string, {
  allowedChildren: string[]
  forbiddenChildren?: string[]
  note?: string
}> = {
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

/** 每个组件的完整 props API 规格（name / type / required / default / description） */
export const COMPONENT_API: Record<string, Array<{
  name: string
  type: string
  required: boolean
  default?: string
  description?: string
}>> = {
  "context-aware-fields-api": [],
  "builtin-action": [
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
  "r-table": [
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
      "name": "on.rowDblclick",
      "type": "string",
      "required": false,
      "description": "行双击（→ script.js 函数名）"
    }
  ],
  "r-form": [
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
  "r-detail": [
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
  "r-tree": [
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
  "r-list": [
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
  "r-tabs": [
    {
      "name": "modelValue",
      "type": "string | number",
      "required": false,
      "description": "当前激活标签页"
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
  "r-collapse": [
    {
      "name": "modelValue",
      "type": "CollapseValue",
      "required": false,
      "description": "当前展开的面板"
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
  "r-steps": [
    {
      "name": "modelValue",
      "type": "string | number",
      "required": false,
      "description": "当前步骤"
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
  "r-dialog": [
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
  "r-drawer": [
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
  "r-section": [
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
      "name": "props.docks.header.class",
      "type": "string",
      "required": false,
      "description": "头部 CSS 类名"
    }
  ],
  "r-block": [
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
  "r-user-picker": [
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
  "r-dept-picker": [
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
  "r-product-picker": [
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
  "r-tour": [
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
    }
  ],
  "r-tooltip": [
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
    }
  ],
  "r-toolbar": [
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
    }
  ],
  "r-tab-pane": [
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
  ],
  "r-step-item": [
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
  "r-space": [
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
    }
  ],
  "r-popover": [
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
    }
  ],
  "r-popconfirm": [
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
    }
  ],
  "r-page-header": [
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
    }
  ],
  "r-link": [
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
    }
  ],
  "r-dropdown": [
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
    }
  ],
  "r-divider": [
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
    }
  ],
  "r-collapse-item": [
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
  ],
  "r-card": [
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
    }
  ],
  "r-button": [
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
    }
  ],
  "r-anchor-link": [
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
    }
  ],
  "r-anchor": [
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
    }
  ],
  "r-upload": [
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
    }
  ],
  "r-tree-select": [
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
    }
  ],
  "r-transfer": [
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
    }
  ],
  "r-time-select": [
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
    }
  ],
  "r-time-picker": [
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
    }
  ],
  "r-textarea": [
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
    }
  ],
  "r-text": [
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
    }
  ],
  "r-switch": [
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
    }
  ],
  "r-slider": [
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
    }
  ],
  "r-select": [
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
    }
  ],
  "r-segmented": [
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
    }
  ],
  "r-rate": [
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
    }
  ],
  "r-radio": [
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
    }
  ],
  "r-number": [
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
    }
  ],
  "r-multi-select": [
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
    }
  ],
  "r-mention": [
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
    }
  ],
  "r-image": [
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
    }
  ],
  "r-icon": [
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
    }
  ],
  "r-html-editor": [
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
    }
  ],
  "r-file-path": [
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
    }
  ],
  "r-file-browser": [
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
    }
  ],
  "r-entity-picker": [
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
    }
  ],
  "r-date": [
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
    }
  ],
  "r-color": [
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
    }
  ],
  "r-check-tag": [
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
    }
  ],
  "r-checkbox-group": [
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
    }
  ],
  "r-checkbox": [
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
    }
  ],
  "r-cascader": [
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
    }
  ],
  "r-autocomplete": [
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
    }
  ],
  "nav-icon": [
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
  ],
  "module-context-badge": [
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
  ],
  "icon-picker": [
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
  "error-fallback": [
    {
      "name": "error",
      "type": "Error",
      "required": false,
      "description": "错误对象\r\n包含错误消息（message）和堆栈信息（stack）"
    }
  ],
  "ai-chat-widget": [
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
  ],
  "ai-chat-panel": [
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
  ],
  "ai-assistant-hub": [],
  "tenant-config": [],
  "settings": [],
  "cache-manager": [],
  "app-list": [],
  "login-view": [],
  "home-page": [],
  "about": [],
  "template-dsl-demo": [],
  "rform-compare-demo": [],
  "dashboard": [],
  "custom-rtable-demo": [],
  "capability-demo": [],
  "dev-system": [],
  "ai-studio-panel": [],
  "spark-component-renderer": [
    {
      "name": "parentContext",
      "type": "ICapabilityContext",
      "required": false,
      "description": "显式父上下文（可选）。\r\n\r\n仅用于根节点 / 测试场景：将其挂到当前 renderer 实例，子业务组件沿父实例链自动发现。\r\n普通递归渲染无需传递，子组件继承已有的 SparkContext 结构树。"
    }
  ],
  "unregistered-node-fallback": [
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
  ],
  "spark-json-editor": [
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
  "spark-code-editor": [
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
  "spark-child": [
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
  ],
  "json-tree-editor": [
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
    }
  ],
  "tree-node-summary": [
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
    }
  ],
  "r-context-renderer": [
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
    }
  ],
  "display-timeline-item": [
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
    }
  ],
  "display-timeline": [],
  "display-skeleton": [
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
    }
  ],
  "display-result": [
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
    }
  ],
  "display-icon": [
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
    }
  ],
  "display-empty": [
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
    }
  ],
  "display-descriptions-item": [
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
    }
  ],
  "display-descriptions": [
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
    }
  ],
  "display-countdown": [
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
    }
  ],
  "display-calendar": [
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
    }
  ],
  "display-breadcrumb-item": [
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
    }
  ],
  "display-breadcrumb": [
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
    }
  ],
  "display-alert": [
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
    }
  ],
  "display-text": [
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
    }
  ],
  "display-tag": [
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
    }
  ],
  "display-statistic": [
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
    }
  ],
  "display-progress": [
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
    }
  ],
  "display-pagination": [
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
    }
  ],
  "display-image": [
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
    }
  ],
  "display-badge": [
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
    }
  ],
  "display-avatar": [
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
    }
  ],
  "builtin-action-button": [
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
    }
  ],
  "dock-tail": [
    {
      "name": "width",
      "type": "string | number",
      "required": false,
      "description": "尾区宽度"
    }
  ],
  "dock-header": [
    {
      "name": "width",
      "type": "string | number",
      "required": false,
      "description": "区域宽度"
    }
  ],
  "dock-footer": [
    {
      "name": "width",
      "type": "string | number",
      "required": false,
      "description": "区域宽度"
    }
  ],
  "dock-filter": [
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
  ],
  "dock-editor": [
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
  ],
  "dock-actions": [
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
  ],
  "r-column-group": []
}
