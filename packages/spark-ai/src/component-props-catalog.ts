/**
 * SPARK 组件 Props 目录
 *
 * 用于 AI 设计会话的交互式查询——AI 通过 @@ 协议请求组件 Props，
 * 系统从此目录查找并注入到对话上下文中。
 */
export const COMPONENT_PROPS_CATALOG: Record<string, string> = {
  // ── 容器组件 ─────────────────────────────────────────────────────────────

  'context-aware-fields-api': `**context-aware-fields-api** — 语境感知字段渲染能力总览

【核心能力】
- 子组件渲染由父容器语境决定：r-table(table) / r-form(form) / r-detail(detail) / r-list(list) / r-tree(tree)
- 同一 r-* 字段组件可跨语境复用，不复制多套组件
- 字段组件必须处于容器 children 中，禁止顶层裸放（会丢失语境）

【关键约束】
- r-table children 仅放 r-* 字段组件，禁止 el-table-column
- 事件逻辑优先用 meta.behavior.on + script.js 函数，不在组件层硬编码父级判断
- 字段绑定优先 field（SparkNode v3），不要使用废弃 name

【建议组合查询】
- r-table, r-form, r-detail, r-text, r-number, r-select, builtin-action`,

  'r-table': `**r-table** — 数据表格容器（SparkNode v3 格式）

【props — 原生组件属性，透传到 el-table】
border: boolean — 边框
stripe: boolean — 斑马纹
highlightCurrentRow: boolean — 当前行高亮（⚠️ 必须显式声明才生效）
height / maxHeight: string | number — 表格高度

【meta.data — 数据绑定域】
meta.data.dataKey: string — 数据绑定键，如 "Users@rows"

【meta.filter — 筛选配置域】
meta.filter.items: Array<string | FilterItem> — 筛选项列表
  字符串简写："fieldName" 等价于 { field: "fieldName", component: "text" }
  完整 FilterItem：{ field, label?, component?, options?, logic?, span?, props? }
  component 内置值：text | select | date | date-range | number | number-range | checkbox | radio
meta.filter.logic: 'and' | 'or' — 多条件默认逻辑，默认 'and'
meta.filter.collapsible: boolean — 可折叠，默认 false
meta.filter.defaultCollapsed: boolean — 默认折叠，默认 false
meta.filter.autoFitMinWidth: string — 最小宽度，默认 '220px'
meta.filter.itemSpan: number — 占栅格列数，默认 1
meta.filter.gridColumns: number — 栅格总列数，默认 24
meta.filter.gridGap: number | string — 间距，默认 12
meta.filter.on.search: string — 搜索触发（script.js 函数名）
meta.filter.on.reset: string — 重置触发
meta.filter.on.change: string — 字段值变化触发

【meta.toolbar — 工具栏域】
meta.toolbar.children: SparkNode[] — 工具栏按钮（优先 builtin-action，其次 Render*）
meta.toolbar.position: 'top' | 'bottom' — 默认 'top'

【meta.actions — 行操作域】
meta.actions.children: SparkNode[] — 行操作按钮（优先 builtin-action）
meta.actions.position: 'left' | 'right' — 默认 'right'
meta.actions.label: string — 操作列标题，默认 '操作'
meta.actions.width: number — 操作列宽度，默认 160
meta.actions.align: 'left' | 'center' | 'right' — 默认 'left'
meta.actions.fixed: boolean | 'left' | 'right' — 固定方向

【meta.behavior — 事件域】
meta.behavior.on.rowDblclick: string — 行双击（→ script.js 函数名）
（其他组件事件同理，key 为 camelCase 事件名）

children 内仅用 r-* 字段组件做列，禁止 el-table-column`,

  'r-form': `**r-form** — 数据表单容器（读写 currentRow）
dataKey: string — 数据绑定键，如 "Users@currentRow"
toolbar: Rule[] — 工具栏
toolbarPosition: 'top' | 'bottom' — 默认 'top'
labelWidth: string — 标签宽度，默认 '100px'
gridColumns: number — CSS Grid 列数，默认 24
gridGap: number — 栅格间距，默认 0
gridAutoRows: string — 行高定义
children 内放 r-* 字段组件`,

  'r-detail': `**r-detail** — 只读详情容器（展示 currentRow）
dataKey: string — 数据绑定键
toolbar: Rule[] — 工具栏
gridColumns: number — CSS Grid 列数，默认 24
gridGap: number — 栅格间距，默认 0
gridAutoRows: string — 行高定义
children 内放 r-* 字段组件（只读模式）`,

  'r-tree': `**r-tree** — 树形组件容器
dataKey: string — 数据绑定键，如 "TreeData@rows"
data: unknown[] — 静态数据（优先用 dataKey）
dataSource: unknown[] — 动态数据源
toolbar: Rule[] — 工具栏
nodeActions: Rule[] — 节点操作区
nodeActionsPosition: string — 节点操作位置
onNodeClick: string — script.js 函数名
onNodeExpand: string — 节点展开回调
onNodeCollapse: string — 节点折叠回调
其他 props 透传到 el-tree（node-key, default-expand-all, show-checkbox 等）`,

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
gridAutoRows: string — 行高定义
itemColSpan: number — 项跨列数
itemRowSpan: number — 项跨行数，默认 1`,

  'r-tabs': `**r-tabs** — 标签页容器
toolbar: Rule[] — 工具栏
modelValue: string | number — 当前激活 tab
onTabChange: string — 切换回调
onTabClick: string — 点击回调
children 内放 r-tab-pane（每个 tab-pane 内可嵌套任意组件）`,

  'r-collapse': `**r-collapse** — 折叠面板容器
toolbar: Rule[] — 工具栏
modelValue: string | number | Array — 展开的面板
onChange: string — 切换回调
children 内放 r-collapse-item`,

  'r-steps': `**r-steps** — 步骤条容器
toolbar: Rule[] — 工具栏
modelValue: number — 当前步骤
onStepChange: string — 步骤切换回调
children 内放 r-step`,

  'r-dialog': `**r-dialog** — 对话框容器
title: string — 标题
modelValue: boolean — 控制显隐
headerActions: Rule[] — 头部操作区
footerActions: Rule[] — 底部操作区
gridColumns: number — 默认 24
gridGap: number — 默认 0
gridAutoRows: string — 行高定义
onOpen: string — 打开回调
onClose: string — 关闭回调
onOpened: string — 打开动画结束回调
onClosed: string — 关闭动画结束回调`,

  'r-drawer': `**r-drawer** — 抽屉容器
title: string — 标题
modelValue: boolean — 控制显隐
headerActions: Rule[] — 头部操作区
footerActions: Rule[] — 底部操作区
gridColumns: number — 默认 24
gridGap: number — 默认 0
gridAutoRows: string — 行高定义
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

  'r-column-group': `**r-column-group** — 多级表头分组（仅用于 r-table 内）
label: string — 分组标题（必填）
width: string | number — 列宽
minWidth: string | number — 最小宽度
fixed: boolean | 'left' | 'right' — 固定方向
align: 'left' | 'center' | 'right' — 对齐方式
headerAlign: 'left' | 'center' | 'right' — 表头对齐
className: string — 列自定义样式类
labelClassName: string — 表头自定义样式类
children 内放 r-* 字段组件作为实际数据列

【使用场景】复杂表格需要多级表头分组，例如「基本信息」下包含「姓名」「年龄」「邮箱」

【示例】
{ "type": "r-column-group", "props": { "label": "基本信息" }, "children": [
  { "type": "r-text", "field": "name", "props": { "label": "姓名" } },
  { "type": "r-number", "field": "age", "props": { "label": "年龄" } }
]}`,

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
- meta.toolbar.children（工具栏动作）
- meta.actions.children（行内动作）

适用于 r-table / r-list / r-form / r-detail 的常见 CRUD 场景`,

  // ── 字段组件 ─────────────────────────────────────────────────────────────
  // 所有 r-* 字段共享基础 Props: field(字段绑定名), label(显示标签), width(r-table列宽)

  'r-text': `**r-text** — 单行文本输入
field: string — 字段绑定名（必填）
label: string — 显示标签
width: number — r-table 内列宽
（无额外特有 Props）`,

  'r-number': `**r-number** — 数字输入
field / label / width — 同 r-text
min: number — 最小值
max: number — 最大值
filterMode: 'range' — 启用范围过滤模式`,

  'r-select': `**r-select** — 下拉选择
field / label / width — 同 r-text
options: Array<{label, value}> — 选项列表
optionLabelField: string — 选项标签字段，默认 'label'
optionValueField: string — 选项值字段，默认 'value'
placeholder: string — 默认 '请选择'
clearable: boolean — 默认 true
filterable: boolean — 可搜索，默认 false`,

  'r-multi-select': `**r-multi-select** — 多选下拉
field / label / width — 同 r-text
options: Array<{label, value}> — 选项列表
optionLabelField / optionValueField — 同 r-select
placeholder: string — 默认 '请选择'
clearable: boolean — 默认 true
filterable: boolean — 默认 false
collapseTags: boolean — 折叠已选标签，默认 false
collapseTagsTooltip: boolean — 折叠标签提示，默认 false
maxCollapseTags: number — 最大显示标签数，默认 1`,

  'r-date': `**r-date** — 日期选择
field / label / width — 同 r-text
modelValue: string | Date | Array — 日期或日期范围
透传到 el-date-picker: type('date'/'datetime'/'daterange'), format, valueFormat 等`,

  'r-textarea': `**r-textarea** — 多行文本
field / label / width — 同 r-text
rows: number — 行数，默认 4
autosize: boolean | {minRows, maxRows} — 自适应高度，默认 false
maxlength: number — 最大长度
showWordLimit: boolean — 显示字数统计，默认 false
placeholder: string — 默认 '请输入内容'`,

  'r-radio': `**r-radio** — 单选按钮组
field / label / width — 同 r-text
options: Array<{label, value}> — 选项列表
optionLabelField / optionValueField — 同 r-select
buttonStyle: boolean — 按钮风格，默认 false`,

  'r-checkbox': `**r-checkbox** — 单复选框
field / label / width — 同 r-text
checkedText: string — 选中时显示文案，默认 '是'
uncheckedText: string — 未选时显示文案，默认 '否'
checkboxText: string — 复选框右侧文案，默认 ''
⚠️ 不再使用 trueLabel / falseLabel（已废弃）`,

  'r-checkbox-group': `**r-checkbox-group** — 复选框组
field / label / width — 同 r-text
options: Array<{label, value}> — 选项列表
optionLabelField / optionValueField — 同 r-select
min: number — 最少勾选数
max: number — 最多勾选数`,

  'r-switch': `**r-switch** — 开关
field / label / width — 同 r-text
activeText: string — 激活文案，默认 '是'
inactiveText: string — 未激活文案，默认 '否'`,

  'r-slider': `**r-slider** — 滑块
field / label / width — 同 r-text
min: number — 默认 0
max: number — 默认 100
step: number — 步长，默认 1
showInput: boolean — 显示输入框，默认 false`,

  'r-cascader': `**r-cascader** — 级联选择
field / label / width — 同 r-text
options: Array — 树形选项（嵌套结构）
optionLabelField: string — 选项标签字段，默认 'label'
optionValueField: string — 选项值字段，默认 'value'
optionChildrenField: string — 子节点字段，默认 'children'
placeholder: string — 默认 '请选择'
clearable: boolean — 默认 true
filterable: boolean — 默认 false
multiple: boolean — 多选模式，默认 false
checkStrictly: boolean — 父子不关联勾选，默认 false
emitPath: boolean — 值是否为完整路径数组，默认 true`,

  'r-tree-select': `**r-tree-select** — 树选择
field / label / width — 同 r-text
options: Array — 树形选项（嵌套结构）
optionLabelField: string — 选项标签字段，默认 'label'
optionValueField: string — 选项值字段，默认 'value'
optionChildrenField: string — 子节点字段，默认 'children'
placeholder: string — 默认 '请选择'
clearable: boolean — 默认 true
filterable: boolean — 默认 false
multiple: boolean — 多选模式，默认 false
checkStrictly: boolean — 父子不关联勾选，默认 false
defaultExpandAll: boolean — 默认展开所有节点，默认 false
renderAfterExpand: boolean — 是否展开后才渲染子节点，默认 true`,

  'r-transfer': `**r-transfer** — 穿梭框
field / label / width — 同 r-text
options: Array — 数据源（左侧候选列表）
optionLabelField: string — 选项标签字段，默认 'label'
optionValueField: string — 选项值字段，默认 'value'
titles: [string, string] — 左右面板标题，默认 ['待选', '已选']
filterable: boolean — 可搜索，默认 false
filterPlaceholder: string — 搜索框占位符，默认 '请输入关键词'
targetOrder: 'original' | 'push' | 'unshift' — 右侧排序方式，默认 'original'`,

  'r-color': `**r-color** — 颜色选择器
field / label / width — 同 r-text
showAlpha: boolean — 显示透明度
colorFormat: 'hex'|'rgb'|'hsl'|'hsv'
predefine: string[] — 预设颜色`,

  'r-icon': `**r-icon** — 图标字段
field / label / width — 同 r-text
iconSet: string — 图标集名
searchable: boolean — 可搜索图标
clearable: boolean — 可清空`,

  'r-rate': `**r-rate** — 评分
field / label / width — 同 r-text
max: number — 最大值，默认 5
allowHalf: boolean — 允许半星，默认 false`,

  'r-html-editor': `**r-html-editor** — 富文本编辑器
field / label / width — 同 r-text
rows: number — 编辑器高度行数，默认 10`,

  'r-upload': `**r-upload** — 文件上传
field / label / width — 同 r-text
action: string — 上传 URL，默认 '#'
accept: string — 接受文件类型，默认 ''
buttonText: string — 按钮文案，默认 '点击上传'
readonlyButtonText: string — 只读模式按钮文案，默认 '浏览'
autoUpload: boolean — 默认 true
showFileList: boolean — 默认 true
limit: number — 最大文件数，默认 1
listType: 'text' | 'picture' | 'picture-card' — 默认 'text'
separator: string — 多文件分隔符，默认 ', '
placeholder: string — 默认 '请选择文件'`,

  'r-file-path': `**r-file-path** — 文件路径输入/选择
field / label / width — 同 r-text
action: string — 上传 URL
accept: string — 接受文件类型
multiple: boolean — 多选，默认 false
separator: string — 多文件分隔符
placeholder: string — 默认 '请选择文件路径'
buttonText: string — 上传按钮文案，默认 '上传'
readonlyButtonText: string — 只读模式按钮文案
clearable: boolean — 默认 true`,

  'r-file-browser': `**r-file-browser** — 文件浏览器入口
field / label / width — 同 r-text
action: string — 上传 URL
accept: string — 接受文件类型
multiple: boolean — 多选，默认 false
separator: string — 多文件分隔符
placeholder: string — 占位符
buttonText: string — 上传按钮文案
readonlyButtonText: string — 只读模式按钮文案
clearable: boolean — 默认 true
⚠️ 与 r-file-path 基本一致，差异在于内置的浏览器 UI 体验`,

  'r-image': `**r-image** — 图片上传
field / label / width — 同 r-text
action: string — 上传 URL
accept: string — 默认 'image/*'
multiple: boolean — 多选，默认 false
separator: string — 多图分隔符
placeholder: string — 默认 '请选择图片'
buttonText: string — 默认 '上传图片'
readonlyButtonText: string — 只读模式按钮文案
clearable: boolean — 默认 true`,

  'r-entity-picker': `**r-entity-picker** — 通用实体选择器
field / label / width — 同 r-text
entityType: string — 实体类型（如 customer/product）
multiple: boolean — 是否多选
displayField: string — 展示字段
valueField: string — 值字段
onSelect: string — 选择回调（可选）`,

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

