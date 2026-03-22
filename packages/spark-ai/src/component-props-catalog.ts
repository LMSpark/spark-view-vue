/**
 * SPARK 组件 Props 目录
 *
 * ⚠️ 自动生成 — 请勿手动编辑
 *
 * 由 vite-plugin-spark-catalog 在 build / dev 时生成。
 * 数据来源：Vue SFC Props JSDoc（AST 提取）+ supplement.ts（手工补充）
 *
 * 重新生成：pnpm run dev 或 pnpm run build
 * 生成时间：2026-03-22T10:18:38.766Z
 * 条目数量：43（AST 字段: 26, 手工容器/概念: 17）
 */
import type { ComponentCatalog } from './catalog-types'

/**
 * 结构化组件目录（SSoT）
 *
 * 由 json-catalog-generator 构建，包含完整的 Props 类型、Emits、能力链、平台约束等。
 * design-session / design-prompt 优先从此对象查询，扁平 COMPONENT_PROPS_CATALOG 保留向后兼容。
 */
export const COMPONENT_CATALOG: ComponentCatalog = {
  "version": "2.0.0",
  "buildTime": "2026-03-22T10:18:38.727Z",
  "componentCount": 43,
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
      "r-color",
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
      "r-switch",
      "r-text",
      "r-textarea",
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
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "**context-aware-fields-api** — 语境感知字段渲染能力总览\n\n【核心能力】\n- 子组件渲染由父容器语境决定：r-table(table) / r-form(form) / r-detail(detail) / r-list(list) / r-tree(tree)\n- 同一 r-* 字段组件可跨语境复用，不复制多套组件\n- 字段组件必须处于容器 children 中，禁止顶层裸放（会丢失语境）\n\n【关键约束】\n- r-table children 仅放 r-* 字段组件，禁止 el-table-column\n- 事件逻辑优先用根级 on + script.js 函数，不在组件层硬编码父级判断\n- 字段绑定用根级 field\n\n【建议组合查询】\n- r-table, r-form, r-detail, r-text, r-number, r-select, builtin-action",
      "source": "override"
    },
    "builtin-action": {
      "type": "builtin-action",
      "category": "meta",
      "description": "声明式动作节点（零代码优先）",
      "props": [],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "**builtin-action** — 声明式动作节点（零代码优先）\n\n【节点形态】\ntype: \"builtin-action\"\nprops.builtinAction: string — 动作类型\nprops.label?: string — 按钮文案\nprops.type?: 'primary'|'success'|'warning'|'danger'|'info'\nprops.confirmTitle?: string — 删除类动作确认标题\nprops.confirmMessage?: string — 删除类动作确认文案\nprops.silent?: boolean — true 时关闭默认消息提示\n\n【常用动作】\nappend-row | refresh | patch-row | patch-current | patch-selected | delete-row | delete-selected | message-row\n\n【放置位置】\n- toolbar.items（工具栏动作）\n- actions.items（行内动作）\n\n适用于 r-table / r-list / r-form / r-detail 的常见 CRUD 场景",
      "source": "override"
    },
    "r-table": {
      "type": "r-table",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-table\" 组织子组件。",
      "props": [],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
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
          "name": "filter.gridAutoRows",
          "type": "string",
          "description": "行高，默认 'minmax(32px, auto)'"
        },
        {
          "name": "toolbar.items",
          "type": "SparkNode[]",
          "description": "工具栏按钮（优先 builtin-action，其次 Render*）"
        },
        {
          "name": "actions.items",
          "type": "SparkNode[]",
          "description": "行操作按钮（优先 builtin-action）"
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
          "name": "actions.class",
          "type": "string",
          "description": "操作列 CSS 类名"
        }
      ],
      "notes": "**r-table** — 数据表格容器\n\n【props — 透传到 el-table】\nborder: boolean — 边框\nstripe: boolean — 斑马纹\nhighlightCurrentRow: boolean — 当前行高亮（⚠️ 必须显式声明才生效）\nheight / maxHeight: string | number — 表格高度\nstyle: object — 行内样式\nclass: string — CSS 类名\n\n【根级字段 — 数据绑定】\ndataKey: string — 数据绑定键，如 \"Users@rows\"（根级）\n\n【根级字段 — 事件绑定】\non.rowDblclick: string — 行双击（→ script.js 函数名）\n（其他组件事件同理，key 为 camelCase 事件名）\n\n【根级字段 — filter 筛选配置】\nfilter.columns: Array<string | FilterItem> — 筛选项列表\n  字符串简写：\"fieldName\" 等价于 { field: \"fieldName\", component: \"text\" }\n  完整 FilterItem：{ field, label?, component?, options?, logic?, span?, props? }\n  component 内置值：text | select | date | date-range | number | number-range | checkbox | radio\nfilter.collapsible: boolean — 可折叠，默认 false\nfilter.defaultCollapsed: boolean — 默认折叠，默认 false\nfilter.autoFitMinWidth: string — 最小宽度，默认 '220px'\nfilter.class: string — 筛选区 CSS 类名\nfilter.itemSpan: number — 每项跨列数，默认 1\nfilter.gridColumns: number — 栅格总列数，默认 24\nfilter.gridGap: number | string — 间距，默认 12\nfilter.gridAutoRows: string — 行高，默认 'minmax(32px, auto)'\n\n【根级字段 — toolbar 工具栏】\ntoolbar.items: SparkNode[] — 工具栏按钮（优先 builtin-action，其次 Render*）\ntoolbar.position: 'top' | 'bottom' — 默认 'top'\n\n【根级字段 — actions 行操作列】\nactions.items: SparkNode[] — 行操作按钮（优先 builtin-action）\nactions.position: 'left' | 'right' — 默认 'right'\nactions.label: string — 操作列标题，默认 '操作'\nactions.width: number — 操作列宽度，默认 160\nactions.align: 'left' | 'center' | 'right' — 默认 'left'\nactions.fixed: boolean | 'left' | 'right' — 固定方向\nactions.class: string — 操作列 CSS 类名\n\n【能力链】\nconsumes: PAGE_DATASET, PAGE_SERVICE, PAGE_COMPONENT_REGISTRY, MODULE_CONTEXT\nprovides: DATA_SOURCE, TABLE_API, FIELD_CONTEXT\n\nchildren 内仅用 r-* 字段组件做列，禁止 el-table-column",
      "source": "override"
    },
    "r-form": {
      "type": "r-form",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-form\" 组织子组件。",
      "props": [],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "**r-form** — 数据表单容器（读写 currentRow）\ndataKey: string — 数据绑定键，如 \"Users@currentRow\"\ntoolbar: Rule[] — 工具栏\ntoolbarPosition: 'top' | 'bottom' — 默认 'top'\ntoolbarClass: string — 工具栏 CSS 类名\nlabelWidth: string — 标签宽度，默认 '100px'\ngridColumns: number — CSS Grid 列数，默认 24\ngridGap: number | string — 栅格间距，默认 0\ngridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'\n\n【能力链】\nconsumes: PAGE_DATASET\nprovides: DATA_SOURCE, FIELD_CONTEXT, CONTEXT_DATA\n\nchildren 内放 r-* 字段组件",
      "source": "override"
    },
    "r-detail": {
      "type": "r-detail",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-detail\" 组织子组件。",
      "props": [],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "**r-detail** — 只读详情容器（展示 currentRow）\ndataKey: string — 数据绑定键\ntoolbar: Rule[] — 工具栏\ntoolbarPosition: 'top' | 'bottom' — 默认 'top'\ntoolbarClass: string — 工具栏 CSS 类名\ngridColumns: number — CSS Grid 列数，默认 24\ngridGap: number | string — 栅格间距，默认 0\ngridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'\n\n【能力链】\nconsumes: PAGE_DATASET\nprovides: DATA_SOURCE, FIELD_CONTEXT, CONTEXT_DATA\n\nchildren 内放 r-* 字段组件（只读模式）",
      "source": "override"
    },
    "r-tree": {
      "type": "r-tree",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-tree\" 组织子组件。",
      "props": [],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "**r-tree** — 树形组件容器\ndataKey: string — 数据绑定键，如 \"TreeData@rows\"\ndata: TreeNode[] — 静态数据（优先用 dataKey）\ndataSource: IDataSource | DataView — 动态数据源\ntoolbar: Rule[] — 工具栏\ntoolbarPosition: 'top' | 'bottom' — 工具栏位置\nnodeActions: Rule[] — 节点操作区\nnodeActionsPosition: string — 节点操作位置\nnodeActionsClass: string — 节点操作区 CSS 类名\nonNodeClick: string — script.js 函数名\nonNodeExpand: string — 节点展开回调\nonNodeCollapse: string — 节点折叠回调\n其他 props 透传到 el-tree（node-key, default-expand-all, show-checkbox 等）\n\n【能力链】\nconsumes: PAGE_DATASET\nprovides: DATA_SOURCE, FIELD_CONTEXT, CONTEXT_DATA",
      "source": "override"
    },
    "r-list": {
      "type": "r-list",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-list\" 组织子组件。",
      "props": [],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "**r-list** — 列表容器\ndataKey: string — 数据绑定键\ntoolbar: Rule[] — 工具栏\ntoolbarPosition: 'top' | 'bottom' — 默认 'top'\ntoolbarClass: string — 工具栏 CSS 类名\nitemActions: Rule[] — 列表项操作区\nitemActionsPosition: 'left' | 'right' — 默认 'right'\nitemActionsClass: string — 操作区 CSS 类名\ncolumns: number — 列数，默认 1\ngap: number | string — 间距，默认 0\nminItemWidth: string — 最小项宽度\nrowKey: string — 行唯一键，默认 'id'\nemptyText: string — 空数据文案，默认 '暂无数据'\nitemClass: string — 列表项 CSS 类名\nitemStyle: CSSProperties — 列表项行内样式\nuseCard: boolean — 使用卡片包裹，默认 false\ncardShadow: 'always' | 'hover' | 'never' — 默认 'hover'\ngridColumns: number — 默认 24\ngridGap: number | string — 默认 0\ngridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'\nitemColSpan: number — 项跨列数\nitemRowSpan: number — 项跨行数，默认 1\n\n【能力链】\nconsumes: PAGE_DATASET\nprovides: DATA_SOURCE",
      "source": "override"
    },
    "r-tabs": {
      "type": "r-tabs",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-tabs\" 组织子组件。",
      "props": [],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "**r-tabs** — 标签页容器\ntoolbar: Rule[] — 工具栏\ntoolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'\ntoolbarClass: string — 工具栏 CSS 类名\nmodelValue: string | number — 当前激活 tab\nonTabChange: string — 切换回调\nonTabClick: string — 点击回调\nchildren 内放 r-tab-pane（每个 tab-pane 内可嵌套任意组件）",
      "source": "override"
    },
    "r-collapse": {
      "type": "r-collapse",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-collapse\" 组织子组件。",
      "props": [],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "**r-collapse** — 折叠面板容器\ntoolbar: Rule[] — 工具栏\ntoolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'\ntoolbarClass: string — 工具栏 CSS 类名\nmodelValue: string | number | Array — 展开的面板\nonChange: string — 切换回调\nchildren 内放 r-collapse-item",
      "source": "override"
    },
    "r-steps": {
      "type": "r-steps",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-steps\" 组织子组件。",
      "props": [],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "**r-steps** — 步骤条容器\ntoolbar: Rule[] — 工具栏\ntoolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'\ntoolbarClass: string — 工具栏 CSS 类名\nmodelValue: string | number — 当前步骤\nonStepChange: string — 步骤切换回调\nchildren 内放 r-step",
      "source": "override"
    },
    "r-dialog": {
      "type": "r-dialog",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-dialog\" 组织子组件。",
      "props": [],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "**r-dialog** — 对话框容器\ntitle: string — 标题\nmodelValue: boolean — 控制显隐\nheaderActions: Rule[] — 头部操作区\nfooterActions: Rule[] — 底部操作区\nheaderClass: string — 头部 CSS 类名\nheaderActionsClass: string — 头部操作区 CSS 类名\nbodyClass: string — 内容区 CSS 类名\nfooterClass: string — 底部 CSS 类名\ngridColumns: number — 默认 24\ngridGap: number | string — 默认 0\ngridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'\nonOpen: string — 打开回调\nonClose: string — 关闭回调\nonOpened: string — 打开动画结束回调\nonClosed: string — 关闭动画结束回调",
      "source": "override"
    },
    "r-drawer": {
      "type": "r-drawer",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-drawer\" 组织子组件。",
      "props": [],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "**r-drawer** — 抽屉容器\ntitle: string — 标题\nmodelValue: boolean — 控制显隐\nheaderActions: Rule[] — 头部操作区\nfooterActions: Rule[] — 底部操作区\nheaderClass: string — 头部 CSS 类名\nheaderActionsClass: string — 头部操作区 CSS 类名\nbodyClass: string — 内容区 CSS 类名\nfooterClass: string — 底部 CSS 类名\ngridColumns: number — 默认 24\ngridGap: number | string — 默认 0\ngridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'\nonOpen / onClose / onOpened / onClosed: string — 生命周期回调",
      "source": "override"
    },
    "r-section": {
      "type": "r-section",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-section\" 组织子组件。",
      "props": [],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "**r-section** — 分区容器\ntitle: string — 标题\ndescription: string — 描述\ncollapsible: boolean — 是否可折叠\ndefaultCollapsed: boolean — 默认折叠\nbordered: boolean — 显示边框，默认 true\nuseCard: boolean — 使用卡片样式，默认 false\ncardShadow: string — 卡片阴影\nheaderActions: Rule[] — 头部操作区\nexpandText: string — 展开文案，默认 '展开'\ncollapseText: string — 收起文案，默认 '收起'\nshowToggleIcon: boolean — 显示切换图标，默认 true\ngridColumns: number — 默认 24\ngridGap: number — 默认 0\ngridAutoRows: string — 行高",
      "source": "override"
    },
    "r-block": {
      "type": "r-block",
      "category": "container",
      "description": "块容器（轻量分区）",
      "props": [],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "**r-block** — 块容器（轻量分区）\ntitle: string — 标题\ndescription: string — 描述\nheaderActions: Rule[] — 头部操作区\nbordered: boolean — 边框，默认 true\nuseCard: boolean — 卡片样式，默认 false\ngridColumns: number — 默认 24\ngridGap: number — 默认 0\ngridAutoRows: string — 行高定义\n适合做页面中的局部块，不强制数据绑定",
      "source": "override"
    },
    "r-user-picker": {
      "type": "r-user-picker",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-user-picker\" 使用。",
      "props": [],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "**r-user-picker** — 用户选择器\nfield / label / width — 同 r-text\nmultiple: boolean — 多选\ndeptScope: string — 部门范围\nincludeDisabled: boolean — 包含禁用用户",
      "source": "override"
    },
    "r-dept-picker": {
      "type": "r-dept-picker",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-dept-picker\" 使用。",
      "props": [],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "**r-dept-picker** — 部门选择器\nfield / label / width — 同 r-text\nmultiple: boolean — 多选\ncheckStrictly: boolean — 父子不关联勾选\nshowPath: boolean — 展示完整路径",
      "source": "override"
    },
    "r-product-picker": {
      "type": "r-product-picker",
      "category": "field",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-product-picker\" 使用。",
      "props": [],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "**r-product-picker** — 产品选择器\nfield / label / width — 同 r-text\nmultiple: boolean — 多选\ncategoryFilter: string[] — 类目过滤\nshowStock: boolean — 显示库存",
      "source": "override"
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
          "default": "'#'",
          "description": "上传 URL"
        },
        {
          "name": "accept",
          "type": "string",
          "required": false,
          "default": "''",
          "description": "接受文件类型"
        },
        {
          "name": "buttonText",
          "type": "string",
          "required": false,
          "default": "'点击上传'",
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
          "type": "'text' | 'picture' | 'picture-card'",
          "required": false,
          "default": "'text'",
          "description": "列表展示类型"
        },
        {
          "name": "separator",
          "type": "string",
          "required": false,
          "default": "', '",
          "description": "多文件分隔符"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "'请选择文件'",
          "description": "占位提示"
        },
        {
          "name": "readonlyButtonText",
          "type": "string",
          "required": false,
          "default": "'浏览'",
          "description": "只读模式按钮文案"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "string"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "透传到 el-upload: autoUpload(默认 true), showFileList(默认 true), limit(默认 1), listType('text'|'picture'|'picture-card')",
      "source": "ast+addendum"
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
          "default": "'请选择'",
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
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "TreeSelectValue"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
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
          "default": "() => ['待选', '已选'] as [string, string]",
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
          "default": "'请输入关键词'",
          "description": "搜索框占位符"
        },
        {
          "name": "targetOrder",
          "type": "'original' | 'push' | 'unshift'",
          "required": false,
          "default": "'original'",
          "description": "右侧排序方式"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "TransferValue"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
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
          "type": "boolean | { minRows?: number; maxRows?: number }",
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
          "default": "'请输入内容'",
          "description": "占位提示"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "string"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "string"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
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
          "default": "'是'",
          "description": "激活时文案"
        },
        {
          "name": "inactiveText",
          "type": "string",
          "required": false,
          "default": "'否'",
          "description": "未激活时文案"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "boolean"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "number"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
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
          "default": "'请选择'",
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
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "string | number"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "number"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
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
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "string | number"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "number | [number | undefined, number | undefined]"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "filterMode: 'range' — 启用范围过滤模式",
      "source": "ast+addendum"
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
          "default": "'请选择'",
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
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "MultiValue"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
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
          "default": "'#'",
          "description": "上传 URL"
        },
        {
          "name": "accept",
          "type": "string",
          "required": false,
          "default": "'image/*'",
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
          "default": "', '",
          "description": "多图分隔符"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "'请选择图片'",
          "description": "占位提示"
        },
        {
          "name": "buttonText",
          "type": "string",
          "required": false,
          "default": "'上传图片'",
          "description": "上传按钮文案"
        },
        {
          "name": "readonlyButtonText",
          "type": "string",
          "required": false,
          "default": "'浏览'",
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
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "string"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
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
          "default": "'请选择图标'",
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
          "default": "''",
          "description": "图标 CSS 类名前缀"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "string"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "string"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
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
          "default": "'#'",
          "description": "上传 URL"
        },
        {
          "name": "accept",
          "type": "string",
          "required": false,
          "default": "''",
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
          "default": "', '",
          "description": "多文件分隔符"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "'请选择文件路径'",
          "description": "占位提示"
        },
        {
          "name": "buttonText",
          "type": "string",
          "required": false,
          "default": "'上传'",
          "description": "上传按钮文案"
        },
        {
          "name": "readonlyButtonText",
          "type": "string",
          "required": false,
          "default": "'浏览'",
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
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "string"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
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
          "default": "''",
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
          "default": "', '",
          "description": "多文件分隔符"
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "'请选择文件'",
          "description": "占位提示"
        },
        {
          "name": "buttonText",
          "type": "string",
          "required": false,
          "default": "'浏览'",
          "description": "上传按钮文案"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "string"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "⚠️ 与 r-file-path 基本一致，差异在于内置的浏览器 UI 体验",
      "source": "ast+addendum"
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
          "default": "'请选择'",
          "description": "占位提示"
        },
        {
          "name": "buttonText",
          "type": "string",
          "required": false,
          "default": "'选择'",
          "description": "选择按钮文案"
        },
        {
          "name": "readonlyButtonText",
          "type": "string",
          "required": false,
          "default": "'查看'",
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
          "default": "', '",
          "description": "多值分隔符"
        },
        {
          "name": "valueMode",
          "type": "'auto' | 'array' | 'comma-string'",
          "required": false,
          "default": "'auto'",
          "description": "值模式"
        },
        {
          "name": "entityName",
          "type": "string",
          "required": false,
          "default": "'项目'",
          "description": "实体名称"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "EntityPickerValue"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
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
          "type": "string | Date | Array<string | Date>",
          "required": false,
          "description": "双向绑定值，日期范围时为数组"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "string | Date | Array<string | Date>"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "透传到 el-date-picker: type('date'/'datetime'/'daterange'), format, valueFormat 等",
      "source": "ast+addendum"
    },
    "r-column-group": {
      "type": "r-column-group",
      "category": "group",
      "description": "SPARK 字段组件，可在 rule.json 中通过 type=\"r-column-group\" 使用。",
      "props": [
        {
          "name": "label",
          "type": "string",
          "required": false,
          "description": "分组标题（必填）"
        },
        {
          "name": "width",
          "type": "string | number",
          "required": false,
          "description": "列宽"
        },
        {
          "name": "minWidth",
          "type": "string | number",
          "required": false,
          "description": "最小宽度"
        },
        {
          "name": "fixed",
          "type": "boolean | 'left' | 'right'",
          "required": false,
          "description": "固定方向"
        },
        {
          "name": "align",
          "type": "'left' | 'center' | 'right'",
          "required": false,
          "description": "对齐方式"
        },
        {
          "name": "headerAlign",
          "type": "'left' | 'center' | 'right'",
          "required": false,
          "description": "表头对齐"
        },
        {
          "name": "className",
          "type": "string",
          "required": false,
          "description": "列自定义样式类"
        },
        {
          "name": "labelClassName",
          "type": "string",
          "required": false,
          "description": "表头自定义样式类"
        }
      ],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "【使用场景】复杂表格需要多级表头分组，例如「基本信息」下包含「姓名」「年龄」「邮箱」\n\n【示例】\n{ \"type\": \"r-column-group\", \"props\": { \"label\": \"基本信息\" }, \"children\": [\n  { \"type\": \"r-text\", \"field\": \"name\", \"props\": { \"label\": \"姓名\" } },\n  { \"type\": \"r-number\", \"field\": \"age\", \"props\": { \"label\": \"年龄\" } }\n]}\nchildren 内放 r-* 字段组件作为实际数据列",
      "source": "ast+addendum"
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
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "string"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "透传到 el-color-picker: showAlpha, colorFormat('hex'|'rgb'|'hsl'|'hsv'), predefine(string[])",
      "source": "ast+addendum"
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
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "MultiValue"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
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
          "default": "'是'",
          "description": "选中时显示文案"
        },
        {
          "name": "uncheckedText",
          "type": "string",
          "required": false,
          "default": "'否'",
          "description": "未选时显示文案"
        },
        {
          "name": "checkboxText",
          "type": "string",
          "required": false,
          "default": "''",
          "description": "复选框右侧文案"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "boolean"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "notes": "⚠️ 用 checkedText / uncheckedText 代替 trueLabel / falseLabel",
      "source": "ast+addendum"
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
          "default": "'请选择'",
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
      "emits": [
        {
          "name": "update:modelValue",
          "payload": [
            {
              "name": "value",
              "type": "CascaderValue"
            }
          ]
        }
      ],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
    },
    "spark-ej2grid": {
      "type": "spark-ej2grid",
      "category": "feature",
      "description": "SPARK 业务组件，可在 rule.json 中通过 type=\"spark-ej2grid\" 使用。",
      "props": [],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
    },
    "spark-ej2column": {
      "type": "spark-ej2column",
      "category": "feature",
      "description": "SPARK 业务组件，可在 rule.json 中通过 type=\"spark-ej2column\" 使用。",
      "props": [
        {
          "name": "parentContext",
          "type": "ComponentContext",
          "required": false,
          "description": "父组件上下文（可选）\r用于列嵌套时的上下文传递\r@default undefined"
        }
      ],
      "emits": [],
      "capabilities": {
        "consumes": [],
        "provides": []
      },
      "source": "ast"
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

export const COMPONENT_PROPS_CATALOG: Record<string, string> = {
  "builtin-action": `**builtin-action** — 声明式动作节点（零代码优先）

【节点形态】
type: "builtin-action"
props.builtinAction: string — 动作类型
props.label?: string — 按钮文案
props.type?: 'primary'|'success'|'warning'|'danger'|'info'
props.confirmTitle?: string — 删除类动作确认标题
props.confirmMessage?: string — 删除类动作确认文案
props.silent?: boolean — true 时关闭默认消息提示

【常用动作】
append-row | refresh | patch-row | patch-current | patch-selected | delete-row | delete-selected | message-row

【放置位置】
- toolbar.items（工具栏动作）
- actions.items（行内动作）

适用于 r-table / r-list / r-form / r-detail 的常见 CRUD 场景`,
  "context-aware-fields-api": `**context-aware-fields-api** — 语境感知字段渲染能力总览

【核心能力】
- 子组件渲染由父容器语境决定：r-table(table) / r-form(form) / r-detail(detail) / r-list(list) / r-tree(tree)
- 同一 r-* 字段组件可跨语境复用，不复制多套组件
- 字段组件必须处于容器 children 中，禁止顶层裸放（会丢失语境）

【关键约束】
- r-table children 仅放 r-* 字段组件，禁止 el-table-column
- 事件逻辑优先用根级 on + script.js 函数，不在组件层硬编码父级判断
- 字段绑定用根级 field

【建议组合查询】
- r-table, r-form, r-detail, r-text, r-number, r-select, builtin-action`,
  "r-block": `**r-block** — 块容器（轻量分区）
title: string — 标题
description: string — 描述
headerActions: Rule[] — 头部操作区
bordered: boolean — 边框，默认 true
useCard: boolean — 卡片样式，默认 false
gridColumns: number — 默认 24
gridGap: number — 默认 0
gridAutoRows: string — 行高定义
适合做页面中的局部块，不强制数据绑定`,
  "r-cascader": `**r-cascader** — SPARK 字段组件，可在 rule.json 中通过 type="r-cascader" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: CascaderValue — 双向绑定值
options?: unknown[] — 树形选项（嵌套结构）
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
optionChildrenField?: string — 子节点字段
placeholder?: string — 占位提示 (默认 '请选择')
clearable?: boolean — 可清除 (默认 true)
filterable?: boolean — 可搜索 (默认 false)
multiple?: boolean — 多选模式 (默认 false)
checkStrictly?: boolean — 父子不关联勾选 (默认 false)
emitPath?: boolean — 值是否为完整路径数组 (默认 true)`,
  "r-checkbox": `**r-checkbox** — SPARK 字段组件，可在 rule.json 中通过 type="r-checkbox" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: boolean — 双向绑定值
checkedText?: string — 选中时显示文案 (默认 '是')
uncheckedText?: string — 未选时显示文案 (默认 '否')
checkboxText?: string — 复选框右侧文案 (默认 '')

⚠️ 用 checkedText / uncheckedText 代替 trueLabel / falseLabel`,
  "r-checkbox-group": `**r-checkbox-group** — SPARK 字段组件，可在 rule.json 中通过 type="r-checkbox-group" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: MultiValue — 双向绑定值（数组）
options?: unknown[] — 选项列表
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
buttonStyle?: boolean — 按钮风格 (默认 false)`,
  "r-collapse": `**r-collapse** — 折叠面板容器
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'
toolbarClass: string — 工具栏 CSS 类名
modelValue: string | number | Array — 展开的面板
onChange: string — 切换回调
children 内放 r-collapse-item`,
  "r-color": `**r-color** — SPARK 字段组件，可在 rule.json 中通过 type="r-color" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值（颜色字符串，透传 el-color-picker）

透传到 el-color-picker: showAlpha, colorFormat('hex'|'rgb'|'hsl'|'hsv'), predefine(string[])`,
  "r-column-group": `**r-column-group** — SPARK 字段组件，可在 rule.json 中通过 type="r-column-group" 使用。
label?: string — 分组标题（必填）
width?: string | number — 列宽
minWidth?: string | number — 最小宽度
fixed?: boolean | 'left' | 'right' — 固定方向
align?: 'left' | 'center' | 'right' — 对齐方式
headerAlign?: 'left' | 'center' | 'right' — 表头对齐
className?: string — 列自定义样式类
labelClassName?: string — 表头自定义样式类

【使用场景】复杂表格需要多级表头分组，例如「基本信息」下包含「姓名」「年龄」「邮箱」

【示例】
{ "type": "r-column-group", "props": { "label": "基本信息" }, "children": [
  { "type": "r-text", "field": "name", "props": { "label": "姓名" } },
  { "type": "r-number", "field": "age", "props": { "label": "年龄" } }
]}
children 内放 r-* 字段组件作为实际数据列`,
  "r-date": `**r-date** — SPARK 字段组件，可在 rule.json 中通过 type="r-date" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string | Date | Array<string | Date> — 双向绑定值，日期范围时为数组

透传到 el-date-picker: type('date'/'datetime'/'daterange'), format, valueFormat 等`,
  "r-dept-picker": `**r-dept-picker** — 部门选择器
field / label / width — 同 r-text
multiple: boolean — 多选
checkStrictly: boolean — 父子不关联勾选
showPath: boolean — 展示完整路径`,
  "r-detail": `**r-detail** — 只读详情容器（展示 currentRow）
dataKey: string — 数据绑定键
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' — 默认 'top'
toolbarClass: string — 工具栏 CSS 类名
gridColumns: number — CSS Grid 列数，默认 24
gridGap: number | string — 栅格间距，默认 0
gridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'

【能力链】
consumes: PAGE_DATASET
provides: DATA_SOURCE, FIELD_CONTEXT, CONTEXT_DATA

children 内放 r-* 字段组件（只读模式）`,
  "r-dialog": `**r-dialog** — 对话框容器
title: string — 标题
modelValue: boolean — 控制显隐
headerActions: Rule[] — 头部操作区
footerActions: Rule[] — 底部操作区
headerClass: string — 头部 CSS 类名
headerActionsClass: string — 头部操作区 CSS 类名
bodyClass: string — 内容区 CSS 类名
footerClass: string — 底部 CSS 类名
gridColumns: number — 默认 24
gridGap: number | string — 默认 0
gridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'
onOpen: string — 打开回调
onClose: string — 关闭回调
onOpened: string — 打开动画结束回调
onClosed: string — 关闭动画结束回调`,
  "r-drawer": `**r-drawer** — 抽屉容器
title: string — 标题
modelValue: boolean — 控制显隐
headerActions: Rule[] — 头部操作区
footerActions: Rule[] — 底部操作区
headerClass: string — 头部 CSS 类名
headerActionsClass: string — 头部操作区 CSS 类名
bodyClass: string — 内容区 CSS 类名
footerClass: string — 底部 CSS 类名
gridColumns: number — 默认 24
gridGap: number | string — 默认 0
gridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'
onOpen / onClose / onOpened / onClosed: string — 生命周期回调`,
  "r-entity-picker": `**r-entity-picker** — SPARK 字段组件，可在 rule.json 中通过 type="r-entity-picker" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: EntityPickerValue — 双向绑定值
options?: unknown[] — 选项列表
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
placeholder?: string — 占位提示 (默认 '请选择')
buttonText?: string — 选择按钮文案 (默认 '选择')
readonlyButtonText?: string — 只读模式按钮文案 (默认 '查看')
clearable?: boolean — 可清除 (默认 true)
multiple?: boolean — 多选 (默认 false)
searchable?: boolean — 可搜索 (默认 true)
separator?: string — 多值分隔符 (默认 ', ')
valueMode?: 'auto' | 'array' | 'comma-string' — 值模式 (默认 'auto')
entityName?: string — 实体名称 (默认 '项目')`,
  "r-file-browser": `**r-file-browser** — SPARK 字段组件，可在 rule.json 中通过 type="r-file-browser" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值（文件路径）
accept?: string — 接受文件类型 (默认 '')
multiple?: boolean — 多选 (默认 false)
clearable?: boolean — 可清除 (默认 true)
separator?: string — 多文件分隔符 (默认 ', ')
placeholder?: string — 占位提示 (默认 '请选择文件')
buttonText?: string — 上传按钮文案 (默认 '浏览')

⚠️ 与 r-file-path 基本一致，差异在于内置的浏览器 UI 体验`,
  "r-file-path": `**r-file-path** — SPARK 字段组件，可在 rule.json 中通过 type="r-file-path" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值（文件路径）
action?: string — 上传 URL (默认 '#')
accept?: string — 接受文件类型 (默认 '')
multiple?: boolean — 多选 (默认 false)
separator?: string — 多文件分隔符 (默认 ', ')
placeholder?: string — 占位提示 (默认 '请选择文件路径')
buttonText?: string — 上传按钮文案 (默认 '上传')
readonlyButtonText?: string — 只读模式按钮文案 (默认 '浏览')
clearable?: boolean — 可清除 (默认 true)`,
  "r-form": `**r-form** — 数据表单容器（读写 currentRow）
dataKey: string — 数据绑定键，如 "Users@currentRow"
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' — 默认 'top'
toolbarClass: string — 工具栏 CSS 类名
labelWidth: string — 标签宽度，默认 '100px'
gridColumns: number — CSS Grid 列数，默认 24
gridGap: number | string — 栅格间距，默认 0
gridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'

【能力链】
consumes: PAGE_DATASET
provides: DATA_SOURCE, FIELD_CONTEXT, CONTEXT_DATA

children 内放 r-* 字段组件`,
  "r-html-editor": `**r-html-editor** — SPARK 字段组件，可在 rule.json 中通过 type="r-html-editor" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值（HTML 字符串）
rows?: number — 编辑器高度行数 (默认 10)`,
  "r-icon": `**r-icon** — SPARK 字段组件，可在 rule.json 中通过 type="r-icon" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值（图标名）
options?: unknown[] — 图标选项列表
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
placeholder?: string — 占位提示 (默认 '请选择图标')
clearable?: boolean — 可清除 (默认 true)
filterable?: boolean — 可搜索 (默认 true)
classPrefix?: string — 图标 CSS 类名前缀 (默认 '')`,
  "r-image": `**r-image** — SPARK 字段组件，可在 rule.json 中通过 type="r-image" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值（图片路径）
action?: string — 上传 URL (默认 '#')
accept?: string — 接受文件类型 (默认 'image/*')
multiple?: boolean — 多选 (默认 false)
separator?: string — 多图分隔符 (默认 ', ')
placeholder?: string — 占位提示 (默认 '请选择图片')
buttonText?: string — 上传按钮文案 (默认 '上传图片')
readonlyButtonText?: string — 只读模式按钮文案 (默认 '浏览')
clearable?: boolean — 可清除 (默认 true)`,
  "r-list": `**r-list** — 列表容器
dataKey: string — 数据绑定键
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' — 默认 'top'
toolbarClass: string — 工具栏 CSS 类名
itemActions: Rule[] — 列表项操作区
itemActionsPosition: 'left' | 'right' — 默认 'right'
itemActionsClass: string — 操作区 CSS 类名
columns: number — 列数，默认 1
gap: number | string — 间距，默认 0
minItemWidth: string — 最小项宽度
rowKey: string — 行唯一键，默认 'id'
emptyText: string — 空数据文案，默认 '暂无数据'
itemClass: string — 列表项 CSS 类名
itemStyle: CSSProperties — 列表项行内样式
useCard: boolean — 使用卡片包裹，默认 false
cardShadow: 'always' | 'hover' | 'never' — 默认 'hover'
gridColumns: number — 默认 24
gridGap: number | string — 默认 0
gridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'
itemColSpan: number — 项跨列数
itemRowSpan: number — 项跨行数，默认 1

【能力链】
consumes: PAGE_DATASET
provides: DATA_SOURCE`,
  "r-multi-select": `**r-multi-select** — SPARK 字段组件，可在 rule.json 中通过 type="r-multi-select" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: MultiValue — 双向绑定值（数组）
options?: unknown[] — 选项列表
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
placeholder?: string — 占位提示 (默认 '请选择')
clearable?: boolean — 可清除 (默认 true)
filterable?: boolean — 可搜索 (默认 false)
collapseTags?: boolean — 折叠已选标签 (默认 false)
collapseTagsTooltip?: boolean — 折叠标签提示 (默认 false)
maxCollapseTags?: number — 最大显示标签数 (默认 1)`,
  "r-number": `**r-number** — SPARK 字段组件，可在 rule.json 中通过 type="r-number" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: number | [number | undefined, number | undefined] — 双向绑定值，范围模式时为元组
min?: number — 最小值
max?: number — 最大值
precision?: number — 小数精度
filterMode?: string — 筛选模式（'range' 启用范围输入）

filterMode: 'range' — 启用范围过滤模式`,
  "r-product-picker": `**r-product-picker** — 产品选择器
field / label / width — 同 r-text
multiple: boolean — 多选
categoryFilter: string[] — 类目过滤
showStock: boolean — 显示库存`,
  "r-radio": `**r-radio** — SPARK 字段组件，可在 rule.json 中通过 type="r-radio" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string | number — 双向绑定值
options?: unknown[] — 选项列表
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
buttonStyle?: boolean — 按钮风格 (默认 false)`,
  "r-rate": `**r-rate** — SPARK 字段组件，可在 rule.json 中通过 type="r-rate" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: number — 双向绑定值
max?: number — 最大值 (默认 5)
allowHalf?: boolean — 允许半星 (默认 false)`,
  "r-section": `**r-section** — 分区容器
title: string — 标题
description: string — 描述
collapsible: boolean — 是否可折叠
defaultCollapsed: boolean — 默认折叠
bordered: boolean — 显示边框，默认 true
useCard: boolean — 使用卡片样式，默认 false
cardShadow: string — 卡片阴影
headerActions: Rule[] — 头部操作区
expandText: string — 展开文案，默认 '展开'
collapseText: string — 收起文案，默认 '收起'
showToggleIcon: boolean — 显示切换图标，默认 true
gridColumns: number — 默认 24
gridGap: number — 默认 0
gridAutoRows: string — 行高`,
  "r-select": `**r-select** — SPARK 字段组件，可在 rule.json 中通过 type="r-select" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string | number — 双向绑定值
options?: unknown[] — 选项列表
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
placeholder?: string — 占位提示 (默认 '请选择')
clearable?: boolean — 可清除 (默认 true)
filterable?: boolean — 可搜索 (默认 false)`,
  "r-slider": `**r-slider** — SPARK 字段组件，可在 rule.json 中通过 type="r-slider" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: number — 双向绑定值
min?: number — 最小值 (默认 0)
max?: number — 最大值 (默认 100)
step?: number — 步长 (默认 1)
showInput?: boolean — 显示输入框 (默认 false)`,
  "r-steps": `**r-steps** — 步骤条容器
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'
toolbarClass: string — 工具栏 CSS 类名
modelValue: string | number — 当前步骤
onStepChange: string — 步骤切换回调
children 内放 r-step`,
  "r-switch": `**r-switch** — SPARK 字段组件，可在 rule.json 中通过 type="r-switch" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: boolean — 双向绑定值
activeText?: string — 激活时文案 (默认 '是')
inactiveText?: string — 未激活时文案 (默认 '否')`,
  "r-table": `**r-table** — 数据表格容器

【props — 透传到 el-table】
border: boolean — 边框
stripe: boolean — 斑马纹
highlightCurrentRow: boolean — 当前行高亮（⚠️ 必须显式声明才生效）
height / maxHeight: string | number — 表格高度
style: object — 行内样式
class: string — CSS 类名

【根级字段 — 数据绑定】
dataKey: string — 数据绑定键，如 "Users@rows"（根级）

【根级字段 — 事件绑定】
on.rowDblclick: string — 行双击（→ script.js 函数名）
（其他组件事件同理，key 为 camelCase 事件名）

【根级字段 — filter 筛选配置】
filter.columns: Array<string | FilterItem> — 筛选项列表
  字符串简写："fieldName" 等价于 { field: "fieldName", component: "text" }
  完整 FilterItem：{ field, label?, component?, options?, logic?, span?, props? }
  component 内置值：text | select | date | date-range | number | number-range | checkbox | radio
filter.collapsible: boolean — 可折叠，默认 false
filter.defaultCollapsed: boolean — 默认折叠，默认 false
filter.autoFitMinWidth: string — 最小宽度，默认 '220px'
filter.class: string — 筛选区 CSS 类名
filter.itemSpan: number — 每项跨列数，默认 1
filter.gridColumns: number — 栅格总列数，默认 24
filter.gridGap: number | string — 间距，默认 12
filter.gridAutoRows: string — 行高，默认 'minmax(32px, auto)'

【根级字段 — toolbar 工具栏】
toolbar.items: SparkNode[] — 工具栏按钮（优先 builtin-action，其次 Render*）
toolbar.position: 'top' | 'bottom' — 默认 'top'

【根级字段 — actions 行操作列】
actions.items: SparkNode[] — 行操作按钮（优先 builtin-action）
actions.position: 'left' | 'right' — 默认 'right'
actions.label: string — 操作列标题，默认 '操作'
actions.width: number — 操作列宽度，默认 160
actions.align: 'left' | 'center' | 'right' — 默认 'left'
actions.fixed: boolean | 'left' | 'right' — 固定方向
actions.class: string — 操作列 CSS 类名

【能力链】
consumes: PAGE_DATASET, PAGE_SERVICE, PAGE_COMPONENT_REGISTRY, MODULE_CONTEXT
provides: DATA_SOURCE, TABLE_API, FIELD_CONTEXT

children 内仅用 r-* 字段组件做列，禁止 el-table-column`,
  "r-tabs": `**r-tabs** — 标签页容器
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'
toolbarClass: string — 工具栏 CSS 类名
modelValue: string | number — 当前激活 tab
onTabChange: string — 切换回调
onTabClick: string — 点击回调
children 内放 r-tab-pane（每个 tab-pane 内可嵌套任意组件）`,
  "r-text": `**r-text** — SPARK 字段组件，可在 rule.json 中通过 type="r-text" 使用。
field?: string — 字段绑定名，映射到 DataView 行字段
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值`,
  "r-textarea": `**r-textarea** — SPARK 字段组件，可在 rule.json 中通过 type="r-textarea" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值
rows?: number — 行数 (默认 4)
autosize?: boolean | { minRows?: number; maxRows?: number } — 自适应高度 (默认 false)
maxlength?: number — 最大长度
showWordLimit?: boolean — 显示字数统计 (默认 false)
placeholder?: string — 占位提示 (默认 '请输入内容')`,
  "r-transfer": `**r-transfer** — SPARK 字段组件，可在 rule.json 中通过 type="r-transfer" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: TransferValue — 双向绑定值（已选值数组）
options?: unknown[] — 数据源（左侧候选列表）
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
titles?: [string, string] — 左右面板标题 (默认 () => ['待选', '已选'] as [string, string])
filterable?: boolean — 可搜索 (默认 false)
filterPlaceholder?: string — 搜索框占位符 (默认 '请输入关键词')
targetOrder?: 'original' | 'push' | 'unshift' — 右侧排序方式 (默认 'original')`,
  "r-tree": `**r-tree** — 树形组件容器
dataKey: string — 数据绑定键，如 "TreeData@rows"
data: TreeNode[] — 静态数据（优先用 dataKey）
dataSource: IDataSource | DataView — 动态数据源
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' — 工具栏位置
nodeActions: Rule[] — 节点操作区
nodeActionsPosition: string — 节点操作位置
nodeActionsClass: string — 节点操作区 CSS 类名
onNodeClick: string — script.js 函数名
onNodeExpand: string — 节点展开回调
onNodeCollapse: string — 节点折叠回调
其他 props 透传到 el-tree（node-key, default-expand-all, show-checkbox 等）

【能力链】
consumes: PAGE_DATASET
provides: DATA_SOURCE, FIELD_CONTEXT, CONTEXT_DATA`,
  "r-tree-select": `**r-tree-select** — SPARK 字段组件，可在 rule.json 中通过 type="r-tree-select" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: TreeSelectValue — 双向绑定值
options?: unknown[] — 树形选项（嵌套结构）
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
optionChildrenField?: string — 子节点字段
placeholder?: string — 占位提示 (默认 '请选择')
clearable?: boolean — 可清除 (默认 true)
filterable?: boolean — 可搜索 (默认 false)
multiple?: boolean — 多选模式 (默认 false)
checkStrictly?: boolean — 父子不关联勾选 (默认 false)
defaultExpandAll?: boolean — 默认展开所有节点 (默认 false)
renderAfterExpand?: boolean — 展开后才渲染子节点 (默认 true)`,
  "r-upload": `**r-upload** — SPARK 字段组件，可在 rule.json 中通过 type="r-upload" 使用。
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值（文件路径）
action?: string — 上传 URL (默认 '#')
accept?: string — 接受文件类型 (默认 '')
buttonText?: string — 上传按钮文案 (默认 '点击上传')
autoUpload?: boolean — 自动上传 (默认 true)
showFileList?: boolean — 显示文件列表 (默认 true)
limit?: number — 最大文件数 (默认 1)
listType?: 'text' | 'picture' | 'picture-card' — 列表展示类型 (默认 'text')
separator?: string — 多文件分隔符 (默认 ', ')
placeholder?: string — 占位提示 (默认 '请选择文件')
readonlyButtonText?: string — 只读模式按钮文案 (默认 '浏览')

透传到 el-upload: autoUpload(默认 true), showFileList(默认 true), limit(默认 1), listType('text'|'picture'|'picture-card')`,
  "r-user-picker": `**r-user-picker** — 用户选择器
field / label / width — 同 r-text
multiple: boolean — 多选
deptScope: string — 部门范围
includeDisabled: boolean — 包含禁用用户`,
  "spark-ej2column": `**spark-ej2column** — SPARK 业务组件，可在 rule.json 中通过 type="spark-ej2column" 使用。
parentContext?: ComponentContext — 父组件上下文（可选）用于列嵌套时的上下文传递@default undefined`,
  "spark-ej2grid": `**spark-ej2grid** — SPARK 业务组件，可在 rule.json 中通过 type="spark-ej2grid" 使用。`,
}

/**
 * 组件注册表（按分类），供 design-prompt.ts 生成组件注册表 section。
 */
export const COMPONENT_REGISTRY = {
  containers: ["r-block","r-collapse","r-detail","r-dialog","r-drawer","r-form","r-list","r-section","r-steps","r-table","r-tabs","r-tree"] as const,
  fields: ["r-cascader","r-checkbox","r-checkbox-group","r-color","r-date","r-dept-picker","r-entity-picker","r-file-browser","r-file-path","r-html-editor","r-icon","r-image","r-multi-select","r-number","r-product-picker","r-radio","r-rate","r-select","r-slider","r-switch","r-text","r-textarea","r-transfer","r-tree-select","r-upload","r-user-picker"] as const,
  groups: ["r-column-group"] as const,
} as const
