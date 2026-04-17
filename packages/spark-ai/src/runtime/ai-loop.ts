/**
 * AI 页面配置闭环服务
 *
 * 完整流程：
 *   提示词 → AI → 生成/修改 4 文件 → SPARK 自动渲染 → Logger 全量上报 → AI 分析日志 → 修改 4 文件 → 循环
 *
 * 本模块提供客户端侧的闭环协调器：
 *   1. 将用户提示词 + 当前页面日志发送给 AI 后端
 *   2. 接收 AI 返回的 4 文件内容
 *   3. 通过 Vite 写入 API 写入磁盘
 *   4. 监听 SSE 文件变更事件，触发页面刷新
 *   5. 收集新一轮日志，准备下一轮循环
 *
 * 使用示例：
 * ```ts
 * import { AIPageLoop } from '@spark-view/spark-ai'
 *
 * const loop = new AIPageLoop({
 *   aiEndpoint: '/api/ai/chat',
 *   onFilesUpdated: (pageId) => { router.push(`/${pageId}`) },
 *   onError: (err) => { console.error(err) },
 * })
 *
 * // 首次生成
 * await loop.generate('order-list', '创建一个订单列表页面，包含表格和分页')
 *
 * // 基于日志反馈迭代
 * await loop.iterate('order-list', '表格没有显示数据，请检查 dataKey 绑定')
 * ```
 */

import { createRequest, onPageConfigChange } from '@spark-view/spark-utils'
import { clearPageCache } from './page-cache'
import { validateGeneratedConfig } from '../validation/config-validator'
import type { ConfigValidationReport } from '../validation/config-validator'
import { configureNavRegister, registerPageNavigation } from './nav-register'
import type { NavRegistrationResult } from './nav-register'
import type { StreamCallbacks } from '../protocol'

/** 模块级共享 HTTP 客户端（统一 axios 封装，复用拦截器 / 超时 / 重试配置） */
const http = createRequest({ timeout: 240_000 })

/** 动态 Page API 基础路径解析器（由应用层注入） */
let _getPageApiUrl: (() => string) | null = null

/** 动态请求头获取器（用于 fetch 流式请求，由应用层注入） */
let _getStreamHeaders: (() => Record<string, string>) | null = null

/**
 * 配置 AI Loop 的 HTTP 客户端和 API 路径。
 * 应在应用启动时调用一次，注入认证头和租户作用域路径。
 */
export function configureAILoopHttp(options: {
  getHeaders?: () => Record<string, string>
  getPageApiUrl?: () => string
  getNavApiUrl?: () => string
}): void {
  if (options.getHeaders) {
    const getHeaders = options.getHeaders
    _getStreamHeaders = getHeaders
    http.interceptors.request.use({
      onRequest: (config) => {
        config.headers = { ...config.headers, ...getHeaders() }
        return config
      }
    })
  }
  if (options.getPageApiUrl) {
    _getPageApiUrl = options.getPageApiUrl
  }
  if (options.getNavApiUrl) {
    configureNavRegister({
      getNavApiUrl: options.getNavApiUrl,
      ...(options.getHeaders ? { getHeaders: options.getHeaders } : {}),
    })
  }
}

/** 获取当前 Page API 基础路径（带租户作用域） */
function getPageApiUrl(): string {
  if (_getPageApiUrl) return _getPageApiUrl()
  throw new Error('AI Loop 未配置 getPageApiUrl，无法解析租户作用域 pages-config API')
}

// ─── 信号订阅（框架无关） ────────────────────────────────────────────────────

type SignalListener = () => void

const _logListeners = new Set<SignalListener>()
const _refreshListeners = new Set<SignalListener>()

/** 订阅日志更新通知，返回取消订阅函数 */
export function onLogUpdate(listener: SignalListener): () => void {
  _logListeners.add(listener)
  return () => { _logListeners.delete(listener) }
}

/** 内部：通知所有日志更新监听器 */
function _notifyLogUpdate(): void {
  for (const fn of _logListeners) fn()
}

/** 订阅页面刷新通知，返回取消订阅函数 */
export function onPageRefresh(listener: SignalListener): () => void {
  _refreshListeners.add(listener)
  return () => { _refreshListeners.delete(listener) }
}

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** AI 闭环四文件 */
export interface PageFiles {
  'rule.json'?: string
  'pagedata.json'?: string
  'script.js'?: string
  'style.css'?: string
}

/** AI 后端响应格式（需后端配合实现） */
export interface AIResponse {
  /** AI 生成/修改的文件内容 */
  files: PageFiles
  /** AI 的分析说明（可选，展示给用户） */
  explanation?: string
  /** 是否需要继续迭代 */
  needsIteration?: boolean
  /** 配置一致性验证报告 */
  validationReport?: ConfigValidationReport
  /** 导航自动注册结果（仅 generate 时填充） */
  navigationResult?: NavRegistrationResult
}

/** 日志条目（与 Logger 的 LogEntry 对齐） */
export interface LogSnapshot {
  level: string
  message: string
  meta?: Record<string, unknown> | undefined
  timestamp: number
  pageId?: string | undefined
  fingerprint?: string | undefined
}

export interface LogIssueSummary {
  fingerprint: string
  level: string
  message: string
  count: number
  lastTimestamp: number
  sampleMeta?: Record<string, unknown> | undefined
}

export interface LogBatchSummary {
  totalLogs: number
  errorCount: number
  warnCount: number
  infoCount: number
  debugCount: number
  duplicateCount: number
  qualityScore: number
  qualityLevel: 'high' | 'medium' | 'low'
  signature: string
  issues: LogIssueSummary[]
  sampleLogs: LogSnapshot[]
}

export interface PageDiagnosticsReport extends LogBatchSummary {
  pageId: string
  sampledAt: number
}

interface SummarizeLogOptions {
  maxIssues?: number
  maxSamples?: number
}

function withValidationReport(
  response: AIResponse,
  catalogValidator?: (files: PageFiles) => ConfigValidationReport,
): AIResponse {
  const report = catalogValidator
    ? catalogValidator(response.files)
    : validateGeneratedConfig(response.files)
  if (report.summary.total === 0) {
    return { ...response, validationReport: report }
  }

  const details = report.issues
    .slice(0, 6)
    .map(issue => `- [${issue.category}] ${issue.message}`)
    .join('\n')

  const header = `⚠️ 配置一致性校验：错误 ${report.summary.errors}，警告 ${report.summary.warnings}`
  const suffix = details === '' ? header : `${header}\n${details}`
  const explanation = response.explanation?.trim()

  return {
    ...response,
    explanation: explanation && explanation !== '' ? `${explanation}\n\n${suffix}` : suffix,
    needsIteration: response.needsIteration ?? !report.valid,
    validationReport: report,
  }
}

function normalizeLogMessage(rawMessage: string): string {
  return rawMessage
    .trim()
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\b\d{5,}\b/g, '<num>')
    .replace(/[0-9a-f]{8,}/gi, '<hex>')
    .replace(/"[^"]{18,}"/g, '"<long>"')
    .replace(/\s+/g, ' ')
}

function buildLogFingerprint(entry: LogSnapshot): string {
  const normalizedMessage = normalizeLogMessage(entry.message)
  return `${entry.level}::${normalizedMessage}`
}

function qualityFromSummary(summary: {
  totalLogs: number
  errorCount: number
  warnCount: number
  duplicateCount: number
  issueCount: number
}): { score: number; level: 'high' | 'medium' | 'low' } {
  if (summary.totalLogs === 0) {
    return { score: 20, level: 'low' }
  }

  const penalty =
    summary.errorCount * 8 +
    summary.warnCount * 3 +
    summary.duplicateCount * 2 +
    Math.max(0, summary.issueCount - 3) * 4

  const score = Math.max(0, Math.min(100, 100 - penalty))
  if (score >= 80) return { score, level: 'high' }
  if (score >= 55) return { score, level: 'medium' }
  return { score, level: 'low' }
}

export function summarizeLogBatch(logs: LogSnapshot[], options?: SummarizeLogOptions): LogBatchSummary {
  const maxIssues = options?.maxIssues ?? 8
  const maxSamples = options?.maxSamples ?? 24

  const issueMap = new Map<string, LogIssueSummary>()
  let errorCount = 0
  let warnCount = 0
  let infoCount = 0
  let debugCount = 0

  for (const rawLog of logs) {
    const fingerprint = rawLog.fingerprint ?? buildLogFingerprint(rawLog)
    const log: LogSnapshot = rawLog.fingerprint ? rawLog : { ...rawLog, fingerprint }

    if (log.level === 'error') errorCount += 1
    else if (log.level === 'warn') warnCount += 1
    else if (log.level === 'info') infoCount += 1
    else debugCount += 1

    const existing = issueMap.get(fingerprint)
    if (existing) {
      existing.count += 1
      if (log.timestamp > existing.lastTimestamp) {
        existing.lastTimestamp = log.timestamp
      }
      continue
    }

    issueMap.set(fingerprint, {
      fingerprint,
      level: log.level,
      message: normalizeLogMessage(log.message),
      count: 1,
      lastTimestamp: log.timestamp,
      sampleMeta: log.meta,
    })
  }

  const issues = [...issueMap.values()]
    .sort((a, b) => {
      const levelWeight = (value: string): number => {
        if (value === 'error') return 3
        if (value === 'warn') return 2
        if (value === 'info') return 1
        return 0
      }
      return levelWeight(b.level) - levelWeight(a.level) || b.count - a.count || b.lastTimestamp - a.lastTimestamp
    })
    .slice(0, maxIssues)

  const fingerprints = new Set(issues.map(item => item.fingerprint))
  const sampleLogs = logs
    .filter(item => {
      const fingerprint = item.fingerprint ?? buildLogFingerprint(item)
      return fingerprints.has(fingerprint)
    })
    .slice(-maxSamples)

  const duplicateCount = Math.max(0, logs.length - issueMap.size)
  const quality = qualityFromSummary({
    totalLogs: logs.length,
    errorCount,
    warnCount,
    duplicateCount,
    issueCount: issueMap.size,
  })

  return {
    totalLogs: logs.length,
    errorCount,
    warnCount,
    infoCount,
    debugCount,
    duplicateCount,
    qualityScore: quality.score,
    qualityLevel: quality.level,
    signature: issues.map(item => `${item.fingerprint}:${item.count}`).join('|'),
    issues,
    sampleLogs,
  }
}

/** AI Loop 配置 */
export interface AIPageLoopOptions {
  /** AI 后端端点（接收提示词+日志，返回文件内容） */
  aiEndpoint: string
  /** 文件写入后的回调（可用于导航到目标页面） */
  onFilesUpdated?: (pageId: string, files: string[]) => void
  /** 错误回调 */
  onError?: (error: Error) => void
  /** 日志收集等待时间 ms（文件写入后等待页面渲染产生日志，默认 3000） */
  logCollectDelay?: number
  /** 是否将全局 error/warn 合并进页面诊断样本（默认 true） */
  includeGlobalDiagnostics?: boolean
  /** 生成页面后自动注册导航节点（默认 true，需先配置 getNavApiUrl） */
  autoRegisterNav?: boolean
  /** 导航注册完成回调 */
  onNavigationRegistered?: (pageId: string, result: NavRegistrationResult) => void
  /** 自动迭代安全超时 ms（超时后强制恢复标志，默认 180000 即 3 分钟） */
  autoIterateTimeout?: number
  /**
   * 可选增强校验器（基于 ComponentCatalog 的结构化校验）
   *
   * 传入时替代内置 validateGeneratedConfig，校验 props / 嵌套 / 组件注册等。
   * 未传入时自动回退到内置规则校验。
   *
   * @example
   * ```ts
   * import { COMPONENT_CATALOG } from '@spark-view/spark-ai'
   * import { validateWithCatalog } from '@spark-view/vite-plugin-spark-catalog'
   *
   * const loop = new AIPageLoop({
   *   catalogValidator: (files) => validateWithCatalog(COMPONENT_CATALOG, files),
   * })
   * ```
   */
  catalogValidator?: (files: PageFiles) => ConfigValidationReport
  /**
   * AI 响应后处理钩子（校验后、文件写入前调用）
   *
   * 返回修改后的 AIResponse（可补充 explanation / needsIteration）。
   * 若抛出异常则跳过该步骤，不影响文件写入。
   */
  onResponseProcessed?: (response: AIResponse, pageId: string) => AIResponse | Promise<AIResponse>
}

// ─── 自动迭代守卫 ────────────────────────────────────────────────────────────

/**
 * 自动迭代标志：为 true 时 setupHotReload 跳过 window.location.reload()
 * 避免 SSE 文件变更事件在迭代循环中途杀死 Vue 应用状态
 */
let _autoIterating = false
/** 安全超时定时器：防止 _autoIterating 永远为 true（AI 请求 hang 住的场景） */
let _autoIteratingTimer: ReturnType<typeof setTimeout> | null = null
const DEFAULT_AUTO_ITERATE_TIMEOUT = 180_000 // 3 分钟默认上限
let _autoIterateTimeout = DEFAULT_AUTO_ITERATE_TIMEOUT

/** 设置自动迭代安全超时（由 AIPageLoop 构造函数调用） */
export function configureAutoIterateTimeout(ms: number): void {
  _autoIterateTimeout = ms > 0 ? ms : DEFAULT_AUTO_ITERATE_TIMEOUT
}

/** 设置自动迭代标志（AiChatPanel 在循环前/后调用） */
export function setAutoIterating(value: boolean): void {
  _autoIterating = value
  if (_autoIteratingTimer) {
    clearTimeout(_autoIteratingTimer)
    _autoIteratingTimer = null
  }
  if (value) {
    // 安全网：超时后强制恢复，避免标志永远为 true
    _autoIteratingTimer = setTimeout(() => {
      _autoIterating = false
      _autoIteratingTimer = null
    }, _autoIterateTimeout)
  }
}

/** 查询当前是否处于自动迭代中 */
export function isAutoIterating(): boolean {
  return _autoIterating
}

/**
 * 启动 AI 闭环热重载
 *
 * 监听 SSE 文件变更事件，当 AI 写入文件后：
 * 1. 清除对应页面的 localStorage 缓存
 * 2. 如果变更页面是当前页面，触发页面重载
 *
 * @param getCurrentPageId - 获取当前路由对应的 pageId（如 `() => route.path.replace(/^\/+/,'')`）
 * @param reload - 重载当前页面的回调
 * @returns 取消订阅函数
 */
export function setupHotReload(
  getCurrentPageId: () => string,
  reload: () => void,
): () => void {
  return onPageConfigChange((event) => {
    clearPageCache(event.pageId)
    // 自动迭代期间跳过 reload（否则 window.location.reload() 会杀死循环状态）
    // 缓存已清，迭代循环自行通过路由切换触发页面刷新
    if (_autoIterating) return
    if (getCurrentPageId() === event.pageId) {
      reload()
    }
  })
}

// ─── 文件写入 API ────────────────────────────────────────────────────────────

/**
 * 批量写入页面配置文件（逐文件 PUT）
 */
export async function writePageFiles(pageId: string, files: PageFiles): Promise<string[]> {
  const written: string[] = []
  const entries = Object.entries(files) as Array<[string, string | undefined]>
  for (const [fileName, content] of entries) {
    if (content === undefined) continue
    await http.put<Record<string, unknown>>(
      `${getPageApiUrl()}/${encodeURIComponent(pageId)}/${fileName}`,
      content,
      { headers: { 'Content-Type': 'text/plain' } },
    )
    written.push(fileName)
  }
  return written
}

/**
 * 读取页面配置文件（当前内容）
 */
export async function readPageFile(pageId: string, fileName: string): Promise<string | null> {
  try {
    const result = await http.get<{ content?: string; notModified?: boolean }>(
      `${getPageApiUrl()}/${encodeURIComponent(pageId)}/${fileName}`,
    )
    return result.content ?? null
  } catch {
    return null
  }
}

/**
 * 读取页面全部 4 文件
 */
export async function readPageFiles(pageId: string): Promise<PageFiles> {
  const [rule, pagedata, script, style] = await Promise.all([
    readPageFile(pageId, 'rule.json'),
    readPageFile(pageId, 'pagedata.json'),
    readPageFile(pageId, 'script.js'),
    readPageFile(pageId, 'style.css'),
  ])
  const files: PageFiles = {}
  if (rule !== null) files['rule.json'] = rule
  if (pagedata !== null) files['pagedata.json'] = pagedata
  if (script !== null) files['script.js'] = script
  if (style !== null) files['style.css'] = style
  return files
}

// ─── 日志收集器（内存缓冲，供 AI 分析） ─────────────────────────────────────

/**
 * 页面日志收集器
 *
 * 注册为全局传输器的消费端，缓存指定 pageId 的日志快照，
 * 供 AIPageLoop 打包发送给 AI 后端。
 */
export class PageLogCollector {
  private logs: LogSnapshot[] = []
  private maxSize: number

  constructor(maxSize = 200) {
    this.maxSize = maxSize
  }

  /** 记录一条日志 */
  push(entry: LogSnapshot): void {
    const normalizedEntry: LogSnapshot = {
      ...entry,
      fingerprint: entry.fingerprint ?? buildLogFingerprint(entry),
    }
    this.logs.push(normalizedEntry)
    if (this.logs.length > this.maxSize) {
      this.logs = this.logs.slice(-this.maxSize)
    }
    _notifyLogUpdate()
  }

  /**
   * 采集并清空某页面诊断日志，同时返回去重摘要。
   * 默认包含全局 error/warn，便于捕获未带 pageId 的运行时异常。
   */
  captureDiagnostics(pageId: string, options?: SummarizeLogOptions & { includeGlobal?: boolean }): PageDiagnosticsReport {
    const includeGlobal = options?.includeGlobal ?? true
    const pickedLogs = this.logs.filter(log =>
      log.pageId === pageId || (includeGlobal && log.pageId === undefined && (log.level === 'error' || log.level === 'warn'))
    )
    this.logs = this.logs.filter(log => !pickedLogs.includes(log))
    const summary = summarizeLogBatch(pickedLogs, options)
    return {
      pageId,
      sampledAt: Date.now(),
      ...summary,
    }
  }

  /** 获取指定 pageId 的日志快照并清空 */
  drain(pageId?: string): LogSnapshot[] {
    if (pageId !== undefined) {
      const matching = this.logs.filter(l => l.pageId === pageId)
      this.logs = this.logs.filter(l => l.pageId !== pageId)
      return matching
    }
    const all = this.logs
    this.logs = []
    return all
  }

  /** 获取指定 pageId 的日志快照（不清空） */
  peek(pageId?: string): LogSnapshot[] {
    if (pageId !== undefined) {
      return this.logs.filter(l => l.pageId === pageId)
    }
    return [...this.logs]
  }

  get size(): number {
    return this.logs.length
  }
}

// ─── AI 闭环协调器 ──────────────────────────────────────────────────────────

// ─── SSE 流消费 ─────────────────────────────────────────────────────────────

/**
 * 消费 SSE 响应流，解析事件并调用回调。
 * 返回最终的 AIResponse（从 `result` 事件中提取）。
 */
async function consumeSSEStream(
  response: Response,
  callbacks?: StreamCallbacks,
): Promise<AIResponse> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('响应体不可读')

  const decoder = new TextDecoder()
  let buffer = ''
  let finalResult: AIResponse | null = null
  const streamState: {
    error: string | null
    sawDoneEvent: boolean
  } = {
    error: null,
    sawDoneEvent: false,
  }
  // SSE 事件累积（event: 和 data: 跨行配对）
  let currentEvent = 'message'
  let currentData = ''

  function dispatchEvent(eventName: string, data: string): AIResponse | null {
    if (!data) return null
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>
      switch (eventName) {
        case 'delta':
          if (typeof parsed['delta'] === 'string') callbacks?.onDelta?.(parsed['delta'])
          break
        case 'reasoning':
          if (typeof parsed['reasoning'] === 'string') callbacks?.onReasoning?.(parsed['reasoning'])
          break
        case 'phase':
          callbacks?.onPhase?.(
            parsed['phase'] as number,
            parsed['status'] as string,
            parsed['message'] as string,
          )
          break
        case 'usage':
          callbacks?.onUsage?.(parsed['usage'] as Record<string, unknown>)
          break
        case 'result':
          return parsed as unknown as AIResponse
        case 'done':
          streamState.sawDoneEvent = true
          break
        case 'error':
          if (typeof parsed['error'] === 'string' && parsed['error'].trim() !== '') {
            streamState.error = parsed['error']
            callbacks?.onError?.(parsed['error'])
          }
          break
        case 'message':
        default:
          if (parsed['files'] !== undefined && typeof parsed['files'] === 'object' && parsed['files'] !== null) {
            return parsed as unknown as AIResponse
          }
          break
      }
    } catch {
      // 跳过非 JSON
    }
    return null
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line === '' || line === '\r') {
          // 空行 → 分发当前事件
          const maybeResult = dispatchEvent(currentEvent, currentData)
          if (maybeResult !== null) {
            finalResult = maybeResult
          }
          currentEvent = 'message'
          currentData = ''
        } else if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') continue
          currentData = currentData ? `${currentData}\n${payload}` : payload
        }
        // 忽略 id: / retry: / 注释行
      }
    }
    // 流结束后分发残余事件
    if (currentData !== '') {
      const maybeResult = dispatchEvent(currentEvent, currentData)
      if (maybeResult !== null) {
        finalResult = maybeResult
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (finalResult !== null) {
    return finalResult
  }

  if (streamState.error !== null) {
    throw new Error(streamState.error)
  }

  if (streamState.sawDoneEvent) {
    throw new Error('SSE 流已结束（收到 done），但未返回 result 结果')
  }

  throw new Error('SSE 流结束但未收到 result 事件')
}

/** _callAI 内部使用的已解析配置 */
interface ResolvedLoopOptions {
  aiEndpoint: string
  onFilesUpdated: (pageId: string, files: string[]) => void
  onError: (error: Error) => void
  logCollectDelay: number
  includeGlobalDiagnostics: boolean
  autoRegisterNav: boolean
  onNavigationRegistered: ((pageId: string, result: NavRegistrationResult) => void) | undefined
  autoIterateTimeout: number
  catalogValidator: ((files: PageFiles) => ConfigValidationReport) | undefined
  onResponseProcessed: ((response: AIResponse, pageId: string) => AIResponse | Promise<AIResponse>) | undefined
}

/**
 * AI 页面配置闭环协调器
 *
 * 管理整个「提示词 → AI → 文件 → 渲染 → 日志 → AI」循环。
 */
export class AIPageLoop {
  private options: ResolvedLoopOptions
  readonly collector = new PageLogCollector()
  private _sessionId: string

  constructor(options: AIPageLoopOptions) {
    this.options = {
      aiEndpoint: options.aiEndpoint,
      onFilesUpdated: options.onFilesUpdated ?? (() => {}),
      onError: options.onError ?? ((e) => { if (import.meta.env.DEV) console.error('[AIPageLoop]', e) }),
      logCollectDelay: options.logCollectDelay ?? 3000,
      includeGlobalDiagnostics: options.includeGlobalDiagnostics ?? true,
      autoRegisterNav: options.autoRegisterNav ?? true,
      onNavigationRegistered: options.onNavigationRegistered,
      autoIterateTimeout: options.autoIterateTimeout ?? DEFAULT_AUTO_ITERATE_TIMEOUT,
      catalogValidator: options.catalogValidator,
      onResponseProcessed: options.onResponseProcessed,
    }
    configureAutoIterateTimeout(this.options.autoIterateTimeout)
    this._sessionId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  get sessionId(): string {
    return this._sessionId
  }

  /**
   * 首次生成：根据提示词生成 4 个配置文件
   */
  async generate(pageId: string, prompt: string): Promise<AIResponse> {
    return this._callAI(pageId, {
      action: 'generate',
      pageId,
      prompt,
      sessionId: this._sessionId,
    })
  }

  /**
   * 迭代修改：基于日志反馈 + 用户追加指令修改文件
   * @param contextFiles 可选，外部提供的文件内容（如编辑器未保存内容），传入时跳过服务端读取
   */
  async iterate(pageId: string, feedback?: string, contextFiles?: PageFiles): Promise<AIResponse> {
    const diagnostics = this.collector.captureDiagnostics(pageId, {
      includeGlobal: this.options.includeGlobalDiagnostics,
      maxIssues: 10,
      maxSamples: 32,
    })
    // 优先使用外部提供的文件内容，否则从服务端读取
    const currentFiles = contextFiles ?? await readPageFiles(pageId)

    return this._callAI(pageId, {
      action: 'iterate',
      pageId,
      sessionId: this._sessionId,
      feedback,
      currentFiles,
      logs: diagnostics.sampleLogs,
      diagnostics,
    })
  }

  /**
   * 流式首次生成：SSE 逐 token 推送，通过回调接收中间事件
   */
  async generateStream(pageId: string, prompt: string, callbacks?: StreamCallbacks): Promise<AIResponse> {
    return this._callAIStream(pageId, {
      action: 'generate',
      pageId,
      prompt,
      sessionId: this._sessionId,
    }, callbacks)
  }

  /**
   * 流式迭代修改：SSE 逐 token 推送，通过回调接收中间事件
   * @param contextFiles 可选，外部提供的文件内容（如编辑器未保存内容），传入时跳过服务端读取
   */
  async iterateStream(pageId: string, feedback?: string, callbacks?: StreamCallbacks, contextFiles?: PageFiles): Promise<AIResponse> {
    const diagnostics = this.collector.captureDiagnostics(pageId, {
      includeGlobal: this.options.includeGlobalDiagnostics,
      maxIssues: 10,
      maxSamples: 32,
    })
    const currentFiles = contextFiles ?? await readPageFiles(pageId)

    return this._callAIStream(pageId, {
      action: 'iterate',
      pageId,
      sessionId: this._sessionId,
      feedback,
      currentFiles,
      logs: diagnostics.sampleLogs,
      diagnostics,
    }, callbacks)
  }

  /**
   * 共享后处理：校验 → 响应处理钩子 → 写文件 → 导航注册
   */
  private async _postProcess(pageId: string, aiResp: AIResponse, action: string, prompt?: string): Promise<AIResponse> {
    let validatedResp = withValidationReport(aiResp, this.options.catalogValidator)

    // 响应处理钩子
    if (this.options.onResponseProcessed) {
      try {
        validatedResp = await this.options.onResponseProcessed(validatedResp, pageId)
      } catch {
        // 钩子失败不阻断文件写入
      }
    }

    // 写入文件（关键路径，失败传播给 onError）
    if (Object.keys(validatedResp.files).length > 0) {
      try {
        const written = await writePageFiles(pageId, validatedResp.files)
        this.options.onFilesUpdated(pageId, written)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        this.options.onError(error)
        // 文件写入失败仍返回响应（包含 AI 生成的内容）
      }
    }

    // 导航自动注册（仅 generate 触发，失败不阻断返回）
    if (action === 'generate' && this.options.autoRegisterNav) {
      try {
        const navResult = await registerPageNavigation(pageId, {
          ...(prompt ? { prompt } : {}),
        })
        validatedResp.navigationResult = navResult
        this.options.onNavigationRegistered?.(pageId, navResult)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        this.options.onError(error)
      }
    }

    return validatedResp
  }

  /**
   * 调用 AI 后端并写入文件
   */
  private async _callAI(pageId: string, payload: Record<string, unknown>): Promise<AIResponse> {
    try {
      const aiResp = await http.post<AIResponse>(this.options.aiEndpoint, payload)
      return this._postProcess(
        pageId, aiResp,
        payload['action'] as string,
        typeof payload['prompt'] === 'string' ? payload['prompt'] : undefined,
      )
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.options.onError(error)
      throw error
    }
  }

  /**
   * 流式调用 AI 后端（SSE），通过回调推送中间事件，最终写入文件并返回结果。
   * 使用 fetch + ReadableStream 消费 SSE 事件流。
   */
  private async _callAIStream(
    pageId: string,
    payload: Record<string, unknown>,
    callbacks?: StreamCallbacks,
  ): Promise<AIResponse> {
    try {
      // 构建请求头（复用 configureAILoopHttp 注入的 headers）
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      // 获取动态 headers（auth token 等）通过拦截器机制
      // 这里直接用 fetch，需要手动获取 headers
      const interceptorHeaders = _getStreamHeaders ? _getStreamHeaders() : {}
      Object.assign(headers, interceptorHeaders)

      const streamEndpoint = this.options.aiEndpoint.replace(/\/chat$/, '/chat/stream-page')
      const response = await fetch(streamEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let responseText = ''
        try {
          responseText = await response.text()
        } catch {
          responseText = ''
        }
        const detail = responseText.trim()
        const suffix = detail.length > 0
          ? `, body=${detail.slice(0, 300)}`
          : ''
        throw new Error(`SSE 请求失败: ${response.status} ${response.statusText}${suffix}`)
      }

      const aiResp = await consumeSSEStream(response, callbacks)
      return this._postProcess(
        pageId, aiResp,
        payload['action'] as string,
        typeof payload['prompt'] === 'string' ? payload['prompt'] : undefined,
      )
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.options.onError(error)
      throw error
    }
  }
}

// ─── 页面组件重建（key 驱动，无需路由跳转） ─────────────────────────────────

/** 响应式 key 递增触发当前页面组件重建（不改变路由，AI 面板状态不受影响） */
export function triggerPageRefresh(): void {
  for (const fn of _refreshListeners) fn()
}

// ─── 全局单例（可选快捷入口） ────────────────────────────────────────────────

let _instance: AIPageLoop | null = null

/**
 * 初始化全局 AI Loop 实例（在 main.ts 中调用）
 */
export function initAILoop(options: AIPageLoopOptions): AIPageLoop {
  _instance = new AIPageLoop(options)
  return _instance
}

/**
 * 获取全局 AI Loop 实例
 */
export function getAILoop(): AIPageLoop | null {
  return _instance
}
