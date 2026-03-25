// ── 技能 / 设计模式目录（Skill & Pattern Catalog）────────────────────────────
// AI 通过以下命令查询本目录：
//   @@query:skill-list  分类名...  → 返回该分类下的技能列表与简介
//   @@query:pattern    模式名...  → 返回指定模式的详细配置说明

import type { ProposalType } from './design-session'

export interface SkillCatalogEntry {
  name: string
  title: string
  /** 单行简介（供 skill-list 展示） */
  summary: string
  /** 适用场景 */
  when: string
  /** 反模式（什么情况下不应使用） */
  avoid?: string
  /** 配置要点（详情块，Markdown） */
  detail: string
  /** 前置依赖：名册A 中必须存在的结构特征（如 'relation', 'tree-config'） */
  requires: string[]
  /** 该模式通常产出的提案类型 */
  produces: ProposalType[]
  /** 校验项：使用该模式时需检查的关键点 */
  checks: string[]
}

export type SkillCategory =
  | 'data-pattern'
  | 'interaction-pattern'
  | 'layout-pattern'
  | 'permission-pattern'

// ── Catalog entries ───────────────────────────────────────────────────────────

export const SKILL_CATALOG: Record<string, SkillCatalogEntry> = {

  // ── data-pattern ─────────────────────────────────────────────────────────

  'master-detail': {
    name: 'master-detail',
    title: '主从表（主表 + 详情/子表）',
    summary: '上/左主表，下/右子表，选中主行自动联动子表数据',
    when: '存在 1:N 关系（订单-订单行、部门-人员等），需要"选主行看明细"',
    avoid: '数据完全独立无关联时无需使用；3层以上嵌套请改用 tree-data',
    requires: ['relation'],
    produces: ['data-model', 'view-plan', 'ui-structure'],
    checks: ['父表主键 isPrimaryKey', '父表 autoCurrentFirst', '子表外键与 relation 对应', '父子表各自声明 highlightCurrentRow'],
    detail: `## master-detail 配置要点

### pagedata.json — relations 配置（关键）
\`\`\`json
{
  "relations": [{
    "parentTable": "Orders",
    "childTable":  "OrderItems",
    "parentField": "id",
    "childField":  "orderId"
  }]
}
\`\`\`
- 子表若**无 api 配置**，框架自动走内存过滤（\`applyInMemoryCascade\`），父行切换自动重过滤
- 子表若**有 api 配置**，父行切换触发 \`childView.loadFromServer({ orderId })\`

### rule.json — 典型布局
\`\`\`json
[
  {
    "type": "r-table", "dataKey": "Orders@rows",
    "props": { "border": true, "stripe": true, "highlightCurrentRow": true }
  },
  {
    "type": "r-table", "dataKey": "OrderItems@rows",
    "props": { "border": true, "stripe": true }
  }
]
\`\`\`
### ⚠️ 注意：父子表各自独立声明 highlightCurrentRow`,
  },

  'tree-data': {
    name: 'tree-data',
    title: '树形数据（多级节点 + 展开折叠）',
    summary: '层级组织/分类树，节点可展开折叠，支持本地或远程懒加载',
    when: '数据有嵌套父子关系（部门树、菜单树、分类树）',
    avoid: '只有两层时 master-detail 更简单；节点超 10 万须配置懒加载',
    requires: ['tree-config'],
    produces: ['data-model', 'view-plan', 'ui-structure', 'interaction'],
    checks: ['idField/parentIdField/textField 三字段齐全', 'hierarchicalTreeData 辅助表存在', 'replaceRows 驱动刷新而非重建规则'],
    detail: `## tree-data 配置要点

### r-tree 基础配置
\`\`\`json
{
  "type": "r-tree",
  "dataKey": "Departments@rows",
  "props": {
    "idField": "id",
    "parentIdField": "parentId",
    "textField": "name"
  }
}
\`\`\`

### script.js — __init__ 中初始化嵌套树
\`\`\`javascript
function __init__() {
  var nodes = $dataSet?.getView('Departments', 'default')?.rows ?? []
  var tm = SparkData.createTreeManager(
    { idField: 'id', parentIdField: 'parentId', textField: 'name' },
    nodes
  )
  $dataSet?.getView('TreeData', 'default')?.replaceRows(tm.buildNestedTree())
}
\`\`\`
### 增删节点 → replaceRows() → UI 自动刷新，展开状态保留`,
  },

  'flat-list': {
    name: 'flat-list',
    title: '平铺列表（单表 CRUD，无关联）',
    summary: '最简 CRUD 模式，单张表的列出/新增/编辑/删除',
    when: '单实体管理（商品、用户、字典），数据无父子关系',
    requires: [],
    produces: ['data-model', 'ui-structure'],
    checks: ['主键字段标记 isPrimaryKey', 'views.default 存在'],
    detail: `## flat-list 最简配置

### pagedata.json
\`\`\`json
{
  "dataSetName": "DS",
  "tables": {
    "Items": { "columns": [...], "rows": [] }
  }
}
\`\`\`

### rule.json
\`\`\`json
[{
  "type": "r-table", "dataKey": "Items@rows",
  "props": { "border": true, "stripe": true, "highlightCurrentRow": true },
  "filter": { "columns": ["name", "status"] },
  "actions": {
    "items": [{ "label": "新增", "event": "handleAdd", "type": "primary" }],
    "rowActions": [
      { "label": "编辑",  "event": "handleEdit" },
      { "label": "删除",  "event": "handleDelete", "type": "danger" }
    ]
  }
}]
\`\`\``,
  },

  // ── interaction-pattern ──────────────────────────────────────────────────

  'search-filter': {
    name: 'search-filter',
    title: '搜索过滤（条件筛选 → 刷新数据）',
    summary: '字段过滤区 + 搜索/重置按钮，支持文本/下拉/日期范围等组合筛选',
    when: '数据量大需条件筛选，或有跨字段组合查询需求',
    avoid: '内联数据 < 20 条直接展示更直观；极简场景一个搜索框即可',
    requires: [],
    produces: ['ui-structure', 'interaction'],
    checks: ['filter.items 字段名存在于表列定义', 'on.search/on.reset 函数已声明'],
    detail: `## search-filter 标准配置

### 使用根级 filter（零代码，推荐）
\`\`\`json
{
  "type": "r-table", "dataKey": "Orders@rows",
  "filter": {
    "columns": [
      "orderNo",
      { "field": "status",    "component": "select",     "options": "OrderStatus" },
      { "field": "createdAt", "component": "date-range", "label": "创建日期" }
    ],
    "collapsible": true
  },
  "on": { "search": "handleSearch", "reset": "handleReset" }
}
\`\`\`

### script.js 回调
\`\`\`javascript
function handleSearch(params) {
  $dataSet?.getView('Orders', 'default')?.loadFromServer(params)
}
function handleReset() {
  $dataSet?.getView('Orders', 'default')?.loadFromServer({})
}
\`\`\``,
  },

  'inline-edit': {
    name: 'inline-edit',
    title: '行内编辑（表格直接编辑单元格，无需弹窗）',
    summary: '行直接变成输入状态，适合少字段批量修改',
    when: '可编辑字段 ≤ 5 个，修改频繁，用户熟悉的场景',
    avoid: '字段多或有复杂联动校验时，优先弹窗表单',
    requires: [],
    produces: ['ui-structure', 'interaction'],
    checks: ['row._editing 状态管理', 'handleEdit/handleSave/handleCancel 三函数齐全'],
    detail: `## inline-edit 配置要点

### 通过 row._editing 控制行状态（script.js）
\`\`\`javascript
function handleEdit(row)   { row._editing = true }
function handleCancel(row) { delete row._editing }
function handleSave(row) {
  var _editing = row._editing
  delete row._editing
  $dataSet?.getView('Items', 'default')?.updateRowById(row.id, row)
}
\`\`\`

### rowActions 绑定编辑/保存/取消
\`\`\`json
{
  "rowActions": [
    { "label": "编辑", "event": "handleEdit",   "hideWhen": "row._editing" },
    { "label": "保存", "event": "handleSave",   "showWhen": "row._editing", "type": "primary" },
    { "label": "取消", "event": "handleCancel", "showWhen": "row._editing" },
    { "label": "删除", "event": "handleDelete", "hideWhen": "row._editing", "type": "danger" }
  ]
}
\`\`\``,
  },

  'batch-select': {
    name: 'batch-select',
    title: '批量选择操作（多选 + 工具栏批量按钮）',
    summary: '勾选多行后执行批删、批改状态等操作',
    when: '需要批量处理多条记录（批量删除、批量导出、批量审批）',
    requires: [],
    produces: ['ui-structure', 'interaction'],
    checks: ['selectionType: checkbox 已声明', 'selectedRows 空数组守卫'],
    detail: `## batch-select 配置要点

### rule.json — selectionType + docked toolbar
\`\`\`json
{
  "type": "r-table",
  "props": {
    "selectionType": "checkbox",
    "docks": { "toolbar": { "position": "top" } }
  },
  "children": [
    {
      "type": "builtin-action",
      "dock": "toolbar",
      "props": { "builtinAction": "delete-selected", "label": "批量删除", "type": "danger" }
    }
  ]
}
\`\`\`

### script.js — 读取 selectedRows
\`\`\`javascript
function handleBatchDelete() {
  var rows = $dataSet?.getView('Items', 'default')?.selectedRows ?? []
  if (!rows.length) { $page.showMessage('请先选择记录', 'warning'); return }
  $page.showConfirm('确认删除 ' + rows.length + ' 条？', function() {
    // batch delete logic...
  })
}
\`\`\``,
  },

  'wizard-form': {
    name: 'wizard-form',
    title: '步骤表单（多步骤向导，降低认知负担）',
    summary: '复杂表单拆为 3-5 步，引导用户分步填写',
    when: '表单字段 > 20 个，或流程有严格顺序（注册 → 填写 → 权限 → 确认）',
    avoid: '字段 < 10 个的简单表单；各步数据强耦合需同屏展示时',
    requires: [],
    produces: ['data-model', 'ui-structure', 'interaction'],
    checks: ['步骤数 3-5 个', '步骤切换逻辑完整（next/prev/submit）', 'Draft 表存在用于暂存'],
    detail: `## wizard-form — el-steps + r-form 分区

### rule.json
\`\`\`json
[
  {
    "type": "el-steps",
    "props": { "active": 0, "finishStatus": "success" },
    "children": [
      { "type": "el-step", "props": { "title": "基本信息" } },
      { "type": "el-step", "props": { "title": "权限设置" } },
      { "type": "el-step", "props": { "title": "确认" } }
    ]
  },
  { "type": "r-form", "id": "step-form", "dataKey": "Draft@currentRow", "children": [...] }
]
\`\`\`

### script.js 步骤控制
\`\`\`javascript
var _step = 0
function handleNext() {
  if (_step < 2) { _step++; $query('[name="steps"]').active = _step }
}
function handlePrev() {
  if (_step > 0) { _step--; $query('[name="steps"]').active = _step }
}
\`\`\``,
  },

  // ── layout-pattern ───────────────────────────────────────────────────────

  'split-panel': {
    name: 'split-panel',
    title: '左右分屏（导航/列表 + 详情区）',
    summary: '左侧树或列表，右侧详情面板，点击左侧更新右侧内容',
    when: '内容有主细层级：组织树+员工详情、菜单树+配置表',
    requires: [],
    produces: ['ui-structure'],
    checks: ['flex 布局 gap 设置', '左侧固定宽度 + 右侧 flex:1', '联动用 replaceRows/DOM 直写'],
    detail: `## split-panel 布局结构

### rule.json — flexbox 分屏
\`\`\`json
{
  "type": "div",
  "style": { "display": "flex", "gap": "16px", "height": "100%" },
  "children": [
    {
      "type": "div", "style": { "width": "240px", "flexShrink": "0" },
      "children": [{ "type": "r-tree", "dataKey": "Menu@rows" }]
    },
    {
      "type": "div", "style": { "flex": "1", "overflow": "auto" },
      "children": [{ "type": "r-table", "dataKey": "Items@rows" }]
    }
  ]
}
\`\`\`

### 联动原则
树节点 click → replaceRows() 或 DOM 直写更新右侧，禁止重建规则（会导致树折叠）`,
  },

  'detail-readonly': {
    name: 'detail-readonly',
    title: '只读详情（展示单条记录，不可编辑）',
    summary: '审批详情、查看记录、打印预览，r-detail 纯展示',
    when: '仅查看无编辑需求（审批流、历史记录查看、打印预览）',
    avoid: '若用户需要修改，请用 r-form 替代',
    requires: [],
    produces: ['ui-structure'],
    checks: ['dataKey 指向 @currentRow', '上游表设置 highlightCurrentRow'],
    detail: `## detail-readonly — r-detail 配置

### rule.json
\`\`\`json
{
  "type": "r-detail",
  "dataKey": "Orders@currentRow",
  "children": [
    { "type": "r-text",   "field": "orderNo",     "props": { "label": "订单号" } },
    { "type": "r-text",   "field": "status",      "props": { "label": "状态" } },
    { "type": "r-number", "field": "totalAmount", "props": { "label": "总金额" } }
  ]
}
\`\`\`

### dataKey 指向 currentRow（非 rows）
r-detail 展示当前选中行，须确保上游 r-table 设置了 highlightCurrentRow`,
  },

  'context-aware-fields': {
    name: 'context-aware-fields',
    title: '语境感知字段渲染（父容器驱动子组件）',
    summary: '同一 r-* 字段组件在 table/form/detail/list/tree 父语境下自动切换渲染策略',
    when: '组件高度抽象，要求子组件自动感知父组件并做差异化渲染',
    avoid: '不要生成脱离容器的字段组件，不要在 r-table 中混用 el-table-column',
    requires: [],
    produces: ['ui-structure', 'interaction'],
    checks: ['字段组件必须位于 r-table/r-form/r-detail/r-list/r-tree 内', 'r-table 子节点禁止 el-table-column', '同类字段组件跨语境复用，不复制多套组件'],
    detail: `## context-aware-fields 配置要点

### 核心原则
- 子组件渲染行为由父容器语境决定（table/form/detail/list/tree）
- 字段组件只声明 field/label，不在脚本里写“按父组件名分支”的硬编码
- 同一字段组件类型跨容器复用，保持规则一致

### 推荐结构
\`\`\`json
[
  {
    "type": "r-table",
    "dataKey": "Orders@rows",
    "children": [
      { "type": "r-text", "field": "orderNo", "props": { "label": "订单号" } },
      { "type": "r-number", "field": "amount", "props": { "label": "金额" } }
    ]
  },
  {
    "type": "r-form",
    "dataKey": "Orders@currentRow",
    "children": [
      { "type": "r-text", "field": "orderNo", "props": { "label": "订单号" } },
      { "type": "r-number", "field": "amount", "props": { "label": "金额" } }
    ]
  }
]
\`\`\`

### 反例
- 顶层直接放 \`r-text\` + \`field\`（缺失父语境）
- \`r-table\` 内写 \`el-table-column\`（违背统一字段体系）
- 为不同容器复制 \`TableText\` / \`FormText\` 等多套组件`,
  },

  // ── permission-pattern ───────────────────────────────────────────────────

  'row-level-perm': {
    name: 'row-level-perm',
    title: '行级权限（不同行有不同操作权限）',
    summary: '从 row._perm 快照读取权限，动态控制操作按钮显隐/可用',
    when: '不同用户/角色对同表的不同行有差异化操作权限（审批流、多角色共用列表）',
    requires: ['_perm-field'],
    produces: ['ui-structure', 'interaction'],
    checks: ['row._perm 字段在样例数据中存在', '禁止根据用户 ID/角色字符串做 if/switch', 'Render* 函数读 _perm 驱动按钮状态'],
    detail: `## row-level-perm — 权限驱动 UI

### 核心原则
- 前端**不做权限判定**，只读 \`row._perm\` 字段（后端下发的权限快照）
- 常用字段：\`canEdit / canDelete / canApprove / editableFields\`（由后端约定）

### Render* 函数（固定代码框架，权限数据变了 UI 自动变）
\`\`\`javascript
function RenderRowActions(row) {
  return h('div', [
    h('button', {
      disabled: !row._perm?.canEdit,
      style: { color: row._perm?.canEdit ? '#409eff' : '#c0c4cc' },
      onClick: row._perm?.canEdit ? function() { handleEdit(row) } : null
    }, '编辑'),
    h('button', {
      disabled: !row._perm?.canDelete,
      style: { color: row._perm?.canDelete ? '#f56c6c' : '#c0c4cc' },
      onClick: row._perm?.canDelete ? function() { handleDelete(row) } : null
    }, '删除')
  ])
}
\`\`\`

### ⚠️ 禁止：根据用户 ID / 角色字符串做 if/switch
所有权限判断必须通过 \`row._perm\` 完成，框架代码一行不动`,
  },

  // ── data-pattern (追加) ──────────────────────────────────────────────────

  'computed-aggregate': {
    name: 'computed-aggregate',
    title: '计算列 + 视图聚合（零代码派生字段与汇总）',
    summary: '通过 computeExpression 逐行计算 + aggregates 自动汇总，无需写脚本',
    when: '需要派生字段（金额=单价×数量）或汇总行（合计/均值/计数），且希望零代码配置实现',
    avoid: '极复杂的业务逻辑（跨多表多条件分支）→ 放在 script.js __init__ 中',
    requires: [],
    produces: ['data-model'],
    checks: ['computeExpression 行字段名拼写与列定义一致', 'rows 中不预填计算列值', 'aggregates 的 type 为合法聚合类型', '多语句表达式所有分支都有 return'],
    detail: `## computed-aggregate 配置要点

### 计算列（pagedata.json 列定义）
\`\`\`json
{
  "columns": [
    { "name": "price", "type": "number" },
    { "name": "qty",   "type": "number" },
    { "name": "total", "type": "number", "computeExpression": "price * qty" },
    { "name": "grade", "computeExpression": "if (score >= 90) return 'A'; if (score >= 60) return 'B'; return 'C';" }
  ]
}
\`\`\`

**表达式规则**：
- 单表达式（不含 return）：框架自动 \`return (expression)\`
- 多语句（含 return）：所有分支必须 \`return\`
- \`ctx.xxx\`：运行时通过 \`view.setComputedContext()\` 注入

### 子表聚合函数（需 DataRelation）
\`\`\`json
{ "name": "orderTotal", "computeExpression": "$sum('OrderItems', 'amount')" }
\`\`\`
支持：\`$sum / $count / $avg / $min / $max / $list / $join\`

### 视图级聚合（views.default.aggregates）
\`\`\`json
{
  "views": {
    "default": {
      "aggregates": {
        "price": { "type": "sum" },
        "score": { "type": "avg" },
        "name":  { "type": "count" }
      }
    }
  }
}
\`\`\`
自动维护 \`summaryRow\` + \`selectionSummaryRow\`，UI 通过 \`dataKey: "Orders@summaryRow"\` 绑定。

### ⚠️ 注意
- 计算列是 **列** 级别（\`DataColumn.computeExpression\`），逐行求值
- 聚合是 **视图** 级别（\`IViewMetadata.aggregates\`），整列汇总
- 两者独立，可同时使用`,
  },

  // ── interaction-pattern (追加) ───────────────────────────────────────────

  'dialog-form-crud': {
    name: 'dialog-form-crud',
    title: '弹窗表单 CRUD（对话框/抽屉编辑，主表不离开）',
    summary: '主表全屏展示，新增/编辑打开弹窗或抽屉表单',
    when: '编辑字段多（>10个），编辑频率中等，用户需要在编辑时参照主表数据',
    avoid: '字段≤5 个时用 inline-edit 更高效；强双面板需求用 split-panel',
    requires: [],
    produces: ['ui-structure', 'interaction'],
    checks: ['r-dialog/r-drawer 声明 modelValue 控制显隐', 'r-form 绑定 @currentRow', '保存后调用 replaceRows 或 refreshData'],
    detail: `## dialog-form-crud 配置要点

### rule.json — 主表 + 弹窗/抽屉
\`\`\`json
[
  {
    "type": "r-table",
    "dataKey": "Orders@rows",
    "props": {
      "docks": { "toolbar": { "position": "top" } },
      "border": true, "stripe": true, "highlightCurrentRow": true
    },
    "actions": {
      "items": [
        { "type": "builtin-action", "props": { "builtinAction": "patch-row", "label": "编辑" } },
        { "type": "builtin-action", "props": { "builtinAction": "delete-row", "label": "删除", "type": "danger" } }
      ]
    },
    "children": [
      { "type": "builtin-action", "dock": "toolbar", "props": { "builtinAction": "append-row", "label": "新增", "type": "primary" } },
      ...
    ]
  },
  {
    "type": "r-dialog",
    "props": { "title": "编辑订单" },
    "children": [
      {
        "type": "r-form",
        "dataKey": "Orders@currentRow",
        "children": [
          { "type": "r-text", "field": "orderNo", "props": { "label": "订单号" } },
          { "type": "r-date", "field": "date", "props": { "label": "日期" } }
        ]
      }
    ]
  }
]
\`\`\`

### 关键
- r-dialog/r-drawer 的 modelValue 由 builtin-action 的 patch-row/append-row 自动控制
- r-form 的 dataKey 绑定 \`@currentRow\`，与主表联动`,
  },

  'tabs-multi-view': {
    name: 'tabs-multi-view',
    title: '标签页多视图（同数据不同展示角度）',
    summary: '用 r-tabs 切换展示角度（列表/卡片/统计/详情等）',
    when: '同一数据集需要多种展示方式（管理员看列表、业务看卡片、领导看统计）',
    avoid: '只有 2 个视角且一个是主要的 → 用 split-panel 更直观',
    requires: [],
    produces: ['ui-structure', 'view-plan'],
    checks: ['每个 tab 容器绑定同一 dataSet 的不同视图或同一视图', 'tab 切换不触发数据重载（内存共享）'],
    detail: `## tabs-multi-view 配置要点

### rule.json
\`\`\`json
{
  "type": "r-tabs",
  "children": [
    {
      "type": "el-tab-pane",
      "props": { "label": "列表视图", "name": "table" },
      "children": [{
        "type": "r-table",
        "dataKey": "Orders@rows",
        "children": [...]
      }]
    },
    {
      "type": "el-tab-pane",
      "props": { "label": "卡片视图", "name": "card" },
      "children": [{
        "type": "r-list",
        "props": { "dataKey": "Orders@rows", "columns": 3, "useCard": true },
        "children": [...]
      }]
    },
    {
      "type": "el-tab-pane",
      "props": { "label": "汇总统计", "name": "stats" },
      "children": [{
        "type": "r-detail",
        "dataKey": "Orders@summaryRow",
        "children": [...]
      }]
    }
  ]
}
\`\`\`

### 核心原则
- 所有 tab 共享同一 DataSet，不重复加载数据
- 使用不同容器（r-table / r-list / r-detail）展示同一数据的不同视角`,
  },

  'import-export': {
    name: 'import-export',
    title: '数据导入/导出（批量录入 + Excel 下载）',
    summary: '工具栏放置导入/导出按钮，通过 $page 服务调用框架级文件操作',
    when: '需要批量数据录入（Excel 导入）或数据导出（Excel/CSV 下载）',
    avoid: '数据量 > 100 万行时建议分批导出或后端直接生成文件下载链接',
    requires: [],
    produces: ['ui-structure', 'interaction'],
    checks: ['_modelPerm.canImport / canExport 权限检查', '导入后调用 refreshData 刷新', '导出使用 selectedRows 或全量 rows'],
    detail: `## import-export 配置要点

### docked toolbar 配置
\`\`\`json
{
  "type": "r-table",
  "props": { "docks": { "toolbar": { "position": "top" } } },
  "children": [
    { "type": "builtin-action", "dock": "toolbar", "props": { "builtinAction": "refresh", "label": "刷新" } },
    { "type": "RenderImportButton", "dock": "toolbar" },
    { "type": "RenderExportButton", "dock": "toolbar" }
  ]
}
\`\`\`

### script.js（Render* 按钮）
\`\`\`javascript
function RenderImportButton() {
  return h('button', { onClick: handleImport, style: '...' }, '导入')
}
function RenderExportButton() {
  return h('button', { onClick: handleExport, style: '...' }, '导出')
}
function handleImport() {
  $page.showFileBrowser({ accept: '.xlsx,.csv' })
    .then(function(file) { /* 上传并刷新 */ })
}
function handleExport() {
  var rows = $dataSet?.getView('Orders', 'default')?.rows ?? []
  // 调用导出 API...
}
\`\`\`

### 权限控制
Render* 内通过 \`_pageState.modelPerm.canImport / canExport\` 控制按钮可用性`,
  },
}

// ── 分类索引 ──────────────────────────────────────────────────────────────────

/** 技能分类索引：分类 key → 该分类下的技能名称列表  */
export const SKILL_CATEGORY_INDEX: Record<string, string[]> = {
  'data-pattern':        ['master-detail', 'tree-data', 'flat-list', 'computed-aggregate'],
  'interaction-pattern': ['search-filter', 'inline-edit', 'batch-select', 'wizard-form', 'dialog-form-crud', 'import-export'],
  'layout-pattern':      ['split-panel', 'detail-readonly', 'context-aware-fields', 'tabs-multi-view'],
  'permission-pattern':  ['row-level-perm'],
}

// ── 查询解析 ──────────────────────────────────────────────────────────────────

/**
 * 解析技能查询请求，返回格式化的响应文本。
 * @param queryType 'skill-list'（列表）| 'pattern'（详情）
 * @param targets   分类名列表（skill-list）或模式名列表（pattern）
 */
export function resolveSkillQuery(
  queryType: 'skill-list' | 'pattern',
  targets: string[],
): string {
  if (queryType === 'skill-list') {
    const lines: string[] = ['## 🗂 可用技能列表']
    for (const cat of targets) {
      const skills = SKILL_CATEGORY_INDEX[cat]
      if (!skills) {
        lines.push(`\n### ❌ 未知分类：\`${cat}\``)
        lines.push(`可用分类：${Object.keys(SKILL_CATEGORY_INDEX).join(', ')}`)
        continue
      }
      lines.push(`\n### 分类: \`${cat}\``)
      for (const name of skills) {
        const entry = SKILL_CATALOG[name]
        if (entry) lines.push(`- **\`${name}\`**: ${entry.summary}`)
      }
    }
    lines.push('\n> 使用 `@@query:pattern 模式名` 查询该模式的详细配置要点。')
    return lines.join('\n')
  } else {
    const lines: string[] = ['## 📖 设计模式详情']
    for (const name of targets) {
      const entry = SKILL_CATALOG[name]
      if (!entry) {
        lines.push(`\n### ❌ 未知模式：\`${name}\``)
        lines.push(`可用模式：${Object.keys(SKILL_CATALOG).join(', ')}`)
        continue
      }
      lines.push(`\n### ${entry.title} (\`${name}\`)`)
      lines.push(`**适用场景**: ${entry.when}`)
      if (entry.avoid) lines.push(`**⚠️ 反模式**: ${entry.avoid}`)
      lines.push('')
      lines.push(entry.detail)
    }
    return lines.join('\n')
  }
}
