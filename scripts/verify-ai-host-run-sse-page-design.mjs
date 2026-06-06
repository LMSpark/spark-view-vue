#!/usr/bin/env node
/**
 * Headless Host Run SSE verification.
 *
 * The script acts as an APP execution node without opening any UI:
 * login -> subscribe /api/events -> receive ai-host-run-request ->
 * AiAgentHost.run(alias,args) -> POST ai-host-run-result -> inspect files.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  createAiAgentHost,
  createAiAgentRunTrace,
  createAiAgentTransportTurn,
  createTurnEventCollector,
  toAiAgentRuntimeScope,
} from '@spark-appworks/spark-ai/agent'
import { coerceStrictJsonValue } from '@spark-appworks/spark-ai/json'
import {
  ensurePageDesignBusiness,
  PAGE_DESIGN_MODULE_ID,
} from '../src/services/page-design-business.ts'
import {
  ProjectWorkspace,
} from '@spark-appworks/spark-project-model/project'
import { PAGE_NODE_FILE_NAMES } from '@spark-appworks/spark-project-model'
import { createRequest, isRecord } from '@spark-appworks/spark-utils'
import {
  createAppSseEventHub,
  subscribeAppSseEvents,
} from './app-sse-client.mjs'

const DEFAULT_BACKEND_URL = 'http://localhost:8180'
const DEFAULT_TENANT_ID = 'lmspark'
const DEFAULT_PROJECT_ID = 'homepage'
const DEFAULT_USERNAME = 'admin'
const DEFAULT_PASSWORD = 'admin123'
const DEFAULT_MAX_ROUNDS = 32
const DEFAULT_RUN_TIMEOUT_MS = 20 * 60 * 1000
const DEFAULT_TURN_TIMEOUT_MS = 240_000
const DEFAULT_SESSION_TURN_SAFE_RETRIES = 2
const SESSION_TURN_RETRY_BASE_MS = 800
const REQUEST_TIMEOUT_MS = 30_000

const RESULT_EVENT = 'ai-host-run-result'
const REQUEST_EVENT = 'ai-host-run-request'
const AI_TURN_EVENTS = ['llm-frame']

function readWorkspaceFileText(workspace, name) {
  return workspace.project.getActivePage()?.getFileText(name) ?? ''
}

function readWorkspaceFiles(workspace) {
  return Object.fromEntries(PAGE_NODE_FILE_NAMES.map((name) => [name, readWorkspaceFileText(workspace, name)]))
}

function parseArgs(argv) {
  const runId = createDefaultRunId()
  const options = {
    backendUrl: normalizeBackendUrl(process.env.AI_BACKEND_URL ?? DEFAULT_BACKEND_URL),
    tenantId: process.env.AI_TENANT_ID ?? DEFAULT_TENANT_ID,
    projectId: process.env.AI_PROJECT_ID ?? process.env.AI_APP_ID ?? DEFAULT_PROJECT_ID,
    username: process.env.AI_USERNAME ?? DEFAULT_USERNAME,
    password: process.env.AI_PASSWORD ?? DEFAULT_PASSWORD,
    backendToken: process.env.SPARK_AUTH_TOKEN ?? process.env.SPARK_BACKEND_TOKEN ?? '',
    runId,
    maxRounds: numberFromEnv(process.env.AI_MAX_TOOL_ROUNDS, DEFAULT_MAX_ROUNDS),
    runTimeoutMs: numberFromEnv(process.env.AI_HOST_RUN_TIMEOUT_MS, DEFAULT_RUN_TIMEOUT_MS),
    turnTimeoutMs: numberFromEnv(process.env.AI_TURN_TIMEOUT_MS, DEFAULT_TURN_TIMEOUT_MS),
    sessionTurnSafeRetries: numberFromEnv(process.env.AI_SESSION_TURN_SAFE_RETRIES, DEFAULT_SESSION_TURN_SAFE_RETRIES),
    turnTransport: normalizeTurnTransport(process.env.AI_TURN_TRANSPORT ?? 'session-turn'),
    replacePage: process.env.AI_REPLACE_PAGE === undefined ? true : process.env.AI_REPLACE_PAGE !== '0',
    sequential: process.env.AI_HOST_RUN_SEQUENTIAL === '1',
    pageKeys: parsePageKeyList(process.env.AI_HOST_RUN_ONLY ?? ''),
    reportDir: process.env.AI_HOST_RUN_REPORT_DIR ?? path.join('artifacts', 'ai-host-run'),
    printFiles: process.env.AI_PRINT_FILES === '1',
    pages: [
      {
        key: 'student',
        pageId: `ai-student-grade-management-${runId}`,
        title: '学生成绩管理',
        icon: 'DataAnalysis',
        description: [
          '实现学生成绩管理页面设计。',
          '这是 headless 自动执行场景，不向用户反问；缺失事实按以下默认决策继续。',
          '数据来源固定为 page-data 静态示例数据，预置班级、学生、课程、成绩样例行。',
          '数据模型使用 Class、Student、Course、Grade 四类数据；成绩包含分数、等级、是否异常等字段。',
          '页面采用单页工作台布局：筛选区、统计摘要、成绩表格、录入/编辑表单。',
          '页面需要支持成绩录入、成绩列表、课程与班级筛选、汇总统计、等级判断和异常成绩提示。',
          '优先完成最小可验收四文件闭环：先建精简数据，再写 rule.json 可见 UI，再写 script.js 服务和 style.css 样式；不要只创建数据模型。',
          '所有 node-tree/text-model 调用都必须通过 OpenAI 标准业务函数 tool_call，例如 addNodes({ path, args })、writeScript({ path, args })、writeStyle({ path, args })；不要使用 module_call({ path, functionName, args }) 作为首选。',
          'style.css 必须包含不少于 400 字符的页面样式；script.js 必须包含面向成绩等级、异常提示或筛选统计的页面服务。',
          '产物必须包含可运行的数据模型、页面节点、脚本服务和样式。',
        ].join(''),
      },
      {
        key: 'employee',
        pageId: `ai-employee-info-management-${runId}`,
        title: '员工信息管理',
        icon: 'User',
        description: [
          '实现员工信息管理页面设计。',
          '这是 headless 自动执行场景，不向用户反问；缺失事实按以下默认决策继续。',
          '数据来源固定为 page-data 静态示例数据，预置部门、岗位、员工样例行。',
          '数据模型使用 Department、Position、Employee 三类数据；员工包含状态、联系方式、入职日期、岗位和部门字段。',
          '页面采用单页工作台布局：筛选区、统计摘要、员工表格、档案编辑表单。',
          '页面需要支持员工档案维护、部门岗位筛选、入职状态管理、联系信息展示、统计摘要和数据校验。',
          '优先完成最小可验收四文件闭环：先建精简数据，再写 rule.json 可见 UI，再写 script.js 服务和 style.css 样式；不要只创建数据模型。',
          '所有 node-tree/text-model 调用都必须通过 OpenAI 标准业务函数 tool_call，例如 addNodes({ path, args })、writeScript({ path, args })、writeStyle({ path, args })；不要使用 module_call({ path, functionName, args }) 作为首选。',
          'style.css 必须包含不少于 400 字符的页面样式；script.js 必须包含面向员工状态、联系方式校验或部门岗位筛选的页面服务。',
          '产物必须包含可运行的数据模型、页面节点、脚本服务和样式。',
        ].join(''),
      },
    ],
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const parsed = parseOption(argv, index)
    if (parsed === null) continue
    const { key, value, consumedNext } = parsed
    if (consumedNext) index += 1

    switch (key) {
      case 'help':
      case 'h':
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
      case 'run-id':
        options.runId = normalizeRunId(value)
        options.pages = options.pages.map((page) => ({
          ...page,
          pageId: page.pageId.replace(runId, options.runId),
        }))
        break
      case 'max-rounds':
      case 'max-tool-rounds':
        options.maxRounds = Number(value)
        break
      case 'run-timeout-ms':
      case 'timeout-ms':
        options.runTimeoutMs = Number(value)
        break
      case 'turn-timeout-ms':
        options.turnTimeoutMs = Number(value)
        break
      case 'session-turn-retries':
        options.sessionTurnSafeRetries = Number(value)
        break
      case 'turn-transport':
        options.turnTransport = normalizeTurnTransport(value)
        break
      case 'replace-page':
        options.replacePage = booleanFlag(value)
        break
      case 'no-replace-page':
        options.replacePage = false
        break
      case 'only':
      case 'page':
      case 'pages':
        options.pageKeys = parsePageKeyList(value)
        break
      case 'sequential':
        options.sequential = booleanFlag(value)
        break
      case 'parallel':
        options.sequential = !booleanFlag(value)
        break
      case 'report-dir':
        options.reportDir = value
        break
      case 'print-files':
        options.printFiles = booleanFlag(value)
        break
      case 'student-page-id':
        updatePage(options.pages, 'student', { pageId: value })
        break
      case 'student-title':
        updatePage(options.pages, 'student', { title: value })
        break
      case 'student-request':
        updatePage(options.pages, 'student', { description: value })
        break
      case 'employee-page-id':
        updatePage(options.pages, 'employee', { pageId: value })
        break
      case 'employee-title':
        updatePage(options.pages, 'employee', { title: value })
        break
      case 'employee-request':
        updatePage(options.pages, 'employee', { description: value })
        break
      default:
        throw new Error(`Unknown option: --${key}`)
    }
  }

  if (options.help) return options
  options.backendUrl = requireNonEmpty(options.backendUrl, 'backendUrl')
  options.tenantId = requireNonEmpty(options.tenantId, 'tenantId')
  options.projectId = requireNonEmpty(options.projectId, 'projectId')
  options.username = options.username.trim()
  options.password = options.password.trim()
  options.backendToken = options.backendToken.trim()
  options.reportDir = requireNonEmpty(options.reportDir, 'reportDir')
  if (options.pageKeys.length > 0) {
    options.pages = options.pages.filter((page) => options.pageKeys.includes(page.key))
  }
  if (options.pages.length === 0) {
    throw new Error('No target pages selected.')
  }
  for (const page of options.pages) {
    page.pageId = requireNonEmpty(page.pageId, `${page.key}.pageId`)
    page.title = requireNonEmpty(page.title, `${page.key}.title`)
    page.description = requireNonEmpty(page.description, `${page.key}.description`)
  }
  requirePositiveNumber(options.maxRounds, 'maxRounds')
  requirePositiveNumber(options.runTimeoutMs, 'runTimeoutMs')
  requirePositiveNumber(options.turnTimeoutMs, 'turnTimeoutMs')
  requirePositiveNumber(options.sessionTurnSafeRetries, 'sessionTurnSafeRetries')
  options.turnTransport = normalizeTurnTransport(options.turnTransport)
  return options
}

function printHelp() {
  console.log([
    'Headless Host Run SSE pageDesign verification.',
    '',
    'Usage:',
    '  node --import tsx scripts/verify-ai-host-run-sse-page-design.mjs [options]',
    '',
    'Options:',
    '  --backend-url <url>       Java backend URL',
    '  --tenant-id <id>          Tenant ID',
    '  --project-id <id>         Project ID',
    '  --username <name>         Login username',
    '  --password <password>     Login password',
    '  --backend-token <token>   Use existing bearer token',
    '  --run-id <id>             Stable page suffix',
    '  --timeout-ms <n>          Host run timeout in ms',
    '  --turn-timeout-ms <n>     LLM turn timeout in ms',
    '  --session-turn-retries <n> Safe retries for transient session-turn LLM failures',
    '  --turn-transport <mode>   session-turn (default) or app-sse',
    '  --student-page-id <id>    Student page ID',
    '  --student-request <text>  Student page description',
    '  --employee-page-id <id>   Employee page ID',
    '  --employee-request <text> Employee page description',
    '  --only <keys>             Comma-separated page keys: student,employee',
    '  --sequential              Trigger selected runs one by one',
    '  --no-replace-page         Reuse existing pages',
    '  --print-files             Include generated file text in report',
    '  --help                    Show help',
  ].join('\n'))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  console.log(`[host-run-sse] login tenant=${options.tenantId} project=${options.projectId}`)
  const auth = await resolveBackendAuth(options)
  await ensureHealth(options)

  const worker = await startHeadlessHostRunWorker(options, auth)
  try {
    const setupEditor = createPageConfigRuntime(options, auth).editor
    for (const page of options.pages) {
      const state = await prepareTargetPage(setupEditor, options, page)
      console.log(`[host-run-sse] page ${page.pageId} ${state}`)
    }

    console.log(`[host-run-sse] appClientId=${worker.appClientId}`)
    const startedAt = Date.now()
    const results = options.sequential
      ? await triggerHostRunsSequentially({ options, auth, worker })
      : await Promise.all(options.pages.map((page) => triggerHostRun({
        options,
        auth,
        worker,
        page,
      })))
    const reports = []
    for (const item of results) {
      const report = await inspectPageResult(options, auth, item)
      reports.push(report)
    }

    const summary = {
      ok: reports.every((report) => report.status === 'completed' && report.validation.ok),
      durationMs: Date.now() - startedAt,
      appClientId: worker.appClientId,
      pages: reports,
    }
    await writeReport(options, summary)
    console.log(JSON.stringify(summary, null, 2))
    if (!summary.ok) {
      process.exitCode = 1
    }
  } finally {
    worker.close()
    await worker.closed
  }
}

async function startHeadlessHostRunWorker(options, auth) {
  const eventHub = createAppSseEventHub()
  let appSseCookie = ''
  const editorsByPageId = new Map()
  const activeRequestIds = new Set()
  const completedResults = new Map()

  const aiHost = createAiAgentHost({
    turnCallbacks: createTurnCallbacks(options, auth),
    maxToolRounds: options.maxRounds,
  })
  const pageDesignHost = ensurePageDesignBusiness({
    host: aiHost,
    getPageDesignEditor: (context) => {
      const editor = editorsByPageId.get(context.moduleInstanceId)
      if (editor === undefined) {
        throw new Error(`Headless editor is not prepared for ${context.moduleInstanceId}`)
      }
      return editor
    },
  })

  const subscription = subscribeAppSseEvents({
    url: `${options.backendUrl}/api/events`,
    headers: createAuthHeaders(options, auth),
    events: [REQUEST_EVENT, RESULT_EVENT],
    onOpen: (response) => {
      appSseCookie = appClientCookieFromResponse(response)
    },
    onEvent: eventHub.emit,
  })
  await subscription.opened
  const appClientId = appClientIdFromCookie(appSseCookie)
  if (appClientId.length === 0) {
    throw new Error('APP SSE subscription did not return SPARK_APP_CLIENT_ID')
  }

  eventHub.on(REQUEST_EVENT, (event) => {
    const data = event.data
    const requestId = isRecord(data) ? readString(data, 'requestId') : ''
    const alias = isRecord(data) ? readString(data, 'alias') : ''
    const dataArgs = isRecord(data) ? data.args : null
    const pageId = isRecord(dataArgs) ? readString(dataArgs, 'pageId') : ''
    console.log(`[host-run-sse] request received requestId=${requestId} alias=${alias} pageId=${pageId}`)
    void handleHostRunRequest({
      event: data,
      options,
      auth,
      host: pageDesignHost,
      appSseCookie,
      editorsByPageId,
      activeRequestIds,
      completedResults,
    })
  })

  return {
    appClientId,
    appSseCookie,
    eventHub,
    close: subscription.close,
    closed: subscription.closed,
  }
}

async function handleHostRunRequest(runtime) {
  const startedAt = Date.now()
  const event = runtime.event
  if (!isRecord(event)) return
  const requestId = readString(event, 'requestId')
  const alias = readString(event, 'alias')
  if (requestId.length === 0 || alias.length === 0) return

  const cached = runtime.completedResults.get(requestId)
  if (cached !== undefined) {
    await postHostRunResult(runtime.options, runtime.auth, cached, runtime.appSseCookie)
    return
  }
  if (runtime.activeRequestIds.has(requestId)) {
    await completeHostRun(runtime, failureResult(event, startedAt, 'busy', 'AI_HOST_RUN_BUSY', `request is already running: ${requestId}`))
    return
  }

  runtime.activeRequestIds.add(requestId)
  const timeoutMs = numberFromUnknown(event.timeoutMs, runtime.options.runTimeoutMs)
  const controller = new AbortController()
  const timeoutState = { timedOut: false }
  const timeoutId = setTimeout(() => {
    timeoutState.timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    let args
    try {
      args = toAiJsonParams(event.args)
    } catch (error) {
      await completeHostRun(runtime, failureResult(event, startedAt, 'invalid_args', 'AI_HOST_RUN_INVALID_REQUEST', errorMessage(error)))
      return
    }

    if (!runtime.host.has(alias)) {
      await completeHostRun(runtime, failureResult(event, startedAt, 'unknown_alias', 'AI_HOST_RUN_UNKNOWN_ALIAS', `alias is not registered: ${alias}`))
      return
    }
    console.log(`[host-run-sse] host run start requestId=${requestId} alias=${alias} pageId=${pageId}`)

    const pageId = readString(args, 'pageId')
    if (alias === PAGE_DESIGN_MODULE_ID && pageId.length > 0) {
      const editor = createPageConfigRuntime(runtime.options, runtime.auth).editor
      await editor.selectPage(pageId, { forceReload: true })
      runtime.editorsByPageId.set(pageId, editor)
    }

    const dryRun = runtime.host.dryRun(alias, args)
    if (!dryRun.ok) {
      await completeHostRun(runtime, failureResult(event, startedAt, classifyDryRunStatus(dryRun.error.message), classifyDryRunCode(dryRun.error.message), dryRun.error.message, {
        diagnostics: dryRun.diagnostics,
      }))
      return
    }

    const trace = createAiAgentRunTrace()
    trace.reset()
    trace.appendUserMessage(dryRun.orchestration.userMessage)
    const result = await runtime.host.run(alias, args, {
      signal: controller.signal,
      onStreamEvent: (streamEvent) => trace.appendEvent(streamEvent),
      onDelta: (delta) => trace.appendDelta(delta),
      onReasoning: (reasoning) => trace.appendReasoning(reasoning),
      onToolCall: (record) => trace.appendToolCall(record),
    })
    trace.finish()

    const snapshot = trace.snapshot()
    const savedFiles = await savePreparedPageFiles(runtime, pageId)
    console.log(`[host-run-sse] host run completed requestId=${requestId} sessionId=${result.session.sessionId} toolCalls=${snapshot.toolCalls.length}`)
    await completeHostRun(runtime, {
      requestId,
      alias,
      status: 'completed',
      durationMs: Date.now() - startedAt,
      clientTimestamp: Date.now(),
      sessionId: result.session.sessionId,
      businessRegistrationId: result.session.scope.businessRegistrationId,
      businessInstanceId: result.session.scope.businessInstanceId,
      text: snapshot.streamText,
      reasoning: snapshot.reasoningText,
      toolCalls: snapshot.toolCalls,
      details: {
        savedFiles,
      },
    })
  } catch (error) {
    const details = await saveDirtyFilesAfterFailure(runtime, event)
    await completeHostRun(runtime, failureResult(
      event,
      startedAt,
      timeoutState.timedOut ? 'timeout' : 'failed',
      timeoutState.timedOut ? 'AI_HOST_RUN_TIMEOUT' : 'AI_HOST_RUN_FAILED',
      errorMessage(error),
      details,
    ))
  } finally {
    clearTimeout(timeoutId)
    runtime.activeRequestIds.delete(requestId)
    const pageId = isRecord(event.args) ? readString(event.args, 'pageId') : ''
    if (pageId.length > 0) runtime.editorsByPageId.delete(pageId)
  }
}

async function triggerHostRun({ options, auth, worker, page }) {
  const requestId = randomUUID()
  const resultPromise = waitForResult(worker.eventHub, requestId, options.runTimeoutMs + 30_000)
  console.log(`[host-run-sse] request post page=${page.key} pageId=${page.pageId} requestId=${requestId}`)
  const accepted = await postBackendJson(options, auth, '/api/ai/host-run/request', {
    appClientId: worker.appClientId,
    requestId,
    alias: PAGE_DESIGN_MODULE_ID,
    args: {
      pageId: page.pageId,
      description: page.description,
      mode: 'create',
    },
    timeoutMs: options.runTimeoutMs,
    reason: `headless-verify:${page.key}`,
  }, undefined, { Cookie: worker.appSseCookie })
  console.log(`[host-run-sse] request accepted requestId=${requestId} delivered=${String(accepted?.delivered ?? '')}`)
  const result = await resultPromise
  return { requestId, page, result }
}

async function triggerHostRunsSequentially({ options, auth, worker }) {
  const results = []
  for (const page of options.pages) {
    results.push(await triggerHostRun({ options, auth, worker, page }))
  }
  return results
}

function waitForResult(eventHub, requestId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      stop()
      reject(new Error(`Timed out waiting for ${RESULT_EVENT}: ${requestId}`))
    }, timeoutMs)
    const stop = eventHub.on(RESULT_EVENT, (event) => {
      const data = event.data
      if (!isRecord(data) || data.requestId !== requestId) return
      clearTimeout(timeout)
      stop()
      resolve(data)
    })
  })
}

async function inspectPageResult(options, auth, item) {
  const editor = createPageConfigRuntime(options, auth).editor
  await editor.selectPage(item.page.pageId, { forceReload: true })
  const files = readEditorFiles(editor)
  const validation = validateGeneratedPage(files, item.page)
  return {
    key: item.page.key,
    pageId: item.page.pageId,
    requestId: item.requestId,
    status: item.result.status,
    durationMs: item.result.durationMs ?? null,
    sessionId: item.result.sessionId ?? null,
    error: item.result.error ?? null,
    resultTextPreview: summarizeText(item.result.text ?? '', 800),
    toolCallCount: Array.isArray(item.result.toolCalls) ? item.result.toolCalls.length : 0,
    files: summarizeFiles(files),
    validation,
    ...(options.printFiles ? { fileText: files } : {}),
  }
}

function validateGeneratedPage(files, page) {
  const errors = []
  const ruleJson = parseJson(files['rule.json'], 'rule.json', errors)
  const pageDataJson = parseJson(files['pagedata.json'], 'pagedata.json', errors)
  if (typeof files['style.css'] !== 'string' || files['style.css'].trim().length < 400) {
    errors.push('style.css is too small')
  }
  if (typeof files['script.js'] !== 'string') {
    errors.push('script.js is missing')
  } else if (files['script.js'].trim().length < 180) {
    errors.push('script.js is too small')
  }
  if (!isValidRuleRoot(ruleJson)) {
    errors.push('rule.json root is not a non-empty object or array')
  } else if (isInitialPlaceholderRule(ruleJson)) {
    errors.push('rule.json is still the initial placeholder')
  }
  if (!isRecord(pageDataJson)) {
    errors.push('pagedata.json root is not object')
  } else if (!hasPageDataTables(pageDataJson)) {
    errors.push('pagedata.json has no business tables')
  }
  const allText = Object.values(files).join('\n')
  if (!allText.includes(page.title.slice(0, 2))) {
    errors.push(`generated files do not mention page title prefix: ${page.title.slice(0, 2)}`)
  }
  return {
    ok: errors.length === 0,
    errors,
  }
}

function hasPageDataTables(value) {
  return isRecord(value.tables) && Object.keys(value.tables).length > 0
}

function isValidRuleRoot(value) {
  if (isRecord(value)) return true
  return Array.isArray(value) && value.length > 0
}

function isInitialPlaceholderRule(value) {
  const serialized = JSON.stringify(value)
  return serialized.includes('页面配置就绪') || serialized.includes('请编辑 rule.json')
}

async function writeReport(options, summary) {
  await mkdir(options.reportDir, { recursive: true })
  const file = path.join(options.reportDir, `host-run-sse-page-design-${options.runId}.json`)
  await writeFile(file, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  console.log(`[host-run-sse] report=${file}`)
}

function createPageConfigRuntime(options, auth) {
  const http = createRequest({
    baseURL: options.backendUrl,
    timeout: REQUEST_TIMEOUT_MS,
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
  return {
    editor: new ProjectWorkspace({
      projectId: auth.projectId,
      http,
      getPageFilesApi: () => `${options.backendUrl}/api/pages-config`,
      getNavigationApi: () => `${options.backendUrl}/api/navigation`,
      getHeaders: () => createAuthHeaders(options, auth),
      fileStorage: 'memory',
    }),
  }
}

async function prepareTargetPage(editor, options, page) {
  if (options.replacePage) {
    try {
      await editor.deletePageFiles(page.pageId)
    } catch {
      // Missing pages are expected on fresh runs.
    }
    await editor.createPageFiles({
      pageId: page.pageId,
      title: page.title,
      icon: page.icon,
    })
    return 'created'
  }
  try {
    await editor.createPageFiles({
      pageId: page.pageId,
      title: page.title,
      icon: page.icon,
    })
    return 'created'
  } catch {
    return 'reused'
  }
}

function createTurnCallbacks(options, auth) {
  const preparedSessionIds = new Set()
  return {
    prepareSession: async (input) => {
      if (preparedSessionIds.has(input.sessionId)) return
      const body = await postBackendJson(options, auth, '/api/ai/sessions', {
        protocolVersion: 4,
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
      if (options.turnTransport === 'session-turn') {
        return executeSessionTurn(options, auth, input)
      }

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
        protocolVersion: 4,
        scope: toAiAgentRuntimeScope(input.scope),
        turn: createAiAgentTransportTurn(input),
        messages: input.messages,
      })
      assertAppendMessages(body, input)
    },
  }
}

async function executeSessionTurn(options, auth, input) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await executeSessionTurnOnce(options, auth, input)
    } catch (error) {
      if (attempt >= options.sessionTurnSafeRetries || !isSafeRetryableTurnError(error)) throw error
      console.warn(`[host-run-sse] session-turn safe retry ${attempt + 1}/${options.sessionTurnSafeRetries}: ${errorMessage(error)}`)
      await delay(SESSION_TURN_RETRY_BASE_MS * 2 ** attempt, input.signal)
    }
  }
}

async function executeSessionTurnOnce(options, auth, input) {
  const body = await postBackendJson(options, auth, `/api/ai/sessions/${encodeURIComponent(input.sessionId)}/turn`, {
    protocolVersion: 4,
    scope: toAiAgentRuntimeScope(input.scope),
    turn: createAiAgentTransportTurn(input),
    messages: input.messages,
  }, input.signal)
  assertSessionTurnResult(body, input)
  const result = {
    text: typeof body.text === 'string' ? body.text : '',
    ...(typeof body.reasoning === 'string' ? { reasoning: body.reasoning } : {}),
    toolCalls: readToolCalls(body.toolCalls),
    assistantMessagePersisted: true,
  }
  input.onStreamEvent?.({
    type: 'result',
    data: body,
    turnKey: '',
    streamKey: '',
    scope: {
      businessRegistrationId: input.scope.businessRegistrationId,
      businessInstanceId: input.scope.businessInstanceId,
      eventModuleId: 'llm',
      turnId: input.turn.turnId,
    },
  })
  if (result.reasoning !== undefined && result.reasoning.length > 0) input.onReasoning?.(result.reasoning)
  if (result.toolCalls.length === 0 && result.text.length > 0) input.onDelta?.(result.text)
  return result
}

function isSafeRetryableTurnError(error) {
  const message = errorMessage(error)
  return message.includes('LLM_CALL_FAILED')
    || message.includes('"retryPolicy":"safe-retry"')
    || message.includes('"retryPolicy": "safe-retry"')
    || message.includes('(safe-retry)')
}

async function delay(ms, signal) {
  if (signal?.aborted) throw new Error('session-turn retry aborted')
  await new Promise((resolve, reject) => {
    let onAbort = () => {}
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    onAbort = () => {
      clearTimeout(timer)
      cleanup()
      reject(new Error('session-turn retry aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function resolveBackendAuth(options) {
  if (options.backendToken.length > 0) {
    return { token: options.backendToken, projectId: options.projectId }
  }
  const response = await fetch(`${options.backendUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': options.tenantId,
      'X-Project-Id': options.projectId,
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
  const data = isRecord(payload) ? payload.data : undefined
  const token = readString(payload, 'token') || readString(data, 'token')
  if (token.length === 0) {
    throw new Error(`Java backend login failed: missing token in ${text}`)
  }
  const defaultProjectId = readString(payload, 'defaultProjectId') || readString(data, 'defaultProjectId')
  return {
    token,
    projectId: options.projectId.length > 0 ? options.projectId : defaultProjectId,
  }
}

function createAuthHeaders(options, auth) {
  return {
    Authorization: `Bearer ${auth.token}`,
    'X-Tenant-Id': options.tenantId,
    'X-Project-Id': auth.projectId,
  }
}

async function ensureHealth(options) {
  const response = await fetch(`${options.backendUrl}/health`)
  if (!response.ok) {
    throw new Error(`Backend health check failed: ${response.status}`)
  }
}

async function postBackendJson(options, auth, requestPath, payload, signal, extraHeaders = {}) {
  const response = await fetch(`${options.backendUrl}${requestPath}`, {
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
    throw new Error(`POST ${requestPath} failed: ${response.status} ${text}`)
  }
  return body
}

async function postHostRunResult(options, auth, payload, appSseCookie) {
  await postBackendJson(options, auth, '/api/ai/host-run/result', payload, undefined, {
    Cookie: appSseCookie,
  })
}

async function completeHostRun(runtime, payload) {
  runtime.completedResults.set(payload.requestId, payload)
  await postHostRunResult(runtime.options, runtime.auth, payload, runtime.appSseCookie)
}

function failureResult(event, startedAt, status, code, message, details) {
  return {
    requestId: readString(event, 'requestId'),
    alias: readString(event, 'alias'),
    status,
    durationMs: Date.now() - startedAt,
    clientTimestamp: Date.now(),
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  }
}

function toAiJsonParams(args) {
  const coerced = coerceStrictJsonValue(args)
  if (!isRecord(coerced)) {
    throw new Error('AI Host Run args must be a JSON object.')
  }
  return coerced
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

async function savePreparedPageFiles(runtime, pageId) {
  if (pageId.length === 0) return []
  const editor = runtime.editorsByPageId.get(pageId)
  return editor === undefined ? [] : saveDirtyFiles(editor)
}

async function saveDirtyFilesAfterFailure(runtime, event) {
  const pageId = isRecord(event.args) ? readString(event.args, 'pageId') : ''
  if (pageId.length === 0) return undefined
  try {
    const savedFiles = await savePreparedPageFiles(runtime, pageId)
    return savedFiles.length === 0 ? undefined : { savedFiles }
  } catch (error) {
    return {
      saveError: errorMessage(error),
    }
  }
}

function readEditorFiles(editor) {
  return readWorkspaceFiles(editor)
}

function summarizeFiles(files) {
  return Object.fromEntries(Object.entries(files).map(([name, content]) => [name, {
    bytes: Buffer.byteLength(String(content ?? ''), 'utf8'),
    lines: String(content ?? '').length === 0 ? 0 : String(content ?? '').split(/\r?\n/).length,
  }]))
}

function classifyDryRunStatus(message) {
  return message.includes('schema validation') || message.includes('input') || message.includes('params')
    ? 'invalid_args'
    : 'non_runnable'
}

function classifyDryRunCode(message) {
  return classifyDryRunStatus(message) === 'invalid_args'
    ? 'AI_HOST_RUN_INVALID_REQUEST'
    : 'AI_HOST_RUN_NON_RUNNABLE'
}

function assertTurnStart(body, input) {
  if (!isRecord(body)) throw new Error('AI turn start response missing body')
  if (body.accepted !== true) throw new Error('AI turn start response was not accepted')
  if (readString(body, 'sessionId') !== input.sessionId) throw new Error('AI turn start response sessionId mismatch')
  if (readString(body, 'turnId') !== input.turn.turnId) throw new Error('AI turn start response turnId mismatch')
}

function assertAppendMessages(body, input) {
  if (!isRecord(body)) throw new Error('AI append response missing body')
  if (readString(body, 'sessionId') !== input.sessionId) throw new Error('AI append response sessionId mismatch')
  if (readString(body, 'turnId') !== input.turn.turnId) throw new Error('AI append response turnId mismatch')
}

function assertSessionTurnResult(body, input) {
  if (!isRecord(body)) throw new Error('AI session turn response missing body')
  if (readString(body, 'sessionId') !== input.sessionId) throw new Error('AI session turn response sessionId mismatch')
  const turnId = readString(body, 'turnId')
  if (turnId.length > 0 && turnId !== input.turn.turnId) throw new Error('AI session turn response turnId mismatch')
}

function readToolCalls(value) {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeToolCall)
    .filter((call) => call !== null)
}

function normalizeToolCall(value) {
  if (!isRecord(value)) return null
  const fn = isRecord(value.function) ? value.function : null
  if (fn === null || typeof fn.name !== 'string' || fn.name.trim().length === 0) return null
  if (typeof value.id !== 'string' || value.id.trim().length === 0) return null
  const rawArguments = fn.arguments
  return {
    id: value.id,
    type: 'function',
    function: {
      name: fn.name,
      arguments: typeof rawArguments === 'string' ? rawArguments : JSON.stringify(rawArguments ?? {}),
    },
  }
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

function appClientIdFromCookie(cookie) {
  const match = String(cookie).match(/SPARK_APP_CLIENT_ID=([^;]+)/)
  return match?.[1] ?? ''
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

function parseJsonMaybe(value) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function parseJson(value, label, errors) {
  try {
    return JSON.parse(String(value ?? ''))
  } catch (error) {
    errors.push(`${label} parse failed: ${errorMessage(error)}`)
    return null
  }
}

function readString(value, key) {
  return isRecord(value) && typeof value[key] === 'string' ? value[key] : ''
}

function numberFromUnknown(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function numberFromEnv(value, fallback) {
  return numberFromUnknown(value, fallback)
}

function summarizeText(value, maxLength) {
  const text = String(value ?? '')
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...<truncated ${text.length - maxLength} chars>`
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

function updatePage(pages, key, patch) {
  const page = pages.find((item) => item.key === key)
  if (page === undefined) throw new Error(`Unknown page key: ${key}`)
  Object.assign(page, patch)
}

function normalizeBackendUrl(value) {
  return String(value ?? DEFAULT_BACKEND_URL).replace(/\/+$/, '')
}

function createDefaultRunId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const random = Math.random().toString(36).slice(2, 8)
  return `${stamp}-${random}`
}

function normalizeRunId(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return requireNonEmpty(normalized, 'runId')
}

function booleanFlag(value) {
  return value !== 'false' && value !== '0'
}

function parsePageKeyList(value) {
  const keys = String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  for (const key of keys) {
    if (key !== 'student' && key !== 'employee') {
      throw new Error(`Unknown page key: ${key}`)
    }
  }
  return Array.from(new Set(keys))
}

function normalizeTurnTransport(value) {
  const normalized = String(value ?? '').trim()
  if (normalized === 'session-turn' || normalized === 'app-sse') return normalized
  throw new Error(`Unknown turn transport: ${value}`)
}

function requireNonEmpty(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value.trim()
}

function requirePositiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`)
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
