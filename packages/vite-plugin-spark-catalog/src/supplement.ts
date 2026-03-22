/**
 * 组件 Props 补充数据（构建时与 AST 提取合并）
 *
 * 分三类：
 * - SHARED_TYPE_DEFINITIONS: 框架级共享类型（SparkNode 等），catalog 顶层 sharedTypes 单例定义
 * - CATALOG_OVERRIDES: 完整条目，替换 AST 生成内容（容器组件 rule.json 格式、元概念、规划组件）
 * - CATALOG_ADDENDUMS: 追加条目，附加在 AST 生成内容之后（透传 Props、使用说明）
 *
 * 为什么容器用 override 而非 AST？
 * 容器组件的 rule.json 根级字段（filter.columns, toolbar.items, actions.items, on.*）
 * 与 Vue Props 名称不同（filterColumns, toolbar, rowActions），由 bindRules 转换。
 * AI 生成 rule.json 需要看到 rule.json 格式，AST 提取的是内部 Props 名，会误导 AI。
 *
 * @module component-props-supplement
 */

import type { SharedTypeDefinition } from './component-catalog-schema'

/* ==========================================================================
 * 共享类型定义（SparkNode 家族）
 *
 * 这些类型会写入 catalog 顶层 sharedTypes，单例定义、全局引用。
 * 组件 props 中出现 SparkNode[] 等类型时不再展开 schema，
 * AI 查阅 sharedTypes 即可理解完整结构。
 * ========================================================================== */

export const SHARED_TYPE_DEFINITIONS: Record<string, SharedTypeDefinition> = {
  SparkNode: {
    name: 'SparkNode',
    description: '组件配置节点 —— rule.json 的基本单元。每个节点通过 type 字段映射到 ComponentRegistry 中已注册的组件，由 SparkComponentRenderer 在运行时动态解析并渲染。',
    properties: [
      { name: 'type', type: 'string', required: true, description: '组件类型（kebab-case），映射到 ComponentRegistry 中的注册名，如 "r-table"、"r-text"、"el-button"' },
      { name: 'id', type: 'string', description: '实例 ID（可选，运行时自动生成 spark-{n}）' },
      { name: 'dataKey', type: 'string', description: '数据绑定键（如 "Users@rows"），容器组件（r-table 等 self-resolve 类型）在运行时自行解析为 DataView' },
      { name: 'field', type: 'string', description: '字段绑定名，定位到 DataView 行中的数据字段（如 "userName"）' },
      { name: 'label', type: 'string', description: '显示标签（UI 展示文字，如 "用户名"），与 field 分离' },
      { name: 'optionKey', type: 'string', description: '选项数据源 DataKey（如 "Categories@rows"），供 r-select/r-radio/r-checkbox-group 解析选项列表' },
      { name: 'props', type: 'Record<string, unknown>', description: '组件属性，透传到 Vue 组件 props（v-bind 展开）' },
      { name: 'children', type: 'SparkNode[]', description: '子组件配置（递归结构），容器组件渲染其 children 形成组件树' },
      { name: 'visible', type: 'boolean', description: '可见性控制，false 时组件不渲染' },
      { name: 'disabled', type: 'boolean', description: '禁用状态控制' },
      { name: 'on', type: 'Record<string, string>', description: '事件绑定（key=camelCase 事件名，value=script.js 函数名），如 { "rowDblclick": "handleRowDblclick" }' },
      { name: 'toolbar', type: 'SparkNodeToolbar', description: '工具栏配置（容器级），详见 SparkNodeToolbar' },
      { name: 'actions', type: 'SparkNodeActions', description: '行操作列配置（容器级），详见 SparkNodeActions' },
      { name: 'filter', type: 'SparkNodeFilter', description: '筛选器配置（容器级），详见 SparkNodeFilter' },
    ],
    notes: `【组件与 SparkNode 的关系】
rule.json 是一棵 SparkNode 树。渲染引擎（SparkComponentRenderer）递归遍历这棵树，对每个节点：
1. 通过 type 从 ComponentRegistry 动态查找已注册的 Vue 组件
2. 将 props + config 传入组件，children 由组件自行渲染（容器组件用 SparkComponentRenderer 递归）
3. 容器组件通过能力系统 provide(DATA_SOURCE, FIELD_CONTEXT) 向子树暴露数据上下文
4. 字段组件通过 consume() 自动感知父容器语境，同一个 r-text 在不同父容器中呈现不同形态

【子组件智能感知父容器（Context-Aware Rendering）】
- 在 r-table 中 → 字段组件渲染为表格列（el-table-column 包装）
- 在 r-form 中 → 字段组件渲染为表单输入控件（el-form-item 包装）
- 在 r-detail 中 → 字段组件渲染为只读展示

语境由 FIELD_CONTEXT 能力键传递，值为 'table' | 'form' | 'detail' | 'list' | 'tree'。
字段组件无需知道自己处于哪种容器，框架自动适配渲染模式。

【动态渲染流程】
rule.json → SparkNode 树
  → SparkComponentRenderer 递归遍历
  → 每个节点：registry.get(node.type) → 渲染对应 Vue 组件
  → 容器组件 provide(DATA_SOURCE, FIELD_CONTEXT)
  → 子组件 consume() 获取数据与语境 → 自适应渲染

【toolbar / actions / filter 的宿主】
这三个根级字段仅在容器组件（r-table、r-form、r-detail、r-list、r-tree 等）上有效。
toolbar.items 和 actions.items 中的每一项也是 SparkNode（常见 type: "builtin-action"）。`,
  },

  SparkNodeToolbar: {
    name: 'SparkNodeToolbar',
    description: '工具栏配置，放置在容器组件的 toolbar 根级字段。items 中的每一项也是 SparkNode（通常是 builtin-action 或 Render* 组件）。',
    properties: [
      { name: 'items', type: 'SparkNode[]', required: true, description: '工具栏按钮列表（通常放 builtin-action 或 Render* 自定义渲染函数）' },
      { name: 'position', type: "'top' | 'bottom' | 'left' | 'right'", description: "工具栏位置，默认 'top'" },
      { name: 'class', type: 'string', description: '自定义 CSS 类名' },
    ],
  },

  SparkNodeActions: {
    name: 'SparkNodeActions',
    description: '行操作列配置（r-table / r-list），放置在容器组件的 actions 根级字段。items 中的每一项也是 SparkNode。',
    properties: [
      { name: 'items', type: 'SparkNode[]', required: true, description: '操作按钮列表（通常放 builtin-action 或 Render* 自定义渲染函数）' },
      { name: 'position', type: "'left' | 'right'", description: "操作列位置，默认 'right'" },
      { name: 'label', type: 'string', description: "列标题，默认 '操作'" },
      { name: 'width', type: 'string | number', description: '列宽度，默认 160' },
      { name: 'align', type: "'left' | 'center' | 'right'", description: "对齐方式，默认 'left'" },
      { name: 'class', type: 'string', description: '自定义 CSS 类名' },
      { name: 'fixed', type: "boolean | 'left' | 'right'", description: '固定列方向' },
    ],
  },

  SparkNodeFilter: {
    name: 'SparkNodeFilter',
    description: '筛选器配置（r-table），放置在容器组件的 filter 根级字段。columns 中可以是字段名字符串（简写）或完整的 SparkNodeFilterItem 对象。',
    properties: [
      { name: 'columns', type: 'Array<string | SparkNodeFilterItem>', required: true, description: '筛选项列表。字符串简写 "fieldName" 等价于 { field: "fieldName", component: "text" }' },
      { name: 'class', type: 'string', description: '筛选区 CSS 类名' },
      { name: 'collapsible', type: 'boolean', description: '是否可折叠，默认 false' },
      { name: 'defaultCollapsed', type: 'boolean', description: '默认是否折叠，默认 false' },
      { name: 'autoFitMinWidth', type: 'string', description: "自适应最小宽度，默认 '220px'" },
      { name: 'itemSpan', type: 'number', description: '每项跨列数，默认 1' },
      { name: 'gridColumns', type: 'number', description: '栅格总列数，默认 24' },
      { name: 'gridGap', type: 'number | string', description: '间距，默认 12' },
      { name: 'gridAutoRows', type: 'string', description: "行高，默认 'minmax(32px, auto)'" },
    ],
  },

  SparkNodeFilterItem: {
    name: 'SparkNodeFilterItem',
    description: '单个筛选项完整配置。在 filter.columns 中使用，控制单个字段的筛选 UI。',
    properties: [
      { name: 'field', type: 'string', required: true, description: '字段名（映射到数据源字段）' },
      { name: 'label', type: 'string', description: '显示标签（省略则用字段名）' },
      { name: 'component', type: "'text' | 'select' | 'date' | 'date-range' | 'number' | 'number-range' | 'checkbox' | 'radio' | string", description: "输入组件类型，默认 'text'" },
      { name: 'options', type: 'Array<{ label: string; value: unknown }>', description: '可选项列表（component 为 select/radio/checkbox 时使用）' },
      { name: 'optionLabelField', type: 'string', description: '选项标签字段映射（options 来自 DataKey 时使用）' },
      { name: 'optionValueField', type: 'string', description: '选项值字段映射' },
      { name: 'logic', type: "'and' | 'or'", description: '与其他条件的逻辑关系（覆盖全局 filter.logic，默认继承）' },
      { name: 'span', type: 'number', description: '跨列数（覆盖全局 filter.itemSpan）' },
      { name: 'props', type: 'Record<string, unknown>', description: '透传到筛选组件的原生 props（如 placeholder、clearable 等）' },
    ],
  },
}

/* ==========================================================================
 * 完整条目：直接作为最终目录内容（不与 AST 合并）
 * ========================================================================== */

export const CATALOG_OVERRIDES: Record<string, string> = {
  // ── 元概念 ─────────────────────────────────────────────────────────────

  'context-aware-fields-api': `**context-aware-fields-api** — 语境感知字段渲染能力总览

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

  'builtin-action': `**builtin-action** — 声明式动作节点（零代码优先）

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

  // ── 容器组件（rule.json 格式） ────────────────────────────────────────

  'r-table': `**r-table** — 数据表格容器

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

  'r-form': `**r-form** — 数据表单容器（读写 currentRow）
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

  'r-detail': `**r-detail** — 只读详情容器（展示 currentRow）
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

  'r-tree': `**r-tree** — 树形组件容器
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

  'r-list': `**r-list** — 列表容器
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

  'r-tabs': `**r-tabs** — 标签页容器
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'
toolbarClass: string — 工具栏 CSS 类名
modelValue: string | number — 当前激活 tab
onTabChange: string — 切换回调
onTabClick: string — 点击回调
children 内放 r-tab-pane（每个 tab-pane 内可嵌套任意组件）`,

  'r-collapse': `**r-collapse** — 折叠面板容器
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'
toolbarClass: string — 工具栏 CSS 类名
modelValue: string | number | Array — 展开的面板
onChange: string — 切换回调
children 内放 r-collapse-item`,

  'r-steps': `**r-steps** — 步骤条容器
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' | 'left' | 'right' — 默认 'top'
toolbarClass: string — 工具栏 CSS 类名
modelValue: string | number — 当前步骤
onStepChange: string — 步骤切换回调
children 内放 r-step`,

  'r-dialog': `**r-dialog** — 对话框容器
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

  'r-drawer': `**r-drawer** — 抽屉容器
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

  'r-section': `**r-section** — 分区容器
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

  'r-block': `**r-block** — 块容器（轻量分区）
title: string — 标题
description: string — 描述
headerActions: Rule[] — 头部操作区
bordered: boolean — 边框，默认 true
useCard: boolean — 卡片样式，默认 false
gridColumns: number — 默认 24
gridGap: number — 默认 0
gridAutoRows: string — 行高定义
适合做页面中的局部块，不强制数据绑定`,

  // ── 规划组件（尚未实现） ───────────────────────────────────────────────

  'r-user-picker': `**r-user-picker** — 用户选择器
field / label / width — 同 r-text
multiple: boolean — 多选
deptScope: string — 部门范围
includeDisabled: boolean — 包含禁用用户`,

  'r-dept-picker': `**r-dept-picker** — 部门选择器
field / label / width — 同 r-text
multiple: boolean — 多选
checkStrictly: boolean — 父子不关联勾选
showPath: boolean — 展示完整路径`,

  'r-product-picker': `**r-product-picker** — 产品选择器
field / label / width — 同 r-text
multiple: boolean — 多选
categoryFilter: string[] — 类目过滤
showStock: boolean — 显示库存`,
}

/* ==========================================================================
 * 追加条目：附加在 AST 生成内容之后
 * ========================================================================== */

export const CATALOG_ADDENDUMS: Record<string, string> = {
  'r-number': `filterMode: 'range' — 启用范围过滤模式`,

  'r-checkbox': `⚠️ 用 checkedText / uncheckedText 代替 trueLabel / falseLabel`,

  'r-color': `透传到 el-color-picker: showAlpha, colorFormat('hex'|'rgb'|'hsl'|'hsv'), predefine(string[])`,

  'r-date': `透传到 el-date-picker: type('date'/'datetime'/'daterange'), format, valueFormat 等`,

  'r-upload': `透传到 el-upload: autoUpload(默认 true), showFileList(默认 true), limit(默认 1), listType('text'|'picture'|'picture-card')`,

  'r-column-group': `【使用场景】复杂表格需要多级表头分组，例如「基本信息」下包含「姓名」「年龄」「邮箱」

【示例】
{ "type": "r-column-group", "props": { "label": "基本信息" }, "children": [
  { "type": "r-text", "field": "name", "props": { "label": "姓名" } },
  { "type": "r-number", "field": "age", "props": { "label": "年龄" } }
]}
children 内放 r-* 字段组件作为实际数据列`,

  'r-file-browser': `⚠️ 与 r-file-path 基本一致，差异在于内置的浏览器 UI 体验`,
}

/* ==========================================================================
 * 组件分类（用于生成提示词中的组件注册表）
 * ========================================================================== */

export type ComponentCategory = 'container' | 'field' | 'group' | 'meta'

/**
 * 手工分类的组件条目。
 * AST 自动提取的字段组件默认归为 'field'，无需在此列出。
 */
export const COMPONENT_CATEGORIES: Record<string, ComponentCategory> = {
  // 容器
  'r-table': 'container',
  'r-form': 'container',
  'r-detail': 'container',
  'r-tree': 'container',
  'r-list': 'container',
  'r-tabs': 'container',
  'r-collapse': 'container',
  'r-dialog': 'container',
  'r-drawer': 'container',
  'r-steps': 'container',
  'r-section': 'container',
  'r-block': 'container',
  // 字段
  'r-cascader': 'field',
  'r-checkbox': 'field',
  'r-checkbox-group': 'field',
  'r-color': 'field',
  'r-context-renderer': 'field',
  'r-date': 'field',
  'r-dept-picker': 'field',
  'r-entity-picker': 'field',
  'r-file-browser': 'field',
  'r-file-path': 'field',
  'r-html-editor': 'field',
  'r-icon': 'field',
  'r-image': 'field',
  'r-multi-select': 'field',
  'r-number': 'field',
  'r-product-picker': 'field',
  'r-radio': 'field',
  'r-rate': 'field',
  'r-select': 'field',
  'r-slider': 'field',
  'r-switch': 'field',
  'r-text': 'field',
  'r-textarea': 'field',
  'r-transfer': 'field',
  'r-tree-select': 'field',
  'r-upload': 'field',
  'r-user-picker': 'field',
  // 分组
  'r-column-group': 'group',
  // 元概念（不进入注册表）
  'builtin-action': 'meta',
  'context-aware-fields-api': 'meta',
}
