/**
 * SparkNode Component Catalog
 *
 * 为 SparkNode.containers 和 SparkNode.fields 两个 capabilityId 提供结构化知识，
 * 作为 generate-tools-catalog.ts queryActionSpec 的事实源。
 *
 * **数据来源**：直接阅读框架源码提取：
 * - dock-extraction.ts — 每个容器接受的 dock 类型集合（TABLE_DOCK_TYPES 等）
 * - RendererTable/input.ts — isCollectedTableColumn() 列子节点分类算法
 * - useResolvedFieldContext.ts — 字段组件宿主上下文解析链
 * - register-renderers.ts — 完整组件注册表
 *
 * 约束：
 * - 本文件只提供 catalog，不提供 execute 实现；
 * - 条目结构对齐其他 catalog 的 failureModes 形状（code/when/fix）。
 */

/** 通用失败模式。 */
export interface SparkNodeComponentFailureMode {
  code: string
  when: string
  fix: string
}

/** SparkNode 组件能力条目。 */
export interface SparkNodeComponentEntry {
  capabilityId: string
  description: string
  paramsSchema: Record<string, unknown>
  usageRules: string[]
  failureModes: SparkNodeComponentFailureMode[]
}

// ── Dock 类型映射（源自 dock-extraction.ts 预定义常量）──────────────────────
// TABLE_DOCK_TYPES  = Set(['r-toolbar', 'r-actions', 'r-filter'])
// TREE_DOCK_TYPES   = Set(['r-toolbar', 'r-actions', 'r-editor'])
// LIST_DOCK_TYPES   = Set(['r-toolbar', 'r-actions'])
// FORM_DOCK_TYPES   = Set(['r-toolbar'])
// OVERLAY_DOCK_TYPES = Set(['r-header', 'r-footer'])
// SECTION_DOCK_TYPES = Set(['r-header'])
// NAVIGATION_DOCK_TYPES = Set(['r-toolbar'])  (r-tabs / r-collapse / r-steps)
// TOOLBAR_DOCK_TYPES = Set(['r-tail'])

export const SPARK_NODE_COMPONENT_ENTRIES: readonly SparkNodeComponentEntry[] = [
  {
    capabilityId: 'SparkNode.containers',
    description: '容器组件嵌套规则 — 每个容器有「dock 子节点」和「内容子节点」两类 children',
    paramsSchema: {
      // ── 组件层级体系（三类容器 + 嵌套规则）──────────────────────────────────
      _组件分类: {
        数据容器: 'r-table / r-form / r-detail / r-tree / r-list — 消费 PAGE_DATASET，提供 DATA_SOURCE，内部放字段组件',
        布局容器: 'r-section / r-card / r-space / r-row / r-col / r-container 等 — 纯布局，不干预数据流，字段上下文自动穿透',
        分组容器: 'r-tabs / r-collapse / r-steps — 每个分组项内可放任意容器',
        弹层容器: 'r-dialog / r-drawer — 浮层，内部可放任意组件',
        dock组件: 'r-toolbar / r-filter / r-actions / r-header / r-footer / r-editor / r-tail — 嵌入父容器的结构化区域',
      },
      _嵌套规则: {
        核心原则: '每个数据容器创建独立的 DATA_SOURCE 作用域 — 内层数据容器会覆盖外层的数据上下文',
        布局容器可嵌套任意组件: 'r-section 内可以放 r-table / r-form 等数据容器，也可以放其他布局容器',
        分组容器每项独立: 'r-tabs 的每个 pane、r-collapse 的每个 item 内可放数据容器',
        弹层容器不限制内容: 'r-dialog / r-drawer 内可放任意组件（数据容器、布局容器、字段组件）',
        数据容器嵌套: [
          '允许但需理解作用域覆盖：r-form 内嵌 r-table，r-table 会 sparkProvide 自己的 DATA_SOURCE，其内部字段绑定到 r-table 的 DataView',
          '常见场景：r-form 内嵌子表格（r-table）展示关联明细',
        ],
        r_table内部限制: 'r-table 的内容子节点只能是字段组件和 r-column-group — 不能放布局容器（r-section 等），否则破坏 el-table > el-table-column 直接父子关系',
      },
      _字段上下文穿透: {
        说明: '字段组件通过 useResolvedFieldContext() 向上查找最近的数据容器类型',
        穿透行为: '布局容器（r-section/r-card/r-space 等）不在宿主类型列表中，字段自动跳过，继续向上找数据容器',
        宿主类型: ['r-table', 'r-form', 'r-detail', 'r-tree', 'r-list'],
        别名映射: { 'r-field-scope': 'r-form', 'r-list-item': 'r-list' },
        默认回退: 'r-detail（只读展示模式）',
        示例: '如果 r-text 放在 r-section > r-form 内，跳过 r-section 找到 r-form，按表单模式渲染为 el-form-item',
      },
      _dock架构: {
        说明: '容器 children 分为 dock 子节点（按 type 匹配）和内容子节点（剩余部分）',
        分离算法: '绑定层 liftDockChildren 在构建阶段按 type 从 children 提升 dock 到 props',
        dock不占据内容区: 'dock 由容器提取后独立渲染在指定区域（工具栏区、筛选区、行操作列等）',
      },

      // ── 数据容器（5 种，均 sparkConsume(PAGE_DATASET) + sparkProvide(DATA_SOURCE)）────
      'r-table': {
        说明: '表格容器 — DataView-first 模型',
        dataKey: '"Table@rows" — 绑定 DataView.rows',
        dock类型: ['r-toolbar', 'r-filter', 'r-actions'],
        内容子节点: [
          'r-* 字段组件（r-text/r-number/r-select/r-date 等）— 需有 field 属性',
          'r-column-group — 分组列头（有 children 的 r-* 节点，内部嵌套字段组件）',
        ],
        children过滤: 'isCollectedTableColumn: 接受 r-* + field 或 r-* + children；排斥 Render*、非 r-* 组件',
        渲染方式: '列节点直接挂在 el-table 下，由 SparkComponentRenderer 逐个展开',
        渲染链: 'r-table → el-table → r-text → FieldContextRenderer → el-table-column',
        关键: 'el-table-column 由 FieldContextRenderer 在 r-table 上下文中自动生成，禁止在 rule.json 中手写',
        keyProps: 'highlightCurrentRow, stripe, border',
        provides: 'DATA_SOURCE (DataView)',
      },
      'r-form': {
        说明: '表单容器 — 双向绑定 currentRow',
        dataKey: '"Table@currentRow" — 绑定 DataView.currentRow',
        dock类型: ['r-toolbar'],
        内容子节点: 'r-* 字段组件或任意 r-* 组件',
        children过滤: '无 — contentChildren 直接进入 grid 布局',
        渲染方式: 'SparkChildrenBridge + grid-item div 包装',
        渲染链: 'r-form → el-form → grid → r-text → FieldContextRenderer → el-form-item + 输入控件',
        provides: 'DATA_SOURCE (DataView), DATA_ROW (currentRow)',
      },
      'r-detail': {
        说明: '详情容器 — 只读展示 currentRow',
        dataKey: '"Table@currentRow" — 绑定 DataView.currentRow',
        dock类型: ['r-toolbar'],
        内容子节点: 'r-* 字段组件或任意 r-* 组件',
        children过滤: '无',
        渲染方式: 'SparkChildrenBridge + grid-item div 包装',
        渲染链: 'r-detail → grid → r-text → FieldContextRenderer → div.field-display（label + value）',
        provides: 'DATA_SOURCE (DataView), DATA_ROW (currentRow)',
      },
      'r-tree': {
        说明: '树容器 — 配合 treeConfig 和 TreeManager',
        dataKey: '"TreeTable@rows" — 绑定嵌套树数据',
        dock类型: ['r-toolbar', 'r-actions', 'r-editor'],
        内容子节点: '字段组件用于自定义节点内容',
        children过滤: '无 — nodeContentChildren 由 dock 分离后直接用',
        渲染方式: 'el-tree #default slot → RendererHostRowScope（注入节点行数据）→ v-for SparkComponentRenderer',
        provides: 'DATA_SOURCE (DataView)',
      },
      'r-list': {
        说明: '列表/卡片容器 — 按行重复渲染',
        dataKey: '"Table@rows" — 绑定 DataView.rows',
        dock类型: ['r-toolbar', 'r-actions'],
        内容子节点: '字段组件（每行卡片内）',
        children过滤: '无',
        渲染方式: 'RendererHostRowScope 迭代 + grid-item div 包装',
        provides: 'DATA_SOURCE (DataView)',
      },

      // ── 布局容器（纯布局，不干预数据流，字段上下文自动穿透）────
      'r-section': {
        说明: '分组块 — 标题/折叠/24列网格布局',
        dock类型: ['r-header'],
        内容子节点: '任意组件（数据容器、布局容器、字段组件）— 字段自动穿透找上层数据容器',
        渲染方式: 'SparkChildrenBridge + grid-item div 包装',
      },
      'r-card': {
        说明: 'el-card 包装 — 任意子组件，字段穿透',
        dock类型: '无',
        渲染方式: 'v-for SparkComponentRenderer 直接渲染（无 dock 提取、无 grid 包装）',
      },
      'r-space': {
        说明: 'el-space 包装 — 任意子组件，字段穿透',
        dock类型: '无',
        渲染方式: 'v-for SparkComponentRenderer 直接渲染（无 dock 提取、无 grid 包装）',
      },

      // ── 弹层容器（浮层，不限制内容）────
      'r-dialog': {
        说明: '弹层 Modal — 内容区可放任意组件',
        dock类型: ['r-header', 'r-footer'],
        内容子节点: '任意组件（常见：r-form + r-toolbar 作为编辑弹窗）',
        渲染方式: 'SparkChildrenBridge + grid-item div 包装',
      },
      'r-drawer': {
        说明: '抽屉面板',
        dock类型: ['r-header', 'r-footer'],
        内容子节点: '任意组件',
        渲染方式: 'SparkChildrenBridge + grid-item div 包装',
      },

      // ── 导航容器（children 有精确类型过滤）────
      'r-tabs': {
        说明: '标签页 — children 必须是 r-tab-pane',
        dock类型: ['r-toolbar'],
        children过滤: '精确类型匹配 child.type === "r-tab-pane"，其他类型被丢弃',
        内容子节点: 'r-tab-pane — 每个 pane 内可放任意组件',
      },
      'r-collapse': {
        说明: '折叠面板 — children 必须是 r-collapse-item',
        dock类型: ['r-toolbar'],
        children过滤: '精确类型匹配 child.type === "r-collapse-item"，其他类型被丢弃',
        内容子节点: 'r-collapse-item — 每个 item 内可放任意组件',
      },
      'r-steps': {
        说明: '步骤条 — children 必须是 r-step',
        dock类型: ['r-toolbar'],
        children过滤: '精确类型匹配 child.type === "r-step"，其他类型被丢弃',
        内容子节点: 'r-step — 每个 step 内可放任意组件',
      },

      // ── 导航子项（由导航容器内部渲染，不独立使用）────
      'r-tab-pane': {
        说明: '标签页项 — r-tabs 的直接子节点',
        内容子节点: '任意组件（数据容器、布局容器、字段组件）',
        渲染方式: 'SparkChildrenBridge + grid-item div 包装',
      },
      'r-collapse-item': {
        说明: '折叠项 — r-collapse 的直接子节点',
        内容子节点: '任意组件',
        渲染方式: 'SparkChildrenBridge + grid-item div 包装',
      },
      'r-step': {
        说明: '步骤项 — r-steps 的直接子节点',
        内容子节点: '任意组件（content 模式）',
        渲染方式: 'SparkChildrenBridge + grid-item div 包装',
      },

      // ── Dock 组件本身（作为 children 嵌套在容器内）────
      'r-toolbar': {
        说明: '工具栏 dock — 按钮/操作入口',
        dock类型: ['r-tail'],
        内容子节点: 'r-button / builtin-action / r-dropdown 等操作组件',
        可被提取的容器: 'r-table / r-form / r-detail / r-tree / r-list / r-tabs / r-collapse / r-steps',
      },
      'r-filter': {
        说明: '筛选区 dock — 字段组件自动布局为筛选面板',
        内容子节点: 'r-* 字段组件（r-text/r-select/r-date 等）',
        可被提取的容器: '仅 r-table',
      },
      'r-actions': {
        说明: '行操作区 dock — 每行的操作按钮',
        内容子节点: 'r-button / r-link / builtin-action / r-dropdown 等操作组件',
        可被提取的容器: 'r-table / r-tree / r-list',
      },
      'r-header': { 说明: '头部 dock', 可被提取的容器: 'r-dialog / r-drawer / r-section' },
      'r-footer': { 说明: '底部 dock', 可被提取的容器: 'r-dialog / r-drawer' },
      'r-editor': { 说明: '编辑区 dock', 可被提取的容器: '仅 r-tree' },
    },
    usageRules: [
      // ── 层级规则（最重要）────
      '数据容器可嵌套数据容器 — 内层会 sparkProvide 自己的 DATA_SOURCE 覆盖外层上下文（如 r-form 内嵌 r-table 子表格）',
      '⚠️ r-table 内部限制：内容子节点只允许字段组件和 r-column-group — 不能放布局容器或其他数据容器（否则破坏 el-table > el-table-column 直接父子关系）',
      '布局容器（r-section/r-card/r-space 等）可嵌套任意组件（包括数据容器），字段上下文自动穿透',
      '导航容器 children 有精确类型过滤 — r-tabs 只接受 r-tab-pane，r-collapse 只接受 r-collapse-item，r-steps 只接受 r-step（其他类型被丢弃）',
      '导航子项（r-tab-pane / r-collapse-item / r-step）内可放数据容器或布局容器',
      '弹层容器（r-dialog/r-drawer）内可放任意组件',
      // ── 典型嵌套结构 ────
      '典型布局：r-section > [ r-table, r-form ] — section 作为布局分组，内部并列放数据容器',
      '典型弹窗：r-dialog > [ r-form, { type: "r-toolbar", children: [提交/取消按钮] } ]',
      '典型主从：r-section > [ r-table(主表), r-tabs > [ r-tab-pane(r-detail 子表1), r-tab-pane(r-table 子表2) ] ]',
      // ── 数据容器内部规则 ────
      'r-table 的内容子节点：有 field 属性的 r-* 字段组件（自动渲染为 el-table-column）、r-column-group',
      'r-table 需要 highlightCurrentRow: true 才能高亮当前行 — 每个表格独立声明',
      // ── dock 规则 ────
      '容器 children 分为 dock 子节点（按 type 匹配自动提取）和内容子节点（剩余部分渲染到主体）',
      'dock 只能放在支持该 dock 的容器内：r-filter 只能在 r-table 中，r-editor 只能在 r-tree 中',
    ],
    failureModes: [
      { code: 'DATA_CONTEXT_OVERRIDE', when: '数据容器嵌套后字段绑定到意外的 DataView', fix: '内层数据容器会覆盖外层 DATA_SOURCE — 确认 dataKey 指向正确的表，字段组件绑定到最近的数据容器' },
      { code: 'CONTAINER_NO_HIGHLIGHT', when: '子表忘记加 highlightCurrentRow', fix: '每个 r-table 独立声明 highlightCurrentRow: true' },
      { code: 'CONTAINER_MISSING_DOCK', when: 'dock 子节点 type 拼错或用在不支持的容器上', fix: '检查容器支持的 dock 类型：r-table→toolbar/filter/actions, r-tree→toolbar/actions/editor, r-dialog→header/footer' },
      { code: 'CONTAINER_DATA_SOURCE_NULL', when: '子组件 sparkConsume(DATA_SOURCE) 返回 null', fix: '确认父级有数据容器且 dataKey 正确' },
      { code: 'CONTAINER_NO_DATA', when: '表格渲染但无数据', fix: '检查 dataKey 与 pagedata.json 的表名一致性' },
      { code: 'CONTAINER_COLUMN_NOT_SHOWN', when: 'r-table 列不显示', fix: '内容子节点必须是有 field 属性的 r-* 字段组件或 r-column-group' },
      { code: 'DOCK_IN_WRONG_CONTAINER', when: 'dock 放在不支持该 dock 的容器中', fix: 'r-filter 只能在 r-table 中，r-editor 只能在 r-tree 中，r-header/r-footer 只在 r-dialog/r-drawer/r-section 中' },
      { code: 'NAV_CHILD_TYPE_MISMATCH', when: '导航容器内放了错误的子节点类型（被丢弃不渲染）', fix: 'r-tabs 只接受 r-tab-pane，r-collapse 只接受 r-collapse-item，r-steps 只接受 r-step' },
      { code: 'FIELD_CONTEXT_LOST', when: '字段组件未渲染为预期模式（如在 r-form 内却显示为只读）', fix: '检查中间是否有阻断上下文的组件 — 布局容器透明可穿透，但数据容器会重置上下文' },
    ],
  },
  {
    capabilityId: 'SparkNode.fields',
    description: '字段组件绑定规则 — 字段组件在 5 种宿主上下文中自适应渲染',
    paramsSchema: {
      field: 'string — 绑定字段名（与 DataColumn.name 对应）',
      label: 'string — 显示标签（r-table 中为表头文案，r-form 中为 form label）',
      width: 'number? — 列宽（仅 r-table 上下文生效）',
      props: 'object — 组件特有属性（由组件类型决定，需查询 queryComponentCatalog）',

      _渲染链路: {
        说明: '字段组件通过 FieldContextRenderer 根据宿主上下文自动选择渲染模板',
        中间组件: [
          'SparkChildrenBridge — 无 DOM，仅传递上下文和子组件',
          'SparkComponentRenderer — 无 DOM，组件路由器',
          '字段组件（r-text 等）— 无 DOM，纯代理，委托给 FieldContextRenderer',
          'FieldContextRenderer — 有 DOM，根据宿主类型输出对应 Element Plus 组件',
        ],
        'r-table上下文': 'FieldContextRenderer → el-table-column（label=field label, #default slot 渲染字段值）',
        'r-form上下文': 'FieldContextRenderer → el-form-item（含验证规则，#form slot 渲染输入控件）',
        'r-detail上下文': 'FieldContextRenderer → div.field-display（label + value 只读展示）',
        'r-tree上下文': 'FieldContextRenderer → 树节点文本片段',
        'r-list上下文': 'FieldContextRenderer → 卡片内字段展示',
      },

      _核心字段组件: {
        'r-text': '文本输入/展示 — 基于 el-input',
        'r-textarea': '多行文本 — 基于 el-input type=textarea',
        'r-number': '数字输入/展示 — 基于 el-input-number',
        'r-select': '下拉选择 — 需要 options/optionKey 属性',
        'r-multi-select': '下拉多选',
        'r-date': '日期选择 — 支持 format',
        'r-switch': '开关',
        'r-checkbox': '复选框',
        'r-checkbox-group': '复选框组',
        'r-radio': '单选',
      },

      _Render函数: {
        说明: 'type 为 script.js 中定义的函数名（如 "RenderStatus"）',
        函数签名: 'function RenderXxx(props) { return h(...) }',
        props参数: '{ row, column, $index, cellValue } — 由 r-table 注入',
        注意: 'Render* 不作为 r-table 列子节点，被 isCollectedTableColumn 过滤掉',
      },

      _分组列: {
        说明: 'r-column-group (FieldContextRenderer) — 分组列头，内含子列',
        使用方式: '{ type: "r-column-group", label: "地址信息", children: [{ type: "r-text", field: "province" }, ...] }',
        仅在r_table上下文: '渲染为嵌套 el-table-column，其他上下文不分组',
      },
    },
    usageRules: [
      '字段组件可在 5 种数据容器内使用：r-table / r-form / r-detail / r-tree / r-list',
      '同一字段组件在不同容器上下文中自动切换渲染模式（FieldContextRenderer 负责路由）',
      'field 值必须与 pagedata.json 中对应表的 columns.name 一致',
      'r-table 中：有 field 属性的字段组件由 FieldContextRenderer 自动渲染为 el-table-column — 禁止在 rule.json 中直接写 el-table-column',
      '⚠️ 不同字段组件支持不同的 props，使用前调用 queryComponentCatalog(type) 确认',
      '例：r-select 需要 options / optionKey 属性，r-date 支持 format — 必须查询确认',
      'Render* 类型节点：type 为 script.js 中定义的函数名，函数通过 h() 返回 VNode',
      '⚠️ 在 rule.json 中使用了 Render* type，script.js 中必须有同名函数定义',
      'r-column-group 用于表格分组列头，在非 r-table 上下文中降级为普通容器',
      '权限控制：字段通过 useFieldPermission 自动获取可见/可编辑状态，无需手动判断',
    ],
    failureModes: [
      { code: 'FIELD_NAME_MISMATCH', when: 'field 名与列定义不匹配', fix: '确保 field 值与 columns 中的 name 完全一致' },
      { code: 'FIELD_RENDER_MISSING', when: 'Render* type 在 script.js 中没有同名函数', fix: '在 script.js 中定义 function RenderXxx(props) { return h(...) }' },
      { code: 'FIELD_NO_HOST', when: '字段组件放在非数据容器内（无 DATA_SOURCE）', fix: '字段组件必须放在 r-table / r-form / r-detail / r-tree / r-list 内' },
      { code: 'FIELD_UNKNOWN_PROP', when: '使用了组件不支持的 props', fix: '调用 queryComponentCatalog(type) 查询该组件的可用 props 列表' },
      { code: 'FIELD_NO_FIELD_ATTR', when: 'r-table 中字段组件缺少 field 属性导致不显示', fix: '在 r-table 的字段子节点上声明 field 属性' },
      { code: 'FIELD_COLUMN_GROUP_OUTSIDE_TABLE', when: 'r-column-group 用在非 r-table 上下文', fix: 'r-column-group 仅在 r-table 内有分组列头效果，其他上下文降级为普通容器' },
    ],
  },
] as const satisfies readonly SparkNodeComponentEntry[]

export function getSparkNodeComponentEntry(capabilityId: string): SparkNodeComponentEntry | undefined {
  return SPARK_NODE_COMPONENT_ENTRIES.find(e => e.capabilityId === capabilityId)
}
