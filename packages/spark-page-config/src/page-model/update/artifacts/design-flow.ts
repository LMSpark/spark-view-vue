/**
 * 页面设计 100 步流程定义与查询函数。
 *
 * PageNode 才是 pageDesign 的 SSOT。这里提供的是生产检查视图和顺序决策知识，
 * 不直接支配模型，也不直接拼进 system prompt。LLM 应通过
 * lifecycle.describeProgress 读取 PageNode 阶段检测，通过 describeDesignFlow
 * 按 intent、phase 或 step 查询必要流程，避免一次性灌入全量流程和具体组件目录。
 */

// ── 公共流程 DTO ───────────────────────────────────────────

export type PageDesignFlowStep = {
  step: number
  phase: string
  action: string
  checkpoint: string
}

export type PageDesignFlowPhaseSummary = {
  phase: string
  firstStep: number
  lastStep: number
  stepCount: number
}

/**
 * 面向 pageDesign LLM 的任务型知识片段。
 *
 * 它只描述“某类页面需求应如何查询和调用工具”，不直接修改页面四文件；
 * 运行时由 lifecycle.describeDesignFlow 按用户 intent 返回给模型，避免把任务模板塞进 system prompt。
 */
export type PageDesignTaskGuide = {
  id: string
  title: string
  when: string
  relevantSteps: readonly number[]
  dataPlanning: readonly string[]
  dataViewPlanning: readonly string[]
  payloadPlanning: readonly string[]
  functionCallPlan: readonly string[]
  validation: readonly string[]
}

// ── 流程定义 DSL ───────────────────────────────────────────

type PageDesignFlowStepParts = readonly [
  stepNumber: number,
  phase: string,
  action: string,
  checkpoint: string,
]

function step(...definition: PageDesignFlowStepParts): PageDesignFlowStep {
  const [stepNumber, phase, action, checkpoint] = definition
  return { step: stepNumber, phase, action, checkpoint }
}

/**
 * 页面设计完整流程。
 *
 * 这是可查询事实源；默认查询只返回阶段摘要，只有按 phase/step/intent 需要时才返回细节。
 */
export const PAGE_DESIGN_100_STEP_FLOW: readonly PageDesignFlowStep[] = [
  step(1, '入口', '明确用户要的是新页面、局部改造、修 bug、补数据还是调样式', '得到任务类型'),
  step(2, '入口', '定位当前页面 pageId', 'DevSystem 中有 activePageId'),
  step(3, '入口', '判断是否处于 PageDesign live editing 环境', '能解析到 PageDesignEditHost'),
  step(4, '入口', '确认 Host 已自动完成 lifecycle bootstrap', 'nodeTree、dataset、script、style binding 齐全'),
  step(5, '入口', '调用 describeProgress', '确认 phase = editing'),
  step(6, '入口', '识别本次修改的风险级别', '小改、结构改、数据改、跨文件改'),
  step(7, '入口', '明确是否允许新增表和新增组件', '约束 AI 的改动边界'),
  step(8, '入口', '明确是否需要保留现有页面交互', '避免误删已有能力'),
  step(9, '入口', '建立本轮修改日志', '记录后续每个文件的变更原因'),
  step(10, '入口', '确认本轮先不处理表格 UI 细节', '先做数据事实，不先铺 r-table'),
  step(11, '盘点', '读取 pagedata.json 当前模型摘要', '已有表、字段、关系、view、聚合、错误状态可见'),
  step(12, '盘点', '列出所有 DataTable', '表名和业务角色可见'),
  step(13, '盘点', '列出每张表的 columns 和 primaryKey', '字段事实可见'),
  step(14, '盘点', '列出 tableRelations', '现有父子关系可见'),
  step(15, '盘点', '列出 viewDependencies', '显式视图联动可见'),
  step(16, '盘点', '列出每张表的 views', 'default 与业务命名 view 可见'),
  step(17, '盘点', '读取 rule.json 根节点和现有数据绑定', '组件树和绑定列表可见'),
  step(18, '盘点', '收集 rule 中现有 handler 名', '为 script 校验做准备'),
  step(19, '盘点', '读取 script.js', '明确已有 __init__ 和 handle* 函数'),
  step(20, '盘点', '读取 style.css', '明确已有页面 class 和布局规则'),
  step(21, '数据规划', '把用户需求翻译成业务对象', '例如客户、订单、订单明细、状态字典'),
  step(22, '数据规划', '区分主表、子表、引用表、字典表、树节点表', '形成表角色清单'),
  step(23, '数据规划', '确定每个业务对象的稳定表名', '表名大小写与后续 DataViewKey 一致'),
  step(24, '数据规划', '确定每张表的主键字段', '单字段主键优先，多字段交给 _pk 机制'),
  step(25, '数据规划', '规划必要字段和字段类型', '只放业务必要字段，不提前塞 UI 临时状态'),
  step(26, '数据规划', '规划字段 label', '后续表格、表单、详情可复用'),
  step(27, '数据规划', '规划字段必填、范围、正则等校验', '校验沉到 DataColumn'),
  step(28, '数据规划', '规划资源语义', 'resourceType、resourceId、businessCategory 明确'),
  step(29, '数据规划', '判断哪些数据是静态样例', 'resourceType=static-data 才内联 rows'),
  step(30, '数据规划', '判断哪些数据来自远端 API', '后续配置 api.list / CRUD 家族'),
  step(31, '最小表模型', '创建或更新主业务表 columns', '先建最小表结构，不进入表格 UI 设计'),
  step(32, '最小表模型', '创建或更新子表 columns', '子表字段足够支撑关系'),
  step(33, '最小表模型', '创建或更新字典/引用表', '选项不重复塞进主表每一行'),
  step(34, '最小表模型', '给静态表设置基础 rows', '样例数据字段与 columns 对齐'),
  step(35, '最小表模型', '给远端表设置基础 API family', 'list/create/update/delete 按需出现'),
  step(36, '最小表模型', '设置 crudConfig', '超时、提交模式、校验策略明确'),
  step(37, '最小表模型', '避免把 UI 状态写入表结构', '展开态、弹窗态、临时筛选不进 columns'),
  step(38, '最小表模型', '检查表名是否含非法分隔符', '避免破坏 DataViewKey'),
  step(39, '最小表模型', '检查字段名是否稳定', '避免后续 rule/script 频繁跟改'),
  step(40, '最小表模型', '做一次 DataSetCrudTool toJson', '表结构能 canonical 序列化'),
  step(41, '表关系', '先设计 tableRelations', '父表、子表、父字段、子字段明确'),
  step(42, '表关系', '处理多层主从关系', '父子链条能从业务上解释'),
  step(43, '表关系', '处理同一父子表多条关系', '用字段和 relationName 消歧'),
  step(44, '表关系', '校验 parentField 存在', '不出现悬空父字段'),
  step(45, '表关系', '校验 childField 存在', '不出现悬空子字段'),
  step(46, '表关系', '判断是否需要 cascadeUpdate', '只在业务明确要求时设置'),
  step(47, '表关系', '判断是否需要 cascadeDelete', '只在业务明确要求时设置'),
  step(48, '表关系', '暂不急着写 DataView 和 viewDependencies', '先确认后续 UI / 输入界面是否有真实数据消费'),
  step(49, '表关系', '检查是否把数据库外键概念误写进配置', '保持 DataSet 页面数据模型口径'),
  step(50, '表关系', '复核表关系对页面是否有真实价值', '没有消费场景的关系先不建'),
  step(51, '页面规划', '规划页面信息架构', '列表、详情、表单、统计、筛选、弹窗、树等区域'),
  step(52, '页面规划', '规划用户操作路径', '新增、编辑、删除、查看、批量、刷新、导入导出'),
  step(53, '页面规划', '明确首屏优先级', '用户打开页面首先看到什么'),
  step(54, '页面规划', '明确主工作区', '主表列表、树、表单还是看板'),
  step(55, '页面规划', '明确辅助区', '详情、统计、日志、说明、筛选等'),
  step(56, '页面规划', '判断哪些区域需要真实数据容器', '避免为装饰区创建无意义 DataView'),
  step(57, '页面规划', '判断哪些区域只是展示静态文本', '这些区域不需要 DataView'),
  step(58, '页面规划', '判断哪些区域需要交互按钮', '后续 rule action / script handler 有据可依'),
  step(59, '页面规划', '判断是否需要弹窗或抽屉', '只在流程需要时新增组件'),
  step(60, '页面规划', '形成页面区域到数据对象的映射草图', '每个区域消费哪张表、是否共享状态清楚'),
  step(61, '数据利用', '在 UI 区域成形后再为每个区域标注 DataView 消费点', '区域、表名、预期 viewId 草案明确'),
  step(62, '数据利用', '为列表/树区域标注 rows', '容器使用 dataViewKey=Table@view'),
  step(63, '数据利用', '为详情/表单区域标注 currentRow', '来自同一 view 或显式上下文字段'),
  step(64, '数据利用', '为批量操作标注 selectedRows', '多选表格或列表有独立消费点'),
  step(65, '数据利用', '为统计区域标注 aggregateResult', '明确统计依附哪个 DataView'),
  step(66, '数据利用', '为选中统计标注 selectionAggregateResult', '批量选择统计有明确 DataView 来源'),
  step(67, '数据利用', '为字段节点和任意 prop 占位符规划字段消费', 'field 与 $[fieldName] 来自当前 DATA_ROW'),
  step(68, '数据利用', '为选项组件规划 optionDataViewKey', '字典表 view rows 能被复用'),
  step(69, '数据利用', '为按钮和普通组件规划数据作用域', '行内、工具栏、页面级动作区分清楚'),
  step(70, '数据利用', '校验每个数据消费都有真实页面区域', '避免先建没人用的数据出口'),
  step(71, '按需视图', '基于已设计的 UI 消费点判断是否需要独立 DataView', '以运行态隔离为判断标准'),
  step(72, '按需视图', '为主列表命名主消费 view', '例如 mainList，表达页面意图'),
  step(73, '按需视图', '为独立分页创建 view', '与其他区域分页互不干扰'),
  step(74, '按需视图', '为弹窗选择器创建 view', '选择器过滤和主列表互不干扰'),
  step(75, '按需视图', '为独立筛选面板创建 view', '特殊筛选不污染其他视图'),
  step(76, '按需视图', '为树区域配置 view 元数据', 'treeConfig 按需出现'),
  step(77, '按需视图', '为排序需求配置 sortExpression', '只在该 view 需要稳定排序时写'),
  step(78, '按需视图', '为过滤需求配置 filterExpression', '复杂过滤用结构化表达'),
  step(79, '按需视图', '设置 view 的自动加载策略', 'autoLoad 与首屏行为一致'),
  step(80, '按需视图', '设置 view 的首行策略', 'autoCurrentFirst / autoSelectFirst 与页面行为一致'),
  step(81, '视图依赖', '在输入界面和主从交互明确后判断是否需要显式 viewDependencies', '省略会从 tableRelations 自动推导；[] 表示明确禁用'),
  step(82, '视图依赖', '为父子表建依赖', 'parentTable / childTable 与 tableRelations 对齐'),
  step(83, '视图依赖', '判断 dependencyType', 'currentRow、selectedRows、allRows、pagedRows 语义明确'),
  step(84, '视图依赖', '判断子表是否 autoLoad', '只在父状态变化后需要加载时开启'),
  step(85, '视图依赖', '校验依赖对应的表关系存在', '字段绑定由 tableRelations 提供，避免悬空依赖'),
  step(86, '视图依赖', '校验父表和子表的 default view 可用', '当前协议运行时展开到 default view'),
  step(87, '视图依赖', '校验依赖链不会循环', '避免 A 触发 B、B 又触发 A'),
  step(88, '视图依赖', '再次序列化 DataSetCrudTool toJson', 'pagedata.json canonical、可 round-trip'),
  step(89, '结构', '查询组件 payload 列表', '选择组件目录中的合法组件'),
  step(90, '结构', '对目标组件调用 guidePayload', '获取 props schema 和使用规则'),
  step(91, '结构', '写入页面节点树', 'rule.json 区域、组件、数据绑定、field 对齐'),
  step(92, '结构', '为需要脚本访问的组件设置稳定 id', '$components.getApi(id) 有真实目标'),
  step(93, '行为', '对照 rule 中 handlers 生成函数清单', '缺失函数列表明确'),
  step(94, '行为', '补 __init__ 和事件函数', '$dataSet.getView(table, view) 读写 DataView'),
  step(95, '行为', '替换或补全 script.js 全文', '不使用 forbidden $page 伪 API'),
  step(96, '样式', '从 rule 收集 class 并补 style.css', '选择器与 rule class 对齐'),
  step(97, '交叉校验', '校验数据绑定、field、relation、dependency', '表、字段、view、关系全部闭合'),
  step(98, '交叉校验', '校验 handler、component id、class', 'rule/script/style 互相闭合'),
  step(99, '预览修正', '触发 DevPreviewTab 或页面渲染并回补错误', '解析、渲染、自动加载、主从联动正常'),
  step(100, '收尾', '总结修改与剩余风险', '用户知道改了哪些文件、如何验证'),
]

// ── 流程查询入口 ───────────────────────────────────────────

/**
 * 按编号查询单个流程步骤；未命中返回 null，调用方负责决定是否提示 LLM 修正参数。
 */
export function getPageDesignFlowStep(stepNumber: number): PageDesignFlowStep | null {
  return PAGE_DESIGN_100_STEP_FLOW.find((item) => item.step === stepNumber) ?? null
}

/**
 * 按阶段列出流程步骤；phase 为空时返回完整流程，服务层会在默认场景继续裁剪。
 */
export function listPageDesignFlowSteps(phase?: string): readonly PageDesignFlowStep[] {
  if (phase === undefined || phase.trim() === '') return PAGE_DESIGN_100_STEP_FLOW
  return PAGE_DESIGN_100_STEP_FLOW.filter((item) => item.phase === phase)
}

/**
 * 返回阶段边界摘要，供 LLM 先选择查询范围，而不是直接读取 100 步正文。
 */
export function summarizePageDesignFlowPhases(): PageDesignFlowPhaseSummary[] {
  const summaries = new Map<string, PageDesignFlowPhaseSummary>()
  for (const item of PAGE_DESIGN_100_STEP_FLOW) {
    const existing = summaries.get(item.phase)
    if (existing === undefined) {
      summaries.set(item.phase, {
        phase: item.phase,
        firstStep: item.step,
        lastStep: item.step,
        stepCount: 1,
      })
    } else {
      existing.lastStep = item.step
      existing.stepCount += 1
    }
  }
  return [...summaries.values()]
}

/**
 * 按已完成步骤返回下一步；流程外编号返回 null。
 */
export function getNextPageDesignFlowStep(completedStep: number): PageDesignFlowStep | null {
  return getPageDesignFlowStep(completedStep + 1)
}

// ── intent 任务知识匹配 ────────────────────────────────────

/**
 * 根据用户原始意图匹配任务知识。
 *
 * guide 是“申请类表单”这样的模式知识，不是具体页面验收；具体业务断言仍属于 smoke/test。
 */
export function matchPageDesignTaskGuides(intent?: string): readonly PageDesignTaskGuide[] {
  const text = intent?.trim().toLowerCase() ?? ''
  if (text.length === 0) return []
  const guides: PageDesignTaskGuide[] = [GENERAL_PAGE_DESIGN_PROTOCOL_GUIDE]
  if (/(请假|休假|leave|申请|application|表单|form)/iu.test(text)) {
    guides.push(APPLICATION_FORM_TASK_GUIDE)
  }
  return guides
}

// PAGE_DESIGN_REFACTOR_SOURCE[task-knowledge-catalog]: intent 命中的任务知识放在这里；不要复制到 system prompt、smoke 脚本或通讯层。
const GENERAL_PAGE_DESIGN_PROTOCOL_GUIDE: PageDesignTaskGuide = {
  id: 'page-design-tool-protocol',
  title: '通用页面设计知识获取协议：缺什么查什么',
  when: '所有 pageDesign 页面设计任务。该 guide 只描述获取知识的方法，不预置具体业务字段或组件答案。',
  relevantSteps: [11, 12, 13, 16, 17, 18, 19, 20, 61, 65, 71, 78, 89, 90, 91, 93, 96, 97, 98],
  dataPlanning: [
    '不知道某个 kind 有哪些函数时，先 module_query({ kind, includeFunctions:true }) 看函数目录，再 module_function_guide({ kind, functionName }) 看参数和失败恢复。',
    '不知道当前页面事实时，先查只读函数：dataset / node-tree / text-model 的真实只读函数名必须从 module_query 或 module_function_guide 获取。',
    'FUNCTION_NOT_DECLARED 说明你猜了不存在的函数；下一步必须回到 module_query/module_function_guide，而不是换另一个猜测名。',
    'ACTION_ERROR 或 SCHEMA_VALIDATION_FAILED 后，读取 code/msg/fix/checks，再对同一 kind/functionName 调 module_function_guide 对照 paramsSchema 后重试。',
  ],
  dataViewPlanning: [
    '不知道 view、filterExpression、aggregates、DataViewKey 怎么写时，不要从记忆生成；对 dataset.createView/updateView/addAggregate/listAggregates 调 module_function_guide。',
    '不知道已有 view 或 aggregate 是否存在时，先调用对应只读函数；不要把 create* 当成幂等 upsert。',
    '不知道 UI 怎么绑定 DataView 成员时，查 node-tree/payload-catalog 指南以及 dataset 相关函数指南。',
  ],
  payloadPlanning: [
    '不知道组件 type 或可用组件时，先调用 payload-catalog.queryPayloads。',
    '不知道组件 props、toolbar/filter/actions 等结构时，必须调用 payload-catalog.guidePayload({ key:type })；node-tree 校验失败后仍回到对应 guidePayload。',
    '不知道 node-tree 写入函数签名时，先 module_function_guide({ kind:"node-tree", functionName })。',
  ],
  functionCallPlan: [
    'FC: 缺函数目录 -> module_query。',
    'FC: 缺函数参数/失败恢复 -> module_function_guide。',
    'FC: 缺组件目录 -> payload-catalog.queryPayloads。',
    'FC: 缺组件 props -> payload-catalog.guidePayload。',
    'FC: 缺当前页面状态 -> 调对应 kind 的只读函数，函数名从目录/指南获取。',
  ],
  validation: [
    '遇到未知函数、未知参数、未知组件、未知状态时，下一步应该是查询知识，不是继续猜。',
    '每次写入前应能说出知识来源：module_query、module_function_guide、payload-catalog 或只读状态函数。',
    '失败恢复应基于工具回执的 code/msg/fix/checks 和对应指南。',
  ],
}

// 该 guide 只表达申请类表单的通用闭环，不能替代某个业务页面的测试验收。
const APPLICATION_FORM_TASK_GUIDE: PageDesignTaskGuide = {
  id: 'application-form-create-submit-list',
  title: '申请类表单页：草稿填写 -> 提交 -> 待处理列表',
  when: '用户要求实现申请、请假、报销、审批提交类页面，且没有明确给出真实后端接口。',
  relevantSteps: [21, 22, 23, 25, 28, 31, 33, 34, 61, 63, 65, 68, 69, 71, 78, 89, 90, 91, 97],
  dataPlanning: [
    '先规划主业务表和引用/字典表；表名和字段名稳定后再写 UI。',
    '没有真实后端接口时主业务表使用 resourceType=page-data，不臆造 api/crudConfig。',
    '主表字段至少覆盖 id、applicantName 或 applicant、申请类型、startDate、endDate、days、reason、status。',
    'default 视图表示可编辑草稿 currentRow，需要一条本地草稿行，例如 id=0、status=draft、days=1。',
    'pending/approval 视图表示提交后的待处理列表，status=pending，rows 初始可为空，并配置 count 聚合用于统计。',
    '类型/字典表使用 resourceType=static-data，default.rows 提供可选项。',
  ],
  dataViewPlanning: [
    '表单容器绑定主表 default 视图，contextDataMember=currentRow。',
    '待处理列表绑定主表 pending/approval 视图的 rows。',
    '统计区从 pending/approval 视图 aggregateResult 读取 count 结果。',
    '选择组件从类型/字典表 default 视图读取 rows，或提供静态 options。',
  ],
  payloadPlanning: [
    '常用组件 type 可先按关键词 queryPayloads 确认；申请表单常见目录组件为 r-section、r-form、r-text、r-select、r-date、r-number、r-textarea、r-button、r-table 或可替代列表组件。',
    '写每个目录组件 type 前先调用 payload-catalog.guidePayload({key:type})。',
    '按钮参数以 r-button guidePayload 返回的 props/schema 为准，尤其是 dataViewKey、appendPayload、inheritFields、then。',
  ],
  functionCallPlan: [
    'FC: dataset.createTable 创建主业务表，含 default 草稿视图和 pending/approval 视图。',
    'FC: dataset.createTable 创建类型/字典表。',
    'FC: payload-catalog.guidePayload 覆盖将写入 rule.json 的目录组件 type。',
    'FC: node-tree 删除默认占位节点后 addNodes 写统计区、表单区、待处理列表区。',
    '提交按钮放在 r-form 子树内，使用 action=append-row，dataViewKey 指向 pending/approval 视图，inheritFields 复制表单字段，appendPayload.status=pending；禁止用 submit-current-form 作为新申请提交动作。',
    '如果需要提交后清空表单，用 then: { action: "patch-current", dataViewKey: "主表@default", patch: {...draft defaults...}, silent: true }。',
  ],
  validation: [
    '主表 default 视图有草稿 currentRow。',
    '表单字段 field 与主表 columns 对齐。',
    '提交按钮不是仅 submit-current-form；append-row 目标必须是待处理视图。',
    '待处理列表与统计读取同一个 pending/approval 视图。',
    'rule.json 中目录组件 type 都能在会话历史看到显式 guidePayload。',
  ],
}
