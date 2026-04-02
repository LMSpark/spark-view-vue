/**
 * 导出企业请假系统 — Stills 完整流水线数据
 * 用法：npx tsx scripts/export-leave-system.ts
 *
 * 输出两个文件：
 *   data/enterprise-leave-system.pagedata.json   — DataSet 元数据快照（可直接用于 pagedata.json）
 *   data/enterprise-leave-system.stills.json     — Stills 流水线全量数据（blueprint + patchLog + 域状态）
 */
import { registerAllStills, createSession, executeStill } from '../packages/spark-ai/src/index.js'
import { getDataSetSlot } from '../packages/spark-ai/src/stills/dataset-domain.js'
import * as fs from 'fs'

registerAllStills()
const session = createSession()

// ── 对话记录 ──
interface DialogTurn {
  turn: number
  phase: string
  ai: { action: string; params: unknown; requestId: string; reasoning?: string }
  agent: { ok: boolean; code?: string; msg?: string; summary?: string; data?: unknown }
}
const dialogue: DialogTurn[] = []
let turnCounter = 0
let currentPhase = ''

function run(action: string, params: unknown = {}, reasoning?: string) {
  const requestId = `req-${String(++turnCounter).padStart(3, '0')}`
  const result = executeStill(action, params, session, requestId)

  dialogue.push({
    turn: turnCounter,
    phase: currentPhase,
    ai: { action, params, requestId, ...(reasoning ? { reasoning } : {}) },
    agent: {
      ok: result.ok,
      ...(result.ok ? { summary: result.summary, data: result.data } : { code: result.code, msg: result.msg }),
    },
  })

  if (!result.ok) { console.error(`FAIL: ${action} [${result.code}] ${result.msg}`); process.exit(1) }
  return result
}

// ══════════════════════════════════════════════════════════
// Phase 1: 发现 & 规划
// ══════════════════════════════════════════════════════════
currentPhase = '① 发现 & 规划'

run('session.describe', {}, '首次进入会话，先查看当前状态以确定从何处开始。')

run('stills.capabilities', {}, '查看可用的全部 action，制定建模计划。')

run('blueprint.create', {
  title: '大型企业请假管理系统',
  requirements: '请假申请+多级审批+假期余额+审批流配置',
  checkpoints: [{ id: 'cp1', title: '全部', plannedActions: ['all'], validation: 'ok' }],
}, '需求已明确：企业请假系统需要假别管理、员工、申请、审批记录、余额、审批流6张表。创建蓝图。')

run('dataset.init', { dataSetName: 'EnterpriseLeaveSystem' },
  '蓝图已就绪，初始化 DataSet 容器。')

// ══════════════════════════════════════════════════════════
// Phase 2: 表结构设计（6 张表）
// ══════════════════════════════════════════════════════════
currentPhase = '② 表结构设计'

run('datatable.create', { tableName: 'LeaveTypes', columns: [
  { name: 'id', type: 'string', isPrimaryKey: true, label: '假别ID' },
  { name: 'name', type: 'string', label: '假别名称' },
  { name: 'code', type: 'string', label: '假别编码' },
  { name: 'maxDays', type: 'number', label: '年度最大天数' },
  { name: 'needProof', type: 'boolean', label: '需要证明材料' },
  { name: 'minUnit', type: 'number', label: '最小请假单位(天)' },
  { name: 'description', type: 'string', label: '说明' },
  { name: 'enabled', type: 'boolean', label: '是否启用' },
  { name: 'sortOrder', type: 'number', label: '排序号' },
]})
run('datatable.create', { tableName: 'Employees', columns: [
  { name: 'id', type: 'string', isPrimaryKey: true, label: '员工ID' },
  { name: 'name', type: 'string', label: '姓名' },
  { name: 'department', type: 'string', label: '部门' },
  { name: 'position', type: 'string', label: '职位' },
  { name: 'managerId', type: 'string', label: '直属上级ID' },
  { name: 'email', type: 'string', label: '邮箱' },
  { name: 'hireDate', type: 'string', label: '入职日期' },
]})
run('datatable.create', { tableName: 'LeaveRequests', columns: [
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
]})
run('datatable.create', { tableName: 'ApprovalRecords', columns: [
  { name: 'id', type: 'string', isPrimaryKey: true, label: '审批ID' },
  { name: 'requestId', type: 'string', label: '申请ID' },
  { name: 'approver', type: 'string', label: '审批人' },
  { name: 'approverRole', type: 'string', label: '审批角色' },
  { name: 'stepOrder', type: 'number', label: '审批步骤' },
  { name: 'action', type: 'string', label: '动作' },
  { name: 'comment', type: 'string', label: '审批意见' },
  { name: 'timestamp', type: 'string', label: '审批时间' },
]})
run('datatable.create', { tableName: 'LeaveBalances', columns: [
  { name: 'id', type: 'string', isPrimaryKey: true, label: 'ID' },
  { name: 'employeeId', type: 'string', label: '员工ID' },
  { name: 'leaveTypeId', type: 'string', label: '假别ID' },
  { name: 'year', type: 'number', label: '年度' },
  { name: 'total', type: 'number', label: '总额度(天)' },
  { name: 'used', type: 'number', label: '已用(天)' },
  { name: 'remaining', type: 'number', label: '剩余(天)', computeExpression: 'total - used' },
]})
run('datatable.create', { tableName: 'ApprovalFlows', columns: [
  { name: 'id', type: 'string', isPrimaryKey: true, label: '流程ID' },
  { name: 'leaveTypeId', type: 'string', label: '假别ID' },
  { name: 'stepOrder', type: 'number', label: '步骤序号' },
  { name: 'approverRole', type: 'string', label: '审批角色' },
  { name: 'conditionExpr', type: 'string', label: '触发条件' },
  { name: 'description', type: 'string', label: '步骤说明' },
]})

// ── 6 关系 ──
run('relation.add', { parentTable: 'LeaveTypes', childTable: 'LeaveRequests', parentField: 'id', childField: 'leaveTypeId' })
run('relation.add', { parentTable: 'Employees', childTable: 'LeaveRequests', parentField: 'id', childField: 'employeeId' })
run('relation.add', { parentTable: 'LeaveRequests', childTable: 'ApprovalRecords', parentField: 'id', childField: 'requestId' })
run('relation.add', { parentTable: 'LeaveTypes', childTable: 'LeaveBalances', parentField: 'id', childField: 'leaveTypeId' })
run('relation.add', { parentTable: 'LeaveTypes', childTable: 'ApprovalFlows', parentField: 'id', childField: 'leaveTypeId' })
run('relation.add', { parentTable: 'Employees', childTable: 'LeaveBalances', parentField: 'id', childField: 'employeeId' })

run('schema.lock')

// ── 视图 + 聚合 ──
run('dataview.configure', { tableName: 'LeaveTypes', autoLoad: true, autoCurrentFirst: true })
run('dataview.configure', { tableName: 'Employees', autoLoad: true, autoCurrentFirst: true, pageSize: 50 })
run('dataview.configure', { tableName: 'LeaveRequests', autoLoad: true, autoCurrentFirst: true, pageSize: 20 })
run('dataview.configure', { tableName: 'ApprovalRecords', autoLoad: false })
run('dataview.configure', { tableName: 'LeaveBalances', autoLoad: true })
run('dataview.configure', { tableName: 'ApprovalFlows', autoLoad: false })
run('dataview.setAggregates', { tableName: 'LeaveRequests', aggregates: { days: { type: 'sum' } } })
run('dataview.setAggregates', { tableName: 'LeaveBalances', aggregates: { total: { type: 'sum' }, used: { type: 'sum' }, remaining: { type: 'sum' } } })

// ── 4 依赖 ──
run('dependency.add', { parentTable: 'LeaveTypes', childTable: 'LeaveRequests', dependencyType: 'currentRow' })
run('dependency.add', { parentTable: 'LeaveRequests', childTable: 'ApprovalRecords', dependencyType: 'currentRow' })
run('dependency.add', { parentTable: 'LeaveTypes', childTable: 'LeaveBalances', dependencyType: 'currentRow' })
run('dependency.add', { parentTable: 'LeaveTypes', childTable: 'ApprovalFlows', dependencyType: 'currentRow' })

// ── 初始数据 ──
run('datatable.addRows', { tableName: 'LeaveTypes', rows: [
  { id: 'LT01', name: '年假', code: 'annual', maxDays: 15, needProof: false, minUnit: 0.5, description: '带薪年休假', enabled: true, sortOrder: 1 },
  { id: 'LT02', name: '事假', code: 'personal', maxDays: 30, needProof: false, minUnit: 0.5, description: '因私事请假', enabled: true, sortOrder: 2 },
  { id: 'LT03', name: '病假', code: 'sick', maxDays: 180, needProof: true, minUnit: 1, description: '因病请假，3天以上需医院证明', enabled: true, sortOrder: 3 },
  { id: 'LT04', name: '婚假', code: 'marriage', maxDays: 15, needProof: true, minUnit: 1, description: '结婚假期，需结婚证', enabled: true, sortOrder: 4 },
  { id: 'LT05', name: '产假', code: 'maternity', maxDays: 158, needProof: true, minUnit: 1, description: '生育假期', enabled: true, sortOrder: 5 },
]})
run('datatable.addRows', { tableName: 'ApprovalFlows', rows: [
  { id: 'AF01', leaveTypeId: 'LT01', stepOrder: 1, approverRole: '直属上级', conditionExpr: 'days <= 3', description: '3天以内年假直属上级审批' },
  { id: 'AF02', leaveTypeId: 'LT01', stepOrder: 1, approverRole: '直属上级', conditionExpr: 'days > 3', description: '超过3天年假先直属上级' },
  { id: 'AF03', leaveTypeId: 'LT01', stepOrder: 2, approverRole: '部门经理', conditionExpr: 'days > 3', description: '超过3天年假部门经理复批' },
  { id: 'AF04', leaveTypeId: 'LT02', stepOrder: 1, approverRole: '直属上级', conditionExpr: '', description: '事假直属上级审批' },
  { id: 'AF05', leaveTypeId: 'LT03', stepOrder: 1, approverRole: '直属上级', conditionExpr: '', description: '病假直属上级审批' },
  { id: 'AF06', leaveTypeId: 'LT03', stepOrder: 2, approverRole: 'HR', conditionExpr: 'days > 3', description: '超过3天病假HR审核' },
  { id: 'AF07', leaveTypeId: 'LT04', stepOrder: 1, approverRole: 'HR', conditionExpr: '', description: '婚假HR审核' },
  { id: 'AF08', leaveTypeId: 'LT05', stepOrder: 1, approverRole: 'HR', conditionExpr: '', description: '产假HR审核' },
  { id: 'AF09', leaveTypeId: 'LT05', stepOrder: 2, approverRole: '部门经理', conditionExpr: '', description: '产假部门经理知会' },
]})

// ── 导出 ──
const exportResult = run('dataset.export')
const snapshot = (exportResult.data as { snapshot: unknown }).snapshot

// 收集 describe 快照
const sessionDescribe = run('session.describe')
const blueprintDescribe = run('blueprint.describe')
const validateResult = run('dataset.validate')

// Stills 完整流水线数据
const slot = getDataSetSlot(session)
const stillsPipeline = {
  // 元信息
  exportedAt: new Date().toISOString(),
  generator: 'scripts/export-leave-system.ts',

  // 1. 会话概览（session.describe 返回值）
  sessionDescribe: sessionDescribe.data,

  // 2. 蓝图（完整 ExecutionBlueprint）
  blueprint: session.blueprint,

  // 3. 蓝图描述（blueprint.describe 返回值）
  blueprintDescribe: blueprintDescribe.data,

  // 4. 域状态
  domain: {
    schemaLocked: slot.schemaLocked,
    currentStep: slot.currentStep,
  },

  // 5. DataSet 元数据快照
  datasetMetadata: snapshot,

  // 6. 校验结果（dataset.validate 返回值）
  validation: validateResult.data,

  // 7. 操作日志（patchLog — 完整审计轨迹）
  patchLog: session.patchLog,
}

fs.mkdirSync('data', { recursive: true })

// 写 pagedata.json（纯 DataSet 元数据，可直接被框架消费）
const pageDataPath = 'data/enterprise-leave-system.pagedata.json'
const pageDataJson = JSON.stringify(snapshot, null, 2)
fs.writeFileSync(pageDataPath, pageDataJson, 'utf-8')
console.log(`✅ pagedata.json  → ${pageDataPath} (${pageDataJson.length} chars)`)

// 写 stills.json（完整流水线数据）
const stillsPath = 'data/enterprise-leave-system.stills.json'
const stillsJson = JSON.stringify(stillsPipeline, null, 2)
fs.writeFileSync(stillsPath, stillsJson, 'utf-8')
console.log(`✅ stills.json    → ${stillsPath} (${stillsJson.length} chars)`)
console.log(`   patchLog 条数: ${session.patchLog.length}`)
console.log(`   blueprint checkpoints: ${session.blueprint?.checkpoints.length ?? 0}`)
console.log(`   schemaLocked: ${slot.schemaLocked}`)
console.log(`   currentStep: ${slot.currentStep}`)
