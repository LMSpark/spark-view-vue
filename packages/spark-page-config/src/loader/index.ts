/**
 * 配置加载器 - 支持本地/远程/混合配置加载
 *
 * 职责：**从哪里加载**（本地/远程/混合 + 缓存策略）。
 * 编译函数（**如何解析**）拆分到 `../compiler/index.ts`。
 *
 * ## 数据流
 * ```
 * loadRule(pageId)
 *   └── hybridLoad('/pageId/rule.json', '/page/pageId/rule')
 *         ├── local  → fileLoader.load<T>(path)  → localResult<T>
 *         ├── remote → fetchFromRemote<T>(path)  → remoteResult<T>
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
  SharedErrorCodes,
  getSharedErrorMessage,
  createFileLoader,
  createRequest
} from '@spark-view/spark-utils'
import type { FileLoader, DerivedLoader, HttpClient } from '@spark-view/spark-utils'

// 编译函数从 compiler 模块导入（职责分离：loader 管加载，compiler 管解析）
import { compileRule, parsePageData, parseScript, parseCss } from '../compiler'

// re-export 编译函数，保持对外 API 兼容（消费方可继续从 './loader' 导入）
export { compileRule, normalizeRuleNode, parsePageData, parseScript, parseCss } from '../compiler'

const pageLogger = Logger('PageConfig')

const REQUEST_TIMEOUT = 10_000

const ErrorCodes = SharedErrorCodes
const getErrorMessage = getSharedErrorMessage

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
    // 绑定编译函数——函数名自动成为派生缓存的 key 后缀
    this.ruleLoader = this.fileLoader.withTransform(compileRule)
    this.dataLoader = this.fileLoader.withTransform(parsePageData)
    this.scriptLoader = this.fileLoader.withTransform(parseScript)
    this.cssLoader = this.fileLoader.withTransform(parseCss)
  }

  // ── 公开 API ──────────────────────────────────────────────────────


  async loadRule(pageId: string): Promise<ConfigLoadResult<RuleConfig[]>> {
    pageLogger.info('加载页面规则', { pageId, source: this.opts.source })
    return this.hybridLoad(`/${pageId}/rule.json`, `/page/${pageId}/rule`, this.ruleLoader)
  }

  async loadPageData(pageId: string): Promise<ConfigLoadResult<PageDataConfig>> {
    pageLogger.info('加载页面数据', { pageId, source: this.opts.source })
    return this.hybridLoad(`/${pageId}/pagedata.json`, `/page/${pageId}/data`, this.dataLoader)
  }

  async loadCss(pageId: string): Promise<ConfigLoadResult<PageCssConfig>> {
    pageLogger.debug('加载页面样式', { pageId, source: this.opts.source })

    if (this.opts.source === 'local') {
      return this.localCssResult(pageId)
    }
    // remote 或 hybrid: 先尝试远程（CSS 是纯文本，使用 text 模式加载）
    try {
      const css = await this.remoteCss(pageId)
      return { success: true, data: css, source: 'remote', timestamp: Date.now() }
    } catch (e) {
      if (this.opts.source === 'remote') throw e
      pageLogger.debug('远程样式不可用，降级到本地', { pageId })
      return this.localCssResult(pageId)
    }
  }

  async loadScript(pageId: string): Promise<ConfigLoadResult<PageScriptConfig>> {
    pageLogger.debug('加载页面脚本', { pageId, source: this.opts.source })

    if (this.opts.source === 'local') {
      return this.localScriptResult(pageId)
    }
    // remote 或 hybrid: 先尝试远程
    try {
      const script = await this.remoteScript(pageId)
      return { success: true, data: script, source: 'remote', timestamp: Date.now() }
    } catch (e) {
      if (this.opts.source === 'remote') throw e
      pageLogger.debug('远程脚本不可用，降级到本地', { pageId })
      return this.localScriptResult(pageId)
    }
  }

  async loadPageConfig(pageId: string): Promise<ConfigLoadResult<PageConfig>> {
    pageLogger.info('加载完整页面配置', { pageId })

    const [ruleResult, dataResult, scriptResult, cssResult] = await Promise.all([
      this.loadRule(pageId),
      this.loadPageData(pageId),
      this.loadScript(pageId),
      this.loadCss(pageId)
    ])

    if (!ruleResult.success) return this.failFrom(ruleResult.error)
    if (!dataResult.success) return this.failFrom(dataResult.error)

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
  }

  getCacheStats(): { size: number; keys: string[] } {
    return this.fileLoader.getCacheStats()
  }

  /** 从失败的 ConfigLoadResult 构建错误响应（DRY）*/
  private failFrom(error: string | undefined): ConfigLoadResult<never> {
    return { success: false, ...(error !== undefined && { error }), timestamp: Date.now() }
  }

  // ── 私有辅助 ──────────────────────────────────────────────────────

  /**
   * 统一 local / remote / hybrid 分支。
   * @param localPath   FileLoader 相对路径（如 `/pageId/rule.json`）
   * @param remotePath  API 相对路径  （如 `/page/pageId/rule`）
   * @param localLoader 指定派生加载器时，本地命中后直接返回编译缓存结果
   */
  private async hybridLoad<T>(
    localPath: string,
    remotePath: string,
    localLoader?: DerivedLoader<T>
  ): Promise<ConfigLoadResult<T>> {
    const { source } = this.opts
    const doLocal = () =>
      localLoader
        ? this.derivedResult(localLoader, localPath)
        : this.localResult<T>(localPath)

    if (source === 'local') return doLocal()
    if (source === 'remote') return this.remoteResult<T>(remotePath)

    // hybrid: 先 remote，失败降级 local
    try {
      pageLogger.debug('hybrid: 尝试远程', { remotePath })
      return await this.remoteResult<T>(remotePath)
    } catch {
      pageLogger.debug('hybrid: 远程失败，降级本地', { localPath })
      return doLocal()
    }
  }

  /**
   * 本地加载结果转换为 ConfigLoadResult。
   * 由 derivedResult / localResult 共同使用，避免两写相同的评斷/日志/返回逻辑。
   */
  private localResultFromData<T>(
    r: { success: boolean; error?: string; fromCache?: boolean; data?: T },
    path: string
  ): ConfigLoadResult<T> {
    if (!r.success) {
      pageLogger.error('本地配置加载失败', { path, error: r.error })
      return {
        success: false,
        error: `${this.pagesConfigBase}${path}: ${r.error ?? ''}`,
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

  /** FileLoader 加载 → ConfigLoadResult */
  private async localResult<T>(path: string): Promise<ConfigLoadResult<T>> {
    return this.localResultFromData(await this.fileLoader.load<T>(path), path)
  }

  /** 远程 JSON fetch → ConfigLoadResult（失败时抛出，由 hybridLoad 捕获） */
  private async remoteResult<T>(path: string): Promise<ConfigLoadResult<T>> {
    const data = await this.fetchFromRemote<T>(path)
    return { success: true, data, source: 'remote', timestamp: Date.now() }
  }

  /** 文本型 loader 结果 → ConfigLoadResult（缺失文件视为 success:true, data:''） */
  private toLocalTextResult<T extends string>(r: { success: boolean; data?: T }): ConfigLoadResult<T> {
    return { success: true, data: (r.data ?? '') as T, source: 'local', timestamp: Date.now() }
  }

  /**
   * 从本地加载脚本（可选文件，失败返回 success:true, data:''）。
   * 使用 scriptLoader（withTransform(parseScript)）：
   *   - fileLoader 内部以 parseJSON:false 读取原始文本并缓存
   *   - parseScript 变换结果（当前透传）单独缓存，timestamp 未变直接返回
   */
  private async localScriptResult(pageId: string): Promise<ConfigLoadResult<PageScriptConfig>> {
    const r = await this.scriptLoader.load(`/${pageId}/script.js`)
    if (!r.success) pageLogger.debug('页面无脚本文件，跳过', { pageId })
    else pageLogger.debug('本地脚本加载成功', { pageId, size: r.data?.length ?? 0 })
    return this.toLocalTextResult(r)
  }

  /**
   * 本地加载 CSS：文件可选，缺失时静默返回空字符串。
   * - style.css 存在 → 经 parseCss 变换后返回
   * - 文件缺失   → success:true, data:''（CSS 为可选资源）
   */
  private async localCssResult(pageId: string): Promise<ConfigLoadResult<PageCssConfig>> {
    const r = await this.cssLoader.load(`/${pageId}/style.css`)
    if (!r.success) pageLogger.debug('页面无样式文件，跳过', { pageId })
    else pageLogger.debug('本地样式加载成功', { pageId, size: r.data?.length ?? 0 })
    return this.toLocalTextResult(r)
  }

  /** 从远程加载脚本文本（失败时抛出） */
  private async remoteScript(pageId: string): Promise<PageScriptConfig> {
    const url = `/page/${pageId}/script`
    pageLogger.debug('加载远程脚本', { pageId, url })

    try {
      const text = await this.request.get<string>(url, undefined, { responseType: 'text' })
      pageLogger.debug('远程脚本加载成功', { pageId, size: text.length })
      return text
    } catch (err) {
      const msg = getErrorMessage(ErrorCodes.CONFIG_LOAD_FAILED)
      pageLogger.error('远程脚本加载失败', { pageId, error: String(err) })
      throw new Error(`${msg}: ${this.opts.apiBaseUrl}${url}`)
    }
  }

  /** 从远程加载 CSS 文本（失败时抛出）。CSS 是纯文本，不走 JSON 解析。 */
  private async remoteCss(pageId: string): Promise<PageCssConfig> {
    const url = `/page/${pageId}/css`
    pageLogger.debug('加载远程样式', { pageId, url })

    try {
      const text = await this.request.get<string>(url, undefined, { responseType: 'text' })
      pageLogger.debug('远程样式加载成功', { pageId, size: text.length })
      return text
    } catch (err) {
      const msg = getErrorMessage(ErrorCodes.CONFIG_LOAD_FAILED)
      pageLogger.error('远程样式加载失败', { pageId, error: String(err) })
      throw new Error(`${msg}: ${this.opts.apiBaseUrl}${url}`)
    }
  }

  /**
   * 从远程 API 加载 JSON 配置。
   * 支持标准封装格式 `{ code, data, message }` 和裸对象两种响应。
   * 失败时抛出，由调用方（hybridLoad / remoteResult）处理或透传。
   */
  private async fetchFromRemote<T>(path: string): Promise<T> {
    const url = path
    pageLogger.debug('发送远程请求', { url: `${this.opts.apiBaseUrl}${path}` })

    try {
      const result = await this.request.request<unknown>({
        url,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      // 标准 API 封装格式 { code, data, message }
      if (typeof result === 'object' && result !== null && 'code' in result) {
        const r = result as Record<string, unknown>
        if (r['code'] === 200 || r['code'] === 0) {
          pageLogger.debug('远程加载成功', { url })
          return r['data'] as T
        }
        const msg = (typeof r['message'] === 'string' ? r['message'] : null) ?? getErrorMessage(ErrorCodes.NETWORK_REQUEST_FAILED)
        pageLogger.error('API 返回错误', { url, code: r['code'], message: msg })
        throw new Error(msg)
      }

      pageLogger.debug('远程加载成功', { url })
      return result as T
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        const msg = getErrorMessage(ErrorCodes.NETWORK_TIMEOUT)
        pageLogger.error('请求超时', { url, timeout: this.opts.timeout })
        throw new Error(`${msg}: ${this.opts.apiBaseUrl}${url}`)
      }
      throw err
    }
  }
}

export function createConfigLoader(options?: Partial<ConfigLoaderOptions>): ConfigLoader {
  return new PageConfigLoader(options)
}
