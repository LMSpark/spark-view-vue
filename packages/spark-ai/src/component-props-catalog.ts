/**
 * SPARK 组件 Props 目录
 *
 * 用于 AI 设计会话的交互式查询——AI 通过 @@ 协议请求组件 Props，
 * 系统从此目录查找并注入到对话上下文中。
 */
export const COMPONENT_PROPS_CATALOG: Record<string, string> = {
  // ── 容器组件 ─────────────────────────────────────────────────────────────

  'r-table': `**r-table** — 数据表格容器（SparkNode v2 格式）

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
itemActions: Rule[] — 列表项操作区
itemActionsPosition: 'left' | 'right' — 默认 'right'
columns: number — 列数，默认 1
gap: number — 间距，默认 0
minItemWidth: string — 最小项宽度
rowKey: string — 行唯一键，默认 'id'
emptyText: string — 空数据文案，默认 '暂无数据'
useCard: boolean — 使用卡片包裹，默认 false
cardShadow: 'always' | 'hover' | 'never' — 默认 'hover'
gridColumns: number — 默认 24
gridGap: number — 默认 0
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

  // ── 字段组件 ─────────────────────────────────────────────────────────────
  // 所有 r-* 字段共享基础 Props: name(字段绑定名), label(显示标签), width(r-table列宽)

  'r-text': `**r-text** — 单行文本输入
name: string — 字段绑定名（必填）
label: string — 显示标签
width: number — r-table 内列宽
（无额外特有 Props）`,

  'r-number': `**r-number** — 数字输入
name / label / width — 同 r-text
min: number — 最小值
max: number — 最大值
filterMode: 'range' — 启用范围过滤模式`,

  'r-select': `**r-select** — 下拉选择
name / label / width — 同 r-text
options: Array<{label, value}> — 选项列表
optionLabelField: string — 选项标签字段，默认 'label'
optionValueField: string — 选项值字段，默认 'value'
placeholder: string — 默认 '请选择'
clearable: boolean — 默认 true
filterable: boolean — 可搜索，默认 false`,

  'r-multi-select': `**r-multi-select** — 多选下拉
name / label / width — 同 r-text
options: Array<{label, value}> — 选项列表
optionLabelField / optionValueField — 同 r-select
placeholder: string — 默认 '请选择'
clearable: boolean — 默认 true
filterable: boolean — 默认 false
collapseTags: boolean — 折叠已选标签，默认 false
collapseTagsTooltip: boolean — 折叠标签提示，默认 false
maxCollapseTags: number — 最大显示标签数，默认 1`,

  'r-date': `**r-date** — 日期选择
name / label / width — 同 r-text
modelValue: string | Date | Array — 日期或日期范围
透传到 el-date-picker: type('date'/'datetime'/'daterange'), format, valueFormat 等`,

  'r-textarea': `**r-textarea** — 多行文本
name / label / width — 同 r-text
rows: number — 行数，默认 4
autosize: boolean | {minRows, maxRows} — 自适应高度，默认 false
maxlength: number — 最大长度
showWordLimit: boolean — 显示字数统计，默认 false
placeholder: string — 默认 '请输入内容'`,

  'r-radio': `**r-radio** — 单选按钮组
name / label / width — 同 r-text
options: Array<{label, value}> — 选项列表
optionLabelField / optionValueField — 同 r-select
buttonStyle: boolean — 按钮风格，默认 false`,

  'r-switch': `**r-switch** — 开关
name / label / width — 同 r-text
activeText: string — 激活文案，默认 '是'
inactiveText: string — 未激活文案，默认 '否'`,

  'r-slider': `**r-slider** — 滑块
name / label / width — 同 r-text
min: number — 默认 0
max: number — 默认 100
step: number — 步长，默认 1
showInput: boolean — 显示输入框，默认 false`,

  'r-rate': `**r-rate** — 评分
name / label / width — 同 r-text
max: number — 最大值，默认 5
allowHalf: boolean — 允许半星，默认 false`,

  'r-html-editor': `**r-html-editor** — 富文本编辑器
name / label / width — 同 r-text
rows: number — 编辑器高度行数，默认 10`,

  'r-upload': `**r-upload** — 文件上传
name / label / width — 同 r-text
action: string — 上传 URL，默认 '#'
accept: string — 接受文件类型，默认 ''
buttonText: string — 按钮文案，默认 '点击上传'
autoUpload: boolean — 默认 true
showFileList: boolean — 默认 true
limit: number — 最大文件数，默认 1
listType: 'text' | 'picture' | 'picture-card' — 默认 'text'
separator: string — 多文件分隔符，默认 ', '
placeholder: string — 默认 '请选择文件'`,

  'r-image': `**r-image** — 图片上传
name / label / width — 同 r-text
action: string — 上传 URL，默认 '#'
accept: string — 默认 'image/*'
multiple: boolean — 多选，默认 false
separator: string — 多图分隔符，默认 ', '
placeholder: string — 默认 '请选择图片'
buttonText: string — 默认 '上传图片'
clearable: boolean — 默认 true`,
}
