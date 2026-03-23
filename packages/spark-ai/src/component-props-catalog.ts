/**
 * SPARK 组件 Props 目录
 *
 * ⚠️ 自动生成 — 请勿手动编辑
 *
 * 由 vite-plugin-spark-catalog 在 build / dev 时生成。
 * 数据来源：vue-component-meta 类型提取 + supplement.ts 手工补充
 *
 * 重新生成：pnpm run dev 或 pnpm run build
 * 生成时间：2026-03-23T17:06:41.214Z
 * 条目数量：77
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
  "buildTime": "2026-03-23T17:06:41.209Z",
  "componentCount": 77,
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
  "sharedTypes": {
    "SparkNode": {
      "name": "SparkNode",
      "description": "组件配置节点 —— rule.json 的基本单元。每个节点通过 type 字段映射到 ComponentRegistry 中已注册的组件，由 SparkComponentRenderer 在运行时动态解析并渲染。",
      "properties": [
        {
          "name": "type",
          "type": "string",
          "required": true,
          "description": "组件类型（kebab-case），映射到 ComponentRegistry 中的注册名，如 \"r-table\"、\"r-text\"、\"el-button\""
        },
        {
          "name": "id",
          "type": "string",
          "description": "实例 ID（可选，运行时自动生成 spark-{n}）"
        },
        {
          "name": "dataKey",
          "type": "string",
          "description": "数据绑定键（如 \"Users@rows\"），容器组件（r-table 等 self-resolve 类型）在运行时自行解析为 DataView"
        },
        {
          "name": "field",
          "type": "string",
          "description": "字段绑定名，定位到 DataView 行中的数据字段（如 \"userName\"）"
        },
        {
          "name": "label",
          "type": "string",
          "description": "显示标签（UI 展示文字，如 \"用户名\"），与 field 分离"
        },
        {
          "name": "optionKey",
          "type": "string",
          "description": "选项数据源 DataKey（如 \"Categories@rows\"），供 r-select/r-radio/r-checkbox-group 解析选项列表"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "description": "组件属性，透传到 Vue 组件 props（v-bind 展开）"
        },
        {
          "name": "children",
          "type": "SparkNode[]",
          "description": "子组件配置（递归结构），容器组件渲染其 children 形成组件树"
        },
        {
          "name": "visible",
          "type": "boolean",
          "description": "可见性控制，false 时组件不渲染"
        },
        {
          "name": "disabled",
          "type": "boolean",
          "description": "禁用状态控制"
        },
        {
          "name": "on",
          "type": "Record<string, string>",
          "description": "事件绑定（key=camelCase 事件名，value=script.js 函数名），如 { \"rowDblclick\": \"handleRowDblclick\" }"
        },
        {
          "name": "toolbar",
          "type": "SparkNodeToolbar",
          "description": "工具栏配置（容器级），详见 SparkNodeToolbar"
        },
        {
          "name": "actions",
          "type": "SparkNodeActions",
          "description": "行操作列配置（容器级），详见 SparkNodeActions"
        },
        {
          "name": "filter",
          "type": "SparkNodeFilter",
          "description": "筛选器配置（容器级），详见 SparkNodeFilter"
        }
      ],
      "notes": "【组件与 SparkNode 的关系】\nrule.json 是一棵 SparkNode 树。渲染引擎（SparkComponentRenderer）递归遍历这棵树，对每个节点：\n1. 通过 type 从 ComponentRegistry 动态查找已注册的 Vue 组件\n2. 将 props + config 传入组件，children 由组件自行渲染（容器组件用 SparkComponentRenderer 递归）\n3. 容器组件通过能力系统 provide(DATA_SOURCE, FIELD_CONTEXT) 向子树暴露数据上下文\n4. 字段组件通过 consume() 自动感知父容器语境，同一个 r-text 在不同父容器中呈现不同形态\n\n【子组件智能感知父容器（Context-Aware Rendering）】\n- 在 r-table 中 → 字段组件渲染为表格列（el-table-column 包装）\n- 在 r-form 中 → 字段组件渲染为表单输入控件（el-form-item 包装）\n- 在 r-detail 中 → 字段组件渲染为只读展示\n\n语境由 FIELD_CONTEXT 能力键传递，值为 'table' | 'form' | 'detail' | 'list' | 'tree'。\n字段组件无需知道自己处于哪种容器，框架自动适配渲染模式。\n\n【动态渲染流程】\nrule.json → SparkNode 树\n  → SparkComponentRenderer 递归遍历\n  → 每个节点：registry.get(node.type) → 渲染对应 Vue 组件\n  → 容器组件 provide(DATA_SOURCE, FIELD_CONTEXT)\n  → 子组件 consume() 获取数据与语境 → 自适应渲染\n\n【toolbar / actions / filter 的宿主】\n这三个根级字段仅在容器组件（r-table、r-form、r-detail、r-list、r-tree 等）上有效。\ntoolbar.items 和 actions.items 中的每一项也是 SparkNode（常见 type: \"builtin-action\"）。"
    },
    "SparkNodeToolbar": {
      "name": "SparkNodeToolbar",
      "description": "工具栏配置，放置在容器组件的 toolbar 根级字段。items 中的每一项也是 SparkNode（通常是 builtin-action 或 Render* 组件）。",
      "properties": [
        {
          "name": "items",
          "type": "SparkNode[]",
          "required": true,
          "description": "工具栏按钮列表（通常放 builtin-action 或 Render* 自定义渲染函数）"
        },
        {
          "name": "position",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "description": "工具栏位置，默认 'top'"
        },
        {
          "name": "class",
          "type": "string",
          "description": "自定义 CSS 类名"
        }
      ]
    },
    "SparkNodeActions": {
      "name": "SparkNodeActions",
      "description": "行操作列配置（r-table / r-list），放置在容器组件的 actions 根级字段。items 中的每一项也是 SparkNode。",
      "properties": [
        {
          "name": "items",
          "type": "SparkNode[]",
          "required": true,
          "description": "操作按钮列表（通常放 builtin-action 或 Render* 自定义渲染函数）"
        },
        {
          "name": "position",
          "type": "'left' | 'right'",
          "description": "操作列位置，默认 'right'"
        },
        {
          "name": "label",
          "type": "string",
          "description": "列标题，默认 '操作'"
        },
        {
          "name": "width",
          "type": "string | number",
          "description": "列宽度，默认 160"
        },
        {
          "name": "align",
          "type": "'left' | 'center' | 'right'",
          "description": "对齐方式，默认 'left'"
        },
        {
          "name": "class",
          "type": "string",
          "description": "自定义 CSS 类名"
        },
        {
          "name": "fixed",
          "type": "boolean | 'left' | 'right'",
          "description": "固定列方向"
        }
      ]
    },
    "SparkNodeFilter": {
      "name": "SparkNodeFilter",
      "description": "筛选器配置（r-table），放置在容器组件的 filter 根级字段。columns 中可以是字段名字符串（简写）或完整的 SparkNodeFilterItem 对象。",
      "properties": [
        {
          "name": "columns",
          "type": "Array<string | SparkNodeFilterItem>",
          "required": true,
          "description": "筛选项列表。字符串简写 \"fieldName\" 等价于 { field: \"fieldName\", component: \"text\" }"
        },
        {
          "name": "class",
          "type": "string",
          "description": "筛选区 CSS 类名"
        },
        {
          "name": "collapsible",
          "type": "boolean",
          "description": "是否可折叠，默认 false"
        },
        {
          "name": "defaultCollapsed",
          "type": "boolean",
          "description": "默认是否折叠，默认 false"
        },
        {
          "name": "autoFitMinWidth",
          "type": "string",
          "description": "自适应最小宽度，默认 '220px'"
        },
        {
          "name": "itemSpan",
          "type": "number",
          "description": "每项跨列数，默认 1"
        },
        {
          "name": "gridColumns",
          "type": "number",
          "description": "栅格总列数，默认 24"
        },
        {
          "name": "gridGap",
          "type": "number | string",
          "description": "间距，默认 12"
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "description": "行高，默认 'minmax(32px, auto)'"
        }
      ]
    },
    "SparkNodeFilterItem": {
      "name": "SparkNodeFilterItem",
      "description": "单个筛选项完整配置。在 filter.columns 中使用，控制单个字段的筛选 UI。",
      "properties": [
        {
          "name": "field",
          "type": "string",
          "required": true,
          "description": "字段名（映射到数据源字段）"
        },
        {
          "name": "label",
          "type": "string",
          "description": "显示标签（省略则用字段名）"
        },
        {
          "name": "component",
          "type": "'text' | 'select' | 'date' | 'date-range' | 'number' | 'number-range' | 'checkbox' | 'radio' | string",
          "description": "输入组件类型，默认 'text'"
        },
        {
          "name": "options",
          "type": "Array<{ label: string; value: unknown }>",
          "description": "可选项列表（component 为 select/radio/checkbox 时使用）"
        },
        {
          "name": "optionLabelField",
          "type": "string",
          "description": "选项标签字段映射（options 来自 DataKey 时使用）"
        },
        {
          "name": "optionValueField",
          "type": "string",
          "description": "选项值字段映射"
        },
        {
          "name": "logic",
          "type": "'and' | 'or'",
          "description": "与其他条件的逻辑关系（覆盖全局 filter.logic，默认继承）"
        },
        {
          "name": "span",
          "type": "number",
          "description": "跨列数（覆盖全局 filter.itemSpan）"
        },
        {
          "name": "props",
          "type": "Record<string, unknown>",
          "description": "透传到筛选组件的原生 props（如 placeholder、clearable 等）"
        }
      ]
    }
  },
  "components": {
    "context-aware-fields-api": {
      "type": "context-aware-fields-api",
      "category": "meta",
      "description": "语境感知字段渲染能力总览",
      "props": [],
      "emits": [],
      "notes": "**context-aware-fields-api** — 语境感知字段渲染能力总览\n\n【核心能力】\n- 子组件渲染由父容器语境决定：r-table(table) / r-form(form) / r-detail(detail) / r-list(list) / r-tree(tree)\n- 同一 r-* 字段组件可跨语境复用，不复制多套组件\n- 字段组件必须处于容器 children 中，禁止顶层裸放（会丢失语境）\n\n【关键约束】\n- r-table children 仅放 r-* 字段组件，禁止 el-table-column\n- 事件逻辑优先用根级 on + script.js 函数，不在组件层硬编码父级判断\n- 字段绑定用根级 field\n\n【建议组合查询】\n- r-table, r-form, r-detail, r-text, r-number, r-select, builtin-action",
      "source": "override"
    },
    "builtin-action": {
      "type": "builtin-action",
      "category": "meta",
      "description": "声明式动作节点（零代码优先）",
      "props": [],
      "emits": [],
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
      "notes": "**builtin-action** — 声明式动作节点（零代码优先）\n\n【节点形态】\ntype: \"builtin-action\"\nprops.builtinAction: string — 动作类型\nprops.label?: string — 按钮文案\nprops.type?: 'primary'|'success'|'warning'|'danger'|'info'\nprops.confirmTitle?: string — 删除类动作确认标题\nprops.confirmMessage?: string — 删除类动作确认文案\nprops.silent?: boolean — true 时关闭默认消息提示\n\n【常用动作】\nappend-row | refresh | patch-row | patch-current | patch-selected | delete-row | delete-selected | message-row\n\n【放置位置】\n- toolbar.items（工具栏动作）\n- actions.items（行内动作）\n\n适用于 r-table / r-list / r-form / r-detail 的常见 CRUD 场景",
      "source": "override"
    },
    "r-table": {
      "type": "r-table",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-table\" 组织子组件。",
      "props": [
        {
          "name": "dataKey",
          "type": "string",
          "required": false,
          "description": "DataKey 格式：tableName@field"
        }
      ],
      "emits": [],
      "exposed": [
        {
          "name": "toolbarPosition",
          "type": "ToolbarPosition | undefined",
          "description": "工具栏位置",
          "schema": {
            "kind": "enum",
            "type": "ToolbarPosition | undefined",
            "variants": [
              "undefined",
              "\"top\"",
              "\"bottom\"",
              "\"left\"",
              "\"right\""
            ]
          }
        },
        {
          "name": "toolbarClass",
          "type": "string | undefined",
          "description": "工具栏 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "filterColumns",
          "type": "string[] | undefined",
          "description": "筛选项字段列表",
          "schema": {
            "kind": "enum",
            "type": "string[] | undefined",
            "variants": [
              "undefined",
              "string[]"
            ]
          }
        },
        {
          "name": "filterClass",
          "type": "string | undefined",
          "description": "筛选区 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "filterCollapsible",
          "type": "boolean | undefined",
          "description": "筛选区可折叠",
          "schema": {
            "kind": "enum",
            "type": "boolean | undefined",
            "variants": [
              "undefined",
              "false",
              "true"
            ]
          }
        },
        {
          "name": "filterDefaultCollapsed",
          "type": "boolean | undefined",
          "description": "筛选区默认折叠",
          "schema": {
            "kind": "enum",
            "type": "boolean | undefined",
            "variants": [
              "undefined",
              "false",
              "true"
            ]
          }
        },
        {
          "name": "filterAutoFitMinWidth",
          "type": "string | undefined",
          "description": "筛选区最小宽度",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "filterItemSpan",
          "type": "number | undefined",
          "description": "每项跨列数",
          "schema": {
            "kind": "enum",
            "type": "number | undefined",
            "variants": [
              "undefined",
              "number"
            ]
          }
        },
        {
          "name": "filterGridColumns",
          "type": "number | undefined",
          "description": "筛选栅格总列数",
          "schema": {
            "kind": "enum",
            "type": "number | undefined",
            "variants": [
              "undefined",
              "number"
            ]
          }
        },
        {
          "name": "filterGridGap",
          "type": "string | number | undefined",
          "description": "筛选栅格间距",
          "schema": {
            "kind": "enum",
            "type": "string | number | undefined",
            "variants": [
              "undefined",
              "string",
              "number"
            ]
          }
        },
        {
          "name": "filterGridAutoRows",
          "type": "string | undefined",
          "description": "筛选栅格行高",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "rowActionsPosition",
          "type": "LateralActionPosition | undefined",
          "description": "行操作列位置",
          "schema": {
            "kind": "enum",
            "type": "LateralActionPosition | undefined",
            "variants": [
              "undefined",
              "\"left\"",
              "\"right\""
            ]
          }
        },
        {
          "name": "rowActionsLabel",
          "type": "string | undefined",
          "description": "行操作列标题",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "rowActionsWidth",
          "type": "string | number | undefined",
          "description": "行操作列宽度",
          "schema": {
            "kind": "enum",
            "type": "string | number | undefined",
            "variants": [
              "undefined",
              "string",
              "number"
            ]
          }
        },
        {
          "name": "rowActionsAlign",
          "type": "\"left\" | \"right\" | \"center\" | undefined",
          "description": "行操作列对齐方式",
          "schema": {
            "kind": "enum",
            "type": "\"left\" | \"right\" | \"center\" | undefined",
            "variants": [
              "undefined",
              "\"left\"",
              "\"right\"",
              "\"center\""
            ]
          }
        },
        {
          "name": "rowActionsClass",
          "type": "string | undefined",
          "description": "行操作列 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "dataKey",
          "type": "string",
          "description": "DataKey 格式：tableName@field"
        },
        {
          "name": "children",
          "type": "SparkNode[]",
          "description": "子节点列表"
        },
        {
          "name": "toolbar",
          "type": "SparkNode[]",
          "description": "工具栏按钮配置"
        },
        {
          "name": "rowActions",
          "type": "SparkNode[]",
          "description": "行操作按钮配置"
        },
        {
          "name": "rowActionsFixed",
          "type": "boolean | \"left\" | \"right\"",
          "description": "行操作列固定方向",
          "schema": {
            "kind": "enum",
            "type": "boolean | \"left\" | \"right\"",
            "variants": [
              "false",
              "true",
              "\"left\"",
              "\"right\""
            ]
          }
        },
        {
          "name": "getDataSource",
          "type": "() => IDataSource | null"
        },
        {
          "name": "getRows",
          "type": "() => IDataRow[]"
        },
        {
          "name": "getCurrentRow",
          "type": "() => IDataRow | null"
        },
        {
          "name": "getSelectedRows",
          "type": "() => IDataRow[]"
        },
        {
          "name": "refresh",
          "type": "() => Promise<void>"
        },
        {
          "name": "appendRow",
          "type": "(row: IDataRow) => void"
        },
        {
          "name": "updateRowById",
          "type": "(id: string | number, patch: Partial<IDataRow>) => boolean"
        },
        {
          "name": "deleteRowById",
          "type": "(id: string | number) => boolean"
        },
        {
          "name": "setCurrentRow",
          "type": "(row: IDataRow | null) => void"
        },
        {
          "name": "setCurrentRowById",
          "type": "(id: string | number | null) => boolean"
        },
        {
          "name": "setSelectedRows",
          "type": "(rows: IDataRow[]) => void",
          "schema": {
            "kind": "event",
            "type": "(rows: IDataRow[]): void",
            "params": [
              {
                "kind": "object",
                "type": "IDataRow",
                "properties": {
                  "_perm": {
                    "name": "_perm",
                    "type": "IInstancePermission",
                    "required": false,
                    "schema": {
                      "kind": "object",
                      "type": "IInstancePermission",
                      "properties": {
                        "allowDelete": {
                          "name": "allowDelete",
                          "type": "boolean",
                          "required": false
                        },
                        "editableFields": {
                          "name": "editableFields",
                          "type": "string[]",
                          "required": false
                        },
                        "hiddenFields": {
                          "name": "hiddenFields",
                          "type": "string[]",
                          "required": false
                        },
                        "maskedFields": {
                          "name": "maskedFields",
                          "type": "string[]",
                          "required": false
                        },
                        "permissionToken": {
                          "name": "permissionToken",
                          "type": "string",
                          "required": false
                        }
                      }
                    }
                  }
                }
              }
            ]
          }
        },
        {
          "name": "setSelectedRowsById",
          "type": "(ids: (string | number)[]) => number",
          "schema": {
            "kind": "event",
            "type": "(ids: (string | number)[]): number",
            "params": [
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
        },
        {
          "name": "clearSelectedRows",
          "type": "() => void"
        },
        {
          "name": "clearUiSelection",
          "type": "() => void"
        },
        {
          "name": "toggleUiRowSelection",
          "type": "(row: IDataRow, selected?: boolean | undefined) => void"
        },
        {
          "name": "doLayout",
          "type": "() => void"
        },
        {
          "name": "getNativeTable",
          "type": "() => unknown"
        },
        {
          "name": "getFilterModel",
          "type": "() => Record<string, unknown>",
          "description": "获取当前过滤条件"
        },
        {
          "name": "resetFilters",
          "type": "() => void",
          "description": "重置所有过滤条件"
        },
        {
          "name": "hasActiveFilters",
          "type": "() => boolean",
          "description": "是否存在活跃过滤"
        },
        {
          "name": "getActiveFilterCount",
          "type": "() => number",
          "description": "活跃过滤条件数量"
        }
      ],
      "slots": [
        {
          "name": "toolbar",
          "type": "{ [x: string]: unknown; dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; }",
          "schema": {
            "kind": "object",
            "type": "{ [x: string]: unknown; dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; }",
            "properties": {
              "dataSource": {
                "name": "dataSource",
                "type": "DataView | null | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "DataView | null | undefined",
                  "variants": [
                    "undefined",
                    "null",
                    "DataView"
                  ]
                }
              },
              "modelPermission": {
                "name": "modelPermission",
                "type": "IModelPermission | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "IModelPermission | undefined",
                  "variants": [
                    "undefined",
                    "IModelPermission"
                  ]
                }
              }
            }
          }
        },
        {
          "name": "row-actions",
          "type": "{ dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; row: IDataRow; rowIndex: number; $index: number; }",
          "schema": {
            "kind": "object",
            "type": "{ dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; row: IDataRow; rowIndex: number; $index: number; }",
            "properties": {
              "dataSource": {
                "name": "dataSource",
                "type": "DataView | null | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "DataView | null | undefined",
                  "variants": [
                    "undefined",
                    "null",
                    "DataView"
                  ]
                }
              },
              "modelPermission": {
                "name": "modelPermission",
                "type": "IModelPermission | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "IModelPermission | undefined",
                  "variants": [
                    "undefined",
                    "IModelPermission"
                  ]
                }
              },
              "row": {
                "name": "row",
                "type": "IDataRow",
                "required": true,
                "schema": {
                  "kind": "object",
                  "type": "IDataRow",
                  "properties": {
                    "_perm": {
                      "name": "_perm",
                      "type": "IInstancePermission",
                      "required": false,
                      "schema": {
                        "kind": "object",
                        "type": "IInstancePermission",
                        "properties": {
                          "allowDelete": {
                            "name": "allowDelete",
                            "type": "boolean",
                            "required": false
                          },
                          "editableFields": {
                            "name": "editableFields",
                            "type": "string[]",
                            "required": false
                          },
                          "hiddenFields": {
                            "name": "hiddenFields",
                            "type": "string[]",
                            "required": false
                          },
                          "maskedFields": {
                            "name": "maskedFields",
                            "type": "string[]",
                            "required": false
                          },
                          "permissionToken": {
                            "name": "permissionToken",
                            "type": "string",
                            "required": false
                          }
                        }
                      }
                    }
                  }
                }
              },
              "rowIndex": {
                "name": "rowIndex",
                "type": "number",
                "required": true
              },
              "$index": {
                "name": "$index",
                "type": "number",
                "required": true
              }
            }
          }
        },
        {
          "name": "default",
          "type": "{}"
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
          "name": "toolbar.items",
          "type": "SparkNode[]",
          "description": "工具栏按钮（优先 builtin-action，其次 Render*）"
        },
        {
          "name": "toolbar.position",
          "type": "'top' | 'bottom'",
          "description": "默认 'top'"
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
      "notes": "**r-table** — 数据表格容器\n\n【props — 透传到 el-table】\nborder: boolean — 边框\nstripe: boolean — 斑马纹\nhighlightCurrentRow: boolean — 当前行高亮（⚠️ 必须显式声明才生效）\nheight / maxHeight: string | number — 表格高度\nstyle: object — 行内样式\nclass: string — CSS 类名\n\n【根级字段 — 数据绑定】\ndataKey: string — 数据绑定键，如 \"Users@rows\"（根级）\n\n【根级字段 — 事件绑定】\non.rowDblclick: string — 行双击（→ script.js 函数名）\n（其他组件事件同理，key 为 camelCase 事件名）\n\n【根级字段 — filter 筛选配置】\nfilter.columns: Array<string | FilterItem> — 筛选项列表\n  字符串简写：\"fieldName\" 等价于 { field: \"fieldName\", component: \"text\" }\n  完整 FilterItem：{ field, label?, component?, options?, logic?, span?, props? }\n  component 内置值：text | select | date | date-range | number | number-range | checkbox | radio\nfilter.collapsible: boolean — 可折叠，默认 false\nfilter.defaultCollapsed: boolean — 默认折叠，默认 false\nfilter.autoFitMinWidth: string — 最小宽度，默认 '220px'\nfilter.class: string — 筛选区 CSS 类名\nfilter.itemSpan: number — 每项跨列数，默认 1\nfilter.gridColumns: number — 栅格总列数，默认 24\nfilter.gridGap: number | string — 间距，默认 12\nfilter.gridAutoRows: string — 行高，默认 'minmax(32px, auto)'\n\n【根级字段 — toolbar 工具栏】\ntoolbar.items: SparkNode[] — 工具栏按钮（优先 builtin-action，其次 Render*）\ntoolbar.position: 'top' | 'bottom' — 默认 'top'\n\n【根级字段 — actions 行操作列】\nactions.items: SparkNode[] — 行操作按钮（优先 builtin-action）\nactions.position: 'left' | 'right' — 默认 'right'\nactions.label: string — 操作列标题，默认 '操作'\nactions.width: number — 操作列宽度，默认 160\nactions.align: 'left' | 'center' | 'right' — 默认 'left'\nactions.fixed: boolean | 'left' | 'right' — 固定方向\nactions.class: string — 操作列 CSS 类名\n\n【能力链】\nconsumes: PAGE_DATASET, PAGE_SERVICE, PAGE_COMPONENT_REGISTRY, MODULE_CONTEXT\nprovides: DATA_SOURCE, FIELD_CONTEXT\n\nchildren 内仅用 r-* 字段组件做列，禁止 el-table-column",
      "source": "vcm+override"
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
          "description": "栅格间距",
          "schema": {
            "kind": "enum",
            "type": "string | number",
            "variants": [
              "string",
              "number"
            ]
          }
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "required": false,
          "default": "\"minmax(32px, auto)\"",
          "description": "栅格行高"
        }
      ],
      "emits": [],
      "exposed": [
        {
          "name": "toolbarPosition",
          "type": "ToolbarPosition | undefined",
          "description": "工具栏位置",
          "schema": {
            "kind": "enum",
            "type": "ToolbarPosition | undefined",
            "variants": [
              "undefined",
              "\"top\"",
              "\"bottom\"",
              "\"left\"",
              "\"right\""
            ]
          }
        },
        {
          "name": "toolbarClass",
          "type": "string | undefined",
          "description": "工具栏 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "gridColumns",
          "type": "number | undefined",
          "description": "CSS Grid 列数",
          "schema": {
            "kind": "enum",
            "type": "number | undefined",
            "variants": [
              "undefined",
              "number"
            ]
          }
        },
        {
          "name": "gridGap",
          "type": "string | number | undefined",
          "description": "栅格间距",
          "schema": {
            "kind": "enum",
            "type": "string | number | undefined",
            "variants": [
              "undefined",
              "string",
              "number"
            ]
          }
        },
        {
          "name": "gridAutoRows",
          "type": "string | undefined",
          "description": "栅格行高",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "labelWidth",
          "type": "string | undefined",
          "description": "表单标签宽度",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "dataKey",
          "type": "string",
          "description": "数据绑定键，如 \"Users@currentRow\""
        },
        {
          "name": "children",
          "type": "SparkNode[]",
          "description": "子节点列表"
        },
        {
          "name": "toolbar",
          "type": "SparkNode[]",
          "description": "工具栏按钮配置"
        },
        {
          "name": "getDataSource",
          "type": "() => IDataSource | null",
          "description": "获取底层 DataView（IDataSource）"
        },
        {
          "name": "getFormData",
          "type": "() => Record<string, unknown>",
          "description": "获取当前表单数据（reactive mirror of currentRow）"
        },
        {
          "name": "getNativeForm",
          "type": "() => unknown",
          "description": "获取底层 el-form 实例（escape hatch）"
        },
        {
          "name": "validate",
          "type": "() => Promise<boolean>",
          "description": "触发表单校验，返回是否通过"
        },
        {
          "name": "resetFields",
          "type": "() => void",
          "description": "重置表单到初始值"
        },
        {
          "name": "clearValidate",
          "type": "() => void",
          "description": "清除校验状态"
        },
        {
          "name": "getFieldValue",
          "type": "(field: string) => unknown",
          "description": "读取指定字段值"
        },
        {
          "name": "setFieldValue",
          "type": "(field: string, value: unknown) => void",
          "description": "写入指定字段值"
        }
      ],
      "slots": [
        {
          "name": "toolbar",
          "type": "{ dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; row: Record<string, unknown>; model: Record<string, unknown>; }",
          "schema": {
            "kind": "object",
            "type": "{ dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; row: Record<string, unknown>; model: Record<string, unknown>; }",
            "properties": {
              "dataSource": {
                "name": "dataSource",
                "type": "DataView | null | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "DataView | null | undefined",
                  "variants": [
                    "undefined",
                    "null",
                    "DataView"
                  ]
                }
              },
              "modelPermission": {
                "name": "modelPermission",
                "type": "IModelPermission | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "IModelPermission | undefined",
                  "variants": [
                    "undefined",
                    "IModelPermission"
                  ]
                }
              },
              "row": {
                "name": "row",
                "type": "Record<string, unknown>",
                "required": true
              },
              "model": {
                "name": "model",
                "type": "Record<string, unknown>",
                "required": true
              }
            }
          }
        },
        {
          "name": "default",
          "type": "{ dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; row: Record<string, unknown>; model: Record<string, unknown>; }",
          "schema": {
            "kind": "object",
            "type": "{ dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; row: Record<string, unknown>; model: Record<string, unknown>; }",
            "properties": {
              "dataSource": {
                "name": "dataSource",
                "type": "DataView | null | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "DataView | null | undefined",
                  "variants": [
                    "undefined",
                    "null",
                    "DataView"
                  ]
                }
              },
              "modelPermission": {
                "name": "modelPermission",
                "type": "IModelPermission | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "IModelPermission | undefined",
                  "variants": [
                    "undefined",
                    "IModelPermission"
                  ]
                }
              },
              "row": {
                "name": "row",
                "type": "Record<string, unknown>",
                "required": true
              },
              "model": {
                "name": "model",
                "type": "Record<string, unknown>",
                "required": true
              }
            }
          }
        }
      ],
      "rootFields": [
        {
          "name": "dataKey",
          "type": "string",
          "description": "数据绑定键，如 \"Users@currentRow\""
        },
        {
          "name": "toolbar",
          "type": "Rule[]",
          "description": "工具栏"
        },
        {
          "name": "toolbarPosition",
          "type": "'top' | 'bottom'",
          "description": "默认 'top'"
        },
        {
          "name": "toolbarClass",
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
      "notes": "**r-form** — 数据表单容器（读写 currentRow）\ndataKey: string — 数据绑定键，如 \"Users@currentRow\"\ntoolbar: Rule[] — 工具栏\ntoolbarPosition: 'top' | 'bottom' — 默认 'top'\ntoolbarClass: string — 工具栏 CSS 类名\nlabelWidth: string — 标签宽度，默认 '100px'\ngridColumns: number — CSS Grid 列数，默认 24\ngridGap: number | string — 栅格间距，默认 0\ngridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'\n\n【能力链】\nconsumes: PAGE_DATASET\nprovides: DATA_SOURCE, FIELD_CONTEXT, CONTEXT_DATA\n\nchildren 内放 r-* 字段组件",
      "source": "vcm+override"
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
          "description": "栅格间距",
          "schema": {
            "kind": "enum",
            "type": "string | number",
            "variants": [
              "string",
              "number"
            ]
          }
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "required": false,
          "default": "\"minmax(32px, auto)\"",
          "description": "栅格行高"
        }
      ],
      "emits": [],
      "exposed": [
        {
          "name": "toolbarPosition",
          "type": "ToolbarPosition | undefined",
          "description": "工具栏位置",
          "schema": {
            "kind": "enum",
            "type": "ToolbarPosition | undefined",
            "variants": [
              "undefined",
              "\"top\"",
              "\"bottom\"",
              "\"left\"",
              "\"right\""
            ]
          }
        },
        {
          "name": "toolbarClass",
          "type": "string | undefined",
          "description": "工具栏 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "gridColumns",
          "type": "number | undefined",
          "description": "CSS Grid 列数",
          "schema": {
            "kind": "enum",
            "type": "number | undefined",
            "variants": [
              "undefined",
              "number"
            ]
          }
        },
        {
          "name": "gridGap",
          "type": "string | number | undefined",
          "description": "栅格间距",
          "schema": {
            "kind": "enum",
            "type": "string | number | undefined",
            "variants": [
              "undefined",
              "string",
              "number"
            ]
          }
        },
        {
          "name": "gridAutoRows",
          "type": "string | undefined",
          "description": "栅格行高",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "dataKey",
          "type": "string",
          "description": "数据绑定键"
        },
        {
          "name": "children",
          "type": "SparkNode[]",
          "description": "子节点列表"
        },
        {
          "name": "toolbar",
          "type": "SparkNode[]",
          "description": "工具栏按钮配置"
        },
        {
          "name": "getDataSource",
          "type": "() => IDataSource | null",
          "description": "获取底层 DataView（IDataSource）"
        },
        {
          "name": "getDetailData",
          "type": "() => Record<string, unknown>",
          "description": "获取当前详情数据"
        },
        {
          "name": "getCurrentRow",
          "type": "() => IDataRow | null",
          "description": "获取当前行数据（便捷访问）"
        },
        {
          "name": "getFieldValue",
          "type": "(field: string) => unknown",
          "description": "读取指定字段值"
        }
      ],
      "slots": [
        {
          "name": "toolbar",
          "type": "{ dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; row: Record<string, unknown>; model: Record<string, unknown>; }",
          "schema": {
            "kind": "object",
            "type": "{ dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; row: Record<string, unknown>; model: Record<string, unknown>; }",
            "properties": {
              "dataSource": {
                "name": "dataSource",
                "type": "DataView | null | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "DataView | null | undefined",
                  "variants": [
                    "undefined",
                    "null",
                    "DataView"
                  ]
                }
              },
              "modelPermission": {
                "name": "modelPermission",
                "type": "IModelPermission | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "IModelPermission | undefined",
                  "variants": [
                    "undefined",
                    "IModelPermission"
                  ]
                }
              },
              "row": {
                "name": "row",
                "type": "Record<string, unknown>",
                "required": true
              },
              "model": {
                "name": "model",
                "type": "Record<string, unknown>",
                "required": true
              }
            }
          }
        },
        {
          "name": "default",
          "type": "{ dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; row: Record<string, unknown>; model: Record<string, unknown>; }",
          "schema": {
            "kind": "object",
            "type": "{ dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; row: Record<string, unknown>; model: Record<string, unknown>; }",
            "properties": {
              "dataSource": {
                "name": "dataSource",
                "type": "DataView | null | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "DataView | null | undefined",
                  "variants": [
                    "undefined",
                    "null",
                    "DataView"
                  ]
                }
              },
              "modelPermission": {
                "name": "modelPermission",
                "type": "IModelPermission | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "IModelPermission | undefined",
                  "variants": [
                    "undefined",
                    "IModelPermission"
                  ]
                }
              },
              "row": {
                "name": "row",
                "type": "Record<string, unknown>",
                "required": true
              },
              "model": {
                "name": "model",
                "type": "Record<string, unknown>",
                "required": true
              }
            }
          }
        }
      ],
      "rootFields": [
        {
          "name": "dataKey",
          "type": "string",
          "description": "数据绑定键"
        },
        {
          "name": "toolbar",
          "type": "Rule[]",
          "description": "工具栏"
        },
        {
          "name": "toolbarPosition",
          "type": "'top' | 'bottom'",
          "description": "默认 'top'"
        },
        {
          "name": "toolbarClass",
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
      "notes": "**r-detail** — 只读详情容器（展示 currentRow）\ndataKey: string — 数据绑定键\ntoolbar: Rule[] — 工具栏\ntoolbarPosition: 'top' | 'bottom' — 默认 'top'\ntoolbarClass: string — 工具栏 CSS 类名\ngridColumns: number — CSS Grid 列数，默认 24\ngridGap: number | string — 栅格间距，默认 0\ngridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'\n\n【能力链】\nconsumes: PAGE_DATASET\nprovides: DATA_SOURCE, FIELD_CONTEXT, CONTEXT_DATA\n\nchildren 内放 r-* 字段组件（只读模式）",
      "source": "vcm+override"
    },
    "r-tree": {
      "type": "r-tree",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-tree\" 组织子组件。",
      "props": [
        {
          "name": "dataKey",
          "type": "string",
          "required": false,
          "description": "数据绑定键，如 \"TreeData@rows\""
        },
        {
          "name": "allowAppend",
          "type": "boolean",
          "required": false,
          "description": "允许追加子节点（自动生成追加按钮）",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "allowDelete",
          "type": "boolean",
          "required": false,
          "description": "允许删除节点（自动生成删除按钮）",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        }
      ],
      "emits": [],
      "exposed": [
        {
          "name": "dataKey",
          "type": "string",
          "description": "数据绑定键，如 \"TreeData@rows\""
        },
        {
          "name": "children",
          "type": "SparkNode[]",
          "description": "子节点（树节点内容配置）"
        },
        {
          "name": "toolbar",
          "type": "SparkNode[]",
          "description": "工具栏按钮配置"
        },
        {
          "name": "toolbarPosition",
          "type": "ToolbarPosition",
          "description": "工具栏位置",
          "schema": {
            "kind": "enum",
            "type": "ToolbarPosition",
            "variants": [
              "\"top\"",
              "\"bottom\"",
              "\"left\"",
              "\"right\""
            ]
          }
        },
        {
          "name": "toolbarClass",
          "type": "string",
          "description": "工具栏 CSS 类名"
        },
        {
          "name": "allowAppend",
          "type": "boolean",
          "description": "允许追加子节点（自动生成追加按钮）",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "allowDelete",
          "type": "boolean",
          "description": "允许删除节点（自动生成删除按钮）",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "onNodeClick",
          "type": "(data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void",
          "description": "节点点击回调"
        },
        {
          "name": "onNodeExpand",
          "type": "(data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void",
          "description": "节点展开回调"
        },
        {
          "name": "onNodeCollapse",
          "type": "(data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void",
          "description": "节点折叠回调"
        },
        {
          "name": "getDataSource",
          "type": "() => IDataSource | null",
          "description": "获取底层 DataView（IDataSource）"
        },
        {
          "name": "getTreeData",
          "type": "() => IDataRow[]",
          "description": "获取当前树数据"
        },
        {
          "name": "getNativeTree",
          "type": "() => unknown",
          "description": "获取底层 el-tree 实例（escape hatch）"
        },
        {
          "name": "getCurrentNode",
          "type": "() => IDataRow | null",
          "description": "获取当前选中节点数据"
        },
        {
          "name": "setCurrentKey",
          "type": "(key: string | number) => void",
          "description": "按 key 设置当前选中节点"
        },
        {
          "name": "filter",
          "type": "(keyword: string) => void",
          "description": "按关键词过滤节点"
        },
        {
          "name": "getCheckedKeys",
          "type": "() => (string | number)[]",
          "description": "获取已勾选节点的 key 列表（show-checkbox 模式）"
        },
        {
          "name": "setCheckedKeys",
          "type": "(keys: (string | number)[]) => void",
          "description": "设置勾选节点 key 列表",
          "schema": {
            "kind": "event",
            "type": "(keys: (string | number)[]): void",
            "params": [
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
        },
        {
          "name": "appendNode",
          "type": "(parentKey: string | number | null, nodeData: IDataRow) => void",
          "description": "在指定父节点下追加子节点（parentKey 为 null 时追加到根级）"
        },
        {
          "name": "insertBefore",
          "type": "(refKey: string | number, nodeData: IDataRow) => void",
          "description": "在参考节点之前插入"
        },
        {
          "name": "insertAfter",
          "type": "(refKey: string | number, nodeData: IDataRow) => void",
          "description": "在参考节点之后插入"
        },
        {
          "name": "updateNode",
          "type": "(key: string | number, patch: Partial<IDataRow>) => boolean",
          "description": "更新节点数据（按 nodeKey 匹配）"
        },
        {
          "name": "removeNode",
          "type": "(key: string | number) => boolean",
          "description": "删除节点（按 nodeKey）"
        },
        {
          "name": "getAllowAppend",
          "type": "() => boolean",
          "description": "是否允许追加子节点（控制自动生成的追加按钮）"
        },
        {
          "name": "getAllowDelete",
          "type": "() => boolean",
          "description": "是否允许删除节点（控制自动生成的删除按钮）"
        }
      ],
      "slots": [
        {
          "name": "toolbar",
          "type": "{ [x: string]: unknown; dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; }",
          "schema": {
            "kind": "object",
            "type": "{ [x: string]: unknown; dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; }",
            "properties": {
              "dataSource": {
                "name": "dataSource",
                "type": "DataView | null | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "DataView | null | undefined",
                  "variants": [
                    "undefined",
                    "null",
                    "DataView"
                  ]
                }
              },
              "modelPermission": {
                "name": "modelPermission",
                "type": "IModelPermission | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "IModelPermission | undefined",
                  "variants": [
                    "undefined",
                    "IModelPermission"
                  ]
                }
              }
            }
          }
        },
        {
          "name": "default",
          "type": "{ node: any; data: any; }",
          "schema": {
            "kind": "object",
            "type": "{ node: any; data: any; }",
            "properties": {
              "node": {
                "name": "node",
                "type": "any",
                "required": true
              },
              "data": {
                "name": "data",
                "type": "any",
                "required": true
              }
            }
          }
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
          "name": "toolbar",
          "type": "SparkNode[]",
          "description": "工具栏按钮配置"
        },
        {
          "name": "toolbarPosition",
          "type": "ToolbarPosition",
          "description": "工具栏位置（'top' | 'bottom' | 'left' | 'right'）"
        },
        {
          "name": "toolbarClass",
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
      "notes": "**r-tree** — 树形组件容器\ndataKey: string — 数据绑定键，如 \"TreeData@rows\"\ndataView: DataView — 直接传入的 DataView（与 Table/List/Form/Detail 一致）\ntoolbar: SparkNode[] — 工具栏按钮配置\ntoolbarPosition: ToolbarPosition — 工具栏位置（'top' | 'bottom' | 'left' | 'right'）\ntoolbarClass: string — 工具栏 CSS 类名\nallowAppend: boolean — 允许追加子节点（自动生成追加按钮）\nallowDelete: boolean — 允许删除节点（自动生成删除按钮）\nonNodeClick: string — script.js 节点点击回调函数名\nonNodeExpand: string — 节点展开回调\nonNodeCollapse: string — 节点折叠回调\n其他 props 透传到 el-tree（node-key, default-expand-all, show-checkbox 等）\n\n【能力链】\nconsumes: PAGE_DATASET\nprovides: DATA_SOURCE, FIELD_CONTEXT, CONTEXT_DATA",
      "source": "vcm+override"
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
          "description": "列表项间距",
          "schema": {
            "kind": "enum",
            "type": "string | number",
            "variants": [
              "string",
              "number"
            ]
          }
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
          "description": "使用卡片包裹",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "cardShadow",
          "type": "\"never\" | \"always\" | \"hover\"",
          "required": false,
          "default": "\"hover\"",
          "description": "卡片阴影模式",
          "schema": {
            "kind": "enum",
            "type": "\"never\" | \"always\" | \"hover\"",
            "variants": [
              "\"never\"",
              "\"always\"",
              "\"hover\""
            ]
          }
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
          "description": "栅格间距",
          "schema": {
            "kind": "enum",
            "type": "string | number",
            "variants": [
              "string",
              "number"
            ]
          }
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
        }
      ],
      "emits": [],
      "exposed": [
        {
          "name": "toolbarPosition",
          "type": "ToolbarPosition | undefined",
          "description": "工具栏位置",
          "schema": {
            "kind": "enum",
            "type": "ToolbarPosition | undefined",
            "variants": [
              "undefined",
              "\"top\"",
              "\"bottom\"",
              "\"left\"",
              "\"right\""
            ]
          }
        },
        {
          "name": "toolbarClass",
          "type": "string | undefined",
          "description": "工具栏 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "gridColumns",
          "type": "number | undefined",
          "description": "CSS Grid 列数",
          "schema": {
            "kind": "enum",
            "type": "number | undefined",
            "variants": [
              "undefined",
              "number"
            ]
          }
        },
        {
          "name": "gridGap",
          "type": "string | number | undefined",
          "description": "栅格间距",
          "schema": {
            "kind": "enum",
            "type": "string | number | undefined",
            "variants": [
              "undefined",
              "string",
              "number"
            ]
          }
        },
        {
          "name": "gridAutoRows",
          "type": "string | undefined",
          "description": "栅格行高",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "useCard",
          "type": "boolean | undefined",
          "description": "使用卡片包裹",
          "schema": {
            "kind": "enum",
            "type": "boolean | undefined",
            "variants": [
              "undefined",
              "false",
              "true"
            ]
          }
        },
        {
          "name": "cardShadow",
          "type": "\"never\" | \"always\" | \"hover\" | undefined",
          "description": "卡片阴影模式",
          "schema": {
            "kind": "enum",
            "type": "\"never\" | \"always\" | \"hover\" | undefined",
            "variants": [
              "undefined",
              "\"never\"",
              "\"always\"",
              "\"hover\""
            ]
          }
        },
        {
          "name": "gap",
          "type": "string | number | undefined",
          "description": "列表项间距",
          "schema": {
            "kind": "enum",
            "type": "string | number | undefined",
            "variants": [
              "undefined",
              "string",
              "number"
            ]
          }
        },
        {
          "name": "itemActionsPosition",
          "type": "LateralActionPosition | undefined",
          "description": "列表项操作位置",
          "schema": {
            "kind": "enum",
            "type": "LateralActionPosition | undefined",
            "variants": [
              "undefined",
              "\"left\"",
              "\"right\""
            ]
          }
        },
        {
          "name": "itemActionsClass",
          "type": "string | undefined",
          "description": "操作区 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "columns",
          "type": "number | undefined",
          "description": "列数",
          "schema": {
            "kind": "enum",
            "type": "number | undefined",
            "variants": [
              "undefined",
              "number"
            ]
          }
        },
        {
          "name": "minItemWidth",
          "type": "string | undefined",
          "description": "最小项宽度",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "rowKey",
          "type": "string | undefined",
          "description": "行唯一键字段",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "emptyText",
          "type": "string | undefined",
          "description": "空数据提示文案",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "itemClass",
          "type": "string | undefined",
          "description": "列表项 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "itemStyle",
          "type": "CSSProperties | undefined",
          "description": "列表项行内样式"
        },
        {
          "name": "itemRowSpan",
          "type": "number | undefined",
          "description": "项跨行数",
          "schema": {
            "kind": "enum",
            "type": "number | undefined",
            "variants": [
              "undefined",
              "number"
            ]
          }
        },
        {
          "name": "dataKey",
          "type": "string",
          "description": "数据绑定键"
        },
        {
          "name": "children",
          "type": "SparkNode[]",
          "description": "子节点（列表项内容配置）"
        },
        {
          "name": "toolbar",
          "type": "SparkNode[]",
          "description": "工具栏按钮配置"
        },
        {
          "name": "itemActions",
          "type": "SparkNode[]",
          "description": "列表项操作按钮配置"
        },
        {
          "name": "itemColSpan",
          "type": "number",
          "description": "项跨列数"
        },
        {
          "name": "getDataSource",
          "type": "() => IDataSource | null",
          "description": "获取底层 DataView（IDataSource）"
        },
        {
          "name": "getRows",
          "type": "() => IDataRow[]",
          "description": "获取当前列表行数据"
        },
        {
          "name": "getItemCount",
          "type": "() => number",
          "description": "获取列表项数量"
        },
        {
          "name": "refresh",
          "type": "() => Promise<void>",
          "description": "刷新列表数据（API 数据源）"
        }
      ],
      "slots": [
        {
          "name": "toolbar",
          "type": "{ [x: string]: unknown; dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; }",
          "schema": {
            "kind": "object",
            "type": "{ [x: string]: unknown; dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; }",
            "properties": {
              "dataSource": {
                "name": "dataSource",
                "type": "DataView | null | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "DataView | null | undefined",
                  "variants": [
                    "undefined",
                    "null",
                    "DataView"
                  ]
                }
              },
              "modelPermission": {
                "name": "modelPermission",
                "type": "IModelPermission | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "IModelPermission | undefined",
                  "variants": [
                    "undefined",
                    "IModelPermission"
                  ]
                }
              }
            }
          }
        },
        {
          "name": "item-actions",
          "type": "{ dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; row: IDataRow; rowIndex: number; $index: number; }",
          "schema": {
            "kind": "object",
            "type": "{ dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; row: IDataRow; rowIndex: number; $index: number; }",
            "properties": {
              "dataSource": {
                "name": "dataSource",
                "type": "DataView | null | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "DataView | null | undefined",
                  "variants": [
                    "undefined",
                    "null",
                    "DataView"
                  ]
                }
              },
              "modelPermission": {
                "name": "modelPermission",
                "type": "IModelPermission | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "IModelPermission | undefined",
                  "variants": [
                    "undefined",
                    "IModelPermission"
                  ]
                }
              },
              "row": {
                "name": "row",
                "type": "IDataRow",
                "required": true,
                "schema": {
                  "kind": "object",
                  "type": "IDataRow",
                  "properties": {
                    "_perm": {
                      "name": "_perm",
                      "type": "IInstancePermission",
                      "required": false,
                      "schema": {
                        "kind": "object",
                        "type": "IInstancePermission",
                        "properties": {
                          "allowDelete": {
                            "name": "allowDelete",
                            "type": "boolean",
                            "required": false
                          },
                          "editableFields": {
                            "name": "editableFields",
                            "type": "string[]",
                            "required": false
                          },
                          "hiddenFields": {
                            "name": "hiddenFields",
                            "type": "string[]",
                            "required": false
                          },
                          "maskedFields": {
                            "name": "maskedFields",
                            "type": "string[]",
                            "required": false
                          },
                          "permissionToken": {
                            "name": "permissionToken",
                            "type": "string",
                            "required": false
                          }
                        }
                      }
                    }
                  }
                }
              },
              "rowIndex": {
                "name": "rowIndex",
                "type": "number",
                "required": true
              },
              "$index": {
                "name": "$index",
                "type": "number",
                "required": true
              }
            }
          }
        },
        {
          "name": "default",
          "type": "{ dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; row: IDataRow; rowIndex: number; $index: number; }",
          "schema": {
            "kind": "object",
            "type": "{ dataSource: DataView | null | undefined; modelPermission: IModelPermission | undefined; row: IDataRow; rowIndex: number; $index: number; }",
            "properties": {
              "dataSource": {
                "name": "dataSource",
                "type": "DataView | null | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "DataView | null | undefined",
                  "variants": [
                    "undefined",
                    "null",
                    "DataView"
                  ]
                }
              },
              "modelPermission": {
                "name": "modelPermission",
                "type": "IModelPermission | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "IModelPermission | undefined",
                  "variants": [
                    "undefined",
                    "IModelPermission"
                  ]
                }
              },
              "row": {
                "name": "row",
                "type": "IDataRow",
                "required": true,
                "schema": {
                  "kind": "object",
                  "type": "IDataRow",
                  "properties": {
                    "_perm": {
                      "name": "_perm",
                      "type": "IInstancePermission",
                      "required": false,
                      "schema": {
                        "kind": "object",
                        "type": "IInstancePermission",
                        "properties": {
                          "allowDelete": {
                            "name": "allowDelete",
                            "type": "boolean",
                            "required": false
                          },
                          "editableFields": {
                            "name": "editableFields",
                            "type": "string[]",
                            "required": false
                          },
                          "hiddenFields": {
                            "name": "hiddenFields",
                            "type": "string[]",
                            "required": false
                          },
                          "maskedFields": {
                            "name": "maskedFields",
                            "type": "string[]",
                            "required": false
                          },
                          "permissionToken": {
                            "name": "permissionToken",
                            "type": "string",
                            "required": false
                          }
                        }
                      }
                    }
                  }
                }
              },
              "rowIndex": {
                "name": "rowIndex",
                "type": "number",
                "required": true
              },
              "$index": {
                "name": "$index",
                "type": "number",
                "required": true
              }
            }
          }
        }
      ],
      "rootFields": [
        {
          "name": "dataKey",
          "type": "string",
          "description": "数据绑定键"
        },
        {
          "name": "toolbar",
          "type": "Rule[]",
          "description": "工具栏"
        },
        {
          "name": "toolbarPosition",
          "type": "'top' | 'bottom'",
          "description": "默认 'top'"
        },
        {
          "name": "toolbarClass",
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
      "notes": "**r-list** — 列表容器\ndataKey: string — 数据绑定键\ntoolbar: Rule[] — 工具栏\ntoolbarPosition: 'top' | 'bottom' — 默认 'top'\ntoolbarClass: string — 工具栏 CSS 类名\nitemActions: Rule[] — 列表项操作区\nitemActionsPosition: 'left' | 'right' — 默认 'right'\nitemActionsClass: string — 操作区 CSS 类名\ncolumns: number — 列数，默认 1\ngap: number | string — 间距，默认 0\nminItemWidth: string — 最小项宽度\nrowKey: string — 行唯一键，默认 'id'\nemptyText: string — 空数据文案，默认 '暂无数据'\nitemClass: string — 列表项 CSS 类名\nitemStyle: CSSProperties — 列表项行内样式\nuseCard: boolean — 使用卡片包裹，默认 false\ncardShadow: 'always' | 'hover' | 'never' — 默认 'hover'\ngridColumns: number — 默认 24\ngridGap: number | string — 默认 0\ngridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'\nitemColSpan: number — 项跨列数\nitemRowSpan: number — 项跨行数，默认 1\n\n【能力链】\nconsumes: PAGE_DATASET\nprovides: DATA_SOURCE",
      "source": "vcm+override"
    },
    "r-tabs": {
      "type": "r-tabs",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-tabs\" 组织子组件。",
      "props": [
        {
          "name": "modelValue",
          "type": "string | number",
          "required": false,
          "description": "当前激活标签页",
          "schema": {
            "kind": "enum",
            "type": "string | number",
            "variants": [
              "string",
              "number"
            ]
          }
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
      "exposed": [
        {
          "name": "toolbarPosition",
          "type": "\"top\" | \"bottom\" | \"left\" | \"right\" | undefined",
          "description": "工具栏位置",
          "schema": {
            "kind": "enum",
            "type": "\"top\" | \"bottom\" | \"left\" | \"right\" | undefined",
            "variants": [
              "undefined",
              "\"top\"",
              "\"bottom\"",
              "\"left\"",
              "\"right\""
            ]
          }
        },
        {
          "name": "toolbarClass",
          "type": "string | undefined",
          "description": "工具栏 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "children",
          "type": "SparkNode[]",
          "description": "子节点（标签面板配置）"
        },
        {
          "name": "toolbar",
          "type": "SparkNode[]",
          "description": "工具栏按钮配置"
        },
        {
          "name": "modelValue",
          "type": "string | number",
          "description": "当前激活标签页",
          "schema": {
            "kind": "enum",
            "type": "string | number",
            "variants": [
              "string",
              "number"
            ]
          }
        },
        {
          "name": "onTabChange",
          "type": "(name: string | number) => void",
          "description": "标签页切换回调"
        },
        {
          "name": "onTabClick",
          "type": "(pane: TabsClickEvent, event: Event) => void",
          "description": "标签页点击回调"
        },
        {
          "name": "onUpdate:modelValue",
          "type": "(value: string | number) => any",
          "schema": {
            "kind": "event",
            "type": "(value: string | number): any",
            "params": [
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
        },
        {
          "name": "getActiveTab",
          "type": "() => string | number | undefined",
          "description": "获取当前激活标签页名称"
        },
        {
          "name": "setActiveTab",
          "type": "(name: string | number) => void",
          "description": "设置激活标签页"
        },
        {
          "name": "getPaneNames",
          "type": "() => (string | number)[]",
          "description": "获取所有标签页名称"
        },
        {
          "name": "getPaneCount",
          "type": "() => number",
          "description": "获取标签页数量"
        }
      ],
      "slots": [
        {
          "name": "toolbar",
          "type": "{ [x: string]: unknown; dataSource: null | undefined; modelPermission: IModelPermission | undefined; }",
          "schema": {
            "kind": "object",
            "type": "{ [x: string]: unknown; dataSource: null | undefined; modelPermission: IModelPermission | undefined; }",
            "properties": {
              "dataSource": {
                "name": "dataSource",
                "type": "null | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "null | undefined",
                  "variants": [
                    "undefined",
                    "null"
                  ]
                }
              },
              "modelPermission": {
                "name": "modelPermission",
                "type": "IModelPermission | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "IModelPermission | undefined",
                  "variants": [
                    "undefined",
                    "IModelPermission"
                  ]
                }
              }
            }
          }
        },
        {
          "name": "default",
          "type": "{ pane: SparkNode; paneIndex: number; paneName: string | number; paneLabel: string; activeName: string | number | undefined; }"
        }
      ],
      "rootFields": [
        {
          "name": "toolbar",
          "type": "Rule[]",
          "description": "工具栏"
        },
        {
          "name": "toolbarPosition",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "description": "默认 'top'"
        },
        {
          "name": "toolbarClass",
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
      "notes": "**r-tabs** — 标签页容器\ntoolbar: Rule[] — 工具栏\ntoolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'\ntoolbarClass: string — 工具栏 CSS 类名\nmodelValue: string | number — 当前激活 tab\nonTabChange: string — 切换回调\nonTabClick: string — 点击回调\nchildren 内放 r-tab-pane（每个 tab-pane 内可嵌套任意组件）",
      "source": "vcm+override"
    },
    "r-collapse": {
      "type": "r-collapse",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-collapse\" 组织子组件。",
      "props": [
        {
          "name": "modelValue",
          "type": "CollapseValue",
          "required": false,
          "description": "当前展开的面板",
          "schema": {
            "kind": "enum",
            "type": "CollapseValue",
            "variants": [
              "string",
              "number",
              "(string | number)[]"
            ]
          }
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
      "exposed": [
        {
          "name": "toolbarPosition",
          "type": "\"top\" | \"bottom\" | \"left\" | \"right\" | undefined",
          "description": "工具栏位置",
          "schema": {
            "kind": "enum",
            "type": "\"top\" | \"bottom\" | \"left\" | \"right\" | undefined",
            "variants": [
              "undefined",
              "\"top\"",
              "\"bottom\"",
              "\"left\"",
              "\"right\""
            ]
          }
        },
        {
          "name": "toolbarClass",
          "type": "string | undefined",
          "description": "工具栏 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "children",
          "type": "SparkNode[]",
          "description": "子节点（折叠项配置）"
        },
        {
          "name": "toolbar",
          "type": "SparkNode[]",
          "description": "工具栏按钮配置"
        },
        {
          "name": "modelValue",
          "type": "CollapseValue",
          "description": "当前展开的面板",
          "schema": {
            "kind": "enum",
            "type": "CollapseValue",
            "variants": [
              "string",
              "number",
              "(string | number)[]"
            ]
          }
        },
        {
          "name": "onUpdate:modelValue",
          "type": "(value: CollapseValue) => any",
          "schema": {
            "kind": "event",
            "type": "(value: CollapseValue): any",
            "params": [
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
        },
        {
          "name": "onChange",
          "type": "(value: CollapseValue) => void",
          "description": "展开/折叠切换回调"
        },
        {
          "name": "getExpandedItems",
          "type": "() => string | number | (string | number)[] | undefined",
          "description": "获取当前展开项"
        },
        {
          "name": "setExpandedItems",
          "type": "(value: string | number | (string | number)[]) => void",
          "description": "设置展开项"
        },
        {
          "name": "expandAll",
          "type": "() => void",
          "description": "展开全部"
        },
        {
          "name": "collapseAll",
          "type": "() => void",
          "description": "收起全部"
        },
        {
          "name": "toggleItem",
          "type": "(name: string | number) => void",
          "description": "切换指定项的展开状态"
        },
        {
          "name": "isItemExpanded",
          "type": "(name: string | number) => boolean",
          "description": "查询指定项是否展开"
        }
      ],
      "slots": [
        {
          "name": "toolbar",
          "type": "{ [x: string]: unknown; dataSource: null | undefined; modelPermission: IModelPermission | undefined; }",
          "schema": {
            "kind": "object",
            "type": "{ [x: string]: unknown; dataSource: null | undefined; modelPermission: IModelPermission | undefined; }",
            "properties": {
              "dataSource": {
                "name": "dataSource",
                "type": "null | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "null | undefined",
                  "variants": [
                    "undefined",
                    "null"
                  ]
                }
              },
              "modelPermission": {
                "name": "modelPermission",
                "type": "IModelPermission | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "IModelPermission | undefined",
                  "variants": [
                    "undefined",
                    "IModelPermission"
                  ]
                }
              }
            }
          }
        },
        {
          "name": "default",
          "type": "{ item: SparkNode; itemIndex: number; itemName: string | number; itemTitle: string; activeNames: CollapseValue | undefined; }"
        }
      ],
      "rootFields": [
        {
          "name": "toolbar",
          "type": "Rule[]",
          "description": "工具栏"
        },
        {
          "name": "toolbarPosition",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "description": "默认 'top'"
        },
        {
          "name": "toolbarClass",
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
      "notes": "**r-collapse** — 折叠面板容器\ntoolbar: Rule[] — 工具栏\ntoolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'\ntoolbarClass: string — 工具栏 CSS 类名\nmodelValue: string | number | Array — 展开的面板\nonChange: string — 切换回调\nchildren 内放 r-collapse-item",
      "source": "vcm+override"
    },
    "r-steps": {
      "type": "r-steps",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-steps\" 组织子组件。",
      "props": [
        {
          "name": "modelValue",
          "type": "string | number",
          "required": false,
          "description": "当前步骤",
          "schema": {
            "kind": "enum",
            "type": "string | number",
            "variants": [
              "string",
              "number"
            ]
          }
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
      "exposed": [
        {
          "name": "toolbarPosition",
          "type": "\"top\" | \"bottom\" | \"left\" | \"right\" | undefined",
          "description": "工具栏位置",
          "schema": {
            "kind": "enum",
            "type": "\"top\" | \"bottom\" | \"left\" | \"right\" | undefined",
            "variants": [
              "undefined",
              "\"top\"",
              "\"bottom\"",
              "\"left\"",
              "\"right\""
            ]
          }
        },
        {
          "name": "toolbarClass",
          "type": "string | undefined",
          "description": "工具栏 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "children",
          "type": "SparkNode[]",
          "description": "子节点（步骤配置）"
        },
        {
          "name": "toolbar",
          "type": "SparkNode[]",
          "description": "工具栏按钮配置"
        },
        {
          "name": "modelValue",
          "type": "string | number",
          "description": "当前步骤",
          "schema": {
            "kind": "enum",
            "type": "string | number",
            "variants": [
              "string",
              "number"
            ]
          }
        },
        {
          "name": "onUpdate:modelValue",
          "type": "(value: string | number) => any",
          "schema": {
            "kind": "event",
            "type": "(value: string | number): any",
            "params": [
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
        },
        {
          "name": "onStepChange",
          "type": "(value: string | number, step: SparkNode, index: number) => void",
          "description": "步骤切换回调"
        },
        {
          "name": "getActiveStep",
          "type": "() => string | number | undefined",
          "description": "获取当前活跃步骤名称"
        },
        {
          "name": "getActiveStepIndex",
          "type": "() => number",
          "description": "获取当前活跃步骤索引"
        },
        {
          "name": "setActiveStep",
          "type": "(index: number) => void",
          "description": "设置活跃步骤（按索引）"
        },
        {
          "name": "nextStep",
          "type": "() => void",
          "description": "下一步"
        },
        {
          "name": "prevStep",
          "type": "() => void",
          "description": "上一步"
        },
        {
          "name": "getStepCount",
          "type": "() => number",
          "description": "获取步骤总数"
        },
        {
          "name": "getStepNames",
          "type": "() => (string | number)[]",
          "description": "获取所有步骤名称"
        },
        {
          "name": "isFirstStep",
          "type": "() => boolean",
          "description": "是否为第一步"
        },
        {
          "name": "isLastStep",
          "type": "() => boolean",
          "description": "是否为最后一步"
        }
      ],
      "slots": [
        {
          "name": "toolbar",
          "type": "{ [x: string]: unknown; dataSource: null | undefined; modelPermission: IModelPermission | undefined; }",
          "schema": {
            "kind": "object",
            "type": "{ [x: string]: unknown; dataSource: null | undefined; modelPermission: IModelPermission | undefined; }",
            "properties": {
              "dataSource": {
                "name": "dataSource",
                "type": "null | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "null | undefined",
                  "variants": [
                    "undefined",
                    "null"
                  ]
                }
              },
              "modelPermission": {
                "name": "modelPermission",
                "type": "IModelPermission | undefined",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "IModelPermission | undefined",
                  "variants": [
                    "undefined",
                    "IModelPermission"
                  ]
                }
              }
            }
          }
        },
        {
          "name": "default",
          "type": "{ step: SparkNode; stepIndex: number; stepName: string | number; stepTitle: string; activeStepName: string | number | undefined; }"
        }
      ],
      "rootFields": [
        {
          "name": "toolbar",
          "type": "Rule[]",
          "description": "工具栏"
        },
        {
          "name": "toolbarPosition",
          "type": "'top' | 'bottom' | 'left' | 'right'",
          "description": "默认 'top'"
        },
        {
          "name": "toolbarClass",
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
      "notes": "**r-steps** — 步骤条容器\ntoolbar: Rule[] — 工具栏\ntoolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'\ntoolbarClass: string — 工具栏 CSS 类名\nmodelValue: string | number — 当前步骤\nonStepChange: string — 步骤切换回调\nchildren 内放 r-step",
      "source": "vcm+override"
    },
    "r-dialog": {
      "type": "r-dialog",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-dialog\" 组织子组件。",
      "props": [
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
          "description": "控制显隐（v-model）",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
          "name": "footerClass",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "底部 CSS 类名"
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
          "description": "栅格间距",
          "schema": {
            "kind": "enum",
            "type": "string | number",
            "variants": [
              "string",
              "number"
            ]
          }
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "required": false,
          "default": "\"minmax(32px, auto)\"",
          "description": "栅格行高"
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
      "exposed": [
        {
          "name": "modelValue",
          "type": "boolean | undefined",
          "description": "控制显隐（v-model）",
          "schema": {
            "kind": "enum",
            "type": "boolean | undefined",
            "variants": [
              "undefined",
              "false",
              "true"
            ]
          }
        },
        {
          "name": "gridColumns",
          "type": "number | undefined",
          "description": "CSS Grid 列数",
          "schema": {
            "kind": "enum",
            "type": "number | undefined",
            "variants": [
              "undefined",
              "number"
            ]
          }
        },
        {
          "name": "gridGap",
          "type": "string | number | undefined",
          "description": "栅格间距",
          "schema": {
            "kind": "enum",
            "type": "string | number | undefined",
            "variants": [
              "undefined",
              "string",
              "number"
            ]
          }
        },
        {
          "name": "gridAutoRows",
          "type": "string | undefined",
          "description": "栅格行高",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "headerActions",
          "type": "SparkNode[] | undefined",
          "description": "头部操作按钮配置"
        },
        {
          "name": "title",
          "type": "string | undefined",
          "description": "对话框标题",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "headerClass",
          "type": "string | undefined",
          "description": "头部 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "headerActionsClass",
          "type": "string | undefined",
          "description": "头部操作区 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "bodyClass",
          "type": "string | undefined",
          "description": "内容区 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "footerActions",
          "type": "SparkNode[] | undefined",
          "description": "底部操作按钮配置"
        },
        {
          "name": "footerClass",
          "type": "string | undefined",
          "description": "底部 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "children",
          "type": "SparkNode[]",
          "description": "子节点"
        },
        {
          "name": "onUpdate:modelValue",
          "type": "(value: boolean) => any",
          "schema": {
            "kind": "event",
            "type": "(value: boolean): any",
            "params": [
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
        },
        {
          "name": "onOpen",
          "type": "() => void",
          "description": "打开回调"
        },
        {
          "name": "onClose",
          "type": "() => void",
          "description": "关闭回调"
        },
        {
          "name": "onOpened",
          "type": "() => void",
          "description": "打开动画结束回调"
        },
        {
          "name": "onClosed",
          "type": "() => void",
          "description": "关闭动画结束回调"
        },
        {
          "name": "open",
          "type": "() => void",
          "description": "打开对话框"
        },
        {
          "name": "close",
          "type": "() => void",
          "description": "关闭对话框"
        },
        {
          "name": "isVisible",
          "type": "() => boolean",
          "description": "当前是否可见"
        },
        {
          "name": "toggle",
          "type": "() => void",
          "description": "切换显隐"
        }
      ],
      "slots": [
        {
          "name": "header-actions",
          "type": "{ title: string; visible: boolean; close: () => void; }",
          "schema": {
            "kind": "object",
            "type": "{ title: string; visible: boolean; close: () => void; }",
            "properties": {
              "title": {
                "name": "title",
                "type": "string",
                "required": true
              },
              "visible": {
                "name": "visible",
                "type": "boolean",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "boolean",
                  "variants": [
                    "false",
                    "true"
                  ]
                }
              },
              "close": {
                "name": "close",
                "type": "() => void",
                "required": true
              }
            }
          }
        },
        {
          "name": "default",
          "type": "{ title: string; visible: boolean; close: () => void; }",
          "schema": {
            "kind": "object",
            "type": "{ title: string; visible: boolean; close: () => void; }",
            "properties": {
              "title": {
                "name": "title",
                "type": "string",
                "required": true
              },
              "visible": {
                "name": "visible",
                "type": "boolean",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "boolean",
                  "variants": [
                    "false",
                    "true"
                  ]
                }
              },
              "close": {
                "name": "close",
                "type": "() => void",
                "required": true
              }
            }
          }
        },
        {
          "name": "footer",
          "type": "{ title: string; visible: boolean; close: () => void; }",
          "schema": {
            "kind": "object",
            "type": "{ title: string; visible: boolean; close: () => void; }",
            "properties": {
              "title": {
                "name": "title",
                "type": "string",
                "required": true
              },
              "visible": {
                "name": "visible",
                "type": "boolean",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "boolean",
                  "variants": [
                    "false",
                    "true"
                  ]
                }
              },
              "close": {
                "name": "close",
                "type": "() => void",
                "required": true
              }
            }
          }
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
      "source": "vcm+override"
    },
    "r-drawer": {
      "type": "r-drawer",
      "category": "container",
      "description": "SPARK 容器组件，可在 rule.json 中通过 type=\"r-drawer\" 组织子组件。",
      "props": [
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
          "description": "控制显隐（v-model）",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
          "name": "footerClass",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "底部 CSS 类名"
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
          "description": "栅格间距",
          "schema": {
            "kind": "enum",
            "type": "string | number",
            "variants": [
              "string",
              "number"
            ]
          }
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "required": false,
          "default": "\"minmax(32px, auto)\"",
          "description": "栅格行高"
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
      "exposed": [
        {
          "name": "modelValue",
          "type": "boolean | undefined",
          "description": "控制显隐（v-model）",
          "schema": {
            "kind": "enum",
            "type": "boolean | undefined",
            "variants": [
              "undefined",
              "false",
              "true"
            ]
          }
        },
        {
          "name": "gridColumns",
          "type": "number | undefined",
          "description": "CSS Grid 列数",
          "schema": {
            "kind": "enum",
            "type": "number | undefined",
            "variants": [
              "undefined",
              "number"
            ]
          }
        },
        {
          "name": "gridGap",
          "type": "string | number | undefined",
          "description": "栅格间距",
          "schema": {
            "kind": "enum",
            "type": "string | number | undefined",
            "variants": [
              "undefined",
              "string",
              "number"
            ]
          }
        },
        {
          "name": "gridAutoRows",
          "type": "string | undefined",
          "description": "栅格行高",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "headerActions",
          "type": "SparkNode[] | undefined",
          "description": "头部操作按钮配置"
        },
        {
          "name": "title",
          "type": "string | undefined",
          "description": "抽屉标题",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "headerClass",
          "type": "string | undefined",
          "description": "头部 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "headerActionsClass",
          "type": "string | undefined",
          "description": "头部操作区 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "bodyClass",
          "type": "string | undefined",
          "description": "内容区 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "footerActions",
          "type": "SparkNode[] | undefined",
          "description": "底部操作按钮配置"
        },
        {
          "name": "footerClass",
          "type": "string | undefined",
          "description": "底部 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "children",
          "type": "SparkNode[]",
          "description": "子节点"
        },
        {
          "name": "onUpdate:modelValue",
          "type": "(value: boolean) => any",
          "schema": {
            "kind": "event",
            "type": "(value: boolean): any",
            "params": [
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
        },
        {
          "name": "onOpen",
          "type": "() => void",
          "description": "打开回调"
        },
        {
          "name": "onClose",
          "type": "() => void",
          "description": "关闭回调"
        },
        {
          "name": "onOpened",
          "type": "() => void",
          "description": "打开动画结束回调"
        },
        {
          "name": "onClosed",
          "type": "() => void",
          "description": "关闭动画结束回调"
        },
        {
          "name": "open",
          "type": "() => void",
          "description": "打开抽屉"
        },
        {
          "name": "close",
          "type": "() => void",
          "description": "关闭抽屉"
        },
        {
          "name": "isVisible",
          "type": "() => boolean",
          "description": "当前是否可见"
        },
        {
          "name": "toggle",
          "type": "() => void",
          "description": "切换显隐"
        }
      ],
      "slots": [
        {
          "name": "header-actions",
          "type": "{ title: string; visible: boolean; close: () => void; }",
          "schema": {
            "kind": "object",
            "type": "{ title: string; visible: boolean; close: () => void; }",
            "properties": {
              "title": {
                "name": "title",
                "type": "string",
                "required": true
              },
              "visible": {
                "name": "visible",
                "type": "boolean",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "boolean",
                  "variants": [
                    "false",
                    "true"
                  ]
                }
              },
              "close": {
                "name": "close",
                "type": "() => void",
                "required": true
              }
            }
          }
        },
        {
          "name": "default",
          "type": "{ title: string; visible: boolean; close: () => void; }",
          "schema": {
            "kind": "object",
            "type": "{ title: string; visible: boolean; close: () => void; }",
            "properties": {
              "title": {
                "name": "title",
                "type": "string",
                "required": true
              },
              "visible": {
                "name": "visible",
                "type": "boolean",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "boolean",
                  "variants": [
                    "false",
                    "true"
                  ]
                }
              },
              "close": {
                "name": "close",
                "type": "() => void",
                "required": true
              }
            }
          }
        },
        {
          "name": "footer",
          "type": "{ title: string; visible: boolean; close: () => void; }",
          "schema": {
            "kind": "object",
            "type": "{ title: string; visible: boolean; close: () => void; }",
            "properties": {
              "title": {
                "name": "title",
                "type": "string",
                "required": true
              },
              "visible": {
                "name": "visible",
                "type": "boolean",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "boolean",
                  "variants": [
                    "false",
                    "true"
                  ]
                }
              },
              "close": {
                "name": "close",
                "type": "() => void",
                "required": true
              }
            }
          }
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
      "source": "vcm+override"
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
          "description": "是否可折叠",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "defaultCollapsed",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "默认折叠",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "bordered",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "显示边框",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "useCard",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "使用卡片样式",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "cardShadow",
          "type": "\"never\" | \"always\" | \"hover\"",
          "required": false,
          "default": "\"never\"",
          "description": "卡片阴影模式",
          "schema": {
            "kind": "enum",
            "type": "\"never\" | \"always\" | \"hover\"",
            "variants": [
              "\"never\"",
              "\"always\"",
              "\"hover\""
            ]
          }
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
          "description": "显示切换图标",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
          "description": "栅格间距",
          "schema": {
            "kind": "enum",
            "type": "string | number",
            "variants": [
              "string",
              "number"
            ]
          }
        },
        {
          "name": "gridAutoRows",
          "type": "string",
          "required": false,
          "default": "\"minmax(32px, auto)\"",
          "description": "栅格行高"
        }
      ],
      "emits": [],
      "exposed": [
        {
          "name": "description",
          "type": "string | undefined",
          "description": "分区描述",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "gridColumns",
          "type": "number | undefined",
          "description": "CSS Grid 列数",
          "schema": {
            "kind": "enum",
            "type": "number | undefined",
            "variants": [
              "undefined",
              "number"
            ]
          }
        },
        {
          "name": "gridGap",
          "type": "string | number | undefined",
          "description": "栅格间距",
          "schema": {
            "kind": "enum",
            "type": "string | number | undefined",
            "variants": [
              "undefined",
              "string",
              "number"
            ]
          }
        },
        {
          "name": "gridAutoRows",
          "type": "string | undefined",
          "description": "栅格行高",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "title",
          "type": "string | undefined",
          "description": "分区标题",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "collapsible",
          "type": "boolean | undefined",
          "description": "是否可折叠",
          "schema": {
            "kind": "enum",
            "type": "boolean | undefined",
            "variants": [
              "undefined",
              "false",
              "true"
            ]
          }
        },
        {
          "name": "defaultCollapsed",
          "type": "boolean | undefined",
          "description": "默认折叠",
          "schema": {
            "kind": "enum",
            "type": "boolean | undefined",
            "variants": [
              "undefined",
              "false",
              "true"
            ]
          }
        },
        {
          "name": "bordered",
          "type": "boolean | undefined",
          "description": "显示边框",
          "schema": {
            "kind": "enum",
            "type": "boolean | undefined",
            "variants": [
              "undefined",
              "false",
              "true"
            ]
          }
        },
        {
          "name": "useCard",
          "type": "boolean | undefined",
          "description": "使用卡片样式",
          "schema": {
            "kind": "enum",
            "type": "boolean | undefined",
            "variants": [
              "undefined",
              "false",
              "true"
            ]
          }
        },
        {
          "name": "cardShadow",
          "type": "\"never\" | \"always\" | \"hover\" | undefined",
          "description": "卡片阴影模式",
          "schema": {
            "kind": "enum",
            "type": "\"never\" | \"always\" | \"hover\" | undefined",
            "variants": [
              "undefined",
              "\"never\"",
              "\"always\"",
              "\"hover\""
            ]
          }
        },
        {
          "name": "headerClass",
          "type": "string | undefined",
          "description": "头部 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "headerActionsClass",
          "type": "string | undefined",
          "description": "头部操作区 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "bodyClass",
          "type": "string | undefined",
          "description": "内容区 CSS 类名",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "expandText",
          "type": "string | undefined",
          "description": "展开文案",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "collapseText",
          "type": "string | undefined",
          "description": "收起文案",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "showToggleIcon",
          "type": "boolean | undefined",
          "description": "显示切换图标",
          "schema": {
            "kind": "enum",
            "type": "boolean | undefined",
            "variants": [
              "undefined",
              "false",
              "true"
            ]
          }
        },
        {
          "name": "expandIconText",
          "type": "string | undefined",
          "description": "展开图标文案",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "collapseIconText",
          "type": "string | undefined",
          "description": "收起图标文案",
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "children",
          "type": "SparkNode[]",
          "description": "子节点"
        },
        {
          "name": "headerActions",
          "type": "SparkNode[]",
          "description": "头部操作按钮配置"
        },
        {
          "name": "isCollapsed",
          "type": "() => boolean",
          "description": "当前是否折叠"
        },
        {
          "name": "setCollapsed",
          "type": "(value: boolean) => void",
          "description": "设置折叠状态"
        },
        {
          "name": "toggle",
          "type": "() => void",
          "description": "切换折叠状态"
        }
      ],
      "slots": [
        {
          "name": "header-actions",
          "type": "{ title: string; description: string; collapsed: boolean; toggleCollapsed: () => void; }",
          "schema": {
            "kind": "object",
            "type": "{ title: string; description: string; collapsed: boolean; toggleCollapsed: () => void; }",
            "properties": {
              "title": {
                "name": "title",
                "type": "string",
                "required": true
              },
              "description": {
                "name": "description",
                "type": "string",
                "required": true
              },
              "collapsed": {
                "name": "collapsed",
                "type": "boolean",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "boolean",
                  "variants": [
                    "false",
                    "true"
                  ]
                }
              },
              "toggleCollapsed": {
                "name": "toggleCollapsed",
                "type": "() => void",
                "required": true
              }
            }
          }
        },
        {
          "name": "default",
          "type": "{ title: string; description: string; collapsed: boolean; toggleCollapsed: () => void; }",
          "schema": {
            "kind": "object",
            "type": "{ title: string; description: string; collapsed: boolean; toggleCollapsed: () => void; }",
            "properties": {
              "title": {
                "name": "title",
                "type": "string",
                "required": true
              },
              "description": {
                "name": "description",
                "type": "string",
                "required": true
              },
              "collapsed": {
                "name": "collapsed",
                "type": "boolean",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "boolean",
                  "variants": [
                    "false",
                    "true"
                  ]
                }
              },
              "toggleCollapsed": {
                "name": "toggleCollapsed",
                "type": "() => void",
                "required": true
              }
            }
          }
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
      "notes": "**r-section** — 分区容器\ntitle: string — 标题\ndescription: string — 描述\ncollapsible: boolean — 是否可折叠\ndefaultCollapsed: boolean — 默认折叠\nbordered: boolean — 显示边框，默认 true\nuseCard: boolean — 使用卡片样式，默认 false\ncardShadow: string — 卡片阴影\nheaderActions: Rule[] — 头部操作区\nexpandText: string — 展开文案，默认 '展开'\ncollapseText: string — 收起文案，默认 '收起'\nshowToggleIcon: boolean — 显示切换图标，默认 true\ngridColumns: number — 默认 24\ngridGap: number — 默认 0\ngridAutoRows: string — 行高",
      "source": "vcm+override"
    },
    "r-block": {
      "type": "r-block",
      "category": "container",
      "description": "块容器（轻量分区）",
      "props": [],
      "emits": [],
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
      "notes": "**r-block** — 块容器（轻量分区）\ntitle: string — 标题\ndescription: string — 描述\nheaderActions: Rule[] — 头部操作区\nbordered: boolean — 边框，默认 true\nuseCard: boolean — 卡片样式，默认 false\ngridColumns: number — 默认 24\ngridGap: number — 默认 0\ngridAutoRows: string — 行高定义\n适合做页面中的局部块，不强制数据绑定",
      "source": "override"
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
          "required": false,
          "schema": {
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
        },
        {
          "name": "name",
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
          "required": false,
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "multiple",
          "type": "boolean",
          "required": false,
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "searchable",
          "type": "boolean",
          "required": false,
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "separator",
          "type": "string",
          "required": false
        },
        {
          "name": "valueMode",
          "type": "\"auto\" | \"array\" | \"comma-string\"",
          "required": false,
          "schema": {
            "kind": "enum",
            "type": "\"auto\" | \"array\" | \"comma-string\"",
            "variants": [
              "\"auto\"",
              "\"array\"",
              "\"comma-string\""
            ]
          }
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
      "source": "vcm+override"
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
          "required": false,
          "schema": {
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
        },
        {
          "name": "name",
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
          "required": false,
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "multiple",
          "type": "boolean",
          "required": false,
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "searchable",
          "type": "boolean",
          "required": false,
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "separator",
          "type": "string",
          "required": false
        },
        {
          "name": "valueMode",
          "type": "\"auto\" | \"array\" | \"comma-string\"",
          "required": false,
          "schema": {
            "kind": "enum",
            "type": "\"auto\" | \"array\" | \"comma-string\"",
            "variants": [
              "\"auto\"",
              "\"array\"",
              "\"comma-string\""
            ]
          }
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
      "source": "vcm+override"
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
          "required": false,
          "schema": {
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
        },
        {
          "name": "name",
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
          "required": false,
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "multiple",
          "type": "boolean",
          "required": false,
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "searchable",
          "type": "boolean",
          "required": false,
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "separator",
          "type": "string",
          "required": false
        },
        {
          "name": "valueMode",
          "type": "\"auto\" | \"array\" | \"comma-string\"",
          "required": false,
          "schema": {
            "kind": "enum",
            "type": "\"auto\" | \"array\" | \"comma-string\"",
            "variants": [
              "\"auto\"",
              "\"array\"",
              "\"comma-string\""
            ]
          }
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
      "source": "vcm+override"
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
          "description": "自动上传",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "showFileList",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "显示文件列表",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
          "description": "列表展示类型",
          "schema": {
            "kind": "enum",
            "type": "\"picture\" | \"text\" | \"picture-card\"",
            "variants": [
              "\"picture\"",
              "\"text\"",
              "\"picture-card\""
            ]
          }
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
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]",
          "schema": []
        }
      ],
      "notes": "透传到 el-upload: autoUpload(默认 true), showFileList(默认 true), limit(默认 1), listType('text'|'picture'|'picture-card')",
      "source": "vcm+addendum"
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
          "description": "双向绑定值",
          "schema": {
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
          "description": "可清除",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "filterable",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "可搜索",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "multiple",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "多选模式",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "checkStrictly",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "父子不关联勾选",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "defaultExpandAll",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "默认展开所有节点",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "renderAfterExpand",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "展开后才渲染子节点",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
      "source": "vcm"
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
          "description": "双向绑定值（已选值数组）",
          "schema": {
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
          "description": "可搜索",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
          "description": "右侧排序方式",
          "schema": {
            "kind": "enum",
            "type": "\"push\" | \"unshift\" | \"original\"",
            "variants": [
              "\"push\"",
              "\"unshift\"",
              "\"original\""
            ]
          }
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
      "source": "vcm"
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
          "description": "自适应高度",
          "schema": {
            "kind": "enum",
            "type": "boolean | { minRows?: number; maxRows?: number; }",
            "variants": [
              "false",
              "true",
              "{ minRows?: number; maxRows?: number; }"
            ]
          }
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
          "description": "显示字数统计",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "placeholder",
          "type": "string",
          "required": false,
          "default": "\"\\u8BF7\\u8F93\\u5165\\u5185\\u5BB9\"",
          "description": "占位提示"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]",
          "schema": []
        }
      ],
      "source": "vcm"
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
          "type": "[value: string]",
          "schema": []
        }
      ],
      "source": "vcm"
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
          "description": "双向绑定值",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
      "source": "vcm"
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
          "description": "显示输入框",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: number]",
          "schema": []
        }
      ],
      "source": "vcm"
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
          "description": "双向绑定值",
          "schema": {
            "kind": "enum",
            "type": "string | number",
            "variants": [
              "string",
              "number"
            ]
          }
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
          "description": "可清除",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "filterable",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "可搜索",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
      "source": "vcm"
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
          "description": "允许半星",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: number]",
          "schema": []
        }
      ],
      "source": "vcm"
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
          "description": "双向绑定值",
          "schema": {
            "kind": "enum",
            "type": "string | number",
            "variants": [
              "string",
              "number"
            ]
          }
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
          "description": "按钮风格",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
      "source": "vcm"
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
          "description": "双向绑定值，范围模式时为元组",
          "schema": {
            "kind": "enum",
            "type": "number | [number | undefined, number | undefined]",
            "variants": [
              "number",
              "[number | undefined, number | undefined]"
            ]
          }
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
          "description": "范围筛选标记",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
      "source": "vcm+addendum"
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
          "description": "双向绑定值（数组）",
          "schema": {
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
          "description": "可清除",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "filterable",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "可搜索",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "collapseTags",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "折叠已选标签",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "collapseTagsTooltip",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "折叠标签提示",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
      "source": "vcm"
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
          "description": "多选",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
          "description": "可清除",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]",
          "schema": []
        }
      ],
      "source": "vcm"
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
          "description": "可清除",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "filterable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可搜索",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "classPrefix",
          "type": "string",
          "required": false,
          "default": "\"\"",
          "description": "图标 CSS 类名前缀"
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]",
          "schema": []
        }
      ],
      "source": "vcm"
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
          "type": "[value: string]",
          "schema": []
        }
      ],
      "source": "vcm"
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
          "description": "多选",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
          "description": "可清除",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]",
          "schema": []
        }
      ],
      "source": "vcm"
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
          "description": "多选",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "clearable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可清除",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]",
          "schema": []
        }
      ],
      "notes": "⚠️ 与 r-file-path 基本一致，差异在于内置的浏览器 UI 体验",
      "source": "vcm+addendum"
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
          "description": "双向绑定值",
          "schema": {
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
          "description": "可清除",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "multiple",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "多选",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "searchable",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "可搜索",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
          "description": "值模式",
          "schema": {
            "kind": "enum",
            "type": "\"auto\" | \"array\" | \"comma-string\"",
            "variants": [
              "\"auto\"",
              "\"array\"",
              "\"comma-string\""
            ]
          }
        },
        {
          "name": "entityName",
          "type": "string",
          "required": false,
          "default": "\"\\u9879\\u76EE\"",
          "description": "实体名称"
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
      "source": "vcm"
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
          "description": "双向绑定值，日期范围时为数组",
          "schema": {
            "kind": "enum",
            "type": "string | Date | (string | Date)[]",
            "variants": [
              "string",
              "Date",
              "(string | Date)[]"
            ]
          }
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
          "description": "范围筛选标记",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
      "source": "vcm+addendum"
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
          "description": "列宽",
          "schema": {
            "kind": "enum",
            "type": "string | number",
            "variants": [
              "string",
              "number"
            ]
          }
        },
        {
          "name": "minWidth",
          "type": "string | number",
          "required": false,
          "description": "最小宽度",
          "schema": {
            "kind": "enum",
            "type": "string | number",
            "variants": [
              "string",
              "number"
            ]
          }
        },
        {
          "name": "fixed",
          "type": "boolean | \"left\" | \"right\"",
          "required": false,
          "description": "固定方向",
          "schema": {
            "kind": "enum",
            "type": "boolean | \"left\" | \"right\"",
            "variants": [
              "false",
              "true",
              "\"left\"",
              "\"right\""
            ]
          }
        },
        {
          "name": "align",
          "type": "\"left\" | \"right\" | \"center\"",
          "required": false,
          "description": "对齐方式",
          "schema": {
            "kind": "enum",
            "type": "\"left\" | \"right\" | \"center\"",
            "variants": [
              "\"left\"",
              "\"right\"",
              "\"center\""
            ]
          }
        },
        {
          "name": "headerAlign",
          "type": "\"left\" | \"right\" | \"center\"",
          "required": false,
          "description": "表头对齐",
          "schema": {
            "kind": "enum",
            "type": "\"left\" | \"right\" | \"center\"",
            "variants": [
              "\"left\"",
              "\"right\"",
              "\"center\""
            ]
          }
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
      "notes": "【使用场景】复杂表格需要多级表头分组，例如「基本信息」下包含「姓名」「年龄」「邮箱」\n\n【示例】\n{ \"type\": \"r-column-group\", \"props\": { \"label\": \"基本信息\" }, \"children\": [\n  { \"type\": \"r-text\", \"field\": \"name\", \"props\": { \"label\": \"姓名\" } },\n  { \"type\": \"r-number\", \"field\": \"age\", \"props\": { \"label\": \"年龄\" } }\n]}\nchildren 内放 r-* 字段组件作为实际数据列",
      "source": "vcm+addendum"
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
          "type": "[value: string]",
          "schema": []
        }
      ],
      "notes": "透传到 el-color-picker: showAlpha, colorFormat('hex'|'rgb'|'hsl'|'hsv'), predefine(string[])",
      "source": "vcm+addendum"
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
          "description": "双向绑定值（数组）",
          "schema": {
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
          "description": "按钮风格",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
      "source": "vcm"
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
          "description": "双向绑定值",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
      "source": "vcm+addendum"
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
          "description": "双向绑定值",
          "schema": {
            "kind": "enum",
            "type": "CascaderValue",
            "variants": [
              "CascaderPath",
              "CascaderPath[]"
            ]
          }
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
          "description": "可清除",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "filterable",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "可搜索",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "multiple",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "多选模式",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "checkStrictly",
          "type": "boolean",
          "required": false,
          "default": "false",
          "description": "父子不关联勾选",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "emitPath",
          "type": "boolean",
          "required": false,
          "default": "true",
          "description": "值是否为完整路径数组",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
      "source": "vcm"
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
          "default": "false",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "forceOpen",
          "type": "boolean",
          "required": false,
          "default": "false",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        }
      ],
      "emits": [],
      "source": "vcm"
    },
    "nav-icon": {
      "type": "nav-icon",
      "category": "feature",
      "description": "SPARK 组件，可在注册表中通过 type=\"nav-icon\" 使用。",
      "props": [
        {
          "name": "name",
          "type": "string | undefined",
          "required": false,
          "schema": {
            "kind": "enum",
            "type": "string | undefined",
            "variants": [
              "undefined",
              "string"
            ]
          }
        },
        {
          "name": "size",
          "type": "number | undefined",
          "required": false,
          "schema": {
            "kind": "enum",
            "type": "number | undefined",
            "variants": [
              "undefined",
              "number"
            ]
          }
        }
      ],
      "emits": [],
      "source": "vcm"
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
      ],
      "emits": [],
      "source": "vcm"
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
          "default": "60",
          "schema": {
            "kind": "enum",
            "type": "string | number",
            "variants": [
              "string",
              "number"
            ]
          }
        }
      ],
      "emits": [
        {
          "name": "update:modelValue",
          "type": "[value: string]",
          "schema": []
        }
      ],
      "source": "vcm"
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
          "description": "错误对象\r\n包含错误消息（message）和堆栈信息（stack）",
          "schema": {
            "kind": "object",
            "type": "Error",
            "properties": {
              "name": {
                "name": "name",
                "type": "string",
                "required": true
              },
              "message": {
                "name": "message",
                "type": "string",
                "required": true
              },
              "stack": {
                "name": "stack",
                "type": "string",
                "required": false
              },
              "cause": {
                "name": "cause",
                "type": "unknown",
                "required": false
              }
            }
          }
        }
      ],
      "emits": [],
      "source": "vcm"
    },
    "ai-proposal-card": {
      "type": "ai-proposal-card",
      "category": "feature",
      "description": "SPARK 组件，可在注册表中通过 type=\"ai-proposal-card\" 使用。",
      "props": [
        {
          "name": "proposal",
          "type": "DesignProposal",
          "required": true,
          "schema": {
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
                    "__@toPrimitive@860": {
                      "name": "__@toPrimitive@860",
                      "type": "{ (hint: \"default\"): string; (hint: \"string\"): string; (hint: \"number\"): number; (hint: string): string | number; }",
                      "required": true,
                      "description": "Converts a Date object to a string.\nConverts a Date object to a number.\nConverts a Date object to a string or number."
                    }
                  }
                }
              }
            }
          }
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
                      "__@toPrimitive@860": {
                        "name": "__@toPrimitive@860",
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
      ],
      "source": "vcm"
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
          "default": "false",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
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
      "source": "vcm"
    },
    "ai-chat-widget": {
      "type": "ai-chat-widget",
      "category": "feature",
      "description": "SPARK 组件，可在注册表中通过 type=\"ai-chat-widget\" 使用。",
      "props": [
        {
          "name": "mode",
          "type": "ChatMode",
          "required": false,
          "schema": {
            "kind": "enum",
            "type": "ChatMode",
            "variants": [
              "\"multi\"",
              "\"single\""
            ]
          }
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
          "required": false,
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        }
      ],
      "emits": [],
      "source": "vcm"
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
          "default": "false",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        },
        {
          "name": "forceOpen",
          "type": "boolean",
          "required": false,
          "default": "false",
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        }
      ],
      "emits": [],
      "source": "vcm"
    },
    "ai-assistant-hub": {
      "type": "ai-assistant-hub",
      "category": "feature",
      "description": "SPARK 组件，可在注册表中通过 type=\"ai-assistant-hub\" 使用。",
      "props": [],
      "emits": [],
      "source": "vcm"
    },
    "tenant-config": {
      "type": "tenant-config",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"tenant-config\" 引用。",
      "props": [],
      "emits": [],
      "source": "vcm"
    },
    "settings": {
      "type": "settings",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"settings\" 引用。",
      "props": [],
      "emits": [],
      "source": "vcm"
    },
    "cache-manager": {
      "type": "cache-manager",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"cache-manager\" 引用。",
      "props": [],
      "emits": [],
      "source": "vcm"
    },
    "app-list": {
      "type": "app-list",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"app-list\" 引用。",
      "props": [],
      "emits": [],
      "source": "vcm"
    },
    "login-view": {
      "type": "login-view",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"login-view\" 引用。",
      "props": [],
      "emits": [],
      "source": "vcm"
    },
    "home-page": {
      "type": "home-page",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"home-page\" 引用。",
      "props": [],
      "emits": [],
      "source": "vcm"
    },
    "about": {
      "type": "about",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"about\" 引用。",
      "props": [],
      "emits": [],
      "source": "vcm"
    },
    "dashboard": {
      "type": "dashboard",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"dashboard\" 引用。",
      "props": [],
      "emits": [],
      "source": "vcm"
    },
    "capability-demo": {
      "type": "capability-demo",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"capability-demo\" 引用。",
      "props": [],
      "emits": [],
      "source": "vcm"
    },
    "dev-workbench": {
      "type": "dev-workbench",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"dev-workbench\" 引用。",
      "props": [],
      "emits": [],
      "source": "vcm"
    },
    "dev-system": {
      "type": "dev-system",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"dev-system\" 引用。",
      "props": [],
      "emits": [],
      "source": "vcm"
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
      ],
      "emits": [],
      "exposed": [
        {
          "name": "state",
          "type": "{ treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[], StatusMessage[] | { text: string; type: \"error\" | \"success\" | \"warning\" | \"info\"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<\"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\", \"error\" | \"pending\" | \"idle\" | \"saving\" | \"saved\">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: \"error\" | \"success\" | \"warning\" | \"info\") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: \"toolbar\" | \"user-menu\") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }"
        },
        {
          "name": "treeRef",
          "type": "any"
        }
      ],
      "source": "vcm"
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
      ],
      "source": "vcm"
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
      ],
      "source": "vcm"
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
      ],
      "emits": [],
      "source": "vcm"
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
      ],
      "emits": [],
      "source": "vcm"
    },
    "workspace-panel": {
      "type": "workspace-panel",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"workspace-panel\" 引用。",
      "props": [
        {
          "name": "nodeId",
          "type": "string | null",
          "required": true,
          "schema": {
            "kind": "enum",
            "type": "string | null",
            "variants": [
              "null",
              "string"
            ]
          }
        }
      ],
      "emits": [],
      "source": "vcm"
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
      ],
      "emits": [],
      "source": "vcm"
    },
    "project-tree": {
      "type": "project-tree",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"project-tree\" 引用。",
      "props": [
        {
          "name": "state",
          "type": "ProjectState",
          "required": true,
          "schema": {
            "kind": "object",
            "type": "ProjectState",
            "properties": {
              "projectName": {
                "name": "projectName",
                "type": "string",
                "required": true
              },
              "wbsRoot": {
                "name": "wbsRoot",
                "type": "WbsNode[]",
                "required": true,
                "schema": {
                  "kind": "array",
                  "type": "WbsNode[]",
                  "items": [
                    {
                      "kind": "object",
                      "type": "WbsNode",
                      "properties": {
                        "id": {
                          "name": "id",
                          "type": "string",
                          "required": true
                        },
                        "title": {
                          "name": "title",
                          "type": "string",
                          "required": true
                        },
                        "description": {
                          "name": "description",
                          "type": "string",
                          "required": true,
                          "description": "需求 / 功能描述"
                        },
                        "type": {
                          "name": "type",
                          "type": "WbsNodeType",
                          "required": true
                        },
                        "icon": {
                          "name": "icon",
                          "type": "string",
                          "required": true
                        },
                        "status": {
                          "name": "status",
                          "type": "WbsNodeStatus",
                          "required": true
                        },
                        "navPath": {
                          "name": "navPath",
                          "type": "string",
                          "required": false
                        },
                        "navHidden": {
                          "name": "navHidden",
                          "type": "boolean",
                          "required": false
                        },
                        "pageId": {
                          "name": "pageId",
                          "type": "string",
                          "required": false
                        },
                        "pageType": {
                          "name": "pageType",
                          "type": "PageType",
                          "required": false
                        },
                        "children": {
                          "name": "children",
                          "type": "WbsNode[]",
                          "required": true
                        }
                      }
                    }
                  ]
                }
              },
              "selectedNodeId": {
                "name": "selectedNodeId",
                "type": "string | null",
                "required": true,
                "schema": {
                  "kind": "enum",
                  "type": "string | null",
                  "variants": [
                    "null",
                    "string"
                  ]
                }
              },
              "aiPanelVisible": {
                "name": "aiPanelVisible",
                "type": "boolean",
                "required": true
              },
              "lastUpdated": {
                "name": "lastUpdated",
                "type": "string",
                "required": true
              }
            }
          }
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
      ],
      "source": "vcm"
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
      ],
      "emits": [],
      "source": "vcm"
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
      ],
      "emits": [],
      "source": "vcm"
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
      ],
      "emits": [],
      "source": "vcm"
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
      ],
      "emits": [],
      "source": "vcm"
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
      ],
      "emits": [],
      "source": "vcm"
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
          "required": true,
          "schema": {
            "kind": "enum",
            "type": "boolean",
            "variants": [
              "false",
              "true"
            ]
          }
        }
      ],
      "emits": [],
      "source": "vcm"
    },
    "ai-studio-panel": {
      "type": "ai-studio-panel",
      "category": "feature",
      "description": "SPARK 视图组件，可在注册表中通过 type=\"ai-studio-panel\" 引用。",
      "props": [],
      "emits": [],
      "source": "vcm"
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
  "about": `**about** — SPARK 视图组件，可在注册表中通过 type="about" 引用。`,
  "ai-assistant-hub": `**ai-assistant-hub** — SPARK 组件，可在注册表中通过 type="ai-assistant-hub" 使用。`,
  "ai-chat-panel": `**ai-chat-panel** — SPARK 组件，可在注册表中通过 type="ai-chat-panel" 使用。

【Props】
embedded?: boolean (默认 false)
forceOpen?: boolean (默认 false)`,
  "ai-chat-widget": `**ai-chat-widget** — SPARK 组件，可在注册表中通过 type="ai-chat-widget" 使用。

【Props】
mode?: ChatMode
systemPrompt?: string
title?: string
placeholder?: string
compact?: boolean`,
  "ai-design-studio": `**ai-design-studio** — SPARK 组件，可在注册表中通过 type="ai-design-studio" 使用。

【Props】
modelValue?: boolean (默认 false)

【事件】
update:modelValue: [value: boolean]`,
  "ai-proposal-card": `**ai-proposal-card** — SPARK 组件，可在注册表中通过 type="ai-proposal-card" 使用。

【Props】
proposal: DesignProposal

【事件】
accept: [id: string]
reject: [id: string]
discuss: [proposal: DesignProposal]
editContent: [id: string, content: string]
editTitle: [id: string, title: string]`,
  "ai-studio-panel": `**ai-studio-panel** — SPARK 视图组件，可在注册表中通过 type="ai-studio-panel" 引用。`,
  "app-list": `**app-list** — SPARK 视图组件，可在注册表中通过 type="app-list" 引用。`,
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
  "cache-manager": `**cache-manager** — SPARK 视图组件，可在注册表中通过 type="cache-manager" 引用。`,
  "capability-demo": `**capability-demo** — SPARK 视图组件，可在注册表中通过 type="capability-demo" 引用。`,
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
  "dashboard": `**dashboard** — SPARK 视图组件，可在注册表中通过 type="dashboard" 引用。`,
  "dev-ai-panel": `**dev-ai-panel** — SPARK 视图组件，可在注册表中通过 type="dev-ai-panel" 引用。

【Props】
state: { treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: "error" | "success" | "warning" | "info"; time: string; }[], StatusMessage[] | { text: string; type: "error" | "success" | "warning" | "info"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<"error" | "pending" | "idle" | "saving" | "saved", "error" | "pending" | "idle" | "saving" | "saved">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: "error" | "success" | "warning" | "info") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: "toolbar" | "user-menu") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: "toolbar" | "user-menu") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }`,
  "dev-file-editor": `**dev-file-editor** — SPARK 视图组件，可在注册表中通过 type="dev-file-editor" 引用。

【Props】
state: { treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: "error" | "success" | "warning" | "info"; time: string; }[], StatusMessage[] | { text: string; type: "error" | "success" | "warning" | "info"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<"error" | "pending" | "idle" | "saving" | "saved", "error" | "pending" | "idle" | "saving" | "saved">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: "error" | "success" | "warning" | "info") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: "toolbar" | "user-menu") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: "toolbar" | "user-menu") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }`,
  "dev-node-props": `**dev-node-props** — SPARK 视图组件，可在注册表中通过 type="dev-node-props" 引用。

【Props】
state: { treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: "error" | "success" | "warning" | "info"; time: string; }[], StatusMessage[] | { text: string; type: "error" | "success" | "warning" | "info"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<"error" | "pending" | "idle" | "saving" | "saved", "error" | "pending" | "idle" | "saving" | "saved">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: "error" | "success" | "warning" | "info") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: "toolbar" | "user-menu") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: "toolbar" | "user-menu") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }

【事件】
createPage: []`,
  "dev-page-overview": `**dev-page-overview** — SPARK 视图组件，可在注册表中通过 type="dev-page-overview" 引用。

【Props】
state: { treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: "error" | "success" | "warning" | "info"; time: string; }[], StatusMessage[] | { text: string; type: "error" | "success" | "warning" | "info"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<"error" | "pending" | "idle" | "saving" | "saved", "error" | "pending" | "idle" | "saving" | "saved">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: "error" | "success" | "warning" | "info") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: "toolbar" | "user-menu") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: "toolbar" | "user-menu") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }

【事件】
createPage: []
locateNode: [pageId: string]
editPage: [pageId: string]`,
  "dev-site-tree": `**dev-site-tree** — SPARK 视图组件，可在注册表中通过 type="dev-site-tree" 引用。

【Props】
state: { treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: "error" | "success" | "warning" | "info"; time: string; }[], StatusMessage[] | { text: string; type: "error" | "success" | "warning" | "info"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<"error" | "pending" | "idle" | "saving" | "saved", "error" | "pending" | "idle" | "saving" | "saved">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: "error" | "success" | "warning" | "info") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: "toolbar" | "user-menu") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: "toolbar" | "user-menu") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }`,
  "dev-system": `**dev-system** — SPARK 视图组件，可在注册表中通过 type="dev-system" 引用。`,
  "dev-workbench": `**dev-workbench** — SPARK 视图组件，可在注册表中通过 type="dev-workbench" 引用。`,
  "error-fallback": `**error-fallback** — SPARK 组件，可在注册表中通过 type="error-fallback" 使用。

【Props】
error?: Error — 错误对象
包含错误消息（message）和堆栈信息（stack）`,
  "home-page": `**home-page** — SPARK 视图组件，可在注册表中通过 type="home-page" 引用。`,
  "icon-picker": `**icon-picker** — SPARK 组件，可在注册表中通过 type="icon-picker" 使用。

【Props】
modelValue?: string (默认 "")
placeholder?: string (默认 "\\u9009\\u62E9\\u56FE\\u6807")
width?: string | number (默认 60)

【事件】
update:modelValue: [value: string]`,
  "login-view": `**login-view** — SPARK 视图组件，可在注册表中通过 type="login-view" 引用。`,
  "module-context-badge": `**module-context-badge** — SPARK 组件，可在注册表中通过 type="module-context-badge" 使用。

【Props】
label?: string (默认 "\\u4E0A\\u4E0B\\u6587")
emptyText?: string (默认 "\\u672A\\u9009\\u62E9")`,
  "nav-icon": `**nav-icon** — SPARK 组件，可在注册表中通过 type="nav-icon" 使用。

【Props】
name?: string | undefined
size?: number | undefined`,
  "node-basic-info": `**node-basic-info** — SPARK 视图组件，可在注册表中通过 type="node-basic-info" 引用。

【Props】
state: { treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: "error" | "success" | "warning" | "info"; time: string; }[], StatusMessage[] | { text: string; type: "error" | "success" | "warning" | "info"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<"error" | "pending" | "idle" | "saving" | "saved", "error" | "pending" | "idle" | "saving" | "saved">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: "error" | "success" | "warning" | "info") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: "toolbar" | "user-menu") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: "toolbar" | "user-menu") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }
moduleKindDisabled: boolean`,
  "node-context-config": `**node-context-config** — SPARK 视图组件，可在注册表中通过 type="node-context-config" 引用。

【Props】
state: { treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: "error" | "success" | "warning" | "info"; time: string; }[], StatusMessage[] | { text: string; type: "error" | "success" | "warning" | "info"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<"error" | "pending" | "idle" | "saving" | "saved", "error" | "pending" | "idle" | "saving" | "saved">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: "error" | "success" | "warning" | "info") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: "toolbar" | "user-menu") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: "toolbar" | "user-menu") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }`,
  "node-layout-config": `**node-layout-config** — SPARK 视图组件，可在注册表中通过 type="node-layout-config" 引用。

【Props】
state: { treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: "error" | "success" | "warning" | "info"; time: string; }[], StatusMessage[] | { text: string; type: "error" | "success" | "warning" | "info"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<"error" | "pending" | "idle" | "saving" | "saved", "error" | "pending" | "idle" | "saving" | "saved">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: "error" | "success" | "warning" | "info") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: "toolbar" | "user-menu") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: "toolbar" | "user-menu") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }`,
  "node-state-config": `**node-state-config** — SPARK 视图组件，可在注册表中通过 type="node-state-config" 引用。

【Props】
state: { treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: "error" | "success" | "warning" | "info"; time: string; }[], StatusMessage[] | { text: string; type: "error" | "success" | "warning" | "info"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<"error" | "pending" | "idle" | "saving" | "saved", "error" | "pending" | "idle" | "saving" | "saved">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: "error" | "success" | "warning" | "info") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: "toolbar" | "user-menu") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: "toolbar" | "user-menu") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }`,
  "node-target-config": `**node-target-config** — SPARK 视图组件，可在注册表中通过 type="node-target-config" 引用。

【Props】
state: { treeData: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[], NavNode[] | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; }[]>; navLoading: Ref<boolean, boolean>; navSaving: Ref<boolean, boolean>; navDirty: Ref<boolean, boolean>; selectedNode: Ref<{ id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null, NavNode | { id: string; path?: string; linkTarget?: LinkTarget; redirect?: string; parentPageId?: string; refId?: string; refPath?: string; refProjectId?: string; refNodeKind?: NavNodeKind; refBroken?: boolean; title: string; description?: string; version?: string; children?: any[]; icon?: string; nodeKind?: NavNodeKind; childPlacement?: ChildPlacement; context?: string | { id: string | number; title: string; }[] | { source: string | { id: string | number; title: string; }[]; placeholder?: string; defaultValue?: string | number; paramName?: string; }; order?: number; hidden?: boolean; disabled?: boolean; dividerAfter?: boolean; } | null>; editForm: { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; }; hasContext: Ref<boolean, boolean>; contextItems: Ref<{ id: string; title: string; }[], { id: string; title: string; }[] | { id: string; title: string; }[]>; contextConfig: { placeholder: string; defaultValue: string; paramName: string; }; navEmpty: Ref<boolean, boolean>; activePageId: Ref<string, string>; editFiles: Record<string, string>; fileDirty: Record<string, boolean>; fileSaving: Ref<boolean, boolean>; fileLoaded: Ref<boolean, boolean>; pageList: Ref<Record<string, unknown>[], Record<string, unknown>[]>; statusMessages: Ref<{ text: string; type: "error" | "success" | "warning" | "info"; time: string; }[], StatusMessage[] | { text: string; type: "error" | "success" | "warning" | "info"; time: string; }[]>; linkProbeLoading: Ref<boolean, boolean>; linkProbeInfo: Ref<{ embeddable: boolean; reason: string; } | null, { embeddable: boolean; reason: string; } | { embeddable: boolean; reason: string; } | null>; aiPanelVisible: Ref<boolean, boolean>; autoSaveStatus: Ref<"error" | "pending" | "idle" | "saving" | "saved", "error" | "pending" | "idle" | "saving" | "saved">; hasAnyFileDirty: ComputedRef<boolean>; hasAnyDirty: ComputedRef<boolean>; previewJson: ComputedRef<string>; addStatus: (text: string, type?: "error" | "success" | "warning" | "info") => void; loadNavConfig: () => Promise<void>; loadPages: () => Promise<void>; loadPageFiles: (pageId: string) => Promise<void>; clearFiles: () => void; onLinkUrlChanged: () => void; probeLinkTarget: () => Promise<void>; selectPage: (pageId: string) => void; loadNodeToForm: (node: NavNode) => void; applyNavChanges: () => void; markNavDirty: () => void; cancelAutoSave: () => void; saveNavConfig: () => Promise<void>; saveNodeChanges: () => Promise<void>; savePageFiles: () => Promise<void>; saveAll: () => Promise<void>; selectNode: (node: NavNode) => void; handlePathChange: (val: string) => void; handleNodeKindChange: (kind: NavNodeKind) => void; addRootNode: () => void; hasReservedRootGroup: (placement: "toolbar" | "user-menu") => boolean; isSystemRootDirectory: (node: NavNode | null | undefined) => boolean; restoreReservedRootGroup: (placement: "toolbar" | "user-menu") => Promise<void>; canUseModuleNodeKind: (node: NavNode | null | undefined) => boolean; addChildNode: (parent: NavNode) => void; removeNodeFromTree: (node: { parent: { data: NavNode; }; }, data: NavNode) => void; resetToDemo: () => void; toggleContext: (val: boolean) => void; addContextItem: () => void; removeContextItem: (idx: number) => void; fillDemoContext: () => void; createPage: (pageId: string, title: string, icon: string, linkToNav: boolean) => Promise<void>; initialize: () => Promise<void>; }`,
  "page-config-editor": `**page-config-editor** — SPARK 视图组件，可在注册表中通过 type="page-config-editor" 引用。

【Props】
pageId: string`,
  "project-tree": `**project-tree** — SPARK 视图组件，可在注册表中通过 type="project-tree" 引用。

【Props】
state: ProjectState

【事件】
nodeClick: [nodeId: string]
addGroup: []
addPage: []`,
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

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: CascaderValue — 双向绑定值
options?: unknown[] — 树形选项（嵌套结构）
optionKey?: string — 选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
optionChildrenField?: string — 子节点字段
placeholder?: string — 占位提示 (默认 "\\u8BF7\\u9009\\u62E9")
clearable?: boolean — 可清除 (默认 true)
filterable?: boolean — 可搜索 (默认 false)
multiple?: boolean — 多选模式 (默认 false)
checkStrictly?: boolean — 父子不关联勾选 (默认 false)
emitPath?: boolean — 值是否为完整路径数组 (默认 true)

【事件】
update:modelValue: [value: CascaderValue]`,
  "r-checkbox": `**r-checkbox** — SPARK 字段组件，可在 rule.json 中通过 type="r-checkbox" 使用。

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: boolean — 双向绑定值
checkedText?: string — 选中时显示文案 (默认 "\\u662F")
uncheckedText?: string — 未选时显示文案 (默认 "\\u5426")
checkboxText?: string — 复选框右侧文案 (默认 "")

【事件】
update:modelValue: [value: boolean]

⚠️ 用 checkedText / uncheckedText 代替 trueLabel / falseLabel`,
  "r-checkbox-group": `**r-checkbox-group** — SPARK 字段组件，可在 rule.json 中通过 type="r-checkbox-group" 使用。

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: MultiValue — 双向绑定值（数组）
options?: unknown[] — 选项列表
optionKey?: string — 选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
buttonStyle?: boolean — 按钮风格 (默认 false)

【事件】
update:modelValue: [value: MultiValue]`,
  "r-collapse": `**r-collapse** — SPARK 容器组件，可在 rule.json 中通过 type="r-collapse" 组织子组件。

【Props】
modelValue?: CollapseValue — 当前展开的面板

【根级字段】
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'
toolbarClass: string — 工具栏 CSS 类名
modelValue: string | number | Array — 展开的面板
onChange: string — 切换回调

【事件】
update:modelValue: [value: CollapseValue]

**r-collapse** — 折叠面板容器
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'
toolbarClass: string — 工具栏 CSS 类名
modelValue: string | number | Array — 展开的面板
onChange: string — 切换回调
children 内放 r-collapse-item`,
  "r-color": `**r-color** — SPARK 字段组件，可在 rule.json 中通过 type="r-color" 使用。

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值（颜色字符串，透传 el-color-picker）

【事件】
update:modelValue: [value: string]

透传到 el-color-picker: showAlpha, colorFormat('hex'|'rgb'|'hsl'|'hsv'), predefine(string[])`,
  "r-column-group": `**r-column-group** — SPARK 字段组件，可在 rule.json 中通过 type="r-column-group" 使用。

【Props】
label?: string — 分组标题（必填）
width?: string | number — 列宽
minWidth?: string | number — 最小宽度
fixed?: boolean | "left" | "right" — 固定方向
align?: "left" | "right" | "center" — 对齐方式
headerAlign?: "left" | "right" | "center" — 表头对齐
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

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string | Date | (string | Date)[] — 双向绑定值，日期范围时为数组
filterMode?: string — 筛选模式
filterVariant?: string — 筛选变体
filterRange?: boolean — 范围筛选标记

【事件】
update:modelValue: [value: string | Date | (string | Date)[]]

透传到 el-date-picker: type('date'/'datetime'/'daterange'), format, valueFormat 等`,
  "r-dept-picker": `**r-dept-picker** — SPARK 字段组件，可在 rule.json 中通过 type="r-dept-picker" 使用。

【Props】
label?: string
modelValue?: EntityPickerValue
name?: string
width?: number
options?: unknown[]
optionLabelField?: string
optionValueField?: string
placeholder?: string
buttonText?: string
readonlyButtonText?: string
clearable?: boolean
multiple?: boolean
searchable?: boolean
separator?: string
valueMode?: "auto" | "array" | "comma-string"
entityName?: string

【根级字段】
multiple: boolean — 多选
checkStrictly: boolean — 父子不关联勾选
showPath: boolean — 展示完整路径

【事件】
update:modelValue: any[]

**r-dept-picker** — 部门选择器
field / label / width — 同 r-text
multiple: boolean — 多选
checkStrictly: boolean — 父子不关联勾选
showPath: boolean — 展示完整路径`,
  "r-detail": `**r-detail** — SPARK 容器组件，可在 rule.json 中通过 type="r-detail" 组织子组件。

【Props】
dataKey?: string — 数据绑定键
gridColumns?: number — CSS Grid 列数 (默认 24)
gridGap?: string | number — 栅格间距 (默认 0)
gridAutoRows?: string — 栅格行高 (默认 "minmax(32px, auto)")

【根级字段】
dataKey: string — 数据绑定键
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' — 默认 'top'
toolbarClass: string — 工具栏 CSS 类名
gridColumns: number — CSS Grid 列数，默认 24
gridGap: number | string — 栅格间距，默认 0
gridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'

**r-detail** — 只读详情容器（展示 currentRow）
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
  "r-dialog": `**r-dialog** — SPARK 容器组件，可在 rule.json 中通过 type="r-dialog" 组织子组件。

【Props】
title?: string — 对话框标题 (默认 "")
modelValue?: boolean — 控制显隐（v-model） (默认 false)
headerClass?: string — 头部 CSS 类名 (默认 "")
bodyClass?: string — 内容区 CSS 类名 (默认 "")
footerClass?: string — 底部 CSS 类名 (默认 "")
gridColumns?: number — CSS Grid 列数 (默认 24)
gridGap?: string | number — 栅格间距 (默认 0)
gridAutoRows?: string — 栅格行高 (默认 "minmax(32px, auto)")

【根级字段】
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
onClosed: string — 关闭动画结束回调

【事件】
update:modelValue: [value: boolean]

**r-dialog** — 对话框容器
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
  "r-drawer": `**r-drawer** — SPARK 容器组件，可在 rule.json 中通过 type="r-drawer" 组织子组件。

【Props】
title?: string — 抽屉标题 (默认 "")
modelValue?: boolean — 控制显隐（v-model） (默认 false)
headerClass?: string — 头部 CSS 类名 (默认 "")
bodyClass?: string — 内容区 CSS 类名 (默认 "")
footerClass?: string — 底部 CSS 类名 (默认 "")
gridColumns?: number — CSS Grid 列数 (默认 24)
gridGap?: string | number — 栅格间距 (默认 0)
gridAutoRows?: string — 栅格行高 (默认 "minmax(32px, auto)")

【根级字段】
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

【事件】
update:modelValue: [value: boolean]

**r-drawer** — 抽屉容器
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

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: EntityPickerValue — 双向绑定值
options?: unknown[] — 选项列表
optionKey?: string — 选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
placeholder?: string — 占位提示 (默认 "\\u8BF7\\u9009\\u62E9")
buttonText?: string — 选择按钮文案 (默认 "\\u9009\\u62E9")
readonlyButtonText?: string — 只读模式按钮文案 (默认 "\\u67E5\\u770B")
clearable?: boolean — 可清除 (默认 true)
multiple?: boolean — 多选 (默认 false)
searchable?: boolean — 可搜索 (默认 true)
separator?: string — 多值分隔符 (默认 ", ")
valueMode?: "auto" | "array" | "comma-string" — 值模式 (默认 "auto")
entityName?: string — 实体名称 (默认 "\\u9879\\u76EE")

【事件】
update:modelValue: [value: EntityPickerValue]`,
  "r-file-browser": `**r-file-browser** — SPARK 字段组件，可在 rule.json 中通过 type="r-file-browser" 使用。

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值（文件路径）
accept?: string — 接受文件类型 (默认 "")
multiple?: boolean — 多选 (默认 false)
clearable?: boolean — 可清除 (默认 true)
separator?: string — 多文件分隔符 (默认 ", ")
placeholder?: string — 占位提示 (默认 "\\u8BF7\\u9009\\u62E9\\u6587\\u4EF6")
buttonText?: string — 上传按钮文案 (默认 "\\u6D4F\\u89C8")

【事件】
update:modelValue: [value: string]

⚠️ 与 r-file-path 基本一致，差异在于内置的浏览器 UI 体验`,
  "r-file-path": `**r-file-path** — SPARK 字段组件，可在 rule.json 中通过 type="r-file-path" 使用。

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值（文件路径）
action?: string — 上传 URL (默认 "#")
accept?: string — 接受文件类型 (默认 "")
multiple?: boolean — 多选 (默认 false)
separator?: string — 多文件分隔符 (默认 ", ")
placeholder?: string — 占位提示 (默认 "\\u8BF7\\u9009\\u62E9\\u6587\\u4EF6\\u8DEF\\u5F84")
buttonText?: string — 上传按钮文案 (默认 "\\u4E0A\\u4F20")
readonlyButtonText?: string — 只读模式按钮文案 (默认 "\\u6D4F\\u89C8")
clearable?: boolean — 可清除 (默认 true)

【事件】
update:modelValue: [value: string]`,
  "r-form": `**r-form** — SPARK 容器组件，可在 rule.json 中通过 type="r-form" 组织子组件。

【Props】
dataKey?: string — 数据绑定键，如 "Users@currentRow"
labelWidth?: string — 表单标签宽度 (默认 "100px")
gridColumns?: number — CSS Grid 列数 (默认 24)
gridGap?: string | number — 栅格间距 (默认 0)
gridAutoRows?: string — 栅格行高 (默认 "minmax(32px, auto)")

【根级字段】
dataKey: string — 数据绑定键，如 "Users@currentRow"
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' — 默认 'top'
toolbarClass: string — 工具栏 CSS 类名
labelWidth: string — 标签宽度，默认 '100px'
gridColumns: number — CSS Grid 列数，默认 24
gridGap: number | string — 栅格间距，默认 0
gridAutoRows: string — 行高定义，默认 'minmax(32px, auto)'

**r-form** — 数据表单容器（读写 currentRow）
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

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值（HTML 字符串）
rows?: number — 编辑器高度行数 (默认 10)

【事件】
update:modelValue: [value: string]`,
  "r-icon": `**r-icon** — SPARK 字段组件，可在 rule.json 中通过 type="r-icon" 使用。

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值（图标名）
options?: unknown[] — 图标选项列表
optionKey?: string — 选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
placeholder?: string — 占位提示 (默认 "\\u8BF7\\u9009\\u62E9\\u56FE\\u6807")
clearable?: boolean — 可清除 (默认 true)
filterable?: boolean — 可搜索 (默认 true)
classPrefix?: string — 图标 CSS 类名前缀 (默认 "")

【事件】
update:modelValue: [value: string]`,
  "r-image": `**r-image** — SPARK 字段组件，可在 rule.json 中通过 type="r-image" 使用。

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值（图片路径）
action?: string — 上传 URL (默认 "#")
accept?: string — 接受文件类型 (默认 "image/*")
multiple?: boolean — 多选 (默认 false)
separator?: string — 多图分隔符 (默认 ", ")
placeholder?: string — 占位提示 (默认 "\\u8BF7\\u9009\\u62E9\\u56FE\\u7247")
buttonText?: string — 上传按钮文案 (默认 "\\u4E0A\\u4F20\\u56FE\\u7247")
readonlyButtonText?: string — 只读模式按钮文案 (默认 "\\u6D4F\\u89C8")
clearable?: boolean — 可清除 (默认 true)

【事件】
update:modelValue: [value: string]`,
  "r-list": `**r-list** — SPARK 容器组件，可在 rule.json 中通过 type="r-list" 组织子组件。

【Props】
dataKey?: string — 数据绑定键
columns?: number — 列数 (默认 1)
gap?: string | number — 列表项间距 (默认 0)
minItemWidth?: string — 最小项宽度 (默认 "")
rowKey?: string — 行唯一键字段 (默认 "id")
emptyText?: string — 空数据提示文案 (默认 "\\u6682\\u65E0\\u6570\\u636E")
itemClass?: string — 列表项 CSS 类名 (默认 "")
itemStyle?: CSSProperties — 列表项行内样式 (默认 {})
useCard?: boolean — 使用卡片包裹 (默认 false)
cardShadow?: "never" | "always" | "hover" — 卡片阴影模式 (默认 "hover")
gridColumns?: number — CSS Grid 列数 (默认 24)
gridGap?: string | number — 栅格间距 (默认 0)
gridAutoRows?: string — 栅格行高 (默认 "minmax(32px, auto)")
itemColSpan?: number — 项跨列数
itemRowSpan?: number — 项跨行数 (默认 1)

【根级字段】
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

**r-list** — 列表容器
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

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: MultiValue — 双向绑定值（数组）
options?: unknown[] — 选项列表
optionKey?: string — 选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
placeholder?: string — 占位提示 (默认 "\\u8BF7\\u9009\\u62E9")
clearable?: boolean — 可清除 (默认 true)
filterable?: boolean — 可搜索 (默认 false)
collapseTags?: boolean — 折叠已选标签 (默认 false)
collapseTagsTooltip?: boolean — 折叠标签提示 (默认 false)
maxCollapseTags?: number — 最大显示标签数 (默认 1)

【事件】
update:modelValue: [value: MultiValue]`,
  "r-number": `**r-number** — SPARK 字段组件，可在 rule.json 中通过 type="r-number" 使用。

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: number | [number | undefined, number | undefined] — 双向绑定值，范围模式时为元组
min?: number — 最小值
max?: number — 最大值
precision?: number — 小数精度
filterMode?: string — 筛选模式（'range' 启用范围输入）
filterVariant?: string — 筛选变体
filterRange?: boolean — 范围筛选标记

【事件】
update:modelValue: [value: number | [number | undefined, number | undefined]]

filterMode: 'range' — 启用范围过滤模式`,
  "r-product-picker": `**r-product-picker** — SPARK 字段组件，可在 rule.json 中通过 type="r-product-picker" 使用。

【Props】
label?: string
modelValue?: EntityPickerValue
name?: string
width?: number
options?: unknown[]
optionLabelField?: string
optionValueField?: string
placeholder?: string
buttonText?: string
readonlyButtonText?: string
clearable?: boolean
multiple?: boolean
searchable?: boolean
separator?: string
valueMode?: "auto" | "array" | "comma-string"
entityName?: string

【根级字段】
multiple: boolean — 多选
categoryFilter: string[] — 类目过滤
showStock: boolean — 显示库存

【事件】
update:modelValue: any[]

**r-product-picker** — 产品选择器
field / label / width — 同 r-text
multiple: boolean — 多选
categoryFilter: string[] — 类目过滤
showStock: boolean — 显示库存`,
  "r-radio": `**r-radio** — SPARK 字段组件，可在 rule.json 中通过 type="r-radio" 使用。

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string | number — 双向绑定值
options?: unknown[] — 选项列表
optionKey?: string — 选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
buttonStyle?: boolean — 按钮风格 (默认 false)

【事件】
update:modelValue: [value: string | number]`,
  "r-rate": `**r-rate** — SPARK 字段组件，可在 rule.json 中通过 type="r-rate" 使用。

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: number — 双向绑定值
max?: number — 最大值 (默认 5)
allowHalf?: boolean — 允许半星 (默认 false)

【事件】
update:modelValue: [value: number]`,
  "r-section": `**r-section** — SPARK 容器组件，可在 rule.json 中通过 type="r-section" 组织子组件。

【Props】
title?: string — 分区标题 (默认 "")
description?: string — 分区描述 (默认 "")
collapsible?: boolean — 是否可折叠 (默认 false)
defaultCollapsed?: boolean — 默认折叠 (默认 false)
bordered?: boolean — 显示边框 (默认 true)
useCard?: boolean — 使用卡片样式 (默认 false)
cardShadow?: "never" | "always" | "hover" — 卡片阴影模式 (默认 "never")
headerClass?: string — 头部 CSS 类名 (默认 "")
bodyClass?: string — 内容区 CSS 类名 (默认 "")
expandText?: string — 展开文案 (默认 "\\u5C55\\u5F00")
collapseText?: string — 收起文案 (默认 "\\u6536\\u8D77")
showToggleIcon?: boolean — 显示切换图标 (默认 true)
expandIconText?: string — 展开图标文案 (默认 ">")
collapseIconText?: string — 收起图标文案 (默认 "v")
gridColumns?: number — CSS Grid 列数 (默认 24)
gridGap?: string | number — 栅格间距 (默认 0)
gridAutoRows?: string — 栅格行高 (默认 "minmax(32px, auto)")

【根级字段】
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
gridAutoRows: string — 行高

**r-section** — 分区容器
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

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string | number — 双向绑定值
options?: unknown[] — 选项列表
optionKey?: string — 选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
placeholder?: string — 占位提示 (默认 "\\u8BF7\\u9009\\u62E9")
clearable?: boolean — 可清除 (默认 true)
filterable?: boolean — 可搜索 (默认 false)

【事件】
update:modelValue: [value: string | number]`,
  "r-slider": `**r-slider** — SPARK 字段组件，可在 rule.json 中通过 type="r-slider" 使用。

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: number — 双向绑定值
min?: number — 最小值 (默认 0)
max?: number — 最大值 (默认 100)
step?: number — 步长 (默认 1)
showInput?: boolean — 显示输入框 (默认 false)

【事件】
update:modelValue: [value: number]`,
  "r-steps": `**r-steps** — SPARK 容器组件，可在 rule.json 中通过 type="r-steps" 组织子组件。

【Props】
modelValue?: string | number — 当前步骤

【根级字段】
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'
toolbarClass: string — 工具栏 CSS 类名
modelValue: string | number — 当前步骤
onStepChange: string — 步骤切换回调

【事件】
update:modelValue: [value: string | number]

**r-steps** — 步骤条容器
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'
toolbarClass: string — 工具栏 CSS 类名
modelValue: string | number — 当前步骤
onStepChange: string — 步骤切换回调
children 内放 r-step`,
  "r-switch": `**r-switch** — SPARK 字段组件，可在 rule.json 中通过 type="r-switch" 使用。

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: boolean — 双向绑定值
activeText?: string — 激活时文案 (默认 "\\u662F")
inactiveText?: string — 未激活时文案 (默认 "\\u5426")

【事件】
update:modelValue: [value: boolean]`,
  "r-table": `**r-table** — SPARK 容器组件，可在 rule.json 中通过 type="r-table" 组织子组件。

【Props】
dataKey?: string — DataKey 格式：tableName@field

【根级字段】
dataKey: string — 数据绑定键，如 "Users@rows"（根级）
on.rowDblclick: string — 行双击（→ script.js 函数名）
filter.columns: Array<string | FilterItem> — 筛选项列表
filter.collapsible: boolean — 可折叠，默认 false
filter.defaultCollapsed: boolean — 默认折叠，默认 false
filter.autoFitMinWidth: string — 最小宽度，默认 '220px'
filter.class: string — 筛选区 CSS 类名
filter.itemSpan: number — 每项跨列数，默认 1
filter.gridColumns: number — 栅格总列数，默认 24
filter.gridGap: number | string — 间距，默认 12
filter.gridAutoRows: string — 行高，默认 'minmax(32px, auto)'
toolbar.items: SparkNode[] — 工具栏按钮（优先 builtin-action，其次 Render*）
toolbar.position: 'top' | 'bottom' — 默认 'top'
actions.items: SparkNode[] — 行操作按钮（优先 builtin-action）
actions.position: 'left' | 'right' — 默认 'right'
actions.label: string — 操作列标题，默认 '操作'
actions.width: number — 操作列宽度，默认 160
actions.align: 'left' | 'center' | 'right' — 默认 'left'
actions.fixed: boolean | 'left' | 'right' — 固定方向
actions.class: string — 操作列 CSS 类名

**r-table** — 数据表格容器

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
provides: DATA_SOURCE, FIELD_CONTEXT

children 内仅用 r-* 字段组件做列，禁止 el-table-column`,
  "r-tabs": `**r-tabs** — SPARK 容器组件，可在 rule.json 中通过 type="r-tabs" 组织子组件。

【Props】
modelValue?: string | number — 当前激活标签页

【根级字段】
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'
toolbarClass: string — 工具栏 CSS 类名
modelValue: string | number — 当前激活 tab
onTabChange: string — 切换回调
onTabClick: string — 点击回调

【事件】
update:modelValue: [value: string | number]

**r-tabs** — 标签页容器
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'
toolbarClass: string — 工具栏 CSS 类名
modelValue: string | number — 当前激活 tab
onTabChange: string — 切换回调
onTabClick: string — 点击回调
children 内放 r-tab-pane（每个 tab-pane 内可嵌套任意组件）`,
  "r-text": `**r-text** — SPARK 字段组件，可在 rule.json 中通过 type="r-text" 使用。

【Props】
field?: string — 字段绑定名，映射到 DataView 行字段
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值

【事件】
update:modelValue: [value: string]`,
  "r-textarea": `**r-textarea** — SPARK 字段组件，可在 rule.json 中通过 type="r-textarea" 使用。

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值
rows?: number — 行数 (默认 4)
autosize?: boolean | { minRows?: number; maxRows?: number; } — 自适应高度 (默认 false)
maxlength?: number — 最大长度
showWordLimit?: boolean — 显示字数统计 (默认 false)
placeholder?: string — 占位提示 (默认 "\\u8BF7\\u8F93\\u5165\\u5185\\u5BB9")

【事件】
update:modelValue: [value: string]`,
  "r-transfer": `**r-transfer** — SPARK 字段组件，可在 rule.json 中通过 type="r-transfer" 使用。

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: TransferValue — 双向绑定值（已选值数组）
options?: unknown[] — 数据源（左侧候选列表）
optionKey?: string — 选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
titles?: [string, string] — 左右面板标题 (默认 ["\\u5F85\\u9009", "\\u5DF2\\u9009"] as [
    string,
    string
])
filterable?: boolean — 可搜索 (默认 false)
filterPlaceholder?: string — 搜索框占位符 (默认 "\\u8BF7\\u8F93\\u5165\\u5173\\u952E\\u8BCD")
targetOrder?: "push" | "unshift" | "original" — 右侧排序方式 (默认 "original")

【事件】
update:modelValue: [value: TransferValue]`,
  "r-tree": `**r-tree** — SPARK 容器组件，可在 rule.json 中通过 type="r-tree" 组织子组件。

【Props】
dataKey?: string — 数据绑定键，如 "TreeData@rows"
allowAppend?: boolean — 允许追加子节点（自动生成追加按钮）
allowDelete?: boolean — 允许删除节点（自动生成删除按钮）

【根级字段】
dataKey: string — 数据绑定键，如 "TreeData@rows"
dataView: DataView — 直接传入的 DataView（与 Table/List/Form/Detail 一致）
toolbar: SparkNode[] — 工具栏按钮配置
toolbarPosition: ToolbarPosition — 工具栏位置（'top' | 'bottom' | 'left' | 'right'）
toolbarClass: string — 工具栏 CSS 类名
allowAppend: boolean — 允许追加子节点（自动生成追加按钮）
allowDelete: boolean — 允许删除节点（自动生成删除按钮）
onNodeClick: string — script.js 节点点击回调函数名
onNodeExpand: string — 节点展开回调
onNodeCollapse: string — 节点折叠回调

**r-tree** — 树形组件容器
dataKey: string — 数据绑定键，如 "TreeData@rows"
dataView: DataView — 直接传入的 DataView（与 Table/List/Form/Detail 一致）
toolbar: SparkNode[] — 工具栏按钮配置
toolbarPosition: ToolbarPosition — 工具栏位置（'top' | 'bottom' | 'left' | 'right'）
toolbarClass: string — 工具栏 CSS 类名
allowAppend: boolean — 允许追加子节点（自动生成追加按钮）
allowDelete: boolean — 允许删除节点（自动生成删除按钮）
onNodeClick: string — script.js 节点点击回调函数名
onNodeExpand: string — 节点展开回调
onNodeCollapse: string — 节点折叠回调
其他 props 透传到 el-tree（node-key, default-expand-all, show-checkbox 等）

【能力链】
consumes: PAGE_DATASET
provides: DATA_SOURCE, FIELD_CONTEXT, CONTEXT_DATA`,
  "r-tree-select": `**r-tree-select** — SPARK 字段组件，可在 rule.json 中通过 type="r-tree-select" 使用。

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: TreeSelectValue — 双向绑定值
options?: unknown[] — 树形选项（嵌套结构）
optionKey?: string — 选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
optionChildrenField?: string — 子节点字段
placeholder?: string — 占位提示 (默认 "\\u8BF7\\u9009\\u62E9")
clearable?: boolean — 可清除 (默认 true)
filterable?: boolean — 可搜索 (默认 false)
multiple?: boolean — 多选模式 (默认 false)
checkStrictly?: boolean — 父子不关联勾选 (默认 false)
defaultExpandAll?: boolean — 默认展开所有节点 (默认 false)
renderAfterExpand?: boolean — 展开后才渲染子节点 (默认 true)

【事件】
update:modelValue: [value: TreeSelectValue]`,
  "r-upload": `**r-upload** — SPARK 字段组件，可在 rule.json 中通过 type="r-upload" 使用。

【Props】
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值（文件路径）
action?: string — 上传 URL (默认 "#")
accept?: string — 接受文件类型 (默认 "")
buttonText?: string — 上传按钮文案 (默认 "\\u70B9\\u51FB\\u4E0A\\u4F20")
autoUpload?: boolean — 自动上传 (默认 true)
showFileList?: boolean — 显示文件列表 (默认 true)
limit?: number — 最大文件数 (默认 1)
listType?: "picture" | "text" | "picture-card" — 列表展示类型 (默认 "text")
separator?: string — 多文件分隔符 (默认 ", ")
placeholder?: string — 占位提示 (默认 "\\u8BF7\\u9009\\u62E9\\u6587\\u4EF6")
readonlyButtonText?: string — 只读模式按钮文案 (默认 "\\u6D4F\\u89C8")

【事件】
update:modelValue: [value: string]

透传到 el-upload: autoUpload(默认 true), showFileList(默认 true), limit(默认 1), listType('text'|'picture'|'picture-card')`,
  "r-user-picker": `**r-user-picker** — SPARK 字段组件，可在 rule.json 中通过 type="r-user-picker" 使用。

【Props】
label?: string
modelValue?: EntityPickerValue
name?: string
width?: number
options?: unknown[]
optionLabelField?: string
optionValueField?: string
placeholder?: string
buttonText?: string
readonlyButtonText?: string
clearable?: boolean
multiple?: boolean
searchable?: boolean
separator?: string
valueMode?: "auto" | "array" | "comma-string"
entityName?: string

【根级字段】
multiple: boolean — 多选
deptScope: string — 部门范围
includeDisabled: boolean — 包含禁用用户

【事件】
update:modelValue: any[]

**r-user-picker** — 用户选择器
field / label / width — 同 r-text
multiple: boolean — 多选
deptScope: string — 部门范围
includeDisabled: boolean — 包含禁用用户`,
  "sap-chat-panel": `**sap-chat-panel** — SPARK 组件，可在注册表中通过 type="sap-chat-panel" 使用。

【Props】
embedded?: boolean (默认 false)
forceOpen?: boolean (默认 false)`,
  "settings": `**settings** — SPARK 视图组件，可在注册表中通过 type="settings" 引用。`,
  "tenant-config": `**tenant-config** — SPARK 视图组件，可在注册表中通过 type="tenant-config" 引用。`,
  "wbs-node-editor": `**wbs-node-editor** — SPARK 视图组件，可在注册表中通过 type="wbs-node-editor" 引用。

【Props】
nodeId: string`,
  "workspace-panel": `**workspace-panel** — SPARK 视图组件，可在注册表中通过 type="workspace-panel" 引用。

【Props】
nodeId: string | null`,
}

/**
 * 组件注册表（按分类），供 design-prompt.ts 生成组件注册表 section。
 */
export const COMPONENT_REGISTRY = {
  containers: ["r-block","r-collapse","r-detail","r-dialog","r-drawer","r-form","r-list","r-section","r-steps","r-table","r-tabs","r-tree"] as const,
  fields: ["r-cascader","r-checkbox","r-checkbox-group","r-color","r-date","r-dept-picker","r-entity-picker","r-file-browser","r-file-path","r-html-editor","r-icon","r-image","r-multi-select","r-number","r-product-picker","r-radio","r-rate","r-select","r-slider","r-switch","r-text","r-textarea","r-transfer","r-tree-select","r-upload","r-user-picker"] as const,
  groups: ["r-column-group"] as const,
} as const
