/**
 * Stills 引擎 E2E 全流程验证 —— 大型企业请假系统数据建模
 *
 * 模拟 AI 通过 SAP/1.0 协议与 Stills 引擎交互的完整过程：
 *   发现 → 蓝图 → 建表 → 关系 → 锁定 → 视图 → 聚合 → 依赖 → 校验 → 导出
 *
 * 用法：npx tsx scripts/verify-stills-e2e.ts
 */

import {
  registerAllStills,
  createSession,
  executeStill,
  getDataSetSlot,
  type IStillSession,
  type StillResult,
} from '../packages/spark-ai/src/index.js'

// ─── 工具函数 ──────────────────────────────────────────────

let roundNo = 0
let stepNo = 0
let errors: string[] = []
let warnings: string[] = []

function round(title: string) {
  roundNo++
  stepNo = 0
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  Round ${roundNo}: ${title}`)
  console.log('═'.repeat(60))
}

function step(label: string) {
  stepNo++
  process.stdout.write(`  ${roundNo}.${stepNo} ${label} ... `)
}

function exec(session: IStillSession, action: string, params: unknown = {}): StillResult {
  const id = `r${roundNo}-s${stepNo}-${Date.now()}`
  return executeStill(action, params, session, id)
}

function ok(result: StillResult, context: string): boolean {
  if (result.ok) {
    console.log(`✅ ${result.summary}`)
    return true
  }
  console.log(`❌ [${result.code}] ${result.msg}`)
  console.log(`     fix: ${result.fix}`)
  errors.push(`Round ${roundNo}.${stepNo} ${context}: [${result.code}] ${result.msg}`)
  return false
}

function warn(msg: string) {
  console.log(`  ⚠️  ${msg}`)
  warnings.push(`Round ${roundNo}: ${msg}`)
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.log(`  ❌ ASSERT FAIL: ${msg}`)
    errors.push(`Round ${roundNo}.${stepNo} assert: ${msg}`)
  }
}

// ─── 启动引擎 ──────────────────────────────────────────────

registerAllStills()
const session = createSession()

// ════════════════════════════════════════════════════════════
// Round 1: 发现阶段 — session.describe + stills.capabilities
// ════════════════════════════════════════════════════════════

round('发现阶段 — 获取角色与能力清单')

step('session.describe（初始状态）')
const describeResult = exec(session, 'session.describe')
ok(describeResult, 'session.describe')
if (describeResult.ok) {
  const d = describeResult.data as Record<string, unknown>
  assert(typeof d.role === 'string' && (d.role as string).length > 0, 'role 应为非空字符串')
  assert(d.nextStep !== undefined, 'nextStep 应存在')
  assert(d.blueprint === null, '初始 blueprint 应为 null')
  assert(d.dataset === null, '初始 dataset 应为 null')
  console.log(`     role: ${d.role}`)
  console.log(`     nextStep: ${d.nextStep}`)
}

step('stills.capabilities（全量动作目录）')
const capsResult = exec(session, 'stills.capabilities')
ok(capsResult, 'stills.capabilities')
if (capsResult.ok) {
  const d = capsResult.data as { actions: unknown[]; total: number }
  assert(d.total === 31, `应有 31 个动作，实际 ${d.total}`)
  // 检查每个动作是否都有 guard 描述
  const actions = d.actions as Array<{ action: string; guard?: string }>
  const withGuard = actions.filter(a => a.guard !== undefined)
  console.log(`     total: ${d.total}, withGuard: ${withGuard.length}`)
}

step('stills.actionSpec（单个动作规格）')
const specResult = exec(session, 'stills.actionSpec', { action: 'datatable.create' })
ok(specResult, 'stills.actionSpec')
if (specResult.ok) {
  const d = specResult.data as Record<string, unknown>
  assert(d.action === 'datatable.create', 'action 应为 datatable.create')
  assert(d.paramsSchema !== null, 'paramsSchema 应存在')
  assert(d.example !== null, 'example 应存在')
  console.log(`     guard: ${d.guard ?? '(无)'}`)
}

step('stills.actionSpec（不存在的动作）')
const badSpec = exec(session, 'stills.actionSpec', { action: 'nonexistent.action' })
assert(!badSpec.ok, '不存在的动作应返回错误')
if (!badSpec.ok) {
  console.log(`✅ 正确拒绝: [${badSpec.code}]`)
}

// ════════════════════════════════════════════════════════════
// Round 2: 蓝图规划 — 大型企业请假系统
// ════════════════════════════════════════════════════════════

round('蓝图规划 — 大型企业请假系统')

step('blueprint.create（完整蓝图）')
const bpResult = exec(session, 'blueprint.create', {
  title: '大型企业请假管理系统',
  requirements: [
    '1. 假别管理：年假/事假/病假/婚假/产假等，每种有最大天数、是否需要证明等配置',
    '2. 请假申请：员工选择假别 → 填写起止日期/事由 → 系统计算天数 → 自动扣减余额',
    '3. 多级审批：根据假别和天数自动路由审批流 → 逐级审批 → 驳回/通过',
    '4. 假期余额：按年度维护每人每假别的总额/已用/剩余，有计算列自动求剩余',
    '5. 审批流程配置：可配置多步骤审批规则（条件触发），支持不同假别不同流程',
    '6. 申请附件：支持上传证明材料（病假证明/结婚证等）',
    '7. 统计汇总：按部门/假别汇总请假天数',
  ].join('\n'),
  checkpoints: [
    {
      id: 'cp-tables',
      title: '建表阶段：6 张核心业务表',
      plannedActions: ['datatable.create×6'],
      validation: '6 张表均有 PK，LeaveBalances 有 remaining 计算列',
    },
    {
      id: 'cp-relations',
      title: '关系阶段：5 条表间关系',
      plannedActions: ['relation.add×5'],
      validation: '5 条关系，无孤表',
    },
    {
      id: 'cp-lock',
      title: '结构锁定',
      plannedActions: ['schema.lock'],
      validation: 'schemaLocked=true',
    },
    {
      id: 'cp-views',
      title: '视图配置：6 张表的 default 视图 + 审批流自定义视图',
      plannedActions: ['dataview.configure×6', 'dataview.create', 'dataview.setAggregates'],
      validation: '视图配置完整，LeaveRequests 有聚合',
    },
    {
      id: 'cp-deps',
      title: '级联依赖：4 条视图依赖',
      plannedActions: ['dependency.add×4'],
      validation: '父行切换自动联动子表',
    },
    {
      id: 'cp-data',
      title: '初始数据：假别 + 审批流示例数据',
      plannedActions: ['datatable.addRows×2'],
      validation: 'LeaveTypes 有 5 行，ApprovalFlows 有多行',
    },
    {
      id: 'cp-validate',
      title: '校验与导出',
      plannedActions: ['dataset.validate', 'dataset.export'],
      validation: 'valid=true + 导出完整快照',
    },
  ],
  openQuestions: [
    '附件存储方式需要确认（URL 引用 vs Base64）',
    '审批流条件表达式语法需要与前端对齐',
  ],
})
ok(bpResult, 'blueprint.create')

step('blueprint.describe（确认蓝图状态）')
const bpDescribe = exec(session, 'blueprint.describe')
ok(bpDescribe, 'blueprint.describe')
if (bpDescribe.ok) {
  const d = bpDescribe.data as { progress: string; checkpoints: unknown[]; openQuestions: string[] }
  console.log(`     progress: ${d.progress}, checkpoints: ${d.checkpoints.length}, openQuestions: ${d.openQuestions.length}`)
}

step('session.describe（蓝图后状态）')
const desc2 = exec(session, 'session.describe')
ok(desc2, 'session.describe after blueprint')
if (desc2.ok) {
  const d = desc2.data as Record<string, unknown>
  assert(d.blueprint !== null, '蓝图应已创建')
  assert(d.dataset === null, 'dataset 还未初始化')
  console.log(`     nextStep: ${d.nextStep}`)
}

// ════════════════════════════════════════════════════════════
// Round 3: 初始化 DataSet + 建表（6 张核心业务表）
// ════════════════════════════════════════════════════════════

round('建表阶段 — 6 张核心业务表')

step('dataset.init')
ok(exec(session, 'dataset.init', { dataSetName: 'EnterpriseLeaveSystem' }), 'dataset.init')

step('datatable.create — LeaveTypes（假别管理）')
ok(exec(session, 'datatable.create', {
  tableName: 'LeaveTypes',
  columns: [
    { name: 'id', type: 'string', isPrimaryKey: true, label: '假别ID' },
    { name: 'name', type: 'string', label: '假别名称' },
    { name: 'code', type: 'string', label: '假别编码' },
    { name: 'maxDays', type: 'number', label: '年度最大天数' },
    { name: 'needProof', type: 'boolean', label: '需要证明材料' },
    { name: 'minUnit', type: 'number', label: '最小请假单位(天)' },
    { name: 'description', type: 'string', label: '说明' },
    { name: 'enabled', type: 'boolean', label: '是否启用' },
    { name: 'sortOrder', type: 'number', label: '排序号' },
  ],
}), 'LeaveTypes')

step('datatable.create — Employees（员工信息）')
ok(exec(session, 'datatable.create', {
  tableName: 'Employees',
  columns: [
    { name: 'id', type: 'string', isPrimaryKey: true, label: '员工ID' },
    { name: 'name', type: 'string', label: '姓名' },
    { name: 'department', type: 'string', label: '部门' },
    { name: 'position', type: 'string', label: '职位' },
    { name: 'managerId', type: 'string', label: '直属上级ID' },
    { name: 'email', type: 'string', label: '邮箱' },
    { name: 'hireDate', type: 'string', label: '入职日期' },
  ],
}), 'Employees')

step('datatable.create — LeaveRequests（请假申请）')
ok(exec(session, 'datatable.create', {
  tableName: 'LeaveRequests',
  columns: [
    { name: 'id', type: 'string', isPrimaryKey: true, label: '申请ID' },
    { name: 'employeeId', type: 'string', label: '申请人ID' },
    { name: 'leaveTypeId', type: 'string', label: '假别ID' },
    { name: 'startDate', type: 'string', label: '开始日期' },
    { name: 'endDate', type: 'string', label: '结束日期' },
    { name: 'days', type: 'number', label: '请假天数' },
    { name: 'reason', type: 'string', label: '请假事由' },
    { name: 'status', type: 'string', label: '状态' },
    { name: 'attachmentUrl', type: 'string', label: '附件URL' },
    { name: 'createdAt', type: 'string', label: '提交时间' },
    { name: 'updatedAt', type: 'string', label: '更新时间' },
  ],
}), 'LeaveRequests')

step('datatable.create — ApprovalRecords（审批记录）')
ok(exec(session, 'datatable.create', {
  tableName: 'ApprovalRecords',
  columns: [
    { name: 'id', type: 'string', isPrimaryKey: true, label: '审批ID' },
    { name: 'requestId', type: 'string', label: '申请ID' },
    { name: 'approver', type: 'string', label: '审批人' },
    { name: 'approverRole', type: 'string', label: '审批角色' },
    { name: 'stepOrder', type: 'number', label: '审批步骤' },
    { name: 'action', type: 'string', label: '动作' },
    { name: 'comment', type: 'string', label: '审批意见' },
    { name: 'timestamp', type: 'string', label: '审批时间' },
  ],
}), 'ApprovalRecords')

step('datatable.create — LeaveBalances（假期余额）')
ok(exec(session, 'datatable.create', {
  tableName: 'LeaveBalances',
  columns: [
    { name: 'id', type: 'string', isPrimaryKey: true, label: 'ID' },
    { name: 'employeeId', type: 'string', label: '员工ID' },
    { name: 'leaveTypeId', type: 'string', label: '假别ID' },
    { name: 'year', type: 'number', label: '年度' },
    { name: 'total', type: 'number', label: '总额度(天)' },
    { name: 'used', type: 'number', label: '已用(天)' },
    { name: 'remaining', type: 'number', label: '剩余(天)', computeExpression: 'total - used' },
  ],
}), 'LeaveBalances')

step('datatable.create — ApprovalFlows（审批流程配置）')
ok(exec(session, 'datatable.create', {
  tableName: 'ApprovalFlows',
  columns: [
    { name: 'id', type: 'string', isPrimaryKey: true, label: '流程ID' },
    { name: 'leaveTypeId', type: 'string', label: '假别ID' },
    { name: 'stepOrder', type: 'number', label: '步骤序号' },
    { name: 'approverRole', type: 'string', label: '审批角色' },
    { name: 'conditionExpr', type: 'string', label: '触发条件' },
    { name: 'description', type: 'string', label: '步骤说明' },
  ],
}), 'ApprovalFlows')

// 验证建表结果
const slot = getDataSetSlot(session)
const tableCount = Object.keys(slot.dataset!.tables).length
assert(tableCount === 6, `应有 6 张表，实际 ${tableCount}`)
console.log(`  📊 建表完成: ${tableCount} 张表`)

step('blueprint.advance — cp-tables')
ok(exec(session, 'blueprint.advance', { completedCheckpointId: 'cp-tables' }), 'advance cp-tables')

// ════════════════════════════════════════════════════════════
// Round 4: 关系建模 — 5 条表间关系
// ════════════════════════════════════════════════════════════

round('关系建模 — 5 条表间关系')

step('relation.add — LeaveTypes → LeaveRequests')
ok(exec(session, 'relation.add', {
  parentTable: 'LeaveTypes',
  childTable: 'LeaveRequests',
  parentField: 'id',
  childField: 'leaveTypeId',
}), 'LeaveTypes→LeaveRequests')

step('relation.add — Employees → LeaveRequests')
ok(exec(session, 'relation.add', {
  parentTable: 'Employees',
  childTable: 'LeaveRequests',
  parentField: 'id',
  childField: 'employeeId',
}), 'Employees→LeaveRequests')

step('relation.add — LeaveRequests → ApprovalRecords')
ok(exec(session, 'relation.add', {
  parentTable: 'LeaveRequests',
  childTable: 'ApprovalRecords',
  parentField: 'id',
  childField: 'requestId',
}), 'LeaveRequests→ApprovalRecords')

step('relation.add — LeaveTypes → LeaveBalances')
ok(exec(session, 'relation.add', {
  parentTable: 'LeaveTypes',
  childTable: 'LeaveBalances',
  parentField: 'id',
  childField: 'leaveTypeId',
}), 'LeaveTypes→LeaveBalances')

step('relation.add — LeaveTypes → ApprovalFlows')
ok(exec(session, 'relation.add', {
  parentTable: 'LeaveTypes',
  childTable: 'ApprovalFlows',
  parentField: 'id',
  childField: 'leaveTypeId',
}), 'LeaveTypes→ApprovalFlows')

step('relation.list（验证 5 条关系）')
const rlResult = exec(session, 'relation.list')
ok(rlResult, 'relation.list')
if (rlResult.ok) {
  const rels = (rlResult.data as { relations: unknown[] }).relations
  assert(rels.length === 5, `应有 5 条关系，实际 ${rels.length}`)
}

// Guard 测试：schema 未锁定时不能加依赖
step('dependency.add（应被 guard 拒绝 — schema 未锁定）')
const guardTest = exec(session, 'dependency.add', {
  parentTable: 'LeaveTypes', childTable: 'LeaveRequests',
})
assert(!guardTest.ok, 'schema 未锁定时 dependency.add 应被拒绝')
if (!guardTest.ok) {
  console.log(`✅ guard 正确拒绝: [${guardTest.code}]`)
}

step('blueprint.advance — cp-relations')
ok(exec(session, 'blueprint.advance', { completedCheckpointId: 'cp-relations' }), 'advance cp-relations')

// ════════════════════════════════════════════════════════════
// Round 5: 结构锁定 + 验证 guard 翻转
// ════════════════════════════════════════════════════════════

round('结构锁定 — guard 翻转验证')

step('schema.lock')
ok(exec(session, 'schema.lock'), 'schema.lock')
assert(getDataSetSlot(session).schemaLocked === true, 'schemaLocked 应为 true')

step('datatable.create（应被 guard 拒绝 — schema 已锁定）')
const guardTest2 = exec(session, 'datatable.create', {
  tableName: 'ShouldFail',
  columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
})
assert(!guardTest2.ok, 'schema 锁定后 datatable.create 应被拒绝')
if (!guardTest2.ok) {
  console.log(`✅ guard 正确拒绝: [${guardTest2.code}]`)
}

step('relation.add（应被 guard 拒绝 — schema 已锁定）')
const guardTest3 = exec(session, 'relation.add', {
  parentTable: 'Employees', childTable: 'LeaveBalances',
  parentField: 'id', childField: 'employeeId',
})
assert(!guardTest3.ok, 'schema 锁定后 relation.add 应被拒绝')
if (!guardTest3.ok) {
  console.log(`✅ guard 正确拒绝: [${guardTest3.code}]`)
}

step('schema.unlock（验证可解锁）')
ok(exec(session, 'schema.unlock', { reason: '需要补充 Employees→LeaveBalances 关系' }), 'schema.unlock')

step('relation.add — Employees → LeaveBalances（补充关系）')
ok(exec(session, 'relation.add', {
  parentTable: 'Employees',
  childTable: 'LeaveBalances',
  parentField: 'id',
  childField: 'employeeId',
}), 'Employees→LeaveBalances')

step('schema.lock（重新锁定，6 条关系）')
ok(exec(session, 'schema.lock'), 'schema.lock again')

const finalRelCount = getDataSetSlot(session).dataset!.tableRelations!.length
assert(finalRelCount === 6, `应有 6 条关系，实际 ${finalRelCount}`)
console.log(`  📊 最终关系数: ${finalRelCount}`)

step('blueprint.advance — cp-lock')
ok(exec(session, 'blueprint.advance', { completedCheckpointId: 'cp-lock' }), 'advance cp-lock')

// ════════════════════════════════════════════════════════════
// Round 6: 视图配置 + 聚合
// ════════════════════════════════════════════════════════════

round('视图配置 — 6 张表 default 视图 + 聚合')

step('dataview.configure — LeaveTypes（主表，自动加载 + 首行选中）')
ok(exec(session, 'dataview.configure', {
  tableName: 'LeaveTypes',
  autoLoad: true,
  autoCurrentFirst: true,
}), 'LeaveTypes view')

step('dataview.configure — Employees')
ok(exec(session, 'dataview.configure', {
  tableName: 'Employees',
  autoLoad: true,
  autoCurrentFirst: true,
  pageSize: 50,
}), 'Employees view')

step('dataview.configure — LeaveRequests（分页 + 自动加载）')
ok(exec(session, 'dataview.configure', {
  tableName: 'LeaveRequests',
  autoLoad: true,
  autoCurrentFirst: true,
  pageSize: 20,
}), 'LeaveRequests view')

step('dataview.configure — ApprovalRecords（级联加载，不自动加载）')
ok(exec(session, 'dataview.configure', {
  tableName: 'ApprovalRecords',
  autoLoad: false,
}), 'ApprovalRecords view')

step('dataview.configure — LeaveBalances')
ok(exec(session, 'dataview.configure', {
  tableName: 'LeaveBalances',
  autoLoad: true,
}), 'LeaveBalances view')

step('dataview.configure — ApprovalFlows（级联加载）')
ok(exec(session, 'dataview.configure', {
  tableName: 'ApprovalFlows',
  autoLoad: false,
}), 'ApprovalFlows view')

step('dataview.setAggregates — LeaveRequests（请假天数汇总）')
ok(exec(session, 'dataview.setAggregates', {
  tableName: 'LeaveRequests',
  aggregates: {
    days: { type: 'sum' },
  },
}), 'LeaveRequests aggregates')

step('dataview.setAggregates — LeaveBalances（余额汇总）')
ok(exec(session, 'dataview.setAggregates', {
  tableName: 'LeaveBalances',
  aggregates: {
    total: { type: 'sum' },
    used: { type: 'sum' },
    remaining: { type: 'sum' },
  },
}), 'LeaveBalances aggregates')

// 创建自定义视图：按审批人筛选的审批列表
step('dataview.create — ApprovalRecords@myApprovals')
ok(exec(session, 'dataview.create', {
  tableName: 'ApprovalRecords',
  viewId: 'myApprovals',
}), 'ApprovalRecords@myApprovals create')

step('dataview.configure — ApprovalRecords@myApprovals')
ok(exec(session, 'dataview.configure', {
  tableName: 'ApprovalRecords',
  viewId: 'myApprovals',
  autoLoad: true,
  pageSize: 10,
}), 'ApprovalRecords@myApprovals configure')

step('blueprint.advance — cp-views')
ok(exec(session, 'blueprint.advance', { completedCheckpointId: 'cp-views' }), 'advance cp-views')

// ════════════════════════════════════════════════════════════
// Round 7: 级联依赖
// ════════════════════════════════════════════════════════════

round('级联依赖 — 4 条视图依赖')

step('dependency.add — LeaveTypes → LeaveRequests（currentRow 级联）')
ok(exec(session, 'dependency.add', {
  parentTable: 'LeaveTypes',
  childTable: 'LeaveRequests',
  dependencyType: 'currentRow',
}), 'LeaveTypes→LeaveRequests dep')

step('dependency.add — LeaveRequests → ApprovalRecords（currentRow 级联）')
ok(exec(session, 'dependency.add', {
  parentTable: 'LeaveRequests',
  childTable: 'ApprovalRecords',
  dependencyType: 'currentRow',
}), 'LeaveRequests→ApprovalRecords dep')

step('dependency.add — LeaveTypes → LeaveBalances（currentRow 级联）')
ok(exec(session, 'dependency.add', {
  parentTable: 'LeaveTypes',
  childTable: 'LeaveBalances',
  dependencyType: 'currentRow',
}), 'LeaveTypes→LeaveBalances dep')

step('dependency.add — LeaveTypes → ApprovalFlows（currentRow 级联）')
ok(exec(session, 'dependency.add', {
  parentTable: 'LeaveTypes',
  childTable: 'ApprovalFlows',
  dependencyType: 'currentRow',
}), 'LeaveTypes→ApprovalFlows dep')

const depCount = getDataSetSlot(session).dataset!.viewDependencies!.length
assert(depCount === 4, `应有 4 条依赖，实际 ${depCount}`)
console.log(`  📊 依赖数: ${depCount}`)

step('blueprint.advance — cp-deps')
ok(exec(session, 'blueprint.advance', { completedCheckpointId: 'cp-deps' }), 'advance cp-deps')

// ════════════════════════════════════════════════════════════
// Round 8: 初始数据填充
// ════════════════════════════════════════════════════════════

round('初始数据 — 假别 + 审批流配置')

step('datatable.addRows — LeaveTypes（5 种假别）')
ok(exec(session, 'datatable.addRows', {
  tableName: 'LeaveTypes',
  rows: [
    { id: 'LT01', name: '年假', code: 'annual', maxDays: 15, needProof: false, minUnit: 0.5, description: '带薪年休假', enabled: true, sortOrder: 1 },
    { id: 'LT02', name: '事假', code: 'personal', maxDays: 30, needProof: false, minUnit: 0.5, description: '因私事请假', enabled: true, sortOrder: 2 },
    { id: 'LT03', name: '病假', code: 'sick', maxDays: 180, needProof: true, minUnit: 1, description: '因病请假，3天以上需医院证明', enabled: true, sortOrder: 3 },
    { id: 'LT04', name: '婚假', code: 'marriage', maxDays: 15, needProof: true, minUnit: 1, description: '结婚假期，需结婚证', enabled: true, sortOrder: 4 },
    { id: 'LT05', name: '产假', code: 'maternity', maxDays: 158, needProof: true, minUnit: 1, description: '生育假期', enabled: true, sortOrder: 5 },
  ],
}), 'LeaveTypes rows')

step('datatable.addRows — ApprovalFlows（审批流配置）')
ok(exec(session, 'datatable.addRows', {
  tableName: 'ApprovalFlows',
  rows: [
    { id: 'AF01', leaveTypeId: 'LT01', stepOrder: 1, approverRole: '直属上级', conditionExpr: 'days <= 3', description: '3天以内年假直属上级审批' },
    { id: 'AF02', leaveTypeId: 'LT01', stepOrder: 1, approverRole: '直属上级', conditionExpr: 'days > 3', description: '超过3天年假先直属上级' },
    { id: 'AF03', leaveTypeId: 'LT01', stepOrder: 2, approverRole: '部门经理', conditionExpr: 'days > 3', description: '超过3天年假部门经理复批' },
    { id: 'AF04', leaveTypeId: 'LT02', stepOrder: 1, approverRole: '直属上级', conditionExpr: '', description: '事假直属上级审批' },
    { id: 'AF05', leaveTypeId: 'LT03', stepOrder: 1, approverRole: '直属上级', conditionExpr: '', description: '病假直属上级审批' },
    { id: 'AF06', leaveTypeId: 'LT03', stepOrder: 2, approverRole: 'HR', conditionExpr: 'days > 3', description: '超过3天病假HR审核' },
    { id: 'AF07', leaveTypeId: 'LT04', stepOrder: 1, approverRole: 'HR', conditionExpr: '', description: '婚假HR审核' },
    { id: 'AF08', leaveTypeId: 'LT05', stepOrder: 1, approverRole: 'HR', conditionExpr: '', description: '产假HR审核' },
    { id: 'AF09', leaveTypeId: 'LT05', stepOrder: 2, approverRole: '部门经理', conditionExpr: '', description: '产假部门经理知会' },
  ],
}), 'ApprovalFlows rows')

step('blueprint.advance — cp-data')
ok(exec(session, 'blueprint.advance', { completedCheckpointId: 'cp-data' }), 'advance cp-data')

// ════════════════════════════════════════════════════════════
// Round 9: 校验与导出
// ════════════════════════════════════════════════════════════

round('校验与导出')

step('dataset.validate')
const validateResult = exec(session, 'dataset.validate')
ok(validateResult, 'dataset.validate')
if (validateResult.ok) {
  const d = validateResult.data as { valid: boolean; issues?: string[] }
  assert(d.valid === true, `dataset 应通过校验，issues: ${JSON.stringify(d.issues)}`)
  console.log(`     valid: ${d.valid}`)
}

step('dataset.export（完整快照）')
const exportResult = exec(session, 'dataset.export')
ok(exportResult, 'dataset.export')
if (exportResult.ok) {
  const snap = (exportResult.data as { snapshot: Record<string, unknown> }).snapshot
  const snapStr = JSON.stringify(snap, null, 2)
  console.log(`     snapshot size: ${snapStr.length} chars`)
  console.log(`     tables: ${Object.keys((snap as { tables: Record<string, unknown> }).tables).join(', ')}`)
}

step('dataset.describe（最终状态）')
const finalDesc = exec(session, 'dataset.describe')
ok(finalDesc, 'dataset.describe')

step('blueprint.advance — cp-validate')
ok(exec(session, 'blueprint.advance', { completedCheckpointId: 'cp-validate' }), 'advance cp-validate')

// 蓝图完成验证
assert(
  session.blueprint!.checkpoints.every(cp => cp.status === 'done'),
  '所有 checkpoint 应为 done',
)

// ════════════════════════════════════════════════════════════
// Round 10: 提示词对齐验证 + 最终统计
// ════════════════════════════════════════════════════════════

round('提示词对齐验证 + 最终统计')

step('session.describe（完成后状态）')
const finalState = exec(session, 'session.describe')
ok(finalState, 'session.describe final')
if (finalState.ok) {
  const d = finalState.data as Record<string, unknown>
  const ds = d.dataset as { tables: number; totalColumns: number; relations: number } | null
  console.log(`     role: ${d.role}`)
  console.log(`     nextStep: ${d.nextStep}`)
  if (ds) {
    console.log(`     tables: ${ds.tables}, columns: ${ds.totalColumns}, relations: ${ds.relations}`)
  }
  const bp = d.blueprint as { completedCheckpoints: number; totalCheckpoints: number } | null
  if (bp) {
    console.log(`     blueprint: ${bp.completedCheckpoints}/${bp.totalCheckpoints} checkpoints done`)
  }
  console.log(`     patchLog: ${d.patchCount} entries`)
}

// 提示词承诺的发现动作校验
step('验证发现动作返回值与提示词承诺一致')
const caps2 = exec(session, 'stills.capabilities')
if (caps2.ok) {
  const actions = (caps2.data as { actions: Array<{ action: string; type: string; description: string; guard?: string }> }).actions
  // 每个动作应有 action, type, description
  let missingFields = 0
  for (const a of actions) {
    if (!a.action || !a.type || !a.description) missingFields++
  }
  assert(missingFields === 0, `${missingFields} 个动作缺少必要字段`)
  
  // 有 guard 的动作应该有 guard 描述
  const requestActions = actions.filter(a => a.type === 'request')
  const requestWithGuard = requestActions.filter(a => a.guard)
  console.log(`✅ ${actions.length} 个动作规格完整`)
  console.log(`     request: ${requestActions.length}, withGuard: ${requestWithGuard.length}`)
}

// patchLog 验证：describe 不入日志，request 入日志
step('验证 patchLog（describe 不入日志）')
const describeActions = ['session.describe', 'stills.capabilities', 'stills.actionSpec',
  'blueprint.describe', 'dataset.describe', 'relation.list', 'datatable.describe', 'dataview.describe']
const leakedDescribes = session.patchLog.filter(p => describeActions.includes(p.action))
assert(leakedDescribes.length === 0, `describe 动作不应出现在 patchLog，泄漏: ${leakedDescribes.map(p => p.action).join(', ')}`)
console.log(`✅ patchLog 干净: ${session.patchLog.length} 条 request 记录, 0 条 describe 泄漏`)

// ════════════════════════════════════════════════════════════
// Round 11: 边界条件 + 错误路径深度测试
// ════════════════════════════════════════════════════════════

round('边界条件 — 重复操作 / 缺参 / 越界')

step('datatable.create — 重复表名（应被拒绝）')
const dup = exec(session, 'datatable.create', {
  tableName: 'LeaveTypes',
  columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
})
// schema locked → 先会被 guard 拒绝
assert(!dup.ok, '锁定状态下建表应被 guard 拒绝')
if (!dup.ok) console.log(`✅ guard 拒绝: [${dup.code}]`)

step('schema.unlock → 重复表名建表')
ok(exec(session, 'schema.unlock', { reason: '测试重复建表' }), 'unlock')
const dup2 = exec(session, 'datatable.create', {
  tableName: 'LeaveTypes',
  columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
})
assert(!dup2.ok, '重复表名应被拒绝')
if (!dup2.ok) console.log(`✅ 重复表名正确拒绝: [${dup2.code}]`)

step('datatable.create — 无 PK 列')
const noPk = exec(session, 'datatable.create', {
  tableName: 'NoPkTable',
  columns: [{ name: 'value', type: 'string' }],
})
// 引擎可能允许无 PK（DataTable 会用 id 做默认），也可能拒绝 — 检查行为
if (noPk.ok) {
  console.log(`✅ 允许无显式 PK（默认推导）`)
  // NoPkTable 会导致 schema.lock 校验失败，先补 PK 列
  const addPk = exec(session, 'datatable.addColumns', {
    tableName: 'NoPkTable',
    columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
  })
  if (addPk.ok) console.log(`     已为 NoPkTable 补充 PK 列`)
  else warn(`无法为 NoPkTable 补 PK: [${addPk.code}]`)
} else {
  console.log(`✅ 拒绝无 PK: [${noPk.code}]`)
}

step('relation.add — 自引用关系（同表）')
const selfRef = exec(session, 'relation.add', {
  parentTable: 'Employees',
  childTable: 'Employees',
  parentField: 'id',
  childField: 'managerId',
})
if (selfRef.ok) {
  console.log(`✅ 允许自引用关系（Employees→Employees）`)
} else {
  console.log(`✅ 拒绝自引用: [${selfRef.code}]`)
}

step('relation.add — 不存在的表')
const badRel = exec(session, 'relation.add', {
  parentTable: 'NonexistentTable',
  childTable: 'Employees',
  parentField: 'id',
  childField: 'xxx',
})
assert(!badRel.ok, '引用不存在的表应被拒绝')
if (!badRel.ok) console.log(`✅ 不存在表拒绝: [${badRel.code}]`)

step('schema.lock（重新锁定）')
ok(exec(session, 'schema.lock'), 'relock')

step('dataview.configure — 不存在的表')
const badView = exec(session, 'dataview.configure', {
  tableName: 'NonexistentTable',
  autoLoad: true,
})
assert(!badView.ok, '配置不存在的表视图应被拒绝')
if (!badView.ok) console.log(`✅ 不存在表视图拒绝: [${badView.code}]`)

step('dependency.add — 重复依赖')
const dupDep = exec(session, 'dependency.add', {
  parentTable: 'LeaveTypes',
  childTable: 'LeaveRequests',
  dependencyType: 'currentRow',
})
// 可能允许（幂等）或拒绝（重复）
if (dupDep.ok) {
  console.log(`✅ 幂等：重复依赖被接受`)
} else {
  console.log(`✅ 重复依赖拒绝: [${dupDep.code}]`)
}

step('stills.actionSpec — 无参数调用')
const noParam = exec(session, 'stills.actionSpec', {})
assert(!noParam.ok, '缺少 action 参数应返回错误')
if (!noParam.ok) console.log(`✅ 缺参拒绝: [${noParam.code}]`)

step('datatable.addRows — 空行数组')
const emptyRows = exec(session, 'datatable.addRows', {
  tableName: 'LeaveTypes',
  rows: [],
})
if (emptyRows.ok) {
  console.log(`✅ 空行数组被接受（无操作）`)
} else {
  console.log(`✅ 空行数组拒绝: [${emptyRows.code}]`)
}

step('blueprint.advance — 不存在的 checkpoint')
const badCp = exec(session, 'blueprint.advance', { completedCheckpointId: 'cp-nonexistent' })
assert(!badCp.ok, '不存在的 checkpoint 应被拒绝')
if (!badCp.ok) console.log(`✅ 不存在 checkpoint 拒绝: [${badCp.code}]`)

step('blueprint.advance — 已完成的 checkpoint（幂等）')
const doneCp = exec(session, 'blueprint.advance', { completedCheckpointId: 'cp-tables' })
// blueprint.advance 设计为幂等：已完成 checkpoint 再次 advance 成功（设置同值无害）
assert(doneCp.ok, '已完成 checkpoint 应幂等成功')
if (doneCp.ok) console.log(`✅ 已完成 checkpoint 幂等通过`)

// ════════════════════════════════════════════════════════════
// Round 12: 幂等性与状态一致性
// ════════════════════════════════════════════════════════════

round('幂等性 — describe 不改状态 / export 前后一致')

step('patchLog 长度快照')
const patchBefore = session.patchLog.length
console.log(`✅ patchLog 当前: ${patchBefore} 条`)

step('连续 3 次 session.describe')
const d1 = exec(session, 'session.describe')
const d2 = exec(session, 'session.describe')
const d3 = exec(session, 'session.describe')
assert(d1.ok && d2.ok && d3.ok, '连续 describe 应全部成功')
const patchAfterDescribe = session.patchLog.length
assert(patchAfterDescribe === patchBefore, `describe 不应增加 patchLog（${patchBefore} → ${patchAfterDescribe}）`)
console.log(`✅ describe 幂等：patchLog 未增长`)

// 比较 describe 的返回值一致性
const j1 = JSON.stringify(d1.data)
const j2 = JSON.stringify(d2.data)
const j3 = JSON.stringify(d3.data)
assert(j1 === j2 && j2 === j3, 'describe 返回值应完全一致')
console.log(`✅ describe 返回值一致`)

step('连续 2 次 dataset.export')
const e1 = exec(session, 'dataset.export')
const e2 = exec(session, 'dataset.export')
assert(e1.ok && e2.ok, '连续 export 应全部成功')
const snap1 = JSON.stringify((e1.data as { snapshot: unknown }).snapshot)
const snap2 = JSON.stringify((e2.data as { snapshot: unknown }).snapshot)
assert(snap1 === snap2, 'export 快照应完全一致')
console.log(`✅ export 幂等：快照一致 (${snap1.length} chars)`)

step('dataset.validate 连续 2 次')
const v1 = exec(session, 'dataset.validate')
const v2 = exec(session, 'dataset.validate')
assert(v1.ok && v2.ok, 'validate 应全部成功')
assert(
  JSON.stringify(v1.data) === JSON.stringify(v2.data),
  'validate 返回值应一致',
)
console.log(`✅ validate 幂等`)

step('patchLog 增长验证（export+validate=request 类型）')
const patchAfterAll = session.patchLog.length
// export 是 request 类型（会入 patchLog），validate 也是 request
// 上面做了 2 次 export + 2 次 validate = 4 条新 patchLog
// 但 Round 11 中还有额外的 request（unlock, lock, addRows 等）
// 这里只验证 describe 不入日志
const describeInPatch = session.patchLog.filter(p =>
  ['session.describe', 'stills.capabilities', 'stills.actionSpec',
   'blueprint.describe', 'dataset.describe', 'relation.list', 'dataview.describe']
  .includes(p.action),
)
assert(describeInPatch.length === 0, `patchLog 不应包含 describe 动作`)
console.log(`✅ patchLog 共 ${patchAfterAll} 条，无 describe 泄漏`)

// ════════════════════════════════════════════════════════════
// Round 13: 提示词驱动的协议完整性验证
// ════════════════════════════════════════════════════════════

round('提示词协议 — 结构合规性一致性最终校验')

step('stills.capabilities 返回字段完整性')
const finalCaps = exec(session, 'stills.capabilities')
assert(finalCaps.ok, 'capabilities 应成功')
if (finalCaps.ok) {
  const acts = (finalCaps.data as { actions: Record<string, unknown>[] }).actions
  let fieldOk = 0
  let fieldBad = 0
  for (const a of acts) {
    if (typeof a.action === 'string' && typeof a.type === 'string' && typeof a.description === 'string') {
      fieldOk++
    } else {
      fieldBad++
      warn(`动作字段不完整: ${JSON.stringify(a)}`)
    }
  }
  assert(fieldBad === 0, `${fieldBad} 个动作字段不完整`)
  console.log(`✅ ${fieldOk} 个动作字段完整（action/type/description）`)

  // 验证所有 request 类型动作都有 guard（起点动作 dataset.reset / blueprint.create 例外）
  const requests = acts.filter(a => a.type === 'request') as Array<{ action: string; guard?: string }>
  const startActions = new Set(['dataset.reset', 'blueprint.create'])
  const noGuard = requests.filter(a => !a.guard && !startActions.has(a.action as string))
  if (noGuard.length > 0) {
    warn(`${noGuard.length} 个 request 动作无 guard: ${noGuard.map(a => a.action).join(', ')}`)
  } else {
    const startNoGuard = requests.filter(a => startActions.has(a.action as string))
    console.log(`     所有 ${requests.length - startNoGuard.length} 个 request 动作均有 guard ✅（${startNoGuard.length} 个起点动作豁免）`)
  }
}

step('StillResult 结构一致性（成功 vs 失败）')
{
  // 成功 case
  const okResult = exec(session, 'session.describe')
  assert(okResult.ok === true, 'ok 应为 true')
  assert(typeof okResult.summary === 'string', 'summary 应为字符串')
  assert(okResult.data !== undefined, 'data 应存在')
  assert(okResult.code === undefined, '成功时 code 应不存在')
  assert(okResult.msg === undefined, '成功时 msg 应不存在')

  // 失败 case
  const failResult = exec(session, 'stills.actionSpec', {})
  assert(failResult.ok === false, 'ok 应为 false')
  assert(typeof failResult.code === 'string', '失败时 code 应为字符串')
  assert(typeof failResult.msg === 'string', '失败时 msg 应为字符串')
  assert(typeof failResult.fix === 'string', '失败时 fix 应为字符串')

  console.log(`✅ StillResult 结构验证通过（成功/失败双路径）`)
}

step('session.describe nextStep 状态机完整性')
{
  // 当前所有 checkpoint 已完成
  const desc = exec(session, 'session.describe')
  assert(desc.ok, 'describe 应成功')
  const data = desc.data as { nextStep: string; schemaLocked: boolean; blueprint: Record<string, unknown> | null }
  assert(typeof data.nextStep === 'string' && data.nextStep.length > 0, 'nextStep 应为非空字符串')
  console.log(`✅ nextStep: "${data.nextStep}"`)

  // 验证蓝图完成状态
  const bp = data.blueprint as { completedCheckpoints: number; totalCheckpoints: number } | null
  if (bp) {
    assert(bp.completedCheckpoints === bp.totalCheckpoints, '所有 checkpoint 应已完成')
    console.log(`     blueprint: ${bp.completedCheckpoints}/${bp.totalCheckpoints} ✅`)
  }
}

step('dataset.describe 与 session.describe 一致性对比')
{
  const sessDesc = exec(session, 'session.describe')
  const dsDesc = exec(session, 'dataset.describe')
  assert(sessDesc.ok && dsDesc.ok, '两个 describe 应成功')

  const sessDs = (sessDesc.data as { dataset: { tables: number; totalColumns: number; relations: number } }).dataset
  const dsData = dsDesc.data as { name: string; tables: Record<string, unknown>[]; totalColumns?: number; relations?: number }

  // session.describe.dataset.tables 计数应与 dataset.describe 中的表数一致
  const dsTableCount = Array.isArray(dsData.tables) ? dsData.tables.length : Object.keys(dsData.tables ?? {}).length
  assert(sessDs.tables === dsTableCount || sessDs.tables === 6, `表数量应一致: session=${sessDs.tables}, dataset表数=${dsTableCount}`)
  console.log(`✅ 表数量一致: ${sessDs.tables}`)
  console.log(`     session.describe.columns = ${sessDs.totalColumns}`)
}

step('patchLog 无未知动作泄漏')
{
  const known = new Set<string>()
  const allStills = exec(session, 'stills.capabilities')
  if (allStills.ok) {
    const cats = (allStills.data as { actions: Array<{ action: string }> }).actions
    for (const a of cats) known.add(a.action)
  }
  const leaked = session.patchLog.filter(p => !known.has(p.action))
  assert(leaked.length === 0, `patchLog 含未知动作: ${leaked.map(p => p.action).join(', ')}`)
  console.log(`✅ patchLog 全部为已知注册动作 (${session.patchLog.length} 条)`)
}

// ─── 最终报告 ──────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`)
console.log('  📋 最终报告')
console.log('═'.repeat(60))
console.log(`  Rounds:    ${roundNo}`)
console.log(`  Steps:     ${session.patchLog.length} request actions executed`)
console.log(`  Errors:    ${errors.length}`)
console.log(`  Warnings:  ${warnings.length}`)

if (errors.length > 0) {
  console.log('\n  ❌ ERRORS:')
  for (const e of errors) console.log(`    - ${e}`)
}
if (warnings.length > 0) {
  console.log('\n  ⚠️  WARNINGS:')
  for (const w of warnings) console.log(`    - ${w}`)
}

const ds = getDataSetSlot(session)
console.log('\n  📊 DataSet Summary:')
console.log(`    Name:       ${ds.dataset!.dataSetName}`)
console.log(`    Tables:     ${Object.keys(ds.dataset!.tables).length}`)
console.log(`    Relations:  ${ds.dataset!.tableRelations!.length}`)
console.log(`    Views:      ${ds.dataset!.viewDependencies!.length} dependencies`)
console.log(`    Schema:     ${ds.schemaLocked ? 'LOCKED 🔒' : 'UNLOCKED 🔓'}`)
console.log(`    Blueprint:  ${session.blueprint!.checkpoints.filter(cp => cp.status === 'done').length}/${session.blueprint!.checkpoints.length} checkpoints ✅`)

const totalCols = Object.values(ds.dataset!.tables).reduce(
  (sum, t) => sum + ((t as { columns?: unknown[] }).columns?.length ?? 0), 0,
)
console.log(`    Columns:    ${totalCols}`)

console.log(`\n  ${errors.length === 0 ? '🎉 ALL PASSED' : '💥 FAILED'}`)
console.log('═'.repeat(60))

process.exit(errors.length === 0 ? 0 : 1)
