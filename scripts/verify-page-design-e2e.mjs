#!/usr/bin/env node
/**
 * SPARK 页面设计 AI 端到端验证脚本。
 *
 * 负责把真实的 Java AI 后端、pageDesign 业务模块和 LLM 串成一条可复现的验证线：
 *   登录 → 准备页面 → 注册 pageDesign → 启动 AI 会话 → 发送需求 → 保存 → 验收
 *
 * PAGE_DESIGN_AI_TRACE[e2e-entry]: 端到端 AI 页面设计验证入口，只装配边界组件和验收逻辑。
 */

// ============================================================================
// 第 0 层：导入（按包聚合，不混用相对路径）
// ============================================================================

import {
  createAiAgentHost,
  createAiAgentTransportTurn,
  createTurnEventCollector,
  previewAiAgentDiagnosticValue,
  summarizeAiAgentSessionRecord,
  toAiAgentRuntimeScope,
} from '@spark-appworks/spark-ai/agent'
import {
  createAppSseEventHub,
  subscribeAppSseEvents,
} from './app-sse-client.mjs'
import {
  ensurePageDesignBusiness,
  resolvePageDesignPlanningContext,
} from '../src/services/page-design-business.ts'
import { createRequest } from '@spark-appworks/spark-utils'
import { PAGE_NODE_FILE_NAMES } from '@spark-appworks/spark-project-model'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {
  DataSet,
  SparkNodeTree,
  getSparkNodeChildren,
  parseDataViewKey,
} from '@spark-appworks/spark-data'
import fs from 'node:fs'
import path from 'node:path'

// ============================================================================
// 第 1 层：默认常量
// ============================================================================

const DEFAULT_BACKEND_URL = 'http://localhost:8180'
const DEFAULT_TENANT_ID = 'lmspark'
const DEFAULT_PROJECT_ID = 'homepage'

function compileRule(raw) {
  const tree = SparkNodeTree.fromRuleJson(raw, {
    fillMissingComponentId: false,
    historyLimit: 0,
  })
  return getSparkNodeChildren(tree.root.children)
}

function parsePageData(raw) {
  return raw.trim() === '' ? DataSet.fromJson({}) : DataSet.fromJson(raw)
}
const DEFAULT_USERNAME = 'admin'
const DEFAULT_PASSWORD = 'admin123'
const DEFAULT_PAGE_ID = 'ai-leave-request-form'
const DEFAULT_PAGE_TITLE = '请假申请'
const DEFAULT_PAGE_ICON = 'Document'
const DEFAULT_REQUEST_TEXT = '实现请假申请页面设计'
const DEFAULT_MAX_ROUNDS = 32
const DEFAULT_TURN_IDLE_TIMEOUT_MS = 120_000
const DEFAULT_TURN_TIMEOUT_MS = 600_000
const DEFAULT_MAX_DEMAND_MS = 360_000
const REQUEST_TIMEOUT = 30_000

// ============================================================================
// 第 2 层：CLI 参数解析与运行参数归一化
// ============================================================================

function parseArgs(argv) {
  const options = {
    // ── 后端连接 ──
    backendUrl: normalizeBackendUrl(process.env.AI_BACKEND_URL ?? DEFAULT_BACKEND_URL),
    tenantId: process.env.AI_TENANT_ID ?? DEFAULT_TENANT_ID,
    projectId: process.env.AI_PROJECT_ID ?? process.env.AI_APP_ID ?? DEFAULT_PROJECT_ID,
    username: process.env.AI_USERNAME ?? DEFAULT_USERNAME,
    password: process.env.AI_PASSWORD ?? DEFAULT_PASSWORD,
    backendToken: process.env.SPARK_AUTH_TOKEN ?? process.env.SPARK_BACKEND_TOKEN ?? '',
    // ── 页面目标 ──
    pageId: process.env.AI_PAGE_ID ?? DEFAULT_PAGE_ID,
    basePageId: process.env.AI_PAGE_ID ?? DEFAULT_PAGE_ID,           // 未隔离时的原始 pageId，用于结果回显
    isolateSession: process.env.AI_ISOLATE_SESSION === undefined ? true : process.env.AI_ISOLATE_SESSION !== '0',
    // ↑ 默认隔离：未设环境变量时自动加 runId 后缀，避免并行跑脚本互相覆盖
    runId: process.env.AI_RUN_ID ?? '',
    pageTitle: process.env.AI_PAGE_TITLE ?? DEFAULT_PAGE_TITLE,
    pageIcon: process.env.AI_PAGE_ICON ?? DEFAULT_PAGE_ICON,
    replacePage: process.env.AI_REPLACE_PAGE === undefined ? true : process.env.AI_REPLACE_PAGE !== '0',
    // ↑ 默认替换：每次运行前删除旧页重建，确保从干净状态开始
    // ── AI 需求与行为 ──
    requestText: process.env.AI_PAGE_REQUEST ?? DEFAULT_REQUEST_TEXT,
    maxRounds: numberFromEnv(process.env.AI_MAX_TOOL_ROUNDS, DEFAULT_MAX_ROUNDS),
    turnIdleTimeoutMs: numberFromEnv(process.env.AI_TURN_IDLE_TIMEOUT_MS, DEFAULT_TURN_IDLE_TIMEOUT_MS),
    turnTimeoutMs: numberFromEnv(process.env.AI_TURN_TIMEOUT_MS, DEFAULT_TURN_TIMEOUT_MS),
    maxDemandMs: numberFromEnv(process.env.AI_MAX_DEMAND_MS, DEFAULT_MAX_DEMAND_MS),
    // ── ProjectEditor Host 模式 ──
    hostMode: process.env.AI_AGENT_HOST_MODE === 'inline' ? 'inline' : 'builtin',
    // ── 输出控制 ──
    printFiles: process.env.AI_PRINT_FILES === '1',
    printStreamEvents: process.env.AI_PRINT_STREAM_EVENTS === '1' || process.env.AI_PRINT_SSE_EVENTS === '1',
    printConversation: process.env.AI_PRINT_CONVERSATION === '1',
    traceConversation: process.env.AI_TRACE_CONVERSATION === '1',
    traceContentLimit: numberFromEnv(process.env.AI_TRACE_LIMIT, 12_000),
    traceFullPrompt: process.env.AI_TRACE_FULL_PROMPT === '1',
    validateDir: process.env.AI_VALIDATE_DIR ?? '',
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
        options.maxRounds = Number(value)
        break
      case 'turn-timeout-ms':
        options.turnTimeoutMs = Number(value)
        break
      case 'turn-idle-timeout-ms':
        options.turnIdleTimeoutMs = Number(value)
        break
      case 'host-mode':
        options.hostMode = value === 'inline' ? 'inline' : 'builtin'
        break
      case 'print-files':
        options.printFiles = booleanFlag(value)
        break
      case 'print-sse-events':
      case 'print-stream-events':
        options.printStreamEvents = booleanFlag(value)
        break
      case 'print-conversation':
        options.printConversation = booleanFlag(value)
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
      case 'validate-dir':
        options.validateDir = value
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
  if (!Number.isFinite(options.maxRounds) || options.maxRounds <= 0) {
    throw new Error('maxRounds must be a positive number')
  }
  if (!Number.isFinite(options.turnTimeoutMs) || options.turnTimeoutMs <= 0) {
    throw new Error('turnTimeoutMs must be a positive number')
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
    return { key: body.slice(0, eq), value: body.slice(eq + 1), consumedNext: false }
  }
  const next = argv[index + 1]
  const hasValue = typeof next === 'string' && !next.startsWith('--')
  return { key: body, value: hasValue ? next : 'true', consumedNext: hasValue }
}

function printHelp() {
  console.log([
    'SPARK 页面设计 AI 端到端验证脚本。',
    '',
    '用法:',
    '  node --import tsx scripts/verify-page-design-e2e.mjs [options]',
    '',
    '后端连接:',
    '  --backend-url <url>        Java AI 后端地址（默认 http://localhost:8180）',
    '  --tenant-id <id>           租户 ID（默认 lmspark）',
    '  --project-id <id>          项目 ID（默认 homepage）',
    '  --username <name>          登录用户名（默认 admin）',
    '  --password <pw>            登录密码',
    '  --backend-token <token>    直接使用已有 token，跳过登录',
    '',
    '页面目标:',
    '  --page-id <id>             目标页面 ID（默认 ai-leave-request-form）',
    '  --page-title <title>       页面标题（默认 请假申请）',
    '  --page-icon <icon>         页面图标（默认 Document）',
    '  --no-isolate-session       复用原始 pageId，不加 runId 后缀',
    '  --no-replace-page          复用已存在的目标页面',
    '  --run-id <id>              会话隔离的固定后缀',
    '',
    'AI 需求与行为:',
    '  --request <text>           发送给 LLM 的需求文本',
    '  --max-rounds <n>           最大工具调用轮次（默认 32）',
    '  --turn-idle-timeout-ms <n> 连续无 LLM SSE 帧的空闲超时（默认 120000）',
    '  --turn-timeout-ms <n>      单轮 turn 绝对上限毫秒（默认 600000）',
    '',
    'ProjectEditor Host 模式:',
    '  --host-mode builtin|inline  两种模式均通过 ProjectEditor live edit host 读写四文件（默认 builtin）',
    '',
    '输出控制:',
    '  --print-files              输出中附带四文件完整内容',
    '  --print-stream-events      输出中附带 AI Host stream 事件',
    '  --print-sse-events         兼容旧参数；等同 --print-stream-events',
    '  --print-conversation       输出中附带 Host 会话记录',
    '  --trace-conversation       实时追踪每次 LLM 交互到 stderr',
    '  --no-trace-conversation    关闭对话追踪',
    '  --trace-limit <n>          追踪内容的字符截断长度（默认 12000）',
    '  --trace-full-prompt        追踪中输出完整 system prompt（否则仅首次输出）',
    '  --validate-dir <path>      仅验收目录内四文件（跳过 LLM；需含 rule/pagedata/script/style）',
    '  --help                     显示此帮助',
    '',
    'Java AI 后端必须先启动并配置好真实 LLM 连接（--validate-dir 除外）。',
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

// ============================================================================
// 第 3 层：基础类型守卫与工具函数
// ============================================================================

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readString(value, key) {
  return isRecord(value) && typeof value[key] === 'string' ? value[key] : ''
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

function samePersistedText(left, right) {
  return String(left ?? '').replace(/\r\n/g, '\n') === String(right ?? '').replace(/\r\n/g, '\n')
}

function parseJsonMaybe(value) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

function summarizeText(value, maxLength) {
  const text = String(value ?? '')
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...<truncated ${text.length - maxLength} chars>`
}

// ============================================================================
// 第 4 层：后端鉴权
// ============================================================================

// PAGE_DESIGN_AI_TRACE[e2e-auth]: 登录或接收外部 token，后续所有请求复用此鉴权头。
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

function getProjectNavigationApi(options, projectId) {
  return `${options.backendUrl}/api/tenants/${encodeURIComponent(options.tenantId)}/projects/${encodeURIComponent(projectId)}/navigation`
}

function getProjectPageApi(options, projectId) {
  return `${options.backendUrl}/api/tenants/${encodeURIComponent(options.tenantId)}/projects/${encodeURIComponent(projectId)}/pages-config`
}

// ============================================================================
// 第 5 层：ProjectEditor 页面生命周期
// ============================================================================

// PAGE_DESIGN_AI_TRACE[e2e-project-editor]: 把 pages-config API 包装成 ProjectEditor，pageDesign 工具只通过 editor 修改四文件。
function createPageConfigRuntime(options, auth) {
  const http = createRequest({
    baseURL: options.backendUrl,
    timeout: REQUEST_TIMEOUT,
  })
  http.interceptors.request.use({
    onRequest: (config) => {
      config.headers = {
        ...config.headers,
        ...createAuthHeaders(options, auth),
      }
      return config
    },
  })
  const editor = new ProjectWorkspace({
    projectId: auth.projectId,
    http,
    getPageFilesApi: () => getProjectPageApi(options, auth.projectId),
    getNavigationApi: () => getProjectNavigationApi(options, auth.projectId),
    getHeaders: () => createAuthHeaders(options, auth),
    fileStorage: 'memory',
  })
  return { editor }
}

async function prepareTargetPage(editor, options) {
  const mountParams = {
    pageId: options.pageId,
    title: options.pageTitle,
    ...(options.pageIcon.length === 0 ? {} : { icon: options.pageIcon }),
    node: {
      id: options.pageId,
      title: options.pageTitle,
      nodeKind: 'page',
      path: `/${options.pageId}`,
      description: options.requestText,
      planningStatus: 'planning_confirmed',
      implGate: 'open',
      upstreamContractsSatisfied: true,
      ...(options.pageIcon.length === 0 ? {} : { icon: options.pageIcon }),
    },
  }

  if (options.replacePage) {
    try {
      await editor.removeMountedPage({ pageId: options.pageId, deleteFiles: true })
    } catch {
      try { await editor.deletePageFiles(options.pageId) } catch { /* page may not exist */ }
    }
    await editor.createMountedPage(mountParams)
    return 'created'
  }
  try {
    await editor.createMountedPage(mountParams)
    return 'created'
  } catch {
    return 'reused'
  }
}

async function loadTargetPage(editor, pageId) {
  await editor.selectPage(pageId, {
    forceReload: true,
  })
}

function readWorkspaceFileText(workspace, name) {
  return workspace.project.getActivePage()?.getFileText(name) ?? ''
}

function readEditorFiles(editor) {
  return Object.fromEntries(PAGE_NODE_FILE_NAMES.map((name) => [name, readWorkspaceFileText(editor, name)]))
}

function changedFiles(before, after) {
  return Object.keys(after).filter((name) => before[name] !== after[name])
}

async function saveDirtyFiles(editor) {
  const saved = []
  const dirtyFiles = editor.project.readDirtyProjection().dirtyFiles
  for (const name of PAGE_NODE_FILE_NAMES) {
    if (!dirtyFiles.has(name)) continue
    await editor.savePageFile(name)
    saved.push(name)
  }
  return saved
}

async function readRemoteFiles(editor, pageId) {
  await editor.selectPage(pageId, { forceReload: true })
  return readEditorFiles(editor)
}

function summarizeFiles(files) {
  return Object.fromEntries(Object.entries(files).map(([name, content]) => [name, {
    bytes: Buffer.byteLength(content, 'utf8'),
    lines: content.length === 0 ? 0 : content.split(/\r?\n/).length,
  }]))
}

// ============================================================================
// 第 6 层：AI turn callbacks（脚本层拥有 HTTP + SSE I/O）
// ============================================================================

const AI_TURN_PROTOCOL_VERSION = 4
const AI_TURN_EVENTS = [
  'llm-frame',
]

function createTurnCallbacks(options, auth) {
  const preparedSessionIds = new Set()
  return {
    prepareSession: async (input) => {
      if (preparedSessionIds.has(input.sessionId)) return
      const body = await postBackendJson(options, auth, '/api/ai/sessions', {
        protocolVersion: AI_TURN_PROTOCOL_VERSION,
        sessionId: input.sessionId,
        systemPrompt: input.systemPrompt,
        messages: [],
        tools: input.tools,
        mode: 'function',
        scope: toAiAgentRuntimeScope(input.scope),
        reuseScopeSession: false,
      }, input.signal)
      const sessionId = readString(body, 'sessionId') || input.sessionId
      if (sessionId !== input.sessionId) {
        throw new Error(`AI prepare sessionId mismatch: expected=${input.sessionId}, actual=${sessionId}`)
      }
      preparedSessionIds.add(input.sessionId)
    },
    executeTurn: async (input) => {
      const eventHub = createAppSseEventHub()
      let appSseCookie = ''
      const subscription = subscribeAppSseEvents({
        url: `${options.backendUrl}/api/events`,
        headers: createAuthHeaders(options, auth),
        events: AI_TURN_EVENTS,
        onOpen: (response) => {
          appSseCookie = appClientCookieFromResponse(response)
        },
        onEvent: eventHub.emit,
      })
      await subscription.opened

      const collector = createTurnEventCollector({
        input,
        source: eventHub,
        timeoutMs: options.turnTimeoutMs,
        idleTimeoutMs: options.turnIdleTimeoutMs,
      })
      try {
        const body = await postBackendJson(options, auth, '/api/ai/turns', {
          sessionId: input.sessionId,
          turnId: input.turn.turnId,
          messages: input.messages,
          systemPrompt: input.systemPrompt,
        }, input.signal, appSseCookie.length === 0 ? {} : { Cookie: appSseCookie })
        assertTurnStart(body, input)
        return await collector.result
      } catch (error) {
        collector.close()
        throw error
      } finally {
        subscription.close()
        await subscription.closed
      }
    },
    appendMessages: async (input) => {
      const body = await postBackendJson(options, auth, `/api/ai/sessions/${encodeURIComponent(input.sessionId)}/turn/append`, {
        protocolVersion: AI_TURN_PROTOCOL_VERSION,
        scope: toAiAgentRuntimeScope(input.scope),
        turn: createAiAgentTransportTurn(input),
        messages: input.messages,
      })
      assertAppendMessages(body, input)
    },
  }
}

async function postBackendJson(options, auth, path, payload, signal, extraHeaders = {}) {
  const response = await fetch(`${options.backendUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...createAuthHeaders(options, auth),
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
    ...(signal === undefined ? {} : { signal }),
  })
  const text = await response.text()
  const body = text.trim().length === 0 ? null : unwrapApiEnvelopeData(parseJsonMaybe(text))
  if (!response.ok) {
    throw new Error(`POST ${path} failed: ${response.status} ${text}`)
  }
  return body
}

function appClientCookieFromResponse(response) {
  const setCookieValues = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean)
  for (const value of setCookieValues) {
    const match = String(value).match(/(?:^|,\s*)SPARK_APP_CLIENT_ID=([^;,]+)/)
    if (match) return `SPARK_APP_CLIENT_ID=${match[1]}`
  }
  return ''
}

function assertTurnStart(body, input) {
  if (!isRecord(body)) {
    throw new Error('AI turn start response missing body')
  }
  if (body.accepted !== true) {
    throw new Error('AI turn start response was not accepted')
  }
  if (readString(body, 'sessionId') !== input.sessionId) {
    throw new Error('AI turn start response sessionId mismatch')
  }
  if (readString(body, 'turnId') !== input.turn.turnId) {
    throw new Error('AI turn start response turnId mismatch')
  }
}

function assertAppendMessages(body, input) {
  if (!isRecord(body)) {
    throw new Error('AI append response missing body')
  }
  if (readString(body, 'sessionId') !== input.sessionId) {
    throw new Error('AI append response sessionId mismatch')
  }
  if (readString(body, 'turnId') !== input.turn.turnId) {
    throw new Error('AI append response turnId mismatch')
  }
}

// ============================================================================
// 第 7 层：pageDesign 业务注册（ProjectWorkspace 直接作为 IO 入口）
// ============================================================================

function createPageDesignAiAgent(options, auth, workspace) {
  const aiHost = createAiAgentHost({
    turnCallbacks: createTurnCallbacks(options, auth),
    maxToolRounds: options.maxRounds,
  })
  ensurePageDesignBusiness({
    host: aiHost,
    getPageDesignEditor: () => workspace,
  })
  return aiHost
}

// PAGE_DESIGN_AI_TRACE[e2e-turn]: 发送 LLM 需求；连续 2 分钟无 LLM 活动则 abort，仍保留 session 供评估。
function createIdleAbortController(idleTimeoutMs) {
  const controller = new AbortController()
  let timer = null
  const touch = () => {
    if (controller.signal.aborted) return
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      controller.abort(new Error(`AI idle timeout: no LLM activity for ${String(idleTimeoutMs)}ms`))
    }, idleTimeoutMs)
  }
  touch()
  return {
    signal: controller.signal,
    touch,
    abort: (reason) => {
      if (controller.signal.aborted) return
      if (timer !== null) clearTimeout(timer)
      timer = null
      controller.abort(reason)
    },
    dispose: () => {
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
  }
}

function wrapChatCallbacksWithIdleTouch(callbacks, touch) {
  return {
    ...callbacks,
    onDelta: (delta) => {
      touch()
      callbacks.onDelta?.(delta)
    },
    onReasoning: (reasoning) => {
      touch()
      callbacks.onReasoning?.(reasoning)
    },
    onStreamEvent: (event) => {
      if (isLlmStreamEvent(event)) touch()
      callbacks.onStreamEvent?.(event)
    },
  }
}

function isLlmStreamEvent(event) {
  if (event === null || typeof event !== 'object') return false
  const type = typeof event.type === 'string' ? event.type : ''
  return type === 'llm-frame' || type.startsWith('llm-')
}

async function sendDemand(pageDesignHost, input, timeoutOptions, callbacks) {
  const idleTimeoutMs = timeoutOptions.turnIdleTimeoutMs ?? DEFAULT_TURN_IDLE_TIMEOUT_MS
  const maxTimeoutMs = timeoutOptions.maxDemandMs ?? timeoutOptions.turnTimeoutMs ?? DEFAULT_MAX_DEMAND_MS
  const idle = createIdleAbortController(idleTimeoutMs)
  const startedAt = Date.now()
  const maxTimer = setTimeout(() => {
    idle.abort(new Error(`AI max demand timeout after ${String(maxTimeoutMs)}ms`))
  }, maxTimeoutMs)

  const chatCallbacks = wrapChatCallbacksWithIdleTouch(callbacks, idle.touch)
  let sendError = null
  let runResult = undefined
  try {
    runResult = await pageDesignHost.run('pageDesign', input, {
      signal: idle.signal,
      ...chatCallbacks,
    })
  } catch (error) {
    sendError = error
  } finally {
    idle.dispose()
    clearTimeout(maxTimer)
  }

  const sessionRecord = runResult?.session.getSessionRecord()
    ?? resolveLatestPageDesignSessionRecord(pageDesignHost, input.pageId)
  return {
    report: {
      ok: sendError === null,
      aborted: idle.signal.aborted,
      idleTimeoutMs,
      maxTimeoutMs,
      durationMs: Date.now() - startedAt,
      ...(sendError === null ? {} : {
        error: sendError instanceof Error ? sendError.message : String(sendError),
      }),
    },
    sessionRecord,
    sessionId: sessionRecord === undefined
      ? undefined
      : `${sessionRecord.moduleId}:${sessionRecord.moduleInstanceId}`,
  }
}

function resolveLatestPageDesignSessionRecord(pageDesignHost, pageId) {
  const sessions = pageDesignHost.listSessions('pageDesign')
  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    const session = sessions[index]
    if (session?.moduleInstanceId === pageId) return session
  }
  return undefined
}

function buildRunFailureSummary(input) {
  const reasons = []
  const sendDemand = input.sendResult ?? {}
  const persistence = input.persistenceAssertions ?? {}
  const artifactValidation = input.artifactValidation ?? {}

  if (sendDemand.ok === false && typeof sendDemand.error === 'string') {
    reasons.push(`sendDemand.error: ${sendDemand.error}`)
  }
  if (sendDemand.aborted === true) {
    reasons.push(`sendDemand aborted after ${String(sendDemand.durationMs ?? '?')}ms`)
  }
  if (persistence.hasToolCalls === false) {
    reasons.push('no tool calls recorded in session')
  }
  if (persistence.hitRoundLimit === true) {
    reasons.push('tool round limit reached')
  }
  if (persistence.requiredFilesChangedAndSaved === false) {
    reasons.push('rule.json / pagedata.json not changed and saved')
  }
  if (persistence.filesPersisted === false) {
    reasons.push('local files do not match remote pages-config')
  }
  if (artifactValidation.ok === false && Array.isArray(artifactValidation.issues)) {
    for (const issue of artifactValidation.issues.slice(0, 3)) {
      reasons.push(`artifact: ${issue}`)
    }
  }
  const failedTools = input.sessionSummary?.failedToolCalls ?? []
  for (const failure of failedTools.slice(0, 2)) {
    reasons.push(`${failure.toolName}: ${failure.code} ${failure.msg}`)
  }
  if (reasons.length === 0 && input.assistantText?.trim().length > 0) {
    reasons.push(`assistant ended without passing checks: ${summarizeText(input.assistantText, 240)}`)
  }
  return reasons
}

// ============================================================================
// 第 9 层：诊断/追踪输出
// ============================================================================

// ── 9.1 实时对话追踪（stderr 输出，用于开发调试） ──

function formatMessageForTrace(message, limit) {
  const toolCalls = Array.isArray(message.tool_calls)
    ? ` tool_calls=${message.tool_calls.map((call) => call.function?.name ?? 'unknown').join(',')}`
    : ''
  const toolCallId = typeof message.tool_call_id === 'string' ? ` tool_call_id=${message.tool_call_id}` : ''
  return `${message.role}${toolCalls}${toolCallId}:\n${previewAiAgentDiagnosticValue(message.content ?? '', limit)}`
}

function createConversationTracer(options) {
  if (!options.traceConversation) {
    return {
      onDelta: () => undefined,
      onReasoning: () => undefined,
      onStreamEvent: () => undefined,
    }
  }
  const limit = Math.floor(options.traceContentLimit)
  let firstPromptLogged = false

  function write(title, body) {
    console.error(`\n[page-design-e2e trace] ${title}\n${body}`)
  }

  return {
    onDelta: (delta) => {
      if (delta.trim().length === 0) return
      write('LLM => AGENT delta', previewAiAgentDiagnosticValue(delta, limit))
    },
    onReasoning: (reasoning) => {
      if (reasoning.trim().length === 0) return
      write('LLM => AGENT reasoning', previewAiAgentDiagnosticValue(reasoning, limit))
    },
    onStreamEvent: (event) => {
      const data = parseJsonMaybe(event.data)
      if (event.type === 'llm-request' && data !== null && typeof data === 'object') {
        const tools = Array.isArray(data.tools)
          ? data.tools.map((tool) => tool.function?.name ?? 'unknown').join(', ')
          : ''
        const messages = Array.isArray(data.messages)
          ? data.messages.map((message, index) => `#${index + 1} ${formatMessageForTrace(message, limit)}`).join('\n\n')
          : ''
        const prompt = typeof data.systemPrompt === 'string'
          ? (options.traceFullPrompt || !firstPromptLogged ? previewAiAgentDiagnosticValue(data.systemPrompt, limit) : `<same session prompt, ${data.systemPrompt.length} chars>`)
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
              return `#${index + 1} ${name}\n${previewAiAgentDiagnosticValue(args, limit)}`
            }).join('\n\n')
          : ''
        write(
          'LLM => AGENT result',
          [
            typeof data.text === 'string' && data.text.trim().length > 0 ? `text:\n${previewAiAgentDiagnosticValue(data.text, limit)}` : 'text: <empty>',
            toolCalls.trim().length > 0 ? `tool_calls:\n${toolCalls}` : 'tool_calls: <none>',
          ].join('\n\n'),
        )
        return
      }

      if (event.type === 'tool-result') {
        write(
          `AGENT TOOL => LLM module=${event.scope?.eventModuleId ?? ''}`,
          previewAiAgentDiagnosticValue(data, limit),
        )
      }
    },
  }
}

// ── 9.2 结构化诊断摘要（JSON 输出，用于 CI 报告） ──

function summarizeStreamEvents(events) {
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

  return { llmRequestCount: llmRequests.length, llmAppendCount: llmAppends.length, llmRequests, llmAppends }
}

function parseEventData(data) {
  const text = String(data ?? '')
  if (text.trim().length === 0) return null
  try { return JSON.parse(text) } catch { return null }
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

function summarizeFailedToolCalls(sessionRecord) {
  const failures = []
  for (const entry of sessionRecord.history ?? []) {
    if (entry?.kind !== 'functionCall' || entry.status !== 'failed') continue
    const error = isRecord(entry.error) ? entry.error : {}
    const checks = Array.isArray(error.checks) ? error.checks : []
    const recoveryHints = checks
      .filter(check => isRecord(check) && check.code === 'RECOVERY_HINT')
      .map(check => String(check.message ?? ''))
      .filter(message => message.length > 0)
    failures.push({
      toolName: typeof entry.toolName === 'string' ? entry.toolName : 'unknown',
      code: typeof error.code === 'string' ? error.code : 'UNKNOWN',
      msg: typeof error.msg === 'string' ? error.msg : '',
      fix: typeof error.fix === 'string' ? error.fix : '',
      recoveryHintCount: recoveryHints.length,
      recoveryHints: recoveryHints.slice(0, 3),
    })
  }
  return failures
}

function summarizeSessionRecord(sessionRecord) {
  const summary = summarizeAiAgentSessionRecord(sessionRecord)
  const roleCounts = {}

  for (const entry of sessionRecord.history ?? []) {
    const role = typeof entry.role === 'string' ? entry.role : 'unknown'
    roleCounts[role] = (roleCounts[role] ?? 0) + 1
  }

  return {
    ...summary,
    messageCount: (sessionRecord.history ?? []).length,
    roleCounts,
    failedToolCalls: summarizeFailedToolCalls(sessionRecord),
  }
}

// ============================================================================
// 第 10 层：请假申请页面语义验收
// ============================================================================

// ── 10.1 节点树与字段提取工具 ──

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

function nodeText(node) {
  const props = isRecord(node.props) ? node.props : {}
  return [
    node.type, node.id,
    props.field, props.prop, props.label, props.title,
    props.placeholder, props.description, props.action,
  ].filter(Boolean).join(' ')
}

const DAYS_COLUMN_ALIASES = ['days', 'duration', 'dayCount']
const CORE_LEAVE_COLUMNS = ['applicantName', 'leaveType', 'startDate', 'endDate', 'reason']

function readBoundFieldFromNode(node) {
  const props = readNodeProps(node)
  if (typeof props.field === 'string' && props.field.trim().length > 0) {
    return props.field.trim()
  }
  if (typeof props.prop === 'string' && props.prop.trim().length > 0) {
    return props.prop.trim()
  }
  return ''
}

function tableHasDaysColumn(columns) {
  return DAYS_COLUMN_ALIASES.some((name) => columns.includes(name))
}

function tableMeetsCoreLeaveColumns(columns) {
  return CORE_LEAVE_COLUMNS.every((field) => columns.includes(field)) && tableHasDaysColumn(columns)
}

function formDraftMemberMatches(props) {
  if (props.contextDataMember === 'currentRow') return true
  const dataMember = typeof props.dataMember === 'string' ? props.dataMember : ''
  return dataMember === 'currentRow' || dataMember === 'current'
}

// ── 10.2 字段组语义匹配（原 live 方案） ──

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
    table.tableName, table.resourceType, table.resourceId, table.businessCategory,
    ...table.columns.map(columnText),
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
    const boundField = readBoundFieldFromNode(node)
    const leaveTypeField = ['leaveType', 'leaveTypeId', 'type'].includes(boundField)
      || includesAny(nodeText(node), ['leaveType', '请假类型', '假别'])
    const hasOptions = Array.isArray(props.options) && props.options.length > 0
    return (node.type === 'r-select' || node.type === 'r-form-item') && leaveTypeField && (
      hasOptions
      || typeof props.optionDataViewKey === 'string'
    )
  })
  return tableHasOptions || selectHasOptions
}

function hasPendingOrListView(dataSet, nodes) {
  if (nodes.some((node) => node.type === 'r-table' || node.type === 'r-list')) {
    return true
  }
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

// ── 10.3 提交闭环验证（原 smoke 方案） ──

function readDataViewKey(value) {
  if (typeof value !== 'string') return null
  return parseDataViewKey(value.trim())
}

function readNodeProps(node) {
  return isRecord(node?.props) ? node.props : {}
}

function tableColumnNames(table) {
  return Array.isArray(table?.columns)
    ? table.columns.filter(isRecord).map((column) => String(column.name ?? ''))
    : []
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

function findLeaveRequestTable(tables) {
  for (const name of ['LeaveRequest', 'LeaveRequests']) {
    if (isRecord(tables[name])) return { name, table: tables[name] }
  }
  for (const [name, table] of Object.entries(tables)) {
    const columns = tableColumnNames(table)
    if (tableMeetsCoreLeaveColumns(columns)) {
      return { name, table }
    }
  }
  return null
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
  const submitIntentClosure = submitButtons.length > 0 && formBindsDraftView

  return {
    ok: appendClosure !== null || submitIntentClosure,
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
    if (!isRecord(node.props)) return false
    if (node.type !== 'r-select' && node.type !== 'r-form-item') return false
    const field = readBoundFieldFromNode(node)
    return ['leaveType', 'leaveTypeId', 'type'].includes(field)
      || includesAny(nodeText(node), ['leaveType', '请假类型', '假别'])
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

// ── 10.4 VCM 知识链会话校验 ──

const VCM_QUERY_TOOL_NAMES = new Set(['vcm_query', 'vcm_model_guide'])

function collectSessionToolNames(sessionRecord) {
  const names = []
  for (const entry of sessionRecord?.history ?? []) {
    if (entry?.kind === 'functionCall' && typeof entry.toolName === 'string') {
      names.push(entry.toolName)
    }
    if (typeof entry?.role === 'string' && entry.role === 'assistant') {
      names.push(...readMessageToolCallNames(entry))
    }
  }
  return names
}

function validatePageDesignVcmGuidesFromSession(sessionRecord) {
  const toolNames = collectSessionToolNames(sessionRecord)
  const matchedToolNames = toolNames.filter(name =>
    VCM_QUERY_TOOL_NAMES.has(name) || name === 'vcm_action_guide',
  )
  const hasQuery = toolNames.some(name => VCM_QUERY_TOOL_NAMES.has(name))
  const hasGuide = toolNames.includes('vcm_action_guide')
  if (hasQuery && hasGuide) {
    return { ok: true, matchedToolNames }
  }
  return {
    ok: false,
    matchedToolNames,
    issue: hasQuery || hasGuide
      ? 'session must record both vcm_query/vcm_model_guide and vcm_action_guide before node-tree writes'
      : 'session did not record VCM guide or query tool usage',
  }
}

// ── 10.5 合并验收入口 ──

// PAGE_DESIGN_AI_TRACE[e2e-artifact-assertions]: 合并字段组语义 + 提交闭环 + VCM guide 三重验收。
function validateArtifacts(files, sessionRecord) {
  const checks = []
  const issues = []
  let ruleNodes = []
  let dataSet = null

  // 阶段 A：文件可解析性
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

  // 阶段 B：字段组语义匹配（原 live 方案）
  const leaveTable = findLeaveTable(dataSet)
  const leaveTableOk = leaveTable !== null && trueCount(leaveTable.groups) >= 7
  const nodeGroups = matchGroups(nodeTexts)
  const formOrFieldNodes = nodes.filter((node) => node.type === 'r-form' || /^r-(text|textarea|select|date|number|time)/.test(node.type))
  const listNodes = nodes.filter((node) => node.type === 'r-table' || node.type === 'r-list' || includesAny(nodeText(node), ['待审批', '列表', '表格', 'pending', 'table', 'list']))
  const dataViewKeys = validateDataViewKeys(dataSet, nodes)

  const fieldGroupChecks = [
    { name: 'hasLeaveRequestTable', ok: leaveTableOk, detail: leaveTable === null ? null : { tableName: leaveTable.table.tableName, groups: leaveTable.groups } },
    { name: 'hasLeaveTypeOptions', ok: hasLeaveTypeOptions(dataSet, nodes) },
    { name: 'hasPendingOrListView', ok: hasPendingOrListView(dataSet, nodes) },
    { name: 'hasFormOrFieldNodes', ok: formOrFieldNodes.length > 0, detail: formOrFieldNodes.map((node) => ({ id: node.id ?? null, type: node.type })).slice(0, 20) },
    { name: 'hasRequiredFieldBindings', ok: trueCount(nodeGroups) >= 6, detail: nodeGroups },
    { name: 'hasListRegion', ok: listNodes.length > 0, detail: listNodes.map((node) => ({ id: node.id ?? null, type: node.type })).slice(0, 20) },
    { name: 'dataViewKeysResolve', ok: dataViewKeys.ok, detail: dataViewKeys.diagnostics },
  ]

  for (const check of fieldGroupChecks) {
    checks.push(check)
    if (!check.ok) issues.push(`semantic check failed: ${check.name}`)
  }

  // 阶段 C：提交闭环 + 请假类型选项（原 smoke 方案）
  const tables = dataSet.tables
  const tableNames = Object.keys(tables)
  const requiredFields = [...CORE_LEAVE_COLUMNS, 'days']
  const leaveTableEntry = findLeaveRequestTable(tables)
  const smokeLeaveTableName = leaveTableEntry?.name ?? 'LeaveRequest'
  const smokeLeaveTable = leaveTableEntry?.table ?? null
  const leaveColumns = tableColumnNames(smokeLeaveTable)
  const boundFields = nodes
    .map(readBoundFieldFromNode)
    .filter((field) => field.length > 0)
  const formNodes = nodes.filter((node) => node.type === 'r-form')
  const primaryForm = formNodes.find((node) => isRecord(node.props) && typeof node.props.dataViewKey === 'string') ?? formNodes[0] ?? null
  const primaryFormProps = isRecord(primaryForm?.props) ? primaryForm.props : {}

  const leaveTypeOptions = validateLeaveTypeOptions(nodes, tables)
  const submitClosure = smokeLeaveTable === null
    ? { ok: false, formBindsDraftView: false, draftRowsUsable: false, draftRowCount: 0, submitButtonCount: 0, appendClosure: null, candidateClosures: [] }
    : validateSubmitClosure(nodes, tables, smokeLeaveTableName, smokeLeaveTable, [...CORE_LEAVE_COLUMNS, ...DAYS_COLUMN_ALIASES])

  if (smokeLeaveTable === null) issues.push('pagedata.json missing LeaveRequest/LeaveRequests table')
  for (const field of CORE_LEAVE_COLUMNS) {
    if (!leaveColumns.includes(field)) issues.push(`${smokeLeaveTableName} missing column: ${field}`)
    const bound = boundFields.includes(field)
      || (field === 'applicantName' && boundFields.some((name) => name === 'applicant' || name === 'applicantName'))
    if (!bound) issues.push(`rule.json missing field binding: ${field}`)
  }
  if (!tableHasDaysColumn(leaveColumns)) {
    issues.push(`${smokeLeaveTableName} missing days column: expected one of ${DAYS_COLUMN_ALIASES.join(', ')}`)
  }
  const daysFieldBound = DAYS_COLUMN_ALIASES.some((name) => boundFields.includes(name))
  if (!daysFieldBound) issues.push(`rule.json missing field binding: ${DAYS_COLUMN_ALIASES.join(' | ')}`)
  if (formNodes.length === 0) issues.push('rule.json missing r-form node')
  if (primaryForm !== null && primaryFormProps.dataViewKey !== `${smokeLeaveTableName}@default`) {
    issues.push(`r-form dataViewKey must be ${smokeLeaveTableName}@default, got ${String(primaryFormProps.dataViewKey ?? '<missing>')}`)
  }
  if (primaryForm !== null && !formDraftMemberMatches(primaryFormProps)) {
    issues.push(`r-form must bind draft row via contextDataMember=currentRow or dataMember=currentRow, got context=${String(primaryFormProps.contextDataMember ?? '<missing>')} dataMember=${String(primaryFormProps.dataMember ?? '<missing>')}`)
  }
  if (!leaveTypeOptions.ok) {
    issues.push('rule.json missing usable leave type options')
  }
  if (!submitClosure.formBindsDraftView) {
    issues.push(`r-form must bind the editable draft view ${smokeLeaveTableName}@default`)
  }
  if (!submitClosure.ok) {
    issues.push('submit button does not close the application flow')
  }

  const closureChecks = [
    { name: 'submitClosure', ok: submitClosure.ok, detail: submitClosure },
    { name: 'leaveTypeOptions', ok: leaveTypeOptions.ok, detail: leaveTypeOptions },
  ]
  for (const check of closureChecks) {
    checks.push(check)
    if (!check.ok) issues.push(`closure check failed: ${check.name}`)
  }

  // 阶段 D：VCM guide 校验
  const vcmGuideValidation = validatePageDesignVcmGuidesFromSession(sessionRecord)
  checks.push({ name: 'vcmGuides', ok: vcmGuideValidation.ok, detail: vcmGuideValidation })
  if (!vcmGuideValidation.ok) issues.push('VCM guide validation failed')

  return {
    ok: issues.length === 0,
    checks,
    issues,
    tableNames,
    leaveTable: leaveTable === null ? null : {
      tableName: leaveTable.table.tableName,
      columns: leaveTable.table.columns.filter((column) => !column.isComputed).map((column) => ({
        name: column.name,
        label: column.label ?? null,
        type: column.type,
      })),
    },
    smokeLeaveTableName,
    formCount: formNodes.length,
    formId: typeof primaryForm?.id === 'string' ? primaryForm.id : null,
    formDataViewKey: typeof primaryFormProps.dataViewKey === 'string' ? primaryFormProps.dataViewKey : null,
    formContextDataMember: typeof primaryFormProps.contextDataMember === 'string' ? primaryFormProps.contextDataMember : null,
    boundFields,
    requiredFields,
    nodeTypes: nodes.map((node) => node.type),
    dataViewKeys: dataViewKeys.keys,
    submitClosure,
    leaveTypeOptions,
    vcmGuideValidation,
  }
}

// ============================================================================
// 第 11 层：主编排
// ============================================================================

// PAGE_DESIGN_AI_TRACE[e2e-orchestrator]: 串联登录 → 页面准备 → AI 会话 → 保存 → 验收的主流程。
async function run(options) {
  // 1. 鉴权
  const auth = await resolveBackendAuth(options)

  // 2. 准备页面工作区
  const pageConfig = createPageConfigRuntime(options, auth)
  const editor = pageConfig.editor
  await editor.loadNavigation()
  const pageStatus = await prepareTargetPage(editor, options)
  await loadTargetPage(editor, options.pageId)
  const before = readEditorFiles(editor)

  // 3. 注册 pageDesign 业务入口
  const pageDesignHost = createPageDesignAiAgent(options, auth, editor)

  // 5. 启动会话，发送 LLM 需求
  const textDeltas = []
  const reasoningDeltas = []
  const usages = []
  const streamEvents = []
  let streamEventCount = 0
  let latestResultText = ''
  const toolCalls = []
  const tracer = createConversationTracer(options)

  const planning = resolvePageDesignPlanningContext(editor.project, options.pageId, {
    fallbackDescription: options.requestText,
  })
  const demand = await sendDemand(pageDesignHost, {
    pageId: options.pageId,
    projectId: auth.projectId,
    description: options.requestText,
    ...planning,
  }, {
    turnIdleTimeoutMs: options.turnIdleTimeoutMs,
    turnTimeoutMs: options.turnTimeoutMs,
    maxDemandMs: options.maxDemandMs,
  }, {
    onDelta: (delta) => {
      textDeltas.push(delta)
      tracer.onDelta(delta)
    },
    onReasoning: (reasoning) => {
      reasoningDeltas.push(reasoning)
      tracer.onReasoning(reasoning)
    },
    onUsage: (usage) => usages.push(usage),
    onStreamEvent: (event) => {
      streamEventCount += 1
      if (options.printStreamEvents) streamEvents.push(event)
      tracer.onStreamEvent(event)
      const data = parseJsonMaybe(event.data)
      if (event.type === 'result' && data !== null && typeof data === 'object' && typeof data.text === 'string') {
        latestResultText = data.text
      }
    },
    onToolCall: (record) => toolCalls.push(record),
  })
  const sendResult = demand.report
  if (demand.sessionRecord === undefined) {
    throw new Error(`AI pageDesign run failed before session was available: ${sendResult.error ?? 'unknown error'}`)
  }
  const sessionRecord = demand.sessionRecord

  // 6. 保存脏文件 + 远端回读验证
  const after = readEditorFiles(editor)
  const changed = changedFiles(before, after)
  const savedFiles = await saveDirtyFiles(editor)
  const remoteFiles = await readRemoteFiles(editor, options.pageId)
  const verifiedFiles = PAGE_NODE_FILE_NAMES.map((name) => ({
    name,
    changed: changed.includes(name),
    saved: savedFiles.includes(name),
    matchesRemote: samePersistedText(after[name], remoteFiles[name]),
  }))

  // 7. 收集会话记录与诊断摘要
  const sessionSummary = summarizeSessionRecord(sessionRecord)
  const assistantText = sessionSummary.lastAssistantText || textDeltas.join('').trim() || latestResultText.trim()
  const hitRoundLimit = assistantText.includes('工具调用轮次已达上限')
  const hasToolCalls = sessionSummary.toolCallCount > 0 || toolCalls.length > 0
  const filesPersisted = verifiedFiles.every((item) => item.matchesRemote)
  const requiredFilesChangedAndSaved = ['rule.json', 'pagedata.json'].every((name) => changed.includes(name) && savedFiles.includes(name))

  // 8. 验收
  const artifactValidation = validateArtifacts(after, sessionRecord)

  const diagnosticStreamEvents = options.printStreamEvents ? streamEvents : []
  const failureSummary = buildRunFailureSummary({
    sendResult,
    persistenceAssertions: {
      filesPersisted,
      requiredFilesChangedAndSaved,
      hitRoundLimit,
      hasToolCalls,
    },
    artifactValidation,
    sessionSummary,
    assistantText,
  })
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
      registerPageDesignModule: true,
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
    hostMode: options.hostMode,
    requestText: options.requestText,
    sessionId: demand.sessionId ?? sessionRecord.moduleInstanceId,
    pageConfigApi: `${options.backendUrl}/api/pages-config/${encodeURIComponent(options.pageId)}`,
    pageConfigDir: `spark-ai-server/data/pages-config/${options.tenantId}/${auth.projectId}/${options.pageId}`,
    changedFiles: changed,
    savedFiles,
    verifiedFiles,
    fileSummary: summarizeFiles(after),
    sessionSummary,
    artifactValidation,
    persistenceAssertions: {
      filesPersisted,
      requiredFilesChangedAndSaved,
      hitRoundLimit,
      hasToolCalls,
    },
    failureSummary,
    assistantText,
    reasoningText: reasoningDeltas.join('').trim(),
    usages,
    streamEventCount,
    streamEventSummary: summarizeStreamEvents(diagnosticStreamEvents),
    diagnosticSummary: summarizeDiagnosticEvents(diagnosticStreamEvents),
    toolCalls,
    ...(options.printConversation ? { sessionRecord } : {}),
    ...(options.printStreamEvents ? { streamEvents } : {}),
    ...(options.printFiles ? { files: after } : {}),
  }
}

// ============================================================================
// 第 12 层：CLI 出口
// ============================================================================

function runValidateDirOnly(validateDir) {
  const root = path.resolve(validateDir)
  const files = Object.fromEntries(PAGE_NODE_FILE_NAMES.map((name) => {
    const filePath = path.join(root, name)
    if (!fs.existsSync(filePath)) {
      throw new Error(`validate-dir missing file: ${filePath}`)
    }
    return [name, fs.readFileSync(filePath, 'utf8')]
  }))
  const sessionRecord = {
    history: [
      { kind: 'functionCall', toolName: 'vcm_query' },
      { kind: 'functionCall', toolName: 'vcm_action_guide' },
      { kind: 'functionCall', toolName: 'vcm_script' },
    ],
  }
  const artifactValidation = validateArtifacts(files, sessionRecord)
  const payload = { ok: artifactValidation.ok, artifactValidation }
  console.log(JSON.stringify(payload, null, 2))
  process.exit(artifactValidation.ok ? 0 : 2)
}

const options = parseArgs(process.argv.slice(2))
if (options.help) {
  printHelp()
  process.exit(0)
}

if (options.validateDir.trim().length > 0) {
  runValidateDirOnly(options.validateDir.trim())
}

run(options).then((result) => {
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(2)
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.log(JSON.stringify({
    ok: false,
    error: message,
    failureSummary: [message],
    steps: { login: false },
  }, null, 2))
  console.error(error instanceof Error ? (error.stack ?? message) : message)
  process.exit(1)
})
