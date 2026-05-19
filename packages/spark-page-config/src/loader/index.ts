/**
 * 配置加载器 - 统一页面配置加载
 *
 * 职责：通过后端页面配置文件 API 加载四文件，并管理客户端缓存策略。
 * 编译函数（**如何解析**）拆分到 `../compiler/index.ts`。
 *
 * ## 数据流
 * ```
 * loadRule(pageId)
 *   └── loadRequiredPageFile(pageId, 'rule.json')
 *         └── fileLoader.withTransform(...).load(path) → ConfigLoadResult<T>
 * ```
 *
 * ## 缓存策略
 * - FileLoader 时间戳协议（localStorage / sessionStorage / memory）
 * - 后端 API 走 timestamp/notModified + 客户端缓存
 */

import type {
  ConfigLoader,
  ConfigLoaderOptions,
  ConfigLoadResult,
  PageConfigFileLoadOptions,
  PageConfigFileName,
  PageConfig,
  RuleConfig,
  PageDataConfig,
  PageScriptConfig,
  PageCssConfig,
  PageFileRegistry,
} from '../types'
import { PAGE_CONFIG_FILE_NAMES, createDefaultFileRegistry } from '../types'
import {
  Logger,
  createFileLoader,
  createRequest
} from '@spark-view/spark-utils'
import type { FileLoader, DerivedLoader, HttpClient, FileLoaderEventMap, RequestInterceptor } from '@spark-view/spark-utils'

// 编译函数从 compiler 模块导入（职责分离：loader 管加载，compiler 管解析）
import { compileRule, parsePageData, parseScript, parseCss } from '../compiler'

// re-export 编译函数，允许消费方从 './loader' 直接导入
export { compileRule, normalizeRuleNode, parsePageData, parseScript, parseCss } from '../compiler'

const pageLogger = Logger('PageConfig')

const REQUEST_TIMEOUT = 10_000
const REQUIRED_PAGE_CONFIG_FILE_NAMES = ['rule.json', 'pagedata.json'] as const

// ─────────────────────────────────────────────────────────────────────────────

/** 必填字段默认值（getHeaders / pagesConfigBaseUrl 可选，不在此列） */
const DEFAULT_OPTIONS = {
  apiBaseUrl: '/api',
  fileStorage: 'localStorage' as const,
  enableValidation: false,
  timeout: REQUEST_TIMEOUT,
} satisfies Omit<Required<ConfigLoaderOptions>, 'getHeaders' | 'pagesConfigBaseUrl' | 'fileRegistry'>

type ResolvedConfigLoaderOptions =
  Omit<Required<ConfigLoaderOptions>, 'getHeaders' | 'pagesConfigBaseUrl' | 'fileRegistry'>
  & Pick<ConfigLoaderOptions, 'getHeaders' | 'pagesConfigBaseUrl' | 'fileRegistry'>

function trimTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '')
}

function cacheScopePrefix(baseUrl: string): string {
  const scope = baseUrl.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return `spark_page_${scope}_`
}

function resolvePagesConfigBaseUrl(options: ResolvedConfigLoaderOptions): string {
  const baseUrl = options.pagesConfigBaseUrl
  if (baseUrl !== undefined) {
    return trimTrailingSlash(typeof baseUrl === 'function' ? baseUrl() : baseUrl)
  }
  return `${trimTrailingSlash(options.apiBaseUrl)}/pages-config`
}

export class PageConfigLoader implements ConfigLoader {
  private opts: ResolvedConfigLoaderOptions
  private fileLoader!: FileLoader
  /** 共享 axios 请求实例（远程 API 调用统一通道，自动注入 auth/tenant headers） */
  private request: HttpClient
  /** 页面配置文件 API 请求实例，baseURL 固定到 .../pages-config。 */
  private fileApiRequest!: HttpClient
  private pagesConfigBase = ''
  private readonly recentMissingFiles = new Set<string>()
  private pageFileManifest: Map<string, Set<PageConfigFileName>> | null = null
  /** 页面文件注册表，用于动态控制加载哪些文件类型 */
  private readonly fileRegistry: PageFileRegistry

  /**
   * 派生加载器：各自对应一种文件类型的编译产物缓存。
   * 相同 timestamp → 直接返回缓存结果，跳过 transform 函数。
   */
  private ruleLoader!: DerivedLoader<RuleConfig[]>
  private dataLoader!: DerivedLoader<PageDataConfig>
  private scriptLoader!: DerivedLoader<PageScriptConfig>
  private cssLoader!: DerivedLoader<PageCssConfig>

  constructor(options: Partial<ConfigLoaderOptions> = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options }
    this.fileRegistry = options.fileRegistry ?? createDefaultFileRegistry()
    // 创建共享 Request 实例（远程 API 调用的统一 axios 通道）
    this.request = createRequest({
      baseURL: this.opts.apiBaseUrl,
      timeout: this.opts.timeout,
    })
    // 动态请求头注入（auth / tenant headers）
    if (this.opts.getHeaders) {
      const getHeaders = this.opts.getHeaders
      const headerInterceptor: RequestInterceptor = {
        onRequest: (config) => {
          config.headers = { ...config.headers, ...getHeaders() }
          return config
        }
      }
      this.request.interceptors.request.use(headerInterceptor)
    }
    // 函数型 pagesConfigBaseUrl 可能依赖登录态或当前项目，首次真实读取前不提前解析。
    if (typeof this.opts.pagesConfigBaseUrl === 'function') return
    this.resetPageFileContext(resolvePagesConfigBaseUrl(this.opts))
  }

  private resetPageFileContext(pagesConfigBase: string): void {
    this.pagesConfigBase = pagesConfigBase
    this.pageFileManifest = null
    this.recentMissingFiles.clear()

    this.fileApiRequest = createRequest({
      baseURL: this.pagesConfigBase,
      timeout: this.opts.timeout,
    })
    if (this.opts.getHeaders) {
      const getHeaders = this.opts.getHeaders
      this.fileApiRequest.interceptors.request.use({
        onRequest: (config) => {
          config.headers = { ...config.headers, ...getHeaders() }
          return config
        }
      })
    }

    this.fileLoader = createFileLoader({
      baseUrl: this.pagesConfigBase,
      storage: this.opts.fileStorage,
      cachePrefix: cacheScopePrefix(this.pagesConfigBase),
      fallbackToCache: false,
      timeout: this.opts.timeout,
      // 动态请求头（认证 / 租户上下文）
      ...(this.opts.getHeaders && { getHeaders: this.opts.getHeaders }),
      // 分级过期策略配置（可选，使用默认值）
      defaultExpirationLevel: 3,  // 默认15天
      maxCacheSize: 50             // 最多缓存 50 个页面配置
    })

    this.bindFileLoaderEvents()
    this.ruleLoader = this.fileLoader.withTransform(compileRule)
    this.dataLoader = this.fileLoader.withTransform(parsePageData)
    this.scriptLoader = this.fileLoader.withTransform(parseScript)
    this.cssLoader = this.fileLoader.withTransform(parseCss)
  }

  private ensurePageFileContext(): void {
    const pagesConfigBase = resolvePagesConfigBaseUrl(this.opts)
    if (pagesConfigBase === this.pagesConfigBase) return
    pageLogger.info('页面配置项目作用域变更，重建文件加载上下文', {
      previousBase: this.pagesConfigBase,
      nextBase: pagesConfigBase,
    })
    this.resetPageFileContext(pagesConfigBase)
  }

  private bindFileLoaderEvents(): void {
    // 订阅 FileLoader 事件：将文件缺失转为可消费状态，避免上层只能依赖字符串兜底。
    this.fileLoader.on('file-missing', (evt: FileLoaderEventMap['file-missing']) => {
      this.recentMissingFiles.add(evt.fileName)
      pageLogger.debug('捕获文件缺失事件', { fileName: evt.fileName, status: evt.status })
    })
    this.fileLoader.on('file-loaded', (evt: FileLoaderEventMap['file-loaded']) => {
      this.recentMissingFiles.delete(evt.fileName)
    })
  }

  // ── 公开 API ──────────────────────────────────────────────────────


  async loadRule(pageId: string): Promise<ConfigLoadResult<RuleConfig[]>> {
    this.ensurePageFileContext()
    pageLogger.info('加载页面规则', { pageId })
    return this.loadRequiredPageFile(pageId, 'rule.json', this.ruleLoader)
  }

  async loadPageData(pageId: string): Promise<ConfigLoadResult<PageDataConfig>> {
    this.ensurePageFileContext()
    pageLogger.info('加载页面数据', { pageId })
    return this.loadRequiredPageFile(pageId, 'pagedata.json', this.dataLoader)
  }

  async loadCss(pageId: string): Promise<ConfigLoadResult<PageCssConfig>> {
    this.ensurePageFileContext()
    pageLogger.debug('加载页面样式', { pageId })
    return this.loadRequiredPageFile(pageId, 'style.css', this.cssLoader)
  }

  async loadScript(pageId: string): Promise<ConfigLoadResult<PageScriptConfig>> {
    this.ensurePageFileContext()
    pageLogger.debug('加载页面脚本', { pageId })
    return this.loadRequiredPageFile(pageId, 'script.js', this.scriptLoader)
  }

  async loadPageConfig(pageId: string): Promise<ConfigLoadResult<PageConfig>> {
    this.ensurePageFileContext()
    pageLogger.info('加载完整页面配置', { pageId })
    const knownFiles = await this.getKnownPageFiles(pageId)
    const missingKnownFile = REQUIRED_PAGE_CONFIG_FILE_NAMES.find(filename => this.isKnownMissing(knownFiles, filename))
    if (missingKnownFile !== undefined) {
      return this.missingPageFileResult(pageId, missingKnownFile)
    }

    const ruleResult = await this.loadRule(pageId)
    if (!ruleResult.success) return this.failFrom(ruleResult.error, ruleResult.reason)

    const dataResult = await this.loadPageData(pageId)
    if (!dataResult.success) return this.failFrom(dataResult.error, dataResult.reason)

    const scriptResult = await this.loadOptionalPageFile(pageId, 'script.js', this.scriptLoader, knownFiles)
    if (!scriptResult.success) return this.failFrom(scriptResult.error, scriptResult.reason)

    const cssResult = await this.loadOptionalPageFile(pageId, 'style.css', this.cssLoader, knownFiles)
    if (!cssResult.success) return this.failFrom(cssResult.error, cssResult.reason)

    pageLogger.debug('页面附加资源加载完成', {
      pageId,
      hasScript: Boolean(scriptResult.data),
      scriptSize: scriptResult.data?.length ?? 0,
      hasCss: Boolean(cssResult.data),
      cssSize: cssResult.data?.length ?? 0,
    })

    return {
      success: true,
      data: {
        pageId,
        rule: ruleResult.data ?? [],
        data: dataResult.data as PageDataConfig,
        script: scriptResult.data,
        css: cssResult.data,
      },
      ...(ruleResult.source !== undefined && { source: ruleResult.source }),
      timestamp: this.latestResultTimestamp(ruleResult, dataResult, scriptResult, cssResult)
    }
  }

  async loadPageFileContent(
    pageId: string,
    filename: PageConfigFileName,
    options?: PageConfigFileLoadOptions,
  ): Promise<ConfigLoadResult<string>> {
    this.ensurePageFileContext()
    const path = this.toPageFilePath(pageId, filename)
    const result = await this.fileLoader.load<string>(path, {
      parseJSON: false,
      forceRefresh: options?.forceReload === true,
    })
    return this.pageFileContentResultFromData(result, path)
  }

  clearCache(key?: string): void {
    this.ensurePageFileContext()
    this.fileLoader.clearCache(key)
    if (!key) {
      this.recentMissingFiles.clear()
      this.pageFileManifest = null
      return
    }
    this.invalidatePageFileManifest(key)
  }

  getCacheStats(): { size: number; keys: string[] } {
    this.ensurePageFileContext()
    return this.fileLoader.getCacheStats()
  }

  getHttpClient(): HttpClient {
    return this.request
  }

  async loadPageFile(
    pageId: string,
    filename: string,
    options?: PageConfigFileLoadOptions,
  ): Promise<ConfigLoadResult<unknown>> {
    this.ensurePageFileContext()
    const descriptor = this.fileRegistry.get(filename)
    if (!descriptor) {
      return { success: false, error: `Unknown file type: ${filename}`, timestamp: Date.now() }
    }
    const path = this.toPageFilePath(pageId, filename)
    const result = await this.fileLoader.load<string>(path, {
      parseJSON: false,
      forceRefresh: options?.forceReload === true,
    })
    if (!result.success) {
      if (descriptor.required) {
        return this.pageFileContentResultFromData(result, path) as ConfigLoadResult<never>
      }
      return { success: true, source: 'remote' }
    }
    return this.pageFileContentResultFromData(result, path)
  }

  /** 从失败的 ConfigLoadResult 构建错误响应（DRY）*/
  private failFrom(error: string | undefined, reason?: string): ConfigLoadResult<never> {
    return { success: false, ...(error !== undefined && { error }), ...(reason !== undefined && { reason }), timestamp: Date.now() }
  }

  // ── 私有辅助 ──────────────────────────────────────────────────────

  private async getKnownPageFiles(pageId: string): Promise<Set<PageConfigFileName> | null> {
    const manifest = await this.getPageFileManifest()
    return manifest?.get(pageId) ?? (manifest === null ? null : new Set<PageConfigFileName>())
  }

  private async getPageFileManifest(): Promise<Map<string, Set<PageConfigFileName>> | null> {
    if (this.pageFileManifest !== null) return this.pageFileManifest

    try {
      const rows = await this.fileApiRequest.get<unknown>('/__list', undefined, {
        meta: { silentHttpError: true },
      })
      if (!Array.isArray(rows)) return null

      const manifest = new Map<string, Set<PageConfigFileName>>()
      for (const row of rows) {
        if (row === null || typeof row !== 'object') continue
        const item = row as Record<string, unknown>
        const pageId = item['pageId']
        if (typeof pageId !== 'string' || pageId.trim() === '') continue
        const files = Array.isArray(item['files'])
          ? item['files'].filter((name): name is PageConfigFileName => this.isPageConfigFileName(name))
          : []
        manifest.set(pageId, new Set(files))
      }
      this.pageFileManifest = manifest
      return manifest
    } catch (error) {
      pageLogger.debug('页面文件清单不可用，回退逐文件加载', { error })
      return null
    }
  }

  private isPageConfigFileName(value: unknown): value is PageConfigFileName {
    return typeof value === 'string'
      && ((PAGE_CONFIG_FILE_NAMES as readonly string[]).includes(value) || this.fileRegistry.has(value))
  }

  private isKnownMissing(
    knownFiles: Set<PageConfigFileName> | null,
    filename: PageConfigFileName,
  ): boolean {
    return knownFiles !== null && !knownFiles.has(filename)
  }

  private invalidatePageFileManifest(key: string): void {
    if (this.pageFileManifest === null) return
    const pageId = key.replace(/^\/+/, '').split('/')[0]
    if (pageId === undefined || pageId === '') {
      this.pageFileManifest = null
      return
    }
    this.pageFileManifest.delete(decodeURIComponent(pageId))
  }

  /**
   * 加载页面四文件。
   * 统一走 FileLoader + 编译缓存；远程模式由 FileLoader 对接 timestamp/notModified。
   */
  private async loadRequiredPageFile<T>(
    pageId: string,
    filename: string,
    localLoader: DerivedLoader<T>,
  ): Promise<ConfigLoadResult<T>> {
    return this.derivedResult(localLoader, this.toPageFilePath(pageId, filename))
  }

  private async loadOptionalPageFile<T>(
    pageId: string,
    filename: PageConfigFileName,
    localLoader: DerivedLoader<T>,
    knownFiles: Set<PageConfigFileName> | null,
  ): Promise<ConfigLoadResult<T | undefined>> {
    if (this.isKnownMissing(knownFiles, filename)) {
      return { success: true, source: 'remote' }
    }

    const result = await this.derivedResult(localLoader, this.toPageFilePath(pageId, filename))
    if (!result.success && result.reason === 'not-found') {
      return { success: true, source: 'remote' }
    }
    return result
  }

  /**
   * FileLoader 加载结果转换为 ConfigLoadResult。
   * 只转换文件 API 的结果，不触发其他来源补读。
   *
   * 这里刻意把 FileLoader 返回的 source timestamp 继续上抛。
   * 页面四文件的缓存一致性由后端文件时间戳驱动，不由前端本地缓存写入时间驱动；
   * 如果改成 Date.now()，调用方会看到“加载时间”而不是“源文件版本”，排查缓存时会被带偏。
   */
  private fileResultFromData<T>(
    r: { success: boolean; error?: string; fromCache?: boolean; data?: T; reason?: string; timestamp?: string; notModified?: boolean },
    path: string
  ): ConfigLoadResult<T> {
    const timestamp = this.resultTimestamp(r.timestamp)
    if (!r.success) {
      const rawError = r.error ?? ''
      const fromEvent = this.recentMissingFiles.has(path)
      const isNotFound = r.reason === 'not-found' || fromEvent || /404|not\s*found/i.test(rawError)
      if (isNotFound) {
        pageLogger.debug('远程页面配置文件不存在', { path })
      } else {
        pageLogger.error('页面配置加载失败', { path, error: r.error })
      }
      return {
        success: false,
        error: `${this.pagesConfigBase}${path}: ${r.error ?? ''}`,
        ...(isNotFound ? { reason: 'not-found' as const } : (r.reason !== undefined ? { reason: r.reason } : {})),
        timestamp
      }
    }
    pageLogger.debug('页面配置加载成功', { path, source: 'remote', fromCache: r.fromCache })
    return {
      success: true,
      ...(r.data !== undefined && { data: r.data }),
      source: 'remote',
      timestamp,
      ...(r.timestamp !== undefined && { sourceTimestamp: r.timestamp }),
      ...(r.fromCache !== undefined && { fromCache: r.fromCache }),
      ...(r.notModified !== undefined && { notModified: r.notModified }),
    }
  }

  /**
   * 通过 DerivedLoader 加载页面文件并转为 ConfigLoadResult。
   * timestamp 未变时直接命中编译缓存，跳过 transform 函数。
   */
  private async derivedResult<T>(
    loader: DerivedLoader<T>,
    path: string
  ): Promise<ConfigLoadResult<T>> {
    return this.fileResultFromData(await loader.load(path), path)
  }

  private missingPageFileResult<T>(pageId: string, filename: PageConfigFileName): ConfigLoadResult<T> {
    pageLogger.debug('远程页面配置文件不存在', { pageId, filename })
    return {
      success: false,
      error: `${this.pagesConfigBase}${this.toPageFilePath(pageId, filename)}: not found`,
      reason: 'not-found',
      source: 'remote',
      timestamp: Date.now(),
    }
  }

  private pageFileContentResultFromData(
    result: { success: boolean; data?: string; error?: string; reason?: string; timestamp?: string; fromCache?: boolean; notModified?: boolean },
    path: string,
  ): ConfigLoadResult<string> {
    const timestamp = this.resultTimestamp(result.timestamp)
    if (result.success) {
      return {
        success: true,
        data: result.data ?? '',
        source: 'remote',
        timestamp,
        ...(result.timestamp !== undefined && { sourceTimestamp: result.timestamp }),
        ...(result.fromCache !== undefined && { fromCache: result.fromCache }),
        ...(result.notModified !== undefined && { notModified: result.notModified }),
      }
    }

    return {
      success: false,
      error: result.error ?? `${path} 加载失败`,
      ...(result.reason !== undefined && { reason: result.reason }),
      timestamp,
    }
  }

  private resultTimestamp(sourceTimestamp: string | undefined): number {
    if (sourceTimestamp === undefined || sourceTimestamp.trim() === '') return Date.now()
    const numeric = Number(sourceTimestamp)
    if (Number.isFinite(numeric)) return numeric
    const parsed = Date.parse(sourceTimestamp)
    return Number.isFinite(parsed) ? parsed : Date.now()
  }

  private latestResultTimestamp(...results: Array<ConfigLoadResult<unknown>>): number {
    const timestamps = results
      .map(result => result.timestamp)
      .filter((timestamp): timestamp is number => typeof timestamp === 'number' && Number.isFinite(timestamp))
    return timestamps.length > 0 ? Math.max(...timestamps) : Date.now()
  }

  private toPageFilePath(pageId: string, filename: string): string {
    return `/${encodeURIComponent(pageId)}/${encodeURIComponent(filename)}`
  }

}

export function createConfigLoader(options?: Partial<ConfigLoaderOptions>): ConfigLoader {
  return new PageConfigLoader(options)
}
