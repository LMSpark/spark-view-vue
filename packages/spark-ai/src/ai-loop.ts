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

/** 模块级共享 HTTP 客户端（统一 axios 封装，复用拦截器 / 超时 / 重试配置） */
const http = createRequest({ timeout: 240_000 })

/** 动态 Page API 基础路径解析器（由应用层注入） */
let _getPageApiUrl: (() => string) | null = null

/**
 * 配置 AI Loop 的 HTTP 客户端和 API 路径。
 * 应在应用启动时调用一次，注入认证头和租户作用域路径。
 */
export function configureAILoopHttp(options: {
  getHeaders?: () => Record<string, string>
  getPageApiUrl?: () => string
}): void {
  if (options.getHeaders) {
    const getHeaders = options.getHeaders
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
}

/** 获取当前 Page API 基础路径（带租户作用域） */
function getPageApiUrl(): string {
  if (_getPageApiUrl) return _getPageApiUrl()
  // 兜底：使用扁平兼容路由（依赖 X-Tenant-Id / X-Project-Id 请求头）
  return '/api/pages-config'
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
}

/** 日志条目（与 Logger 的 LogEntry 对齐） */
export interface LogSnapshot {
  level: string
  message: string
  meta?: Record<string, unknown> | undefined
  timestamp: number
  pageId?: string | undefined
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
  /** Skill Catalog Markdown（由 buildSkillPrompt 生成，附加到系统提示词） */
  skillCatalog?: string | undefined
}

// ─── 自动迭代守卫 ────────────────────────────────────────────────────────────

/**
 * 自动迭代标志：为 true 时 setupHotReload 跳过 window.location.reload()
 * 避免 SSE 文件变更事件在迭代循环中途杀死 Vue 应用状态
 */
let _autoIterating = false
/** 安全超时定时器：防止 _autoIterating 永远为 true（AI 请求 hang 住的场景） */
let _autoIteratingTimer: ReturnType<typeof setTimeout> | null = null
const AUTO_ITERATE_TIMEOUT = 180_000 // 3 分钟硬上限

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
    }, AUTO_ITERATE_TIMEOUT)
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
 * 批量写入页面配置文件
 */
export async function writePageFiles(pageId: string, files: PageFiles): Promise<string[]> {
  const result = await http.post<{ written: string[] }>(
    `${getPageApiUrl()}/${encodeURIComponent(pageId)}/__batch`,
    files,
  )
  return result.written
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
    this.logs.push(entry)
    if (this.logs.length > this.maxSize) {
      this.logs = this.logs.slice(-this.maxSize)
    }
    _notifyLogUpdate()
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

/** _callAI 内部使用的已解析配置 */
interface ResolvedLoopOptions {
  aiEndpoint: string
  onFilesUpdated: (pageId: string, files: string[]) => void
  onError: (error: Error) => void
  logCollectDelay: number
  skillCatalog: string | undefined
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
      skillCatalog: options.skillCatalog ?? undefined,
    }
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
   */
  async iterate(pageId: string, feedback?: string): Promise<AIResponse> {
    // 收集当前页面的日志
    const logs = this.collector.drain(pageId)
    // 读取当前文件内容
    const currentFiles = await readPageFiles(pageId)

    return this._callAI(pageId, {
      action: 'iterate',
      pageId,
      sessionId: this._sessionId,
      feedback,
      currentFiles,
      logs,
    })
  }

  /**
   * 调用 AI 后端并写入文件
   */
  private async _callAI(pageId: string, payload: Record<string, unknown>): Promise<AIResponse> {
    try {
      // 注入 Skill Catalog 到每个请求
      if (this.options.skillCatalog !== undefined) {
        payload['skillCatalog'] = this.options.skillCatalog
      }
      const aiResp = await http.post<AIResponse>(this.options.aiEndpoint, payload)

      // 写入文件
      if (Object.keys(aiResp.files).length > 0) {
        const written = await writePageFiles(pageId, aiResp.files)
        this.options.onFilesUpdated(pageId, written)
      }

      return aiResp
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
