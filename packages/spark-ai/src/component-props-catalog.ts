/**
 * SPARK 组件 Props 目录
 *
 * ⚠️ 自动生成 — 请勿手动编辑
 *
 * 由 vite-plugin-spark-components 在 build / dev 时生成。
 * 数据来源：Vue SFC Props JSDoc（AST 提取）+ component-props-supplement.ts（手工补充）
 *
 * 重新生成：pnpm run dev 或 pnpm run build
 * 生成时间：2026-03-22T07:59:17.510Z
 * 条目数量：41（AST 字段: 24, 手工容器/概念: 17）
 */
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
  "r-cascader": `**r-cascader** — SPARK 字段组件
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
  "r-checkbox": `**r-checkbox** — SPARK 字段组件
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: boolean — 双向绑定值
checkedText?: string — 选中时显示文案 (默认 '是')
uncheckedText?: string — 未选时显示文案 (默认 '否')
checkboxText?: string — 复选框右侧文案 (默认 '')

⚠️ 用 checkedText / uncheckedText 代替 trueLabel / falseLabel`,
  "r-checkbox-group": `**r-checkbox-group** — SPARK 字段组件
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
  "r-color": `**r-color** — SPARK 字段组件
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值（颜色字符串，透传 el-color-picker）

透传到 el-color-picker: showAlpha, colorFormat('hex'|'rgb'|'hsl'|'hsv'), predefine(string[])`,
  "r-column-group": `**r-column-group** — SPARK 字段组件
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
  "r-date": `**r-date** — SPARK 字段组件
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
  "r-entity-picker": `**r-entity-picker** — SPARK 字段组件
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
  "r-file-browser": `**r-file-browser** — SPARK 字段组件
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
  "r-file-path": `**r-file-path** — SPARK 字段组件
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
  "r-html-editor": `**r-html-editor** — SPARK 字段组件
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值（HTML 字符串）
rows?: number — 编辑器高度行数 (默认 10)`,
  "r-icon": `**r-icon** — SPARK 字段组件
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
  "r-image": `**r-image** — SPARK 字段组件
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
  "r-multi-select": `**r-multi-select** — SPARK 字段组件
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
  "r-number": `**r-number** — SPARK 字段组件
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
  "r-radio": `**r-radio** — SPARK 字段组件
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string | number — 双向绑定值
options?: unknown[] — 选项列表
optionLabelField?: string — 选项标签字段
optionValueField?: string — 选项值字段
buttonStyle?: boolean — 按钮风格 (默认 false)`,
  "r-rate": `**r-rate** — SPARK 字段组件
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
  "r-select": `**r-select** — SPARK 字段组件
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
  "r-slider": `**r-slider** — SPARK 字段组件
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
  "r-switch": `**r-switch** — SPARK 字段组件
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
  "r-text": `**r-text** — SPARK 字段组件
field?: string — 字段绑定名，映射到 DataView 行字段
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值`,
  "r-textarea": `**r-textarea** — SPARK 字段组件
field?: string — 字段绑定名
label?: string — 显示标签
width?: number — r-table 内列宽
modelValue?: string — 双向绑定值
rows?: number — 行数 (默认 4)
autosize?: boolean | { minRows?: number; maxRows?: number } — 自适应高度 (默认 false)
maxlength?: number — 最大长度
showWordLimit?: boolean — 显示字数统计 (默认 false)
placeholder?: string — 占位提示 (默认 '请输入内容')`,
  "r-transfer": `**r-transfer** — SPARK 字段组件
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
  "r-tree-select": `**r-tree-select** — SPARK 字段组件
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
  "r-upload": `**r-upload** — SPARK 字段组件
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
}

/**
 * 组件注册表（按分类），供 design-prompt.ts 生成组件注册表 section。
 */
export const COMPONENT_REGISTRY = {
  containers: ["r-block","r-collapse","r-detail","r-dialog","r-drawer","r-form","r-list","r-section","r-steps","r-table","r-tabs","r-tree"] as const,
  fields: ["r-cascader","r-checkbox","r-checkbox-group","r-color","r-date","r-dept-picker","r-entity-picker","r-file-browser","r-file-path","r-html-editor","r-icon","r-image","r-multi-select","r-number","r-product-picker","r-radio","r-rate","r-select","r-slider","r-switch","r-text","r-textarea","r-transfer","r-tree-select","r-upload","r-user-picker"] as const,
  groups: ["r-column-group"] as const,
} as const
