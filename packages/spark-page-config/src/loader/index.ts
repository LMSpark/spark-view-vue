/**
 * 配置加载器 - 支持本地/远程/混合配置加载
 *
 * 职责：**从哪里加载**（本地/远程/混合 + 缓存策略）。
 * 编译函数（**如何解析**）拆分到 `../compiler/index.ts`。
 *
 * ## 数据流
 * ```
 * loadRule(pageId)
 *   └── loadRequiredPageFile(pageId, 'rule.json')
 *         ├── local  → fileLoader.load<T>(path)         → localResult<T>
 *         ├── remote → request('/pages-config/...')     → compileRule(text)
 *         └── hybrid → remote first, fallback to local
 * ```
 *
 * ## 缓存策略
 * - 本地文件：FileLoader 时间戳协议（localStorage / sessionStorage / memory）
 * - 远程 API：依赖服务器 HTTP 缓存，客户端无缓存
 */

import type {
  ConfigLoader,
  ConfigLoaderOptions,
  ConfigLoadResult,
  PageConfig,
  RuleConfig,
  PageDataConfig,
  PageScriptConfig,
  PageCssConfig
} from '../types'
import {
  Logger,
  createFileLoader,
  createRequest
} from '@spark-view/spark-utils'
import type { FileLoader, DerivedLoader, HttpClient, FileLoaderEventMap } from '@spark-view/spark-utils'

// 编译函数从 compiler 模块导入（职责分离：loader 管加载，compiler 管解析）
import { compileRule, parsePageData, parseScript, parseCss } from '../compiler'

// re-export 编译函数，保持对外 API 兼容（消费方可继续从 './loader' 导入）
export { compileRule, normalizeRuleNode, parsePageData, parseScript, parseCss } from '../compiler'

const pageLogger = Logger('PageConfig')

const REQUEST_TIMEOUT = 10_000

type RemoteFileResponse = {
  content?: unknown
  timestamp?: unknown
  notModified?: unknown
}

// ─────────────────────────────────────────────────────────────────────────────

/** 必填字段默认值（getHeaders 可选，不在此列） */
const DEFAULT_OPTIONS = {
  source: 'hybrid' as const,
  apiBaseUrl: '/api',
  fileStorage: 'localStorage' as const,
  enableValidation: false,
  timeout: REQUEST_TIMEOUT,
} satisfies Omit<Required<ConfigLoaderOptions>, 'getHeaders'>

export class PageConfigLoader implements ConfigLoader {
  private opts: Required<Omit<ConfigLoaderOptions, 'getHeaders'>> & Pick<ConfigLoaderOptions, 'getHeaders'>
  private fileLoader: FileLoader
  /** 共享 axios 请求实例（远程 API 调用统一通道，自动注入 auth/tenant headers） */
  private request: HttpClient
  private readonly pagesConfigBase: string
  private readonly recentMissingFiles = new Set<string>()

  /**
   * 派生加载器：各自对应一种文件类型的编译产物缓存。
   * 相同 timestamp → 直接返回缓存结果，跳过 transform 函数。
   */
  private readonly ruleLoader: DerivedLoader<RuleConfig[]>
  private readonly dataLoader: DerivedLoader<PageDataConfig>
  private readonly scriptLoader: DerivedLoader<PageScriptConfig>
  private readonly cssLoader: DerivedLoader<PageCssConfig>

  constructor(options: Partial<ConfigLoaderOptions> = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options }
    this.pagesConfigBase = `${this.opts.apiBaseUrl}/pages-config`

    // 创建共享 Request 实例（远程 API 调用的统一 axios 通道）
    this.request = createRequest({
      baseURL: this.opts.apiBaseUrl,
      timeout: this.opts.timeout,
    })
    // 动态请求头注入（auth / tenant headers）
    if (this.opts.getHeaders) {
      const getHeaders = this.opts.getHeaders
      this.request.interceptors.request.use({
        onRequest: (config) => {
          config.headers = { ...config.headers, ...getHeaders() }
          return config
        }
      })
    }

    this.fileLoader = createFileLoader({
      baseUrl: this.pagesConfigBase,
      storage: this.opts.fileStorage,
      cachePrefix: 'spark_page_',
      fallbackToCache: true,
      timeout: this.opts.timeout,
      // 动态请求头（认证 / 租户上下文）
      ...(this.opts.getHeaders && { getHeaders: this.opts.getHeaders }),
      // 分级过期策略配置（可选，使用默认值）
      defaultExpirationLevel: 3,  // 默认15天
      maxCacheSize: 50             // 最多缓存 50 个页面配置
    })

    // 订阅 FileLoader 事件：将文件缺失转为可消费状态，避免上层只能依赖字符串兜底。
    this.fileLoader.on('file-missing', (evt: FileLoaderEventMap['file-missing']) => {
      this.recentMissingFiles.add(evt.fileName)
      pageLogger.debug('捕获文件缺失事件', { fileName: evt.fileName, status: evt.status })
    })
    this.fileLoader.on('file-loaded', (evt: FileLoaderEventMap['file-loaded']) => {
      this.recentMissingFiles.delete(evt.fileName)
    })
    // 绑定编译函数——函数名自动成为派生缓存的 key 后缀
    this.ruleLoader = this.fileLoader.withTransform(compileRule)
    this.dataLoader = this.fileLoader.withTransform(parsePageData)
    this.scriptLoader = this.fileLoader.withTransform(parseScript)
    this.cssLoader = this.fileLoader.withTransform(parseCss)
  }

  // ── 公开 API ──────────────────────────────────────────────────────


  async loadRule(pageId: string): Promise<ConfigLoadResult<RuleConfig[]>> {
    pageLogger.info('加载页面规则', { pageId, source: this.opts.source })
    return this.loadRequiredPageFile(pageId, 'rule.json', this.ruleLoader, compileRule)
  }

  async loadPageData(pageId: string): Promise<ConfigLoadResult<PageDataConfig>> {
    pageLogger.info('加载页面数据', { pageId, source: this.opts.source })
    return this.loadRequiredPageFile(pageId, 'pagedata.json', this.dataLoader, parsePageData)
  }

  async loadCss(pageId: string): Promise<ConfigLoadResult<PageCssConfig>> {
    return this.loadCssInternal(pageId, true)
  }

  async loadScript(pageId: string): Promise<ConfigLoadResult<PageScriptConfig>> {
    return this.loadScriptInternal(pageId, true)
  }

  private async loadCssInternal(pageId: string, logStart: boolean): Promise<ConfigLoadResult<PageCssConfig>> {
    if (logStart) {
      pageLogger.debug('加载页面样式', { pageId, source: this.opts.source })
    }

    return this.loadOptionalPageFile(pageId, 'style.css', this.cssLoader, parseCss, '样式')
  }

  private async loadScriptInternal(pageId: string, logStart: boolean): Promise<ConfigLoadResult<PageScriptConfig>> {
    if (logStart) {
      pageLogger.debug('加载页面脚本', { pageId, source: this.opts.source })
    }

    return this.loadOptionalPageFile(pageId, 'script.js', this.scriptLoader, parseScript, '脚本')
  }

  async loadPageConfig(pageId: string): Promise<ConfigLoadResult<PageConfig>> {
    pageLogger.info('加载完整页面配置', { pageId })

    // 必需文件先加载：rule / pagedata 任一缺失即短路，避免 script/css 产生额外 404 噪音
    const ruleResult = await this.loadRule(pageId)
    if (!ruleResult.success) return this.failFrom(ruleResult.error, ruleResult.reason)

    const dataResult = await this.loadPageData(pageId)
    if (!dataResult.success) return this.failFrom(dataResult.error, dataResult.reason)

    // 可选文件并行加载（script / css 缺失时会返回 success + 空字符串）
    const [scriptResult, cssResult] = await Promise.all([
      this.loadScriptInternal(pageId, false),
      this.loadCssInternal(pageId, false)
    ])

    if (!scriptResult.success) return this.failFrom(scriptResult.error, scriptResult.reason)
    if (!cssResult.success) return this.failFrom(cssResult.error, cssResult.reason)

    pageLogger.debug('页面附加资源加载完成', {
      pageId,
      hasScript: Boolean(scriptResult.data),
      scriptSize: scriptResult.data?.length ?? 0,
      hasCss: Boolean(cssResult.data),
      cssSize: cssResult.data?.length ?? 0,
    })

    const rules = ruleResult.data ?? []

    return {
      success: true,
      data: {
        pageId,
        rule: rules,
        data: dataResult.data as PageDataConfig,
        script: scriptResult.data,
        css: cssResult.data
      },
      ...(ruleResult.source !== undefined && { source: ruleResult.source }),
      timestamp: Date.now()
    }
  }

  clearCache(key?: string): void {
    this.fileLoader.clearCache(key)
    if (!key) this.recentMissingFiles.clear()
  }

  getCacheStats(): { size: number; keys: string[] } {
    return this.fileLoader.getCacheStats()
  }

  getHttpClient(): HttpClient {
    return this.request
  }

  /** 从失败的 ConfigLoadResult 构建错误响应（DRY）*/
  private failFrom(error: string | undefined, reason?: string): ConfigLoadResult<never> {
    return { success: false, ...(error !== undefined && { error }), ...(reason !== undefined && { reason }), timestamp: Date.now() }
  }

  // ── 私有辅助 ──────────────────────────────────────────────────────

  /**
   * 加载必需页面文件（rule.json / pagedata.json）。
   * - local: 直接走 FileLoader + 编译缓存
   * - remote: 读取 /pages-config/{pageId}/{filename}，再编译
   * - hybrid: 远程失败时降级本地
   */
  private async loadRequiredPageFile<T>(
    pageId: string,
    filename: string,
    localLoader: DerivedLoader<T>,
    transform: (content: string) => T,
  ): Promise<ConfigLoadResult<T>> {
    const localPath = `/${pageId}/${filename}`
    if (this.opts.source === 'local') {
      return this.derivedResult(localLoader, localPath)
    }

    const remoteResult = await this.remoteRequiredFileResult(pageId, filename, transform)
    if (remoteResult.success || this.opts.source === 'remote') return remoteResult

    pageLogger.debug('远程必需配置不可用，降级到本地', {
      pageId,
      filename,
      reason: remoteResult.reason,
      error: remoteResult.error,
    })
    return this.derivedResult(localLoader, localPath)
  }

  /**
   * 加载可选页面文件（script.js / style.css）。
   * `not-found` 视为空内容；其他远程错误在 hybrid 下回退本地，在 remote 下显式返回失败。
   */
  private async loadOptionalPageFile<T extends string>(
    pageId: string,
    filename: string,
    localLoader: DerivedLoader<T>,
    transform: (content: string) => T,
    assetLabel: string,
  ): Promise<ConfigLoadResult<T>> {
    const localPath = `/${pageId}/${filename}`
    if (this.opts.source === 'local') {
      return this.localOptionalTextResult(pageId, assetLabel, localLoader, localPath)
    }

    const remoteResult = await this.remoteOptionalFileResult(pageId, filename, transform)
    if (remoteResult.success || this.opts.source === 'remote') return remoteResult

    pageLogger.debug(`远程${assetLabel}不可用，降级到本地`, {
      pageId,
      filename,
      reason: remoteResult.reason,
      error: remoteResult.error,
    })
    return this.localOptionalTextResult(pageId, assetLabel, localLoader, localPath)
  }

  /**
   * 本地加载结果转换为 ConfigLoadResult。
   * 由 derivedResult / localResult 共同使用，避免两写相同的评斷/日志/返回逻辑。
   */
  private localResultFromData<T>(
    r: { success: boolean; error?: string; fromCache?: boolean; data?: T; reason?: string },
    path: string
  ): ConfigLoadResult<T> {
    if (!r.success) {
      const rawError = r.error ?? ''
      const fromEvent = this.recentMissingFiles.has(path)
      const isNotFound = r.reason === 'not-found' || fromEvent || /404|not\s*found/i.test(rawError)
      if (isNotFound) {
        pageLogger.warn('本地配置文件不存在', { path })
      } else {
        pageLogger.error('本地配置加载失败', { path, error: r.error })
      }
      return {
        success: false,
        error: `${this.pagesConfigBase}${path}: ${r.error ?? ''}`,
        ...(isNotFound && { reason: 'not-found' as const }),
        timestamp: Date.now()
      }
    }
    pageLogger.debug('本地配置加载成功', { path, fromCache: r.fromCache })
    return { success: true, ...(r.data !== undefined && { data: r.data }), source: 'local', timestamp: Date.now() }
  }

  /**
   * 通过 DerivedLoader 加载本地文件并转为 ConfigLoadResult。
   * timestamp 未变时直接命中编译缓存，跳过 transform 函数。
   */
  private async derivedResult<T>(
    loader: DerivedLoader<T>,
    path: string
  ): Promise<ConfigLoadResult<T>> {
    return this.localResultFromData(await loader.load(path), path)
  }

  /** 文本型 loader 结果 → ConfigLoadResult（缺失文件视为 success:true, data:''） */
  private toLocalTextResult<T extends string>(r: { success: boolean; data?: T }): ConfigLoadResult<T> {
    return { success: true, data: (r.data ?? '') as T, source: 'local', timestamp: Date.now() }
  }

  private async localOptionalTextResult<T extends string>(
    pageId: string,
    assetLabel: string,
    loader: DerivedLoader<T>,
    path: string,
  ): Promise<ConfigLoadResult<T>> {
    const r = await loader.load(path)
    if (!r.success) pageLogger.debug(`页面无${assetLabel}文件，跳过`, { pageId })
    return this.toLocalTextResult(r)
  }

  private async remoteRequiredFileResult<T>(
    pageId: string,
    filename: string,
    transform: (content: string) => T,
  ): Promise<ConfigLoadResult<T>> {
    try {
      const text = await this.readRemoteFile(pageId, filename)
      return { success: true, data: transform(text), source: 'remote', timestamp: Date.now() }
    } catch (error: unknown) {
      return this.toRemoteFailureResult(error, pageId, filename)
    }
  }

  private async remoteOptionalFileResult<T extends string>(
    pageId: string,
    filename: string,
    transform: (content: string) => T,
  ): Promise<ConfigLoadResult<T>> {
    try {
      const text = await this.readRemoteFile(pageId, filename)
      return { success: true, data: transform(text), source: 'remote', timestamp: Date.now() }
    } catch (error: unknown) {
      const failure = this.toRemoteFailureResult(error, pageId, filename)
      if (failure.reason === 'not-found') {
        return { success: true, data: transform(''), source: 'remote', timestamp: Date.now() }
      }
      return failure as ConfigLoadResult<T>
    }
  }

  private toRemoteFailureResult(
    error: unknown,
    pageId: string,
    filename: string,
  ): ConfigLoadResult<never> {
    const fileId = `${pageId}/${filename}`
    if (this.isHttpStatus(error, 404)) {
      return { success: false, reason: 'not-found', error: `${fileId} 不存在`, timestamp: Date.now() }
    }
    if (this.isHttpStatus(error, 401)) {
      return { success: false, error: `加载 ${fileId} 未授权`, timestamp: Date.now() }
    }
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message, timestamp: Date.now() }
  }

  private isHttpStatus(error: unknown, status: number): boolean {
    if (error === null || error === undefined || typeof error !== 'object') return false
    const candidate = error as { status?: unknown; response?: { status?: unknown } }
    return candidate.status === status || candidate.response?.status === status
  }

  /**
   * 读取远程页面配置文件。
   * 当前后端约定返回 `{ content, timestamp, notModified }`。
   */
  private async readRemoteFile(pageId: string, filename: string): Promise<string> {
    const encodedPageId = encodeURIComponent(pageId)
    const encodedFileName = encodeURIComponent(filename)
    const url = `/pages-config/${encodedPageId}/${encodedFileName}`
    pageLogger.debug('读取远程页面配置文件', { pageId, filename, url })

    const result = await this.request.request<RemoteFileResponse>({
      url,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    const content = result.content
    if (typeof content !== 'string') {
      throw new Error(`配置接口返回无效内容: ${pageId}/${filename}`)
    }
    return content
  }
}

export function createConfigLoader(options?: Partial<ConfigLoaderOptions>): ConfigLoader {
  return new PageConfigLoader(options)
}
