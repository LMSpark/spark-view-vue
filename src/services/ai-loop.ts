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
 * import { AIPageLoop } from '@/services/ai-loop'
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
}

// ─── SSE 文件变更监听 ───────────────────────────────────────────────────────

export interface FileChangeEvent {
  pageId: string
  file: string
  timestamp: number
}

/**
 * 监听页面配置文件变更（SSE 长连接）
 *
 * @returns 取消订阅函数
 */
export function onPageConfigChange(
  callback: (event: FileChangeEvent) => void
): () => void {
  const es = new EventSource('/api/pages-config/__events')
  const handler = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data as string) as Record<string, unknown>
      if ('pageId' in data && 'file' in data) {
        callback(data as unknown as FileChangeEvent)
      }
    } catch { /* ignore malformed events */ }
  }
  es.addEventListener('message', handler)
  return () => {
    es.removeEventListener('message', handler)
    es.close()
  }
}

// ─── 页面缓存失效 ───────────────────────────────────────────────────────────

/** FileLoader 使用的 localStorage 缓存前缀 */
const CACHE_PREFIX = 'spark_page_'
/** 页面 4 文件 */
const PAGE_FILES = ['rule.json', 'pagedata.json', 'script.js', 'style.css'] as const

/**
 * 清除指定页面的 localStorage 缓存
 *
 * FileLoader 的缓存键格式：`spark_page_/{pageId}/{file}:raw`
 * 清除后下一次 `loadPageConfig()` 必须走网络请求，拿到最新内容。
 */
export function clearPageCache(pageId: string): void {
  if (typeof localStorage === 'undefined') return
  for (const file of PAGE_FILES) {
    const base = `${CACHE_PREFIX}/${pageId}/${file}`
    localStorage.removeItem(base)
    localStorage.removeItem(`${base}:raw`)
    localStorage.removeItem(`${base}:transform`)
  }
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
  const resp = await fetch(`/api/pages-config/${encodeURIComponent(pageId)}/__batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(files),
  })
  if (!resp.ok) {
    const err = await resp.json() as { error?: string }
    throw new Error(err.error ?? `写入失败: ${resp.status}`)
  }
  const result = await resp.json() as { written: string[] }
  return result.written
}

/**
 * 读取页面配置文件（当前内容）
 */
export async function readPageFile(pageId: string, fileName: string): Promise<string | null> {
  const resp = await fetch(`/api/pages-config/${encodeURIComponent(pageId)}/${fileName}`)
  if (!resp.ok) return null
  const result = await resp.json() as { content?: string; notModified?: boolean }
  return result.content ?? null
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

/**
 * AI 页面配置闭环协调器
 *
 * 管理整个「提示词 → AI → 文件 → 渲染 → 日志 → AI」循环。
 */
export class AIPageLoop {
  private options: Required<AIPageLoopOptions>
  readonly collector = new PageLogCollector()
  private _sessionId: string

  constructor(options: AIPageLoopOptions) {
    this.options = {
      aiEndpoint: options.aiEndpoint,
      onFilesUpdated: options.onFilesUpdated ?? (() => {}),
      onError: options.onError ?? ((e) => { console.error('[AIPageLoop]', e) }),
      logCollectDelay: options.logCollectDelay ?? 3000,
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
      const resp = await fetch(this.options.aiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!resp.ok) {
        throw new Error(`AI 后端返回 ${resp.status}: ${await resp.text()}`)
      }

      const aiResp = await resp.json() as AIResponse

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
