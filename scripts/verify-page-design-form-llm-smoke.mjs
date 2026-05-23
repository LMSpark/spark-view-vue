#!/usr/bin/env node
/**
 * Smoke test: drive the pageDesign module-semantic tool loop to create an
 * employee leave application form.
 *
 * Default mode calls the Java backend SSE endpoint. The backend owns the real
 * LLM provider config, while this script executes pageDesign tools locally.
 *
 * Use --mock to validate the pageDesign tool chain without making an LLM call:
 *   node --import tsx scripts/verify-page-design-form-llm-smoke.mjs --mock
 *
 * Use --publish after a successful run to write the generated page files to
 * the Java backend and register a navigation node for direct viewing:
 *   node --import tsx scripts/verify-page-design-form-llm-smoke.mjs --publish --request=帮我设计请假条界面 --tenant-id=lmspark --app-id=homepage
 *
 * Authentication boundary:
 * - This script talks to the SPARK backend with a system login JWT from
 *   --backend-token / SPARK_AUTH_TOKEN, or logs in with username/password.
 * - LLM provider keys are owned by the Java backend and are not read here.
 */

import { randomUUID } from 'node:crypto'
import {
  AiHostFetchTransport,
  AiHostToolLoopRunner,
  startRegistrationSession,
  toAiHostRuntimeScope,
} from '@spark-view/spark-ai/host'
import {
  PAGE_DESIGN_MODULE_ID,
  createPageDesignBusinessRegistration,
} from '@spark-view/spark-page-config/ai'
import { compileRule, parsePageData } from '@spark-view/spark-page-config/config'
import { SparkNodeTree } from '@spark-view/spark-page-config/node-tree'
import { DataSetCrudTool } from '@spark-view/spark-data'

const FORM_PAGE_ID = 'employee-leave-form-smoke'
const FORM_PAGE_TITLE = 'AI 员工请假申请'
const DEFAULT_REQUEST_TEXT = '帮我设计请假条界面'

function parseArgs(argv) {
  const out = {
    mock: false,
    maxRounds: 14,
    repairAttempts: 4,
    publish: false,
    requestText: process.env.AI_PAGE_REQUEST ?? DEFAULT_REQUEST_TEXT,
    pageId: process.env.AI_PAGE_ID ?? FORM_PAGE_ID,
    title: process.env.AI_PAGE_TITLE ?? FORM_PAGE_TITLE,
    tenantId: process.env.AI_TENANT_ID ?? 'lmspark',
    projectId: process.env.AI_PROJECT_ID ?? '',
    backendUrl: normalizeBackendUrl(process.env.AI_BACKEND_URL),
    username: process.env.AI_USERNAME ?? 'admin',
    password: process.env.AI_PASSWORD ?? 'admin123',
    backendToken: process.env.SPARK_AUTH_TOKEN ?? process.env.SPARK_BACKEND_TOKEN ?? '',
    navParentId: null,
    navIndex: -1,
  }
  for (const arg of argv) {
    if (arg === '--mock') out.mock = true
    if (arg === '--publish') out.publish = true
    if (arg.startsWith('--max-rounds=')) out.maxRounds = Number(arg.slice('--max-rounds='.length))
    if (arg.startsWith('--repair-attempts=')) out.repairAttempts = Number(arg.slice('--repair-attempts='.length))
    if (arg.startsWith('--request=')) out.requestText = arg.slice('--request='.length)
    if (arg.startsWith('--page-id=')) out.pageId = arg.slice('--page-id='.length)
    if (arg.startsWith('--publish-page-id=')) out.pageId = arg.slice('--publish-page-id='.length)
    if (arg.startsWith('--title=')) out.title = arg.slice('--title='.length)
    if (arg.startsWith('--publish-title=')) out.title = arg.slice('--publish-title='.length)
    if (arg.startsWith('--tenant-id=')) out.tenantId = arg.slice('--tenant-id='.length)
    if (arg.startsWith('--project-id=')) out.projectId = arg.slice('--project-id='.length)
    if (arg.startsWith('--app-id=')) out.projectId = arg.slice('--app-id='.length)
    if (arg.startsWith('--backend-url=')) out.backendUrl = normalizeBackendUrl(arg.slice('--backend-url='.length))
    if (arg.startsWith('--backend-token=')) out.backendToken = arg.slice('--backend-token='.length)
    if (arg.startsWith('--spark-token=')) out.backendToken = arg.slice('--spark-token='.length)
    if (arg.startsWith('--nav-parent-id=')) {
      const value = arg.slice('--nav-parent-id='.length).trim()
      out.navParentId = value.length === 0 ? null : value
    }
    if (arg.startsWith('--nav-index=')) out.navIndex = Number(arg.slice('--nav-index='.length))
  }
  return out
}

function normalizeBackendUrl(value) {
  return (value ?? 'http://localhost:8080').replace(/\/+$/, '')
}

function createPageContext(pageId) {
  const normalizedPageId = pageId.trim()
  if (normalizedPageId.length === 0) throw new Error('pageId must be a non-empty string')
  const rootPath = `/pageDesign[${normalizedPageId}]`
  return {
    pageId: normalizedPageId,
    sessionId: `${PAGE_DESIGN_MODULE_ID}:${normalizedPageId}:${randomUUID()}`,
    rootPath,
    lifecyclePath: `${rootPath}/lifecycle[${normalizedPageId}]`,
    datasetPath: `${rootPath}/dataset[${normalizedPageId}]`,
    nodeTreePath: `${rootPath}/node-tree[${normalizedPageId}]`,
    payloadPath: `${rootPath}/payload-catalog[${normalizedPageId}]`,
  }
}

function createHost(pageId) {
  let script = '/* AI employee leave form smoke page script */'
  let style = ''
  let nodeChanged = 0
  let dataChanged = 0
  const nodeTree = SparkNodeTree.fromJson({ type: 'page', props: {}, children: [] })
  const dataSetTool = new DataSetCrudTool(pageId)
  return {
    nodeTree,
    dataSetTool,
    host: {
      getNodeTree: () => nodeTree,
      onNodeTreeChanged: () => { nodeChanged += 1 },
      getDataSetTool: () => dataSetTool,
      onDataSetChanged: () => { dataChanged += 1 },
      readScript: () => script,
      writeScript: (content) => { script = content },
      readStyle: () => style,
      writeStyle: (content) => { style = content },
    },
    textModels: () => ({ script, style, nodeChanged, dataChanged }),
  }
}

function runtimeContext(ctx) {
  return {
    moduleId: PAGE_DESIGN_MODULE_ID,
    moduleInstanceId: ctx.pageId,
    instanceId: `${PAGE_DESIGN_MODULE_ID}:${ctx.pageId}`,
  }
}

function businessScope(ctx) {
  return {
    businessRegistrationId: PAGE_DESIGN_MODULE_ID,
    businessInstanceId: ctx.pageId,
    instanceId: ctx.sessionId,
    runtimeInstanceId: ctx.sessionId,
  }
}

function turnMeta(ctx, seq = 1) {
  const now = new Date().toISOString()
  return {
    turnId: `turn-${ctx.pageId}-${seq}`,
    seq,
    baseRevision: 0,
    queuedAt: now,
    startedAt: now,
    maxParallelTurns: 1,
  }
}

function buildUserPrompt(ctx, options, previousChecks) {
  const base = [
    `用户原话：${options.requestText}`,
    `目标位置：tenantId=${options.tenantId}，appId/projectId=${options.projectId || '登录默认项目'}，pageId=${ctx.pageId}。`,
    '请像真实页面设计助手一样理解需求，并用 pageDesign 工具直接创建一个员工请假申请表单页面。',
    '必须修改 pagedata.json 和 rule.json，不要只输出方案。',
    `当前 pageDesign 实例路径已确认：${ctx.rootPath}`,
    `只能使用这些子模块路径：lifecycle=${ctx.lifecyclePath}，payload-catalog=${ctx.payloadPath}，dataset=${ctx.datasetPath}，node-tree=${ctx.nodeTreePath}。`,
    `不要省略方括号实例段，例如不要写 /pageDesign[${ctx.pageId}]/dataset。`,
    '每次回复最多发起一个 tool_call；收到工具结果后再继续下一个。严禁发起空参数工具调用，尤其禁止 invokeAction 参数为 {}。',
    '建议流程：describeProgress -> describeDesignFlow -> guidePayload -> createTable -> addNode -> 最终一句话。',
    '不要调用 export、getAllData、readScript、readStyle、listTables、countNodes、listChildren、findInstance。',
    '最小数据模型必须创建 EmployeeLeaveRequest 表，字段使用 camelCase：id、employeeName、employeeNo、department、leaveType、startDate、endDate、totalDays、reason、approver、status。',
    '不要创建 leave_requests、employee_name、leave_type 这类 snake_case 表或字段；不要臆造后端 API。',
    'rule.json 必须有 r-form，dataViewKey 必须是 EmployeeLeaveRequest@default，字段组件放在表单 children 中并用 field 绑定上面的 camelCase 字段。',
    '构造组件节点前必须通过 payload-catalog 的 guidePayload 获取组件参数指南，至少覆盖 r-form、r-text、r-select、r-date、r-number、r-textarea。',
    '完成后用一句话总结你实际改了哪些文件。',
  ]

  if (previousChecks === undefined) return base.join('\n')

  return [
    '上一轮没有通过 smoke 校验。不要重新解释，继续调用工具修正当前页面。',
    `当前校验失败项：${JSON.stringify(previousChecks)}`,
    '必须补齐缺失项：EmployeeLeaveRequest 表、10 个字段绑定、r-form 节点、标准 dataViewKey、每类组件 guidePayload、createTable 和 addNode。',
    ...base,
  ].join('\n')
}

function buildSystemPrompt() {
  return [
    '这是一次 pageDesign 表单生成 smoke。目标是验证 AI 能否通过 ModuleKind 子模块寻址完成最小表单生成。',
    '路径是宿主传入的确定上下文，不需要重新猜测。若工具返回 schema 或参数指南，必须按返回的 schema 组织参数。',
    '每次只调用一个工具；所有工具调用必须携带完整 JSON 参数，禁止空对象 {}，禁止缺少 path/actionName/args 的 invokeAction。',
    '优先创建最小可运行表单；字段、DataViewKey、组件 props 必须来自工具结果，不要猜测。',
  ].join('\n')
}

async function createJavaSseTransport(config) {
  const auth = await resolveBackendAuth(config)
  const headers = {
    Authorization: `Bearer ${auth.token}`,
    'X-Tenant-Id': config.tenantId,
    Accept: 'text/event-stream',
    ...(auth.projectId.trim().length === 0 ? {} : { 'X-Project-Id': auth.projectId }),
  }
  return new AiHostFetchTransport({
    baseUrl: `${config.backendUrl}/api/ai`,
    getHeaders: () => headers,
  })
}

async function resolveBackendAuth(config) {
  if (config.backendToken.trim().length > 0) {
    return {
      token: config.backendToken,
      projectId: config.projectId,
    }
  }
  const response = await fetch(`${config.backendUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': config.tenantId,
      ...(config.projectId.trim().length === 0 ? {} : { 'X-Project-Id': config.projectId }),
    },
    body: JSON.stringify({
      tenantId: config.tenantId,
      username: config.username,
      password: config.password,
    }),
  })
  if (!response.ok) {
    throw new Error(`Java backend login failed: ${response.status} ${await response.text()}`)
  }
  const payload = await response.json()
  const token = typeof payload?.token === 'string'
    ? payload.token
    : (typeof payload?.data?.token === 'string' ? payload.data.token : '')
  if (token.trim().length === 0) {
    throw new Error('Java backend login failed: missing token')
  }
  const loginDefaultProjectId = typeof payload?.defaultProjectId === 'string'
    ? payload.defaultProjectId
    : (typeof payload?.data?.defaultProjectId === 'string' ? payload.data.defaultProjectId : '')
  return {
    token,
    projectId: config.projectId.trim().length === 0 ? loginDefaultProjectId : config.projectId,
  }
}

function ensureTrailingNewline(value) {
  return value.endsWith('\n') ? value : `${value}\n`
}

function publishRuleNodes(rule) {
  if (rule === null || typeof rule !== 'object') {
    throw new Error('Cannot publish rule.json: generated rule is not an object')
  }
  if (Array.isArray(rule.children)) return rule.children
  if (typeof rule.type === 'string') return [rule]
  throw new Error('Cannot publish rule.json: generated rule has no SparkNode root or children')
}

function buildPublishFiles(artifacts, textModels) {
  const ruleJson = ensureTrailingNewline(JSON.stringify(publishRuleNodes(artifacts.rule), null, 2))
  const pageDataJson = ensureTrailingNewline(JSON.stringify(artifacts.pagedata, null, 2))
  compileRule(ruleJson)
  parsePageData(pageDataJson)
  return {
    'rule.json': ruleJson,
    'pagedata.json': pageDataJson,
    'script.js': ensureTrailingNewline(textModels.script.trim().length > 0
      ? textModels.script
      : '/* AI employee leave form smoke page script */'),
    'style.css': ensureTrailingNewline(textModels.style.trim().length > 0
      ? textModels.style
      : '/* AI employee leave form smoke page */'),
  }
}

function requireProjectId(config, auth) {
  const projectId = (auth.projectId ?? config.projectId ?? '').trim()
  if (projectId.length === 0) {
    throw new Error('Java backend projectId is missing. Set AI_PROJECT_ID or login with a user that has defaultProjectId.')
  }
  return projectId
}

function backendApiBase(config, auth) {
  const tenantId = encodeURIComponent(config.tenantId)
  const projectId = encodeURIComponent(requireProjectId(config, auth))
  return `${config.backendUrl}/api/tenants/${tenantId}/projects/${projectId}`
}

function javaJsonHeaders(config, auth) {
  const projectId = requireProjectId(config, auth)
  return {
    Authorization: `Bearer ${auth.token}`,
    'Content-Type': 'application/json',
    'X-Tenant-Id': config.tenantId,
    'X-Project-Id': projectId,
  }
}

function javaTextHeaders(config, auth) {
  const projectId = requireProjectId(config, auth)
  return {
    Authorization: `Bearer ${auth.token}`,
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Tenant-Id': config.tenantId,
    'X-Project-Id': projectId,
  }
}

async function readJsonResponse(response, label) {
  const text = await response.text()
  let payload = null
  if (text.trim().length > 0) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }
  if (!response.ok) {
    const suffix = typeof payload === 'string' ? payload : JSON.stringify(payload)
    throw new Error(`${label} failed: ${response.status} ${suffix}`)
  }
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    if (payload.ok === false) {
      throw new Error(`${label} failed: ${JSON.stringify(payload.error ?? payload)}`)
    }
    if (payload.ok === true && Object.prototype.hasOwnProperty.call(payload, 'data')) {
      return payload.data
    }
  }
  return payload
}

async function fetchJson(url, init, label) {
  return readJsonResponse(await fetch(url, init), label)
}

async function putPageFile(config, auth, pageId, filename, content) {
  const url = `${backendApiBase(config, auth)}/pages-config/${encodeURIComponent(pageId)}/${encodeURIComponent(filename)}`
  return fetchJson(url, {
    method: 'PUT',
    headers: javaTextHeaders(config, auth),
    body: content,
  }, `Publish ${pageId}/${filename}`)
}

async function listNavigationNodes(config, auth) {
  const url = `${backendApiBase(config, auth)}/navigation/nodes?limit=5000`
  const payload = await fetchJson(url, {
    method: 'GET',
    headers: javaJsonHeaders(config, auth),
  }, 'List navigation nodes')
  return Array.isArray(payload) ? payload : []
}

async function updateNavigationNode(config, auth, nodeId, patch) {
  const url = `${backendApiBase(config, auth)}/navigation/nodes/${encodeURIComponent(nodeId)}`
  const payload = await fetchJson(url, {
    method: 'PUT',
    headers: javaJsonHeaders(config, auth),
    body: JSON.stringify(patch),
  }, `Update navigation node ${nodeId}`)
  return payload?.node ?? patch
}

async function addNavigationNode(config, auth, node, parentId, index) {
  const url = `${backendApiBase(config, auth)}/navigation/nodes`
  const body = {
    ...(parentId === null ? {} : { parentId }),
    node,
    ...(Number.isFinite(index) ? { index } : {}),
  }
  const payload = await fetchJson(url, {
    method: 'POST',
    headers: javaJsonHeaders(config, auth),
    body: JSON.stringify(body),
  }, `Add navigation node ${node.id}`)
  return payload?.node ?? node
}

async function upsertNavigationNode(config, auth, options) {
  const pageId = options.pageId.trim()
  if (pageId.length === 0) throw new Error('pageId must be a non-empty string')
  const routePath = `/${pageId}`
  const title = options.title.trim().length > 0 ? options.title.trim() : pageId
  const node = {
    id: pageId,
    title,
    description: 'AI 生成的员工请假申请表单 smoke 页面',
    nodeKind: 'page',
    path: routePath,
    icon: 'Document',
    permissionMode: 'masked',
  }
  const nodes = await listNavigationNodes(config, auth)
  const existing = nodes.find(item => item?.id === pageId)
    ?? nodes.find(item => item?.path === routePath)
    ?? null
  if (existing !== null && typeof existing.id === 'string') {
    const updated = await updateNavigationNode(config, auth, existing.id, {
      ...node,
      id: existing.id,
    })
    return {
      mode: 'updated',
      nodeId: existing.id,
      node: updated,
    }
  }
  const created = await addNavigationNode(config, auth, node, options.navParentId, options.navIndex)
  return {
    mode: 'created',
    nodeId: typeof created?.id === 'string' ? created.id : pageId,
    node: created,
  }
}

async function publishArtifacts(config, artifacts, textModels, options) {
  const auth = await resolveBackendAuth(config)
  const pageId = options.pageId.trim()
  if (pageId.length === 0) throw new Error('pageId must be a non-empty string')
  const files = buildPublishFiles(artifacts, textModels)
  const written = []
  for (const [filename, content] of Object.entries(files)) {
    const result = await putPageFile(config, auth, pageId, filename, content)
    written.push({
      filename,
      unchanged: Boolean(result?.unchanged),
      timestamp: typeof result?.timestamp === 'string' ? result.timestamp : '',
    })
  }
  const navigation = await upsertNavigationNode(config, auth, options)
  return {
    tenantId: config.tenantId,
    projectId: requireProjectId(config, auth),
    pageId,
    title: options.title,
    routePath: `/${pageId}`,
    files: written,
    navigation,
  }
}

function toolCall(id, name, args) {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  }
}

function employeeLeaveColumns() {
  return [
    { name: 'id', type: 'string', isPrimaryKey: true, required: true },
    { name: 'employeeName', type: 'string', required: true },
    { name: 'employeeNo', type: 'string', required: true },
    { name: 'department', type: 'string', required: true },
    { name: 'leaveType', type: 'string', required: true },
    { name: 'startDate', type: 'string', required: true },
    { name: 'endDate', type: 'string', required: true },
    { name: 'totalDays', type: 'number', required: true },
    { name: 'reason', type: 'string', required: true },
    { name: 'approver', type: 'string' },
    { name: 'status', type: 'string' },
  ]
}

function employeeLeaveFormNode() {
  return {
    type: 'r-form',
    id: 'employee-leave-form',
    props: {
      dataViewKey: 'EmployeeLeaveRequest@default',
      contextDataMember: 'currentRow',
      autoColumns: false,
      labelWidth: '120px',
      gridColumns: 24,
      gridGap: 12,
    },
    children: [
      { type: 'r-text', id: 'leave-employee-name', props: { field: 'employeeName', label: '员工姓名' } },
      { type: 'r-text', id: 'leave-employee-no', props: { field: 'employeeNo', label: '员工编号' } },
      {
        type: 'r-select',
        id: 'leave-department',
        props: {
          field: 'department',
          label: '部门',
          options: [
            { label: '研发部', value: 'rd' },
            { label: '产品部', value: 'product' },
            { label: '运营部', value: 'ops' },
          ],
          optionLabelField: 'label',
          optionValueField: 'value',
        },
      },
      {
        type: 'r-select',
        id: 'leave-type',
        props: {
          field: 'leaveType',
          label: '请假类型',
          options: [
            { label: '年假', value: 'annual' },
            { label: '病假', value: 'sick' },
            { label: '事假', value: 'personal' },
            { label: '其他', value: 'other' },
          ],
          optionLabelField: 'label',
          optionValueField: 'value',
        },
      },
      { type: 'r-date', id: 'leave-start-date', props: { field: 'startDate', label: '开始日期' } },
      { type: 'r-date', id: 'leave-end-date', props: { field: 'endDate', label: '结束日期' } },
      { type: 'r-number', id: 'leave-total-days', props: { field: 'totalDays', label: '请假天数' } },
      { type: 'r-textarea', id: 'leave-reason', props: { field: 'reason', label: '请假原因' } },
      { type: 'r-text', id: 'leave-approver', props: { field: 'approver', label: '审批人' } },
      {
        type: 'r-select',
        id: 'leave-status',
        props: {
          field: 'status',
          label: '状态',
          options: [
            { label: '草稿', value: 'draft' },
            { label: '审批中', value: 'pending' },
            { label: '已通过', value: 'approved' },
            { label: '已驳回', value: 'rejected' },
          ],
          optionLabelField: 'label',
          optionValueField: 'value',
        },
      },
    ],
  }
}

function mockCallPlan(ctx) {
  return [
    toolCall('mock-1', 'listChildren', { path: '/' }),
    toolCall('mock-2', 'findInstance', { path: '/', childKind: PAGE_DESIGN_MODULE_ID, query: {} }),
    toolCall('mock-3', 'invokeAction', { path: ctx.lifecyclePath, actionName: 'describeProgress', args: {} }),
    toolCall('mock-4', 'invokeAction', { path: ctx.lifecyclePath, actionName: 'describeDesignFlow', args: { phase: '数据规划' } }),
    toolCall('mock-5', 'invokeAction', { path: ctx.payloadPath, actionName: 'queryPayloads', args: { category: 'container', keyword: 'form', limit: 10 } }),
    toolCall('mock-6', 'invokeAction', { path: ctx.payloadPath, actionName: 'guidePayload', args: { key: 'r-form' } }),
    toolCall('mock-7', 'invokeAction', { path: ctx.payloadPath, actionName: 'guidePayload', args: { key: 'r-text' } }),
    toolCall('mock-8', 'invokeAction', { path: ctx.payloadPath, actionName: 'guidePayload', args: { key: 'r-select' } }),
    toolCall('mock-9', 'invokeAction', { path: ctx.payloadPath, actionName: 'guidePayload', args: { key: 'r-date' } }),
    toolCall('mock-10', 'invokeAction', { path: ctx.payloadPath, actionName: 'guidePayload', args: { key: 'r-number' } }),
    toolCall('mock-11', 'invokeAction', { path: ctx.payloadPath, actionName: 'guidePayload', args: { key: 'r-textarea' } }),
    toolCall('mock-12', 'invokeAction', {
      path: ctx.datasetPath,
      actionName: 'createTable',
      args: {
        tableName: 'EmployeeLeaveRequest',
        columns: employeeLeaveColumns(),
        resourceType: 'static-data',
        resourceId: 'employee.leave.request',
        businessCategory: 'transaction',
        views: {
          default: {
            rows: [{
              id: 'leave-draft-1',
              employeeName: '',
              employeeNo: '',
              department: '',
              leaveType: 'annual',
              startDate: '',
              endDate: '',
              totalDays: 1,
              reason: '',
              approver: '',
              status: 'draft',
            }],
          },
        },
      },
    }),
    toolCall('mock-13', 'invokeAction', {
      path: ctx.nodeTreePath,
      actionName: 'addNode',
      args: {
        parentComponentId: null,
        node: employeeLeaveFormNode(),
      },
    }),
  ]
}

class MockPageDesignTransport {
  constructor(ctx) {
    this.index = 0
    this.calls = mockCallPlan(ctx)
  }

  streamTurn() {
    if (this.index >= this.calls.length) {
      return Promise.resolve({
        text: '已创建员工请假申请表单页面，包含 EmployeeLeaveRequest 数据表和 r-form 字段绑定。',
        toolCalls: [],
      })
    }
    const call = this.calls[this.index]
    this.index += 1
    return Promise.resolve({
      text: '',
      toolCalls: [call],
    })
  }

  appendMessages() {
    return Promise.resolve()
  }
}

function flattenNodes(node) {
  const children = Array.isArray(node.children) ? node.children : []
  return [node, ...children.flatMap(flattenNodes)]
}

function readActionName(record) {
  const args = record.args
  return args && typeof args === 'object' && typeof args.actionName === 'string' ? args.actionName : null
}

function readPath(record) {
  const args = record.args
  return args && typeof args === 'object' && typeof args.path === 'string' ? args.path : null
}

function validateArtifacts(nodeTree, dataSetTool, toolCalls) {
  const rule = nodeTree.toJSON()
  const nodes = flattenNodes(rule)
  const formNodes = nodes.filter(node => node.type === 'r-form')
  const fieldNodes = nodes.filter(node => node.props && typeof node.props.field === 'string')
  const pagedata = dataSetTool.toJson()
  const tables = pagedata.tables ?? {}
  const tableNames = Object.keys(tables)
  const dataViewKeys = nodes
    .map(node => node.props && typeof node.props.dataViewKey === 'string' ? node.props.dataViewKey : null)
    .filter(Boolean)
  const schemaFields = new Set(employeeLeaveColumns().map(column => column.name))
  const boundFields = fieldNodes.map(node => node.props.field)
  const missingBindings = [...schemaFields].filter(field => field !== 'id' && !boundFields.includes(field))
  const invalidDataViewKeys = dataViewKeys.filter(key =>
    !(/^[^@]+@[^@]+$/.test(key) || /^#[^@]+@[^@]+@[^@]+$/.test(key)),
  )
  const failedToolCalls = toolCalls.filter(call => call.ok !== true)
  const actionNames = toolCalls
    .map(call => call.actionName)
    .filter(actionName => typeof actionName === 'string')
  const forbiddenActionNames = actionNames.filter(actionName => [
    'export',
    'getAllData',
    'readScript',
    'readStyle',
    'listTables',
    'countNodes',
  ].includes(actionName))
  return {
    ok:
      tableNames.includes('EmployeeLeaveRequest')
      && formNodes.length > 0
      && fieldNodes.length >= 9
      && missingBindings.length === 0
      && invalidDataViewKeys.length === 0
      && failedToolCalls.length === 0
      && actionNames.includes('createTable')
      && actionNames.includes('addNode')
      && actionNames.filter(actionName => actionName === 'guidePayload').length >= 4,
    rule,
    pagedata,
    checks: {
      tableNames,
      formCount: formNodes.length,
      fieldCount: fieldNodes.length,
      boundFields,
      missingBindings,
      dataViewKeys,
      invalidDataViewKeys,
      failedToolCalls,
      forbiddenActionNames,
      actionNames,
    },
  }
}

async function runSmoke(options) {
  const ctx = createPageContext(options.pageId)
  const backendConfig = {
    backendUrl: options.backendUrl,
    tenantId: options.tenantId,
    projectId: options.projectId,
    username: options.username,
    password: options.password,
    backendToken: options.backendToken,
  }
  const { host, nodeTree, dataSetTool, textModels } = createHost(ctx.pageId)
  const registration = createPageDesignBusinessRegistration({
    getEditToolHost: () => host,
  })
  const scope = businessScope(ctx)
  await startRegistrationSession(registration, runtimeContext(ctx))
  const boot = await registration.runtime.executeTool('invokeAction', {
    path: ctx.lifecyclePath,
    actionName: 'bootstrap',
    args: {},
  }, toAiHostRuntimeScope(scope))
  if (!boot.ok) throw new Error(`pageDesign bootstrap failed: ${boot.msg}`)

  const transport = options.mock
    ? new MockPageDesignTransport(ctx)
    : await createJavaSseTransport(backendConfig)

  const fcCalls = []
  const deltas = []
  const usages = []
  const runner = new AiHostToolLoopRunner({
    registry: { get: () => registration, list: () => [registration] },
    transport,
    maxToolRounds: options.maxRounds,
  })

  const maxAttempts = options.mock ? 1 : Math.max(1, options.repairAttempts + 1)
  let artifacts = validateArtifacts(nodeTree, dataSetTool, fcCalls)
  let attempts = 0
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt
    const previousChecks = attempt === 1 ? undefined : artifacts.checks
    await runner.runToolLoop({
      registration,
      scope,
      request: {
        historyMsgs: [{
          role: 'user',
          content: buildUserPrompt(ctx, options, previousChecks),
        }],
        systemPrompt: buildSystemPrompt(),
        onDelta: delta => deltas.push(delta),
        onUsage: usage => usages.push(usage),
        onFcCall: record => {
          fcCalls.push({
            ...(record.callId === undefined ? {} : { callId: record.callId }),
            toolName: record.toolName,
            actionName: readActionName(record),
            path: readPath(record),
            status: record.status,
            ok: record.result.ok,
            errorCode: record.result.ok ? null : record.result.code ?? null,
            errorMessage: record.result.ok ? null : record.result.msg ?? null,
            fix: record.result.ok ? null : record.result.fix ?? null,
            ...(record.result.ok ? {} : { args: record.args }),
          })
        },
      },
      turn: turnMeta(ctx, attempt),
      clearSelected: () => undefined,
    })

    artifacts = validateArtifacts(nodeTree, dataSetTool, fcCalls)
    if (artifacts.ok) break
    deltas.push(`\n[smoke] 第 ${attempt} 轮未通过，将按校验结果继续修正。\n`)
  }
  const finalTextModels = textModels()
  const published = artifacts.ok && options.publish
    ? await publishArtifacts(backendConfig, artifacts, finalTextModels, options)
    : null
  return {
    ok: artifacts.ok,
    mode: options.mock ? 'mock' : 'real',
    attempts,
    sessionId: scope.instanceId,
    llm: {
      provider: options.mock ? 'mock' : 'java-sse',
      baseUrl: options.mock ? '' : `${backendConfig.backendUrl}/api/ai`,
      model: '',
      credential: options.mock ? 'mock' : 'present',
      toolCallCount: fcCalls.length,
      usages,
    },
    toolCalls: fcCalls,
    summaryText: deltas.join('').slice(0, 1200),
    textModels: finalTextModels,
    validation: artifacts.checks,
    published,
    pagedata: artifacts.pagedata,
    rule: artifacts.rule,
  }
}

const options = parseArgs(process.argv.slice(2))
runSmoke(options).then((result) => {
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(2)
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
