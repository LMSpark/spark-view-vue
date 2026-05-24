#!/usr/bin/env node
/**
 * Thin smoke: log in to the Java AI backend, run one pageDesign business
 * session, and ask the real LLM to design a leave-request page.
 *
 * The pageDesign prompt, module-semantic tools, bootstrap lifecycle, payload
 * rules, DataSet editing, and node-tree editing all live in spark-page-config
 * and spark-ai. This script only wires the runtime boundary.
 *
 * PAGE_DESIGN_REFACTOR_SOURCE[smoke-boundary]: smoke 只负责登录、注册、发起会话、保存与验收；若出现页面生成/组件选择/参数修复业务逻辑，应回收到 spark-page-config 或 spark-ai。
 */

import {
  AiHostBusinessRegistry,
  AiHostBusinessTarget,
  AiHostFetchTransport,
  createAiHostBusinessSession,
  previewAiHostDiagnosticValue,
  summarizeAiHostSessionRecord,
} from '@spark-view/spark-ai/host'
import {
  PAGE_DESIGN_MODULE_ID,
  flattenPageDesignSparkNodes,
  parsePageDesignJsonFile,
  registerPageDesignBusiness,
  validatePageDesignPayloadGuidesFromSession,
} from '@spark-view/spark-page-config/ai'
import { parseDataViewKey } from '@spark-view/spark-data'
import {
  PAGE_CONFIG_FILE_NAMES,
  PageConfigFileApi,
  PageConfigLoader,
} from '@spark-view/spark-page-config/config'
import { PageConfigEditWorkspace } from '@spark-view/spark-page-config/design'

const DEFAULT_REQUEST_TEXT = '实现请假申请页面设计'
const DEFAULT_PAGE_ID = 'ai-leave-request-form'
const DEFAULT_PAGE_TITLE = '请假单'
const DEFAULT_PAGE_ICON = 'Document'
const REQUEST_TIMEOUT = 30_000

// ── CLI 与运行参数 ─────────────────────────────────────────

function parseArgs(argv) {
  const options = {
    backendUrl: normalizeBackendUrl(process.env.AI_BACKEND_URL),
    tenantId: process.env.AI_TENANT_ID ?? 'lmspark',
    projectId: process.env.AI_PROJECT_ID ?? process.env.AI_APP_ID ?? 'homepage',
    username: process.env.AI_USERNAME ?? 'admin',
    password: process.env.AI_PASSWORD ?? 'admin123',
    backendToken: process.env.SPARK_AUTH_TOKEN ?? process.env.SPARK_BACKEND_TOKEN ?? '',
    requestText: process.env.AI_PAGE_REQUEST ?? DEFAULT_REQUEST_TEXT,
    pageId: process.env.AI_PAGE_ID ?? DEFAULT_PAGE_ID,
    basePageId: process.env.AI_PAGE_ID ?? DEFAULT_PAGE_ID,
    isolateSession: process.env.AI_ISOLATE_SESSION === undefined ? true : process.env.AI_ISOLATE_SESSION !== '0',
    runId: process.env.AI_RUN_ID ?? '',
    pageTitle: process.env.AI_PAGE_TITLE ?? DEFAULT_PAGE_TITLE,
    pageIcon: process.env.AI_PAGE_ICON ?? DEFAULT_PAGE_ICON,
    replacePage: process.env.AI_REPLACE_PAGE === '1',
    maxRounds: numberFromEnv(process.env.AI_MAX_TOOL_ROUNDS, 28),
    printFiles: process.env.AI_PRINT_FILES === '1',
    printSseEvents: process.env.AI_PRINT_SSE_EVENTS === '1',
    traceConversation: process.env.AI_TRACE_CONVERSATION === '1',
    traceContentLimit: numberFromEnv(process.env.AI_TRACE_LIMIT, 12_000),
    traceFullPrompt: process.env.AI_TRACE_FULL_PROMPT === '1',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const parsed = parseOption(argv, index)
    if (parsed === null) continue
    const { key, value, consumedNext } = parsed
    if (consumedNext) index += 1

    switch (key) {
      case 'backend-url':
        options.backendUrl = normalizeBackendUrl(value)
        break
      case 'tenant-id':
        options.tenantId = value
        break
      case 'project-id':
      case 'app-id':
        options.projectId = value
        break
      case 'username':
        options.username = value
        break
      case 'password':
        options.password = value
        break
      case 'backend-token':
      case 'spark-token':
        options.backendToken = value
        break
      case 'request':
        options.requestText = value
        break
      case 'page-id':
        options.pageId = value
        break
      case 'isolate-session':
        options.isolateSession = booleanFlag(value)
        break
      case 'no-isolate-session':
        options.isolateSession = false
        break
      case 'run-id':
      case 'session-run-id':
        options.runId = value
        break
      case 'page-title':
      case 'title':
        options.pageTitle = value
        break
      case 'page-icon':
      case 'icon':
        options.pageIcon = value
        break
      case 'replace-page':
        options.replacePage = booleanFlag(value)
        break
      case 'no-replace-page':
        options.replacePage = false
        break
      case 'max-rounds':
        options.maxRounds = Number(value)
        break
      case 'print-files':
        options.printFiles = booleanFlag(value)
        break
      case 'print-sse-events':
        options.printSseEvents = booleanFlag(value)
        break
      case 'trace-conversation':
        options.traceConversation = booleanFlag(value)
        break
      case 'no-trace-conversation':
        options.traceConversation = false
        break
      case 'trace-limit':
        options.traceContentLimit = Number(value)
        break
      case 'trace-full-prompt':
        options.traceFullPrompt = booleanFlag(value)
        break
      case 'mock':
        throw new Error('--mock has been removed from this smoke; use package tests for local tool-chain coverage.')
      case 'publish':
        break
      case 'dry-run':
        throw new Error('--dry-run is not supported; this smoke verifies real page-config persistence.')
        break
      default:
        throw new Error(`Unknown option: --${key}`)
    }
  }

  options.backendUrl = requireNonEmpty(options.backendUrl, 'backendUrl')
  options.tenantId = requireNonEmpty(options.tenantId, 'tenantId')
  options.projectId = options.projectId.trim()
  options.requestText = requireNonEmpty(options.requestText, 'requestText')
  options.pageId = requireNonEmpty(options.pageId, 'pageId')
  options.basePageId = options.pageId
  options.runId = normalizeOptionalRunId(options.runId)
  if (options.isolateSession) {
    options.runId = options.runId || createDefaultRunId()
    options.pageId = buildIsolatedPageId(options.basePageId, options.runId)
  }
  options.pageTitle = requireNonEmpty(options.pageTitle, 'pageTitle')
  options.pageIcon = options.pageIcon.trim()
  if (!Number.isFinite(options.maxRounds) || options.maxRounds <= 0) {
    throw new Error('maxRounds must be a positive number')
  }
  if (!Number.isFinite(options.traceContentLimit) || options.traceContentLimit <= 0) {
    throw new Error('traceContentLimit must be a positive number')
  }
  return options
}

function parseOption(argv, index) {
  const arg = argv[index]
  if (arg === '--') return null
  if (typeof arg !== 'string' || !arg.startsWith('--')) return null
  const body = arg.slice(2)
  const eq = body.indexOf('=')
  if (eq >= 0) {
    return {
      key: body.slice(0, eq),
      value: body.slice(eq + 1),
      consumedNext: false,
    }
  }
  const next = argv[index + 1]
  const hasValue = typeof next === 'string' && !next.startsWith('--')
  return {
    key: body,
    value: hasValue ? next : 'true',
    consumedNext: hasValue,
  }
}

function normalizeBackendUrl(value) {
  return (value ?? 'http://localhost:8080').replace(/\/+$/, '')
}

function numberFromEnv(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function booleanFlag(value) {
  return value !== 'false' && value !== '0'
}

function createDefaultRunId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const random = Math.random().toString(36).slice(2, 8)
  return `${stamp}-${random}`
}

function normalizeOptionalRunId(value) {
  const text = String(value ?? '').trim()
  if (text.length === 0) return ''
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  if (normalized.length === 0) {
    throw new Error('runId must contain at least one ascii letter, digit, "_" or "-"')
  }
  return normalized
}

function buildIsolatedPageId(basePageId, runId) {
  return `${basePageId}-${runId}`
}

function requireNonEmpty(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value.trim()
}

// ── 后端鉴权与 AI transport ────────────────────────────────

function readString(value, key) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof value[key] === 'string'
    ? value[key]
    : ''
}

async function resolveBackendAuth(options) {
  if (options.backendToken.trim().length > 0) {
    return {
      token: options.backendToken.trim(),
      projectId: options.projectId,
    }
  }

  const response = await fetch(`${options.backendUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': options.tenantId,
      ...(options.projectId.length === 0 ? {} : { 'X-Project-Id': options.projectId }),
    },
    body: JSON.stringify({
      tenantId: options.tenantId,
      username: options.username,
      password: options.password,
    }),
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Java backend login failed: ${response.status} ${text}`)
  }

  const payload = text.trim().length === 0 ? {} : JSON.parse(text)
  const data = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    ? payload.data
    : undefined
  const token = readString(payload, 'token') || readString(data, 'token')
  if (token.trim().length === 0) {
    throw new Error(`Java backend login failed: missing token in ${text}`)
  }

  const defaultProjectId = readString(payload, 'defaultProjectId') || readString(data, 'defaultProjectId')
  return {
    token,
    projectId: options.projectId.length > 0 ? options.projectId : defaultProjectId,
  }
}

function createAuthHeaders(options, auth) {
  const projectId = auth.projectId.trim()
  return {
    Authorization: `Bearer ${auth.token}`,
    'X-Tenant-Id': options.tenantId,
    ...(projectId.length === 0 ? {} : { 'X-Project-Id': projectId }),
  }
}

function createTransport(options, auth) {
  return new AiHostFetchTransport({
    baseUrl: `${options.backendUrl}/api/ai`,
    getHeaders: () => ({
      ...createAuthHeaders(options, auth),
    }),
  })
}

// ── PageConfig 工作区生命周期 ───────────────────────────────

async function deleteBackendAiSession(options, auth, sessionId) {
  const response = await fetch(`${options.backendUrl}/api/ai/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: createAuthHeaders(options, auth),
  })
  if (!response.ok && response.status !== 404) {
    throw new Error(`Delete AI session failed: ${response.status} ${await response.text()}`)
  }
}

function createPageConfigRuntime(options, auth) {
  const apiBaseUrl = `${options.backendUrl}/api`
  const loader = new PageConfigLoader({
    apiBaseUrl,
    pagesConfigBaseUrl: `${apiBaseUrl}/pages-config`,
    fileStorage: 'memory',
    timeout: REQUEST_TIMEOUT,
    getHeaders: () => createAuthHeaders(options, auth),
  })
  const fileApi = new PageConfigFileApi({
    getPageConfigApi: () => '/pages-config',
    http: loader.getHttpClient(),
  })
  const workspace = new PageConfigEditWorkspace({
    fileApi,
    getConfigLoader: () => loader,
  })
  return { loader, workspace }
}

async function prepareTargetPage(workspace, options) {
  const existingPages = await workspace.listPages()
  let exists = existingPages.some((page) => page.pageId === options.pageId)
  if (exists && options.replacePage) {
    await workspace.deletePage(options.pageId)
    exists = false
  }
  if (!exists) {
    await workspace.createPage({
      pageId: options.pageId,
      title: options.pageTitle,
      ...(options.pageIcon.length === 0 ? {} : { icon: options.pageIcon }),
    })
    return 'created'
  }
  return 'reused'
}

async function loadTargetPage(workspace, pageId) {
  workspace.setActivePage(pageId, true)
  await workspace.ensureActivePageFilesLoaded({
    forceReload: true,
    allowMissingAsEmpty: false,
  })
}

function readWorkspaceFiles(documents) {
  return Object.fromEntries(PAGE_CONFIG_FILE_NAMES.map((name) => [name, documents[name].text.value]))
}

function changedFiles(before, after) {
  return Object.keys(after).filter((name) => before[name] !== after[name])
}

async function saveDirtyFiles(workspace) {
  const savedFiles = []
  for (const name of PAGE_CONFIG_FILE_NAMES) {
    if (!workspace.isDocumentDirty(name)) continue
    await workspace.savePageFile(name)
    savedFiles.push(name)
  }
  return savedFiles
}

// ── 文件快照与持久化验收 ───────────────────────────────────

async function readRemoteFiles(loader, pageId) {
  const entries = []
  for (const name of PAGE_CONFIG_FILE_NAMES) {
    const result = await loader.loadPageFileContent(pageId, name, { forceReload: true })
    if (!result.success) {
      throw new Error(`Remote page file verification failed: ${pageId}/${name} (${result.error ?? result.reason ?? 'unknown'})`)
    }
    entries.push([name, result.data ?? ''])
  }
  return Object.fromEntries(entries)
}

function summarizeFiles(files) {
  return Object.fromEntries(Object.entries(files).map(([name, content]) => [name, {
    bytes: Buffer.byteLength(content, 'utf8'),
    lines: content.length === 0 ? 0 : content.split(/\r?\n/).length,
  }]))
}

// ── 请假申请页面 smoke 语义断言 ────────────────────────────

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function dataViewKeysFromNodes(nodes) {
  const keys = []
  for (const node of nodes) {
    const props = isRecord(node.props) ? node.props : {}
    for (const key of ['dataViewKey', 'optionDataViewKey']) {
      if (typeof props[key] === 'string' && props[key].trim().length > 0) {
        keys.push(props[key])
      }
    }
  }
  return keys
}

function tableColumnNames(table) {
  return Array.isArray(table?.columns)
    ? table.columns.filter(isRecord).map((column) => String(column.name ?? ''))
    : []
}

function findLeaveRequestTable(tables, requiredFields) {
  for (const name of ['LeaveRequest', 'LeaveRequests']) {
    if (isRecord(tables[name])) return { name, table: tables[name] }
  }
  for (const [name, table] of Object.entries(tables)) {
    const columns = tableColumnNames(table)
    if (requiredFields.every((field) => columns.includes(field))) {
      return { name, table }
    }
  }
  return null
}

function readDataViewKey(value) {
  if (typeof value !== 'string') return null
  return parseDataViewKey(value.trim())
}

function readTableView(table, viewId) {
  const views = isRecord(table?.views) ? table.views : {}
  return isRecord(views[viewId]) ? views[viewId] : null
}

function readTableViewRows(table, viewId) {
  const view = readTableView(table, viewId)
  if (Array.isArray(view?.rows)) return view.rows
  if (viewId === 'default' && Array.isArray(table?.rows)) return table.rows
  return []
}

function readNodeProps(node) {
  return isRecord(node?.props) ? node.props : {}
}

function statusFilterValue(view) {
  const filter = isRecord(view?.filterExpression) ? view.filterExpression : {}
  const field = typeof filter.field === 'string' ? filter.field : ''
  if (field !== 'status') return ''
  return typeof filter.value === 'string' ? filter.value : ''
}

function isPendingLikeView(viewId, view) {
  const normalized = String(viewId).toLowerCase()
  if (normalized.includes('pending') || normalized.includes('approval') || normalized.includes('approve')) return true
  return statusFilterValue(view) === 'pending'
}

function isPendingStatusPayload(value) {
  return isRecord(value) && value.status === 'pending'
}

function arrayIncludesString(value, item) {
  return Array.isArray(value) && value.includes(item)
}

function copiesFieldFromScope(props, field) {
  if (arrayIncludesString(props.inheritFields, field)) return true
  const map = isRecord(props.inheritFieldMap) ? props.inheritFieldMap : {}
  if (typeof map[field] === 'string' && map[field].trim().length > 0) return true
  return Object.values(map).includes(field)
}

function validateSubmitClosure(nodes, tables, leaveTableName, leaveTable, requiredFields) {
  const formNodes = nodes.filter((node) => node.type === 'r-form')
  const primaryForm = formNodes.find((node) => typeof readNodeProps(node).dataViewKey === 'string') ?? formNodes[0] ?? null
  const formProps = readNodeProps(primaryForm)
  const formKey = readDataViewKey(formProps.dataViewKey)
  const formBindsDraftView = formKey !== null && formKey.tableName === leaveTableName && formKey.viewId === 'default'
  const draftRows = readTableViewRows(leaveTable, 'default')
  const draftRowsUsable = draftRows.length > 0

  const submitButtons = nodes.filter((node) => {
    if (node.type !== 'r-button') return false
    const props = readNodeProps(node)
    const label = typeof props.label === 'string' ? props.label : ''
    return label.includes('提交') || props.action === 'append-row' || props.action === 'submit-current-form'
  })

  const candidateClosures = submitButtons.map((node) => {
    const props = readNodeProps(node)
    const target = readDataViewKey(props.dataViewKey)
    const targetTable = target === null ? null : tables[target.tableName]
    const targetView = targetTable === undefined || target === null ? null : readTableView(targetTable, target.viewId)
    const missingInheritedFields = requiredFields.filter((field) => !copiesFieldFromScope(props, field))
    return {
      id: typeof node.id === 'string' ? node.id : null,
      action: typeof props.action === 'string' ? props.action : null,
      label: typeof props.label === 'string' ? props.label : null,
      dataViewKey: typeof props.dataViewKey === 'string' ? props.dataViewKey : null,
      targetTableName: target?.tableName ?? null,
      targetViewId: target?.viewId ?? null,
      targetViewExists: targetView !== null,
      targetIsPending: target !== null && target.tableName === leaveTableName && targetView !== null && isPendingLikeView(target.viewId, targetView),
      copiesAllRequiredFields: missingInheritedFields.length === 0,
      missingInheritedFields,
      appendPayloadHasPendingStatus: isPendingStatusPayload(props.appendPayload),
      hasThenResetDraft: isRecord(props.then)
        && props.then.action === 'patch-current'
        && props.then.dataViewKey === `${leaveTableName}@default`
        && isRecord(props.then.patch),
    }
  })

  const appendClosure = candidateClosures.find((item) =>
    item.action === 'append-row'
    && formBindsDraftView
    && draftRowsUsable
    && item.targetIsPending
    && item.copiesAllRequiredFields
    && item.appendPayloadHasPendingStatus,
  ) ?? null

  return {
    ok: appendClosure !== null,
    formBindsDraftView,
    draftRowsUsable,
    draftRowCount: draftRows.length,
    submitButtonCount: submitButtons.length,
    appendClosure,
    candidateClosures,
  }
}

function validateLeaveTypeOptions(nodes, tables) {
  const selectNodes = nodes.filter((node) => {
    if (node.type !== 'r-select' || !isRecord(node.props)) return false
    const field = typeof node.props.field === 'string' ? node.props.field : ''
    return ['leaveType', 'leaveTypeId', 'type'].includes(field)
  })
  const bindings = []
  let hasStaticOptions = false
  for (const node of selectNodes) {
    const props = isRecord(node.props) ? node.props : {}
    if (Array.isArray(props.options) && props.options.length > 0) {
      hasStaticOptions = true
    }
    const parsed = readDataViewKey(props.optionDataViewKey)
    if (parsed === null) continue
    const table = isRecord(tables[parsed.tableName]) ? tables[parsed.tableName] : null
    const view = table === null ? null : readTableView(table, parsed.viewId)
    const staticTableNeedsRows = table !== null && table.resourceType === 'static-data'
    const rowCount = Array.isArray(view?.rows) ? view.rows.length : 0
    bindings.push({
      nodeId: typeof node.id === 'string' ? node.id : null,
      optionDataViewKey: props.optionDataViewKey,
      tableName: parsed.tableName,
      viewId: parsed.viewId,
      tableExists: table !== null,
      viewExists: view !== null,
      rowCount,
      usable: table !== null && view !== null && (!staticTableNeedsRows || rowCount > 0),
    })
  }
  return {
    ok: selectNodes.length > 0 && (hasStaticOptions || bindings.some((binding) => binding.usable)),
    selectCount: selectNodes.length,
    hasStaticOptions,
    bindings,
  }
}

function validateGeneratedLeaveRequestPage(files) {
  const issues = []
  const rule = parsePageDesignJsonFile(files, 'rule.json')
  const pagedata = parsePageDesignJsonFile(files, 'pagedata.json')
  if (!rule.ok) issues.push(`rule.json is not valid JSON: ${rule.error}`)
  if (!pagedata.ok) issues.push(`pagedata.json is not valid JSON: ${pagedata.error}`)
  if (!rule.ok || !pagedata.ok) {
    return { ok: false, issues }
  }

  const nodes = flattenPageDesignSparkNodes(rule.data)
  const tables = isRecord(pagedata.data.tables) ? pagedata.data.tables : {}
  const tableNames = Object.keys(tables)
  const requiredFields = ['applicantName', 'leaveType', 'startDate', 'endDate', 'days', 'reason']
  const leaveTableEntry = findLeaveRequestTable(tables, requiredFields)
  const leaveTableName = leaveTableEntry?.name ?? 'LeaveRequest'
  const leaveTable = leaveTableEntry?.table ?? null
  const leaveColumns = tableColumnNames(leaveTable)
  const boundFields = nodes
    .map((node) => isRecord(node.props) && typeof node.props.field === 'string' ? node.props.field : '')
    .filter((field) => field.length > 0)
  const formNodes = nodes.filter((node) => node.type === 'r-form')
  const primaryForm = formNodes.find((node) => isRecord(node.props) && typeof node.props.dataViewKey === 'string') ?? formNodes[0] ?? null
  const primaryFormProps = isRecord(primaryForm?.props) ? primaryForm.props : {}
  const dataViewKeys = dataViewKeysFromNodes(nodes)
  const invalidDataViewKeys = dataViewKeys.filter((key) => readDataViewKey(key) === null)
  const leaveTypeOptions = validateLeaveTypeOptions(nodes, tables)
  const submitClosure = leaveTable === null
    ? { ok: false, formBindsDraftView: false, draftRowsUsable: false, draftRowCount: 0, submitButtonCount: 0, appendClosure: null, candidateClosures: [] }
    : validateSubmitClosure(nodes, tables, leaveTableName, leaveTable, requiredFields)

  if (leaveTable === null) issues.push('pagedata.json missing LeaveRequest/LeaveRequests table')
  for (const field of requiredFields) {
    if (!leaveColumns.includes(field)) issues.push(`${leaveTableName} missing column: ${field}`)
    if (!boundFields.includes(field)) issues.push(`rule.json missing field binding: ${field}`)
  }
  if (formNodes.length === 0) issues.push('rule.json missing r-form node')
  if (primaryForm !== null && primaryFormProps.dataViewKey !== `${leaveTableName}@default`) {
    issues.push(`r-form dataViewKey must be ${leaveTableName}@default, got ${String(primaryFormProps.dataViewKey ?? '<missing>')}`)
  }
  if (primaryForm !== null && primaryFormProps.contextDataMember !== 'currentRow') {
    issues.push(`r-form contextDataMember must be currentRow, got ${String(primaryFormProps.contextDataMember ?? '<missing>')}`)
  }
  if (!leaveTypeOptions.ok) {
    issues.push('rule.json missing usable leave type options: bind r-select to an existing optionDataViewKey table/view or provide static options')
  }
  if (!submitClosure.formBindsDraftView) {
    issues.push(`r-form must bind the editable draft view ${leaveTableName}@default`)
  }
  if (!submitClosure.draftRowsUsable) {
    issues.push(`${leaveTableName}@default must include one editable draft currentRow before UI generation`)
  }
  if (!submitClosure.ok) {
    issues.push('submit button does not close the application flow: use r-button action=append-row inside the form, copy form fields with inheritFields/inheritFieldMap, append status=pending, and target the pending/approval view')
  }
  for (const key of invalidDataViewKeys) issues.push(`invalid dataViewKey format: ${key}`)

  return {
    ok: issues.length === 0,
    issues,
    tableNames,
    leaveTableName,
    formCount: formNodes.length,
    formId: typeof primaryForm?.id === 'string' ? primaryForm.id : null,
    formDataViewKey: typeof primaryFormProps.dataViewKey === 'string' ? primaryFormProps.dataViewKey : null,
    formContextDataMember: typeof primaryFormProps.contextDataMember === 'string' ? primaryFormProps.contextDataMember : null,
    boundFields,
    requiredFields,
    dataViewKeys,
    invalidDataViewKeys,
    leaveTypeOptions,
    submitClosure,
  }
}

// ── Agent ⇄ LLM 对话诊断输出 ───────────────────────────────

function parseJsonMaybe(value) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function formatMessageForTrace(message, limit) {
  const toolCalls = Array.isArray(message.tool_calls)
    ? ` tool_calls=${message.tool_calls.map((call) => call.function?.name ?? 'unknown').join(',')}`
    : ''
  const toolCallId = typeof message.tool_call_id === 'string' ? ` tool_call_id=${message.tool_call_id}` : ''
  return `${message.role}${toolCalls}${toolCallId}:\n${previewAiHostDiagnosticValue(message.content ?? '', limit)}`
}

function createConversationTracer(options) {
  if (!options.traceConversation) {
    return {
      onSseEvent: () => undefined,
      onDelta: () => undefined,
      onReasoning: () => undefined,
    }
  }
  const limit = Math.floor(options.traceContentLimit)
  let firstPromptLogged = false

  function write(title, body) {
    console.error(`\n[page-design-smoke trace] ${title}\n${body}`)
  }

  return {
    onDelta: (delta) => {
      if (delta.trim().length === 0) return
      write('LLM => AGENT delta', previewAiHostDiagnosticValue(delta, limit))
    },
    onReasoning: (reasoning) => {
      if (reasoning.trim().length === 0) return
      write('LLM => AGENT reasoning', previewAiHostDiagnosticValue(reasoning, limit))
    },
    onSseEvent: (event) => {
      const data = parseJsonMaybe(event.data)
      if (event.type === 'llm-request' && data !== null && typeof data === 'object') {
        const tools = Array.isArray(data.tools)
          ? data.tools.map((tool) => tool.function?.name ?? 'unknown').join(', ')
          : ''
        const messages = Array.isArray(data.messages)
          ? data.messages.map((message, index) => `#${index + 1} ${formatMessageForTrace(message, limit)}`).join('\n\n')
          : ''
        const prompt = typeof data.systemPrompt === 'string'
          ? (options.traceFullPrompt || !firstPromptLogged ? previewAiHostDiagnosticValue(data.systemPrompt, limit) : `<same session prompt, ${data.systemPrompt.length} chars>`)
          : ''
        firstPromptLogged = true
        write(
          `AGENT => LLM request round=${data.round ?? '?'} session=${data.sessionId ?? ''}`,
          [
            `tools: ${tools}`,
            `systemPrompt:\n${prompt}`,
            `messages:\n${messages}`,
          ].join('\n\n'),
        )
        return
      }

      if (event.type === 'result' && data !== null && typeof data === 'object') {
        const toolCalls = Array.isArray(data.toolCalls)
          ? data.toolCalls.map((call, index) => {
              const name = call.function?.name ?? 'unknown'
              const args = parseJsonMaybe(call.function?.arguments ?? '')
              return `#${index + 1} ${name}\n${previewAiHostDiagnosticValue(args, limit)}`
            }).join('\n\n')
          : ''
        write(
          'LLM => AGENT result',
          [
            typeof data.text === 'string' && data.text.trim().length > 0 ? `text:\n${previewAiHostDiagnosticValue(data.text, limit)}` : 'text: <empty>',
            toolCalls.trim().length > 0 ? `tool_calls:\n${toolCalls}` : 'tool_calls: <none>',
          ].join('\n\n'),
        )
        return
      }

      if (event.type === 'tool-result') {
        write(
          `AGENT TOOL => LLM module=${event.scope?.eventModuleId ?? ''}`,
          previewAiHostDiagnosticValue(data, limit),
        )
      }
    },
  }
}

// ── Smoke 主流程 ────────────────────────────────────────────

async function runSmoke(options) {
  // 1. 登录 Java 后端，拿到 SPARK 业务 token。
  const auth = await resolveBackendAuth(options)

  // 2. 准备目标租户/应用/页面配置工作区，注册 pageDesign 模块。
  const pageConfig = createPageConfigRuntime(options, auth)
  const pageStatus = await prepareTargetPage(pageConfig.workspace, options)
  await loadTargetPage(pageConfig.workspace, options.pageId)
  const workspace = pageConfig.workspace
  const before = readWorkspaceFiles(workspace.documents)
  const host = workspace.createPageDesignEditHost()
  const sessionId = `${PAGE_DESIGN_MODULE_ID}:${options.pageId}`

  if (options.replacePage) {
    await deleteBackendAiSession(options, auth, sessionId)
  }

  const registry = new AiHostBusinessRegistry()
  registerPageDesignBusiness({
    registry,
    getPageDesignEditHost: () => host,
  })

  // 3. 启动 Spark AI Host 会话；bootstrap / SSE / tool loop 都归 spark-ai 接管。
  const transport = createTransport(options, auth)
  const session = createAiHostBusinessSession({
    registry,
    transport,
    maxToolRounds: options.maxRounds,
  }, new AiHostBusinessTarget(PAGE_DESIGN_MODULE_ID, options.pageId))

  const textDeltas = []
  const reasoningDeltas = []
  let latestResultText = ''
  const usages = []
  const sseEvents = []
  let sseEventCount = 0
  const tracer = createConversationTracer(options)

  await session.start()

  // 4. 输入真实用户需求；后续由 pageDesign + module-semantic 工具链完成。
  await session.send({
    historyMsgs: [{ role: 'user', content: options.requestText }],
    onDelta: (delta) => {
      textDeltas.push(delta)
      tracer.onDelta(delta)
    },
    onReasoning: (reasoning) => {
      reasoningDeltas.push(reasoning)
      tracer.onReasoning(reasoning)
    },
    onUsage: (usage) => usages.push(usage),
    onSseEvent: (event) => {
      sseEventCount += 1
      if (options.printSseEvents) sseEvents.push(event)
      tracer.onSseEvent(event)
      const data = parseJsonMaybe(event.data)
      if (event.type === 'result' && data !== null && typeof data === 'object' && typeof data.text === 'string') {
        latestResultText = data.text
      }
    },
  })

  // 5. 只做成果验收：保存脏文件、校验远端持久化、读取 spark-ai 会话历史。
  const after = readWorkspaceFiles(workspace.documents)
  const touchedFiles = changedFiles(before, after)
  const savedFiles = await saveDirtyFiles(workspace)
  const remoteFiles = await readRemoteFiles(pageConfig.loader, options.pageId)
  const verifiedFiles = PAGE_CONFIG_FILE_NAMES.map((name) => ({
    name,
    saved: savedFiles.includes(name),
    changed: touchedFiles.includes(name),
    matchesRemote: after[name] === remoteFiles[name],
  }))
  const sessionRecord = session.getSessionRecord()
  const sessionSummary = summarizeAiHostSessionRecord(sessionRecord)
  const assistantText = sessionSummary.lastAssistantText || textDeltas.join('').trim() || latestResultText.trim()
  const hitRoundLimit = assistantText.includes('工具调用轮次已达上限')
  const filesPersisted = verifiedFiles.every((item) => item.matchesRemote)
  const artifactValidation = validateGeneratedLeaveRequestPage(after)
  const payloadGuideValidation = validatePageDesignPayloadGuidesFromSession(after, sessionRecord)
  const result = {
    ok: !hitRoundLimit && filesPersisted && savedFiles.length > 0 && artifactValidation.ok && payloadGuideValidation.ok,
    tenantId: options.tenantId,
    projectId: auth.projectId,
    basePageId: options.basePageId,
    pageId: options.pageId,
    isolateSession: options.isolateSession,
    runId: options.runId,
    pageTitle: options.pageTitle,
    pageStatus,
    requestText: options.requestText,
    sessionId: session.sessionId,
    pageConfigApi: `${options.backendUrl}/api/pages-config/${encodeURIComponent(options.pageId)}`,
    pageConfigDir: `spark-ai-server/data/pages-config/${options.tenantId}/${auth.projectId}/${options.pageId}`,
    sessionSummary,
    changedFiles: touchedFiles,
    savedFiles,
    verifiedFiles,
    fileSummary: summarizeFiles(after),
    artifactValidation,
    payloadGuideValidation,
    hitRoundLimit,
    filesPersisted,
    assistantText,
    reasoningText: reasoningDeltas.join('').trim(),
    usages,
    sseEventCount,
    ...(options.printSseEvents ? { sseEvents } : {}),
    ...(options.printFiles ? { files: after } : {}),
  }
  return result
}

runSmoke(parseArgs(process.argv.slice(2))).then((result) => {
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(2)
}).catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
  process.exit(1)
})
