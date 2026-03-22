/**
 * 组件 Props 补充数据（构建时与 AST 提取合并）
 *
 * 分两类：
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
  // 分组
  'r-column-group': 'group',
  // 元概念（不进入注册表）
  'builtin-action': 'meta',
  'context-aware-fields-api': 'meta',
}
