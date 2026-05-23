#!/usr/bin/env node
/**
 * Thin live LLM test for pageDesign.
 *
 * The script only wires the real Spark AI boundary:
 * 1. log in and get backend token
 * 2. register the pageDesign module
 * 3. start the business session
 * 4. send "实现请假申请页面设计"
 * 5. read backend session history and verify generated four-file artifacts
 */

// PAGE_DESIGN_AI_TRACE[live-llm-entry]: 真实“请假申请页面设计”AI 线评测入口；只装配登录、pageDesign 注册、AiHost 会话和验收，不承载业务生成逻辑。
import {
  AiHostBusinessRegistry,
  AiHostBusinessTarget,
  AiHostFetchTransport,
  createAiHostBusinessSession,
} from '@spark-view/spark-ai/host'
import {
  PAGE_DESIGN_MODULE_ID,
  registerPageDesignBusiness,
} from '@spark-view/spark-page-config/ai'
import {
  PAGE_CONFIG_FILE_NAMES,
  PageConfigFileApi,
  PageConfigLoader,
  compileRule,
  parsePageData,
} from '@spark-view/spark-page-config/config'
import { PageConfigEditWorkspace } from '@spark-view/spark-page-config/design'
import { parseDataViewKey } from '@spark-view/spark-data'

const DEFAULT_BACKEND_URL = 'http://localhost:8080'
const DEFAULT_TENANT_ID = 'lmspark'
const DEFAULT_PROJECT_ID = 'homepage'
const DEFAULT_USERNAME = 'admin'
const DEFAULT_PASSWORD = 'admin123'
const DEFAULT_PAGE_ID = 'ai-leave-request-llm-smoke'
const DEFAULT_PAGE_TITLE = '请假申请 LLM Smoke'
const DEFAULT_PAGE_ICON = 'Document'
const DEFAULT_REQUEST_TEXT = '实现请假申请页面设计'
const DEFAULT_MAX_TOOL_ROUNDS = 40
const DEFAULT_TURN_TIMEOUT_MS = 240_000
const REQUEST_TIMEOUT = 30_000

function parseArgs(argv) {
  const options = {
    backendUrl: normalizeBackendUrl(process.env.AI_BACKEND_URL ?? DEFAULT_BACKEND_URL),
    tenantId: process.env.AI_TENANT_ID ?? DEFAULT_TENANT_ID,
    projectId: process.env.AI_PROJECT_ID ?? process.env.AI_APP_ID ?? DEFAULT_PROJECT_ID,
    username: process.env.AI_USERNAME ?? DEFAULT_USERNAME,
    password: process.env.AI_PASSWORD ?? DEFAULT_PASSWORD,
    backendToken: process.env.SPARK_AUTH_TOKEN ?? process.env.SPARK_BACKEND_TOKEN ?? '',
    pageId: process.env.AI_PAGE_ID ?? DEFAULT_PAGE_ID,
    basePageId: process.env.AI_PAGE_ID ?? DEFAULT_PAGE_ID,
    isolateSession: process.env.AI_ISOLATE_SESSION === undefined ? true : process.env.AI_ISOLATE_SESSION !== '0',
    runId: process.env.AI_RUN_ID ?? '',
    pageTitle: process.env.AI_PAGE_TITLE ?? DEFAULT_PAGE_TITLE,
    pageIcon: process.env.AI_PAGE_ICON ?? DEFAULT_PAGE_ICON,
    requestText: process.env.AI_PAGE_REQUEST ?? DEFAULT_REQUEST_TEXT,
    replacePage: process.env.AI_REPLACE_PAGE === undefined ? true : process.env.AI_REPLACE_PAGE !== '0',
    maxToolRounds: numberFromEnv(process.env.AI_MAX_TOOL_ROUNDS, DEFAULT_MAX_TOOL_ROUNDS),
    turnTimeoutMs: numberFromEnv(process.env.AI_TURN_TIMEOUT_MS, DEFAULT_TURN_TIMEOUT_MS),
    printConversation: process.env.AI_PRINT_CONVERSATION === '1',
    printFiles: process.env.AI_PRINT_FILES === '1',
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const parsed = parseOption(argv, index)
    if (parsed === null) continue
    const { key, value, consumedNext } = parsed
    if (consumedNext) index += 1

    switch (key) {
      case 'h':
      case 'help':
        options.help = true
        break
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
      case 'request':
        options.requestText = value
        break
      case 'replace-page':
        options.replacePage = booleanFlag(value)
        break
      case 'no-replace-page':
        options.replacePage = false
        break
      case 'max-rounds':
      case 'max-tool-rounds':
        options.maxToolRounds = Number(value)
        break
      case 'turn-timeout-ms':
        options.turnTimeoutMs = Number(value)
        break
      case 'print-conversation':
        options.printConversation = booleanFlag(value)
        break
      case 'print-files':
        options.printFiles = booleanFlag(value)
        break
      default:
        throw new Error(`Unknown option: --${key}`)
    }
  }

  if (options.help) return options
  options.backendUrl = requireNonEmpty(options.backendUrl, 'backendUrl')
  options.tenantId = requireNonEmpty(options.tenantId, 'tenantId')
  options.projectId = options.projectId.trim()
  options.username = options.username.trim()
  options.password = options.password.trim()
  options.backendToken = options.backendToken.trim()
  options.pageId = requireNonEmpty(options.pageId, 'pageId')
  options.basePageId = options.pageId
  options.runId = normalizeOptionalRunId(options.runId)
  if (options.isolateSession) {
    options.runId = options.runId || createDefaultRunId()
    options.pageId = buildIsolatedPageId(options.basePageId, options.runId)
  }
  options.pageTitle = requireNonEmpty(options.pageTitle, 'pageTitle')
  options.pageIcon = options.pageIcon.trim()
  options.requestText = requireNonEmpty(options.requestText, 'requestText')
  if (!Number.isFinite(options.maxToolRounds) || options.maxToolRounds <= 0) {
    throw new Error('maxToolRounds must be a positive number')
  }
  if (!Number.isFinite(options.turnTimeoutMs) || options.turnTimeoutMs <= 0) {
    throw new Error('turnTimeoutMs must be a positive number')
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
    return { key: body.slice(0, eq), value: body.slice(eq + 1), consumedNext: false }
  }
  const next = argv[index + 1]
  const hasValue = typeof next === 'string' && !next.startsWith('--')
  return { key: body, value: hasValue ? next : 'true', consumedNext: hasValue }
}

function printHelp() {
  console.log([
    'Live LLM pageDesign test for leave-request page design.',
    '',
    'Usage:',
    '  pnpm run verify:ai:page-design-leave:llm',
    '  node --import tsx scripts/verify-page-design-leave-llm-live.mjs [options]',
    '',
    'Options:',
    '  --backend-url <url>       Default: http://localhost:8080',
    '  --tenant-id <id>          Default: lmspark',
    '  --project-id <id>         Default: homepage',
    '  --username <name>         Default: admin',
    '  --password <password>     Default: admin123',
    '  --backend-token <token>   Use an existing backend auth token',
    '  --page-id <id>            Default: ai-leave-request-llm-smoke',
    '  --no-isolate-session      Reuse the exact pageId/sessionId instead of adding a run suffix',
    '  --run-id <id>             Stable suffix when session isolation is enabled',
    '  --request <text>          Default: 实现请假申请页面设计',
    '  --no-replace-page         Reuse the target page instead of replacing it',
    '  --max-tool-rounds <n>     Default: 40',
    '  --turn-timeout-ms <n>     Default: 240000',
    '  --print-conversation      Include backend conversation in JSON output',
    '  --print-files             Include generated four-file content in JSON output',
    '  --help                    Show this help',
    '',
    'The Java backend must already be running and configured with a real LLM.',
  ].join('\n'))
}

function normalizeBackendUrl(value) {
  return String(value ?? DEFAULT_BACKEND_URL).replace(/\/+$/, '')
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

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readString(value, key) {
  return isRecord(value) && typeof value[key] === 'string' ? value[key] : ''
}

// PAGE_DESIGN_AI_TRACE[live-auth]: live LLM 评测只在这里登录/接收外部 token；后续所有 AI/page-config 请求复用同一组前端鉴权头。
async function resolveBackendAuth(options) {
  if (options.backendToken.length > 0) {
    return { token: options.backendToken, projectId: options.projectId }
  }

  let response
  try {
    response = await fetch(`${options.backendUrl}/api/auth/login`, {
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
  } catch (error) {
    throw new Error(
      `Java AI backend is not reachable at ${options.backendUrl}. `
      + 'Start spark-ai-server first and configure its LLM environment. '
      + `Fetch error: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Java backend login failed: ${response.status} ${text}`)
  }

  const payload = text.trim().length === 0 ? {} : JSON.parse(text)
  const data = isRecord(payload) ? payload.data : undefined
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

// PAGE_DESIGN_AI_TRACE[live-page-workspace]: live 评测把真实 pages-config API 包装成 PageConfigEditWorkspace，pageDesign 工具只改这个前端 workspace。
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

function createTransport(options, auth) {
  return new AiHostFetchTransport({
    baseUrl: `${options.backendUrl}/api/ai`,
    getHeaders: () => ({
      ...createAuthHeaders(options, auth),
    }),
  })
}

function toBackendWireScope(scope) {
  // Frontend Host keeps businessRegistrationId/businessInstanceId internally;
  // Java wire scope is v4 moduleId/moduleInstanceId.
  return {
    moduleId: scope.businessRegistrationId,
    moduleInstanceId: scope.businessInstanceId,
    instanceId: scope.instanceId,
    runtimeInstanceId: scope.runtimeInstanceId,
  }
}

async function prepareTargetPage(workspace, options) {
  const pages = await workspace.listPages()
  let exists = pages.some((page) => page.pageId === options.pageId)
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

function createWorkspaceHost(workspace) {
  const documents = workspace.documents
  return {
    getNodeTree: () => documents['rule.json'].model.value,
    onNodeTreeChanged: (nodeTree) => {
      documents['rule.json'].replaceModel(nodeTree)
    },
    getDataSetTool: () => documents['pagedata.json'].model.value,
    onDataSetChanged: (tool) => {
      documents['pagedata.json'].replaceModel(tool)
    },
    readScript: () => documents['script.js'].text.value,
    writeScript: (content) => {
      documents['script.js'].setText(content)
    },
    readStyle: () => documents['style.css'].text.value,
    writeStyle: (content) => {
      documents['style.css'].setText(content)
    },
  }
}

function readWorkspaceFiles(documents) {
  return Object.fromEntries(PAGE_CONFIG_FILE_NAMES.map((name) => [name, documents[name].text.value]))
}

function changedFiles(before, after) {
  return Object.keys(after).filter((name) => before[name] !== after[name])
}

async function saveDirtyFiles(workspace) {
  const saved = []
  for (const name of PAGE_CONFIG_FILE_NAMES) {
    if (!workspace.isDocumentDirty(name)) continue
    await workspace.savePageFile(name)
    saved.push(name)
  }
  return saved
}

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

async function readBackendConversation(options, auth, sessionId) {
  const response = await fetch(`${options.backendUrl}/api/ai/sessions/${encodeURIComponent(sessionId)}/conversation`, {
    method: 'GET',
    headers: createAuthHeaders(options, auth),
  })
  if (!response.ok) {
    throw new Error(`Read AI session conversation failed: ${response.status} ${await response.text()}`)
  }
  const payload = await response.json()
  const data = unwrapApiEnvelopeData(payload)
  if (Array.isArray(data?.conversation)) return data.conversation
  if (Array.isArray(payload?.conversation)) return payload.conversation
  if (Array.isArray(data?.history)) return data.history
  if (Array.isArray(payload?.history)) return payload.history
  return []
}

function unwrapApiEnvelopeData(payload) {
  if (!isRecord(payload) || typeof payload.ok !== 'boolean' || !Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return payload
  }
  if (payload.ok) return payload.data
  const error = isRecord(payload.error) ? payload.error : {}
  const message = typeof error.message === 'string' ? error.message : 'AI API request failed'
  throw new Error(message)
}

async function deleteBackendSession(options, auth, sessionId) {
  const response = await fetch(`${options.backendUrl}/api/ai/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: createAuthHeaders(options, auth),
  })
  if (!response.ok && response.status !== 404) {
    throw new Error(`Delete AI session failed: ${response.status} ${await response.text()}`)
  }
}

// PAGE_DESIGN_AI_TRACE[live-session-reset]: 每次 live 用 reuseScopeSession:false 预建同名 V4 session，避免 Java 后端复用旧会话历史污染评测。
async function createBackendSession(options, auth, sessionId, scope) {
  const response = await fetch(`${options.backendUrl}/api/ai/sessions`, {
    method: 'POST',
    headers: {
      ...createAuthHeaders(options, auth),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      protocolVersion: 4,
      sessionId,
      systemPrompt: 'pageDesign live LLM session reset',
      messages: [],
      tools: [],
      mode: 'function',
      windowSize: options.maxToolRounds,
      scope: toBackendWireScope(scope),
      reuseScopeSession: false,
    }),
  })
  if (!response.ok) {
    throw new Error(`Create AI session failed: ${response.status} ${await response.text()}`)
  }
  const payload = await response.json()
  const data = unwrapApiEnvelopeData(payload)
  const createdSessionId = readString(data, 'sessionId') || readString(payload, 'sessionId')
  if (createdSessionId.length > 0 && createdSessionId !== sessionId) {
    throw new Error(`Create AI session returned unexpected sessionId: ${createdSessionId}`)
  }
}

async function sendDemand(session, requestText, timeoutMs, callbacks) {
  const controller = new AbortController()
  const startedAt = Date.now()
  const timer = setTimeout(() => controller.abort(), Math.floor(timeoutMs))
  try {
    await session.send({
      historyMsgs: [{ role: 'user', content: requestText }],
      signal: controller.signal,
      ...callbacks,
    })
    return { ok: true, aborted: false, durationMs: Date.now() - startedAt }
  } catch (error) {
    return {
      ok: false,
      aborted: controller.signal.aborted,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}

function samePersistedText(left, right) {
  return String(left ?? '').replace(/\r\n/g, '\n') === String(right ?? '').replace(/\r\n/g, '\n')
}

function summarizeFiles(files) {
  return Object.fromEntries(Object.entries(files).map(([name, content]) => [name, {
    bytes: Buffer.byteLength(content, 'utf8'),
    lines: content.length === 0 ? 0 : content.split(/\r?\n/).length,
  }]))
}

function summarizeConversation(conversation) {
  const roleCounts = {}
  const toolNames = []
  let lastAssistantText = ''

  for (const message of conversation) {
    if (!isRecord(message)) continue
    const role = typeof message.role === 'string' ? message.role : 'unknown'
    roleCounts[role] = (roleCounts[role] ?? 0) + 1
    if (role === 'assistant' && typeof message.content === 'string' && message.content.trim().length > 0) {
      lastAssistantText = message.content.trim()
    }
    const toolCalls = Array.isArray(message.tool_calls)
      ? message.tool_calls
      : (Array.isArray(message.toolCalls) ? message.toolCalls : [])
    if (toolCalls.length > 0) {
      for (const call of toolCalls) {
        if (isRecord(call) && isRecord(call.function) && typeof call.function.name === 'string') {
          toolNames.push(call.function.name)
        }
      }
    }
  }

  return {
    messageCount: conversation.length,
    roleCounts,
    toolCallCount: toolNames.length,
    toolNames,
    lastAssistantText,
  }
}

function summarizeDiagnosticEvents(events) {
  const llmRequests = []
  const llmAppends = []

  for (const event of events) {
    const payload = parseEventData(event.data)
    if (!isRecord(payload)) continue
    if (event.type === 'llm-request') {
      const tools = Array.isArray(payload.tools) ? payload.tools : []
      const messages = Array.isArray(payload.messages) ? payload.messages : []
      llmRequests.push({
        round: typeof payload.round === 'number' ? payload.round : null,
        sessionId: readString(payload, 'sessionId') || null,
        turnId: readString(payload, 'turnId') || null,
        toolCount: tools.length,
        toolNames: tools.map(readTransportToolName).filter(Boolean).slice(0, 40),
        messageCount: messages.length,
        messageRoles: messages.map(readMessageRole).filter(Boolean),
        systemPromptBytes: Buffer.byteLength(String(payload.systemPrompt ?? ''), 'utf8'),
      })
    }
    if (event.type === 'llm-append') {
      const messages = Array.isArray(payload.messages) ? payload.messages : []
      llmAppends.push({
        sessionId: readString(payload, 'sessionId') || null,
        turnId: readString(payload, 'turnId') || null,
        messageCount: messages.length,
        messageRoles: messages.map(readMessageRole).filter(Boolean),
        toolCallNames: messages.flatMap(readMessageToolCallNames).slice(0, 40),
      })
    }
  }

  return {
    llmRequestCount: llmRequests.length,
    llmAppendCount: llmAppends.length,
    llmRequests,
    llmAppends,
  }
}

function parseEventData(data) {
  const text = String(data ?? '')
  if (text.trim().length === 0) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function readTransportToolName(tool) {
  return isRecord(tool) && isRecord(tool.function) && typeof tool.function.name === 'string'
    ? tool.function.name
    : ''
}

function readMessageRole(message) {
  return isRecord(message) && typeof message.role === 'string' ? message.role : ''
}

function readMessageToolCallNames(message) {
  if (!isRecord(message)) return []
  const toolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls
    : (Array.isArray(message.toolCalls) ? message.toolCalls : [])
  return toolCalls.map(readTransportToolName).filter(Boolean)
}

function summarizeSseEvents(events) {
  const interesting = events
    .filter((event) => event.type === 'result' || event.type === 'error' || event.type === 'done')
    .map((event) => ({
      type: event.type,
      turnKey: event.turnKey ?? null,
      streamKey: event.streamKey ?? null,
      data: summarizeText(event.data, 3000),
    }))
  return {
    count: events.length,
    types: [...new Set(events.map((event) => event.type))],
    interesting,
  }
}

function summarizeText(value, maxLength) {
  const text = String(value ?? '')
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...<truncated ${text.length - maxLength} chars>`
}

function flattenSparkNodes(value) {
  if (Array.isArray(value)) return value.flatMap(flattenSparkNodes)
  if (!isRecord(value)) return []
  const children = flattenSparkNodes(value.children)
  return typeof value.type === 'string' ? [value, ...children] : children
}

function collectStringProps(value, names, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectStringProps(item, names, out)
    return out
  }
  if (!isRecord(value)) return out
  for (const [key, child] of Object.entries(value)) {
    if (names.has(key) && typeof child === 'string' && child.trim().length > 0) {
      out.push(child.trim())
    }
    collectStringProps(child, names, out)
  }
  return out
}

const FIELD_GROUPS = {
  applicant: ['applicant', 'employee', 'user', 'name', '申请人', '员工', '姓名'],
  leaveType: ['leaveType', 'type', 'category', '请假类型', '假别', '类型'],
  startDate: ['startDate', 'beginDate', 'fromDate', 'start', 'begin', '开始', '起始'],
  endDate: ['endDate', 'toDate', 'finishDate', 'end', '结束', '截止'],
  days: ['days', 'duration', 'dayCount', 'hours', '天数', '时长'],
  reason: ['reason', 'cause', 'remark', 'description', '事由', '原因', '说明'],
  status: ['status', 'state', 'approvalStatus', 'flowStatus', '状态', '审批'],
}

function includesAny(text, keywords) {
  const haystack = String(text ?? '').toLowerCase()
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))
}

function matchGroups(texts) {
  return Object.fromEntries(Object.entries(FIELD_GROUPS).map(([group, keywords]) => [
    group,
    texts.some((text) => includesAny(text, keywords)),
  ]))
}

function trueCount(record) {
  return Object.values(record).filter(Boolean).length
}

function columnText(column) {
  return [column.name, column.label].filter(Boolean).join(' ')
}

function tableText(table) {
  return [
    table.tableName,
    table.resourceType,
    table.resourceId,
    table.businessCategory,
    ...table.columns.map(columnText),
  ].filter(Boolean).join(' ')
}

function nodeText(node) {
  const props = isRecord(node.props) ? node.props : {}
  return [
    node.type,
    node.id,
    props.field,
    props.label,
    props.title,
    props.placeholder,
    props.description,
    props.action,
  ].filter(Boolean).join(' ')
}

function findLeaveTable(dataSet) {
  return Object.values(dataSet.tables)
    .map((table) => {
      const groups = matchGroups([tableText(table)])
      const nameScore = includesAny(table.tableName, ['leave', 'vacation', 'absence', '请假', '休假']) ? 2 : 0
      return { table, groups, score: trueCount(groups) + nameScore }
    })
    .sort((a, b) => b.score - a.score)[0] ?? null
}

function hasLeaveTypeOptions(dataSet, nodes) {
  const tableHasOptions = Object.values(dataSet.tables).some((table) => {
    const rowsText = Object.values(table.views).flatMap((view) => view.rows).map((row) => JSON.stringify(row)).join(' ')
    return includesAny(tableText(table), ['leave type', 'leavetype', '请假类型', '假别'])
      || includesAny(rowsText, ['annual', 'sick', 'personal', '年假', '病假', '事假', '调休'])
  })
  const selectHasOptions = nodes.some((node) => {
    const props = isRecord(node.props) ? node.props : {}
    return node.type === 'r-select' && (
      Array.isArray(props.options)
      || typeof props.optionDataViewKey === 'string'
      || includesAny(nodeText(node), ['leaveType', '请假类型', '假别'])
    )
  })
  return tableHasOptions || selectHasOptions
}

function hasPendingOrListView(dataSet) {
  return Object.values(dataSet.tables).some((table) => Object.entries(table.views).some(([viewId, view]) => {
    const viewText = [
      viewId,
      JSON.stringify(view.filterExpression ?? {}),
      JSON.stringify(view.sortExpression ?? {}),
      JSON.stringify(view.aggregates ?? {}),
    ].join(' ')
    return viewId !== 'default' || includesAny(viewText, ['pending', 'approval', '待审批', '审批'])
  }))
}

function validateDataViewKeys(dataSet, nodes) {
  const keys = [...new Set(collectStringProps(nodes, new Set(['dataViewKey', 'optionDataViewKey'])))]
  const diagnostics = keys.map((key) => {
    const descriptor = parseDataViewKey(key)
    return {
      key,
      parseOk: descriptor !== null,
      tableName: descriptor?.tableName ?? null,
      viewId: descriptor?.viewId ?? null,
      exists: descriptor === null ? false : dataSet.getView(descriptor.tableName, descriptor.viewId) !== undefined,
    }
  })
  return { keys, diagnostics, ok: keys.length > 0 && diagnostics.every((item) => item.parseOk && item.exists) }
}

// PAGE_DESIGN_AI_TRACE[live-artifact-assertions]: live 验收集中在这里；用结构语义断言验证 rule/pagedata，而不是做 LLM 输出快照。
function validateArtifacts(files) {
  const checks = []
  const issues = []
  let ruleNodes = []
  let dataSet = null

  try {
    ruleNodes = compileRule(files['rule.json'])
    checks.push({ name: 'ruleCompiles', ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    checks.push({ name: 'ruleCompiles', ok: false, message })
    issues.push(`rule.json cannot compile: ${message}`)
  }

  try {
    dataSet = parsePageData(files['pagedata.json'])
    checks.push({ name: 'pagedataParses', ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    checks.push({ name: 'pagedataParses', ok: false, message })
    issues.push(`pagedata.json cannot parse: ${message}`)
  }

  if (dataSet === null) {
    return { ok: false, checks, issues, tableNames: [], nodeTypes: [], dataViewKeys: [] }
  }

  const nodes = flattenSparkNodes(ruleNodes)
  const nodeTexts = nodes.map(nodeText)
  const leaveTable = findLeaveTable(dataSet)
  const leaveTableOk = leaveTable !== null && trueCount(leaveTable.groups) >= 7
  const nodeGroups = matchGroups(nodeTexts)
  const formOrFieldNodes = nodes.filter((node) => node.type === 'r-form' || /^r-(text|textarea|select|date|number|time)/.test(node.type))
  const listNodes = nodes.filter((node) => node.type === 'r-table' || node.type === 'r-list' || includesAny(nodeText(node), ['待审批', '列表', '表格', 'pending', 'table', 'list']))
  const dataViewKeys = validateDataViewKeys(dataSet, nodes)

  const semanticChecks = [
    { name: 'hasLeaveRequestTable', ok: leaveTableOk, detail: leaveTable === null ? null : { tableName: leaveTable.table.tableName, groups: leaveTable.groups } },
    { name: 'hasLeaveTypeOptions', ok: hasLeaveTypeOptions(dataSet, nodes) },
    { name: 'hasPendingOrListView', ok: hasPendingOrListView(dataSet) },
    { name: 'hasFormOrFieldNodes', ok: formOrFieldNodes.length > 0, detail: formOrFieldNodes.map((node) => ({ id: node.id ?? null, type: node.type })).slice(0, 20) },
    { name: 'hasRequiredFieldBindings', ok: trueCount(nodeGroups) >= 6, detail: nodeGroups },
    { name: 'hasListRegion', ok: listNodes.length > 0, detail: listNodes.map((node) => ({ id: node.id ?? null, type: node.type })).slice(0, 20) },
    { name: 'dataViewKeysResolve', ok: dataViewKeys.ok, detail: dataViewKeys.diagnostics },
  ]

  for (const check of semanticChecks) {
    checks.push(check)
    if (!check.ok) issues.push(`semantic check failed: ${check.name}`)
  }

  return {
    ok: issues.length === 0,
    checks,
    issues,
    tableNames: Object.keys(dataSet.tables),
    leaveTable: leaveTable === null ? null : {
      tableName: leaveTable.table.tableName,
      columns: leaveTable.table.columns.filter((column) => !column.isComputed).map((column) => ({
        name: column.name,
        label: column.label ?? null,
        type: column.type,
      })),
    },
    nodeTypes: nodes.map((node) => node.type),
    dataViewKeys: dataViewKeys.keys,
  }
}

// PAGE_DESIGN_AI_TRACE[live-orchestrator]: live 主流程编排登录、页面替换、注册 pageDesign、启动 AI 会话、保存脏文件和远端回读。
async function runLiveTest(options) {
  const auth = await resolveBackendAuth(options)
  const pageConfig = createPageConfigRuntime(options, auth)
  const pageStatus = await prepareTargetPage(pageConfig.workspace, options)
  await loadTargetPage(pageConfig.workspace, options.pageId)

  const workspace = pageConfig.workspace
  const before = readWorkspaceFiles(workspace.documents)
  const host = createWorkspaceHost(workspace)
  const sessionId = `${PAGE_DESIGN_MODULE_ID}:${options.pageId}`
  if (options.replacePage) {
    await deleteBackendSession(options, auth, sessionId)
  }

  const registry = new AiHostBusinessRegistry()
  registerPageDesignBusiness({
    registry,
    getPageDesignEditHost: () => host,
  })

  const session = createAiHostBusinessSession({
    registry,
    transport: createTransport(options, auth),
    maxToolRounds: options.maxToolRounds,
  }, new AiHostBusinessTarget(PAGE_DESIGN_MODULE_ID, options.pageId))

  const textDeltas = []
  const reasoningDeltas = []
  const usages = []
  const sseEvents = []
  const toolCalls = []

  if (options.replacePage) {
    await createBackendSession(options, auth, session.sessionId, session.scope)
  }

  await session.start()
  const sendResult = await sendDemand(session, options.requestText, options.turnTimeoutMs, {
    onDelta: (delta) => textDeltas.push(delta),
    onReasoning: (reasoning) => reasoningDeltas.push(reasoning),
    onUsage: (usage) => usages.push(usage),
    onSseEvent: (event) => sseEvents.push(event),
    onFcCall: (record) => toolCalls.push(record),
  })

  const after = readWorkspaceFiles(workspace.documents)
  const changed = changedFiles(before, after)
  const savedFiles = await saveDirtyFiles(workspace)
  const remoteFiles = await readRemoteFiles(pageConfig.loader, options.pageId)
  const verifiedFiles = PAGE_CONFIG_FILE_NAMES.map((name) => ({
    name,
    changed: changed.includes(name),
    saved: savedFiles.includes(name),
    matchesRemote: samePersistedText(after[name], remoteFiles[name]),
  }))
  const conversation = await readBackendConversation(options, auth, session.sessionId)
  const conversationSummary = summarizeConversation(conversation)
  const artifactValidation = validateArtifacts(after)
  const filesPersisted = verifiedFiles.every((item) => item.matchesRemote)
  const requiredFilesChangedAndSaved = ['rule.json', 'pagedata.json'].every((name) => changed.includes(name) && savedFiles.includes(name))
  const hitRoundLimit = textDeltas.join('').includes('工具调用轮次已达上限')
  const hasToolCalls = conversationSummary.toolCallCount > 0 || toolCalls.length > 0

  return {
    ok: sendResult.ok
      && !sendResult.aborted
      && artifactValidation.ok
      && filesPersisted
      && requiredFilesChangedAndSaved
      && !hitRoundLimit
      && hasToolCalls,
    steps: {
      login: true,
      registerPageDesignModuleViaSparkPageConfig: true,
      startSession: true,
      sendDemand: sendResult,
      verifyArtifacts: artifactValidation.ok,
    },
    tenantId: options.tenantId,
    projectId: auth.projectId,
    basePageId: options.basePageId,
    pageId: options.pageId,
    isolateSession: options.isolateSession,
    runId: options.runId,
    pageTitle: options.pageTitle,
    pageStatus,
    replacePage: options.replacePage,
    requestText: options.requestText,
    sessionId: session.sessionId,
    pageConfigApi: `${options.backendUrl}/api/pages-config/${encodeURIComponent(options.pageId)}`,
    pageConfigDir: `spark-ai-server/data/pages-config/${options.tenantId}/${auth.projectId}/${options.pageId}`,
    changedFiles: changed,
    savedFiles,
    verifiedFiles,
    fileSummary: summarizeFiles(after),
    semanticAssertions: artifactValidation,
    backendConversationSummary: conversationSummary,
    persistenceAssertions: {
      filesPersisted,
      requiredFilesChangedAndSaved,
      hitRoundLimit,
      hasToolCalls,
    },
    assistantText: textDeltas.join('').trim() || conversationSummary.lastAssistantText,
    reasoningText: reasoningDeltas.join('').trim(),
    usages,
    sseEventSummary: summarizeSseEvents(sseEvents),
    diagnosticSummary: summarizeDiagnosticEvents(sseEvents),
    toolCalls,
    ...(options.printConversation ? { backendConversation: conversation } : {}),
    ...(options.printFiles ? { files: after } : {}),
  }
}

const options = parseArgs(process.argv.slice(2))
if (options.help) {
  printHelp()
  process.exit(0)
}

runLiveTest(options).then((result) => {
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(2)
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
