/**
 * 页面内容加载器 - 统一读取四文件内容配置
 *
 * 职责：通过后端页面配置文件 API 加载四文件，并管理客户端缓存策略。
 * 编译函数（**如何解析**）拆分到 `page-content-compiler.ts`。
 *
 * ## 数据流
 * ```
 * loadRule(pageId)
 *   └── loadRequiredPageFile(pageId, 'rule.json')
 *         └── fileLoader.withTransform(...).load(path) → PageContentLoadResult<T>
 * ```
 *
 * ## 缓存策略
 * - FileLoader 时间戳协议（localStorage / sessionStorage / memory）
 * - 后端 API 走 timestamp/notModified + 客户端缓存
 */

import type {
  PageContentLoaderOptions,
  PageContentConfig,
} from './types'
import { BasePageContentLoader } from './types'
import type { PageContentLoadResult, PageNodeLoadOptions } from '../../page/file'
import type { DataSet } from '@spark-appworks/spark-data'
import type { SparkNode } from '@spark-appworks/spark-data'
import {
  Logger,
  createFileLoader,
  createRequest
} from '@spark-appworks/spark-utils'
import type { FileLoader, TransformedFileLoader, HttpClientBase, FileLoaderEventMap } from '@spark-appworks/spark-utils'
import {
  PageNodeFilePath,
  type PageNodeFileName,
} from '../../page/file'
import { trimTrailingSlash } from '../util'
import { installHeaderInterceptor } from '../util'

// 编译函数从同一文件域的 compiler 模块导入（职责分离：loader 管加载，compiler 管解析）
import { compileRule, parsePageData, parseScript, parseCss } from './compiler'

const pageLogger = Logger('PageContentConfig')

const REQUEST_TIMEOUT = 10_000

// ═══ 选项解析：加载器构造参数的默认值与归一化 ═══

/** 必填字段默认值（getHeaders / pagesConfigBaseUrl 可选，不在此列） */
const DEFAULT_OPTIONS = {
  apiBaseUrl: '/api',
  fileStorage: 'localStorage',
  enableValidation: false,
  timeout: REQUEST_TIMEOUT,
} satisfies Omit<Required<PageContentLoaderOptions>, 'getHeaders' | 'pagesConfigBaseUrl' | 'httpClient'>

/** 已解析的加载器选项：所有必填字段均有值，可选字段保持可选。 */
type ResolvedPageContentLoaderOptions =
  Omit<Required<PageContentLoaderOptions>, 'getHeaders' | 'pagesConfigBaseUrl' | 'httpClient'>
  & Pick<PageContentLoaderOptions, 'getHeaders' | 'pagesConfigBaseUrl' | 'httpClient'>

/** 为缓存前缀生成作用域标识符，避免不同后端路径之间的缓存冲突。 */
function cacheScopePrefix(baseUrl: string): string {
  const scope = baseUrl.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return `spark_page_${scope}_`
}

/** 解析页面配置基础 URL：优先使用显式配置，否则从 apiBaseUrl 推导。 */
function resolvePagesConfigBaseUrl(options: ResolvedPageContentLoaderOptions): string {
  const baseUrl = options.pagesConfigBaseUrl
  if (baseUrl !== undefined) {
    return trimTrailingSlash(typeof baseUrl === 'function' ? baseUrl() : baseUrl)
  }
  return `${trimTrailingSlash(options.apiBaseUrl)}/pages-config`
}

// ═══ PageContentLoader 构造与配置 ═══════════════════════════

export class PageContentLoader extends BasePageContentLoader {
  private opts: ResolvedPageContentLoaderOptions
  private fileLoader!: FileLoader
  /** 共享 axios 请求实例（远程 API 调用统一通道，自动注入 auth/tenant headers） */
  private request: HttpClientBase
  private pagesConfigBase = ''
  private readonly recentMissingFiles = new Set<string>()

  /**
   * 派生加载器：各自对应一种文件类型的编译产物缓存。
   * 相同 timestamp → 直接返回缓存结果，跳过 transform 函数。
   */
  private ruleLoader!: TransformedFileLoader<SparkNode[]>
  private dataLoader!: TransformedFileLoader<DataSet>
  // 这里不再为 JS 基础类型保留导出别名，直接使用原生 string。
  private scriptLoader!: TransformedFileLoader<string>
  private cssLoader!: TransformedFileLoader<string>

  constructor(options: Partial<PageContentLoaderOptions> = {}) {
    super()
    this.opts = { ...DEFAULT_OPTIONS, ...options }
    // 创建共享 Request 实例（远程 API 调用的统一 axios 通道）
    this.request = this.opts.httpClient ?? createRequest({
      baseURL: this.opts.apiBaseUrl,
      timeout: this.opts.timeout,
    })
    // 动态请求头注入（auth / tenant headers）
    installHeaderInterceptor(this.request, this.opts.getHeaders)
    // 函数型 pagesConfigBaseUrl 可能依赖登录态或当前项目，首次真实读取前不提前解析。
    if (typeof this.opts.pagesConfigBaseUrl === 'function') return
    this.resetPageFileContext(resolvePagesConfigBaseUrl(this.opts))
  }

  private resetPageFileContext(pagesConfigBase: string): void {
    this.pagesConfigBase = pagesConfigBase
    this.recentMissingFiles.clear()

    this.fileLoader = createFileLoader({
      baseUrl: this.pagesConfigBase,
      ...(this.opts.httpClient !== undefined && { request: this.opts.httpClient }),
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


  async loadRule(pageId: string): Promise<PageContentLoadResult<SparkNode[]>> {
    this.ensurePageFileContext()
    pageLogger.info('加载页面规则', { pageId })
    return this.loadRequiredPageFile(pageId, 'rule.json', this.ruleLoader)
  }

  async loadPageData(pageId: string): Promise<PageContentLoadResult<DataSet>> {
    this.ensurePageFileContext()
    pageLogger.info('加载页面数据', { pageId })
    return this.loadRequiredPageFile(pageId, 'pagedata.json', this.dataLoader)
  }

  async loadCss(pageId: string): Promise<PageContentLoadResult<string>> {
    this.ensurePageFileContext()
    pageLogger.debug('加载页面样式', { pageId })
    return this.loadRequiredPageFile(pageId, 'style.css', this.cssLoader)
  }

  async loadScript(pageId: string): Promise<PageContentLoadResult<string>> {
    this.ensurePageFileContext()
    pageLogger.debug('加载页面脚本', { pageId })
    return this.loadRequiredPageFile(pageId, 'script.js', this.scriptLoader)
  }

  // ═══ 加载器公共方法 ═══════════════════════════════════════

  async loadPageContentConfig(pageId: string): Promise<PageContentLoadResult<PageContentConfig>> {
    this.ensurePageFileContext()
    pageLogger.info('加载页面内容配置', { pageId })

    const ruleResult = await this.loadRule(pageId)
    if (!ruleResult.success) return this.failFrom(ruleResult.error, ruleResult.reason)

    const dataResult = await this.loadPageData(pageId)
    if (!dataResult.success) return this.failFrom(dataResult.error, dataResult.reason)
    if (dataResult.data === undefined) {
      throw new Error(`Page data loader returned no data: ${pageId}/pagedata.json`)
    }

    const scriptResult = await this.loadOptionalPageFile(pageId, 'script.js', this.scriptLoader)
    if (!scriptResult.success) return this.failFrom(scriptResult.error, scriptResult.reason)

    const cssResult = await this.loadOptionalPageFile(pageId, 'style.css', this.cssLoader)
    if (!cssResult.success) return this.failFrom(cssResult.error, cssResult.reason)

    pageLogger.debug('页面附加资源加载完成', {
      pageId,
      hasScript: Boolean(scriptResult.data),
      scriptSize: scriptResult.data?.length ?? 0,
      hasCss: Boolean(cssResult.data),
      cssSize: cssResult.data?.length ?? 0,
    })

    const timestamp = this.latestResultTimestamp(ruleResult, dataResult, scriptResult, cssResult)
    return {
      success: true,
      data: {
        pageId,
        rule: ruleResult.data ?? [],
        data: dataResult.data,
        script: scriptResult.data,
        css: cssResult.data,
      },
      ...(ruleResult.source !== undefined && { source: ruleResult.source }),
      ...(timestamp !== undefined && { timestamp }),
    }
  }

  async loadPageFileContent(
    pageId: string,
    filename: PageNodeFileName,
    options?: PageNodeLoadOptions,
  ): Promise<PageContentLoadResult<string>> {
    this.ensurePageFileContext()
    const path = this.toPageFilePath(pageId, filename)
    const result = await this.fileLoader.load(path, {
      parseJSON: false,
      forceRefresh: options?.forceReload === true,
    })
    return this.pageFileContentResultFromData(result, path)
  }

  // ═══ 缓存管理 ═══════════════════════════════════════════

  clearCache(key?: string): void {
    this.ensurePageFileContext()
    this.fileLoader.clearCache(key)
    if (!key) {
      this.recentMissingFiles.clear()
    }
  }

  getCacheStats(): { size: number; keys: string[] } {
    this.ensurePageFileContext()
    return this.fileLoader.getCacheStats()
  }

  override getHttpClient(): HttpClientBase {
    return this.request
  }

  override async loadPageFile(
    pageId: string,
    filename: PageNodeFileName,
    options?: PageNodeLoadOptions,
  ): Promise<PageContentLoadResult<unknown>> {
    this.ensurePageFileContext()
    const path = this.toPageFilePath(pageId, filename)
    const result = await this.fileLoader.load(path, {
      parseJSON: false,
      forceRefresh: options?.forceReload === true,
    })
    return this.pageFileContentResultFromData(result, path)
  }

  /** 从失败的 PageContentLoadResult 构建错误响应（DRY）*/
  private failFrom(error: string | undefined, reason?: string): PageContentLoadResult<never> {
    return { success: false, ...(error !== undefined && { error }), ...(reason !== undefined && { reason }) }
  }

  // ── 私有辅助 ──────────────────────────────────────────────────────

  /**
   * 加载页面四文件。
   * 统一走 FileLoader + 编译缓存；远程模式由 FileLoader 对接 timestamp/notModified。
   */
  private async loadRequiredPageFile<T>(
    pageId: string,
    filename: string,
    localLoader: TransformedFileLoader<T>,
  ): Promise<PageContentLoadResult<T>> {
    return this.derivedResult(localLoader, this.toPageFilePath(pageId, filename))
  }

  private async loadOptionalPageFile<T>(
    pageId: string,
    filename: PageNodeFileName,
    localLoader: TransformedFileLoader<T>,
  ): Promise<PageContentLoadResult<T | undefined>> {
    const result = await this.derivedResult(localLoader, this.toPageFilePath(pageId, filename))
    return result
  }

  /**
   * FileLoader 加载结果转换为 PageContentLoadResult。
   * 只转换文件 API 的结果，不触发其他来源补读。
   *
   * 这里刻意把 FileLoader 返回的 source timestamp 继续上抛。
   * 页面四文件的缓存一致性由后端文件时间戳驱动，不由前端本地缓存写入时间驱动；
   * 如果改成 Date.now()，调用方会看到“加载时间”而不是“源文件版本”，排查缓存时会被带偏。
   */
  private fileResultFromData<T>(
    r: { success: boolean; error?: string; fromCache?: boolean; data?: T; reason?: string; timestamp?: string; notModified?: boolean },
    path: string
  ): PageContentLoadResult<T> {
    const timestamp = this.resultTimestamp(r.timestamp)
    if (!r.success) {
      const rawError = r.error ?? ''
      const fromEvent = this.recentMissingFiles.has(path)
      const isNotFound = r.reason === 'not-found' || fromEvent || /404|not\s*found/i.test(rawError)
      if (isNotFound) {
        pageLogger.debug('远程页面配置文件不存在', { path })
      } else {
        pageLogger.error('页面内容配置加载失败', { path, error: r.error })
      }
      return {
        success: false,
        error: `${this.pagesConfigBase}${path}: ${r.error ?? ''}`,
        ...(isNotFound ? { reason: 'not-found' } : (r.reason !== undefined ? { reason: r.reason } : {})),
        ...(timestamp !== undefined && { timestamp }),
      }
    }
    pageLogger.debug('页面内容配置加载成功', { path, source: 'remote', fromCache: r.fromCache })
    return {
      success: true,
      ...(r.data !== undefined && { data: r.data }),
      source: 'remote',
      ...(timestamp !== undefined && { timestamp }),
      ...(r.timestamp !== undefined && { sourceTimestamp: r.timestamp }),
      ...(r.fromCache !== undefined && { fromCache: r.fromCache }),
      ...(r.notModified !== undefined && { notModified: r.notModified }),
    }
  }

  /**
   * 通过 TransformedFileLoader 加载页面文件并转为 PageContentLoadResult。
   * timestamp 未变时直接命中编译缓存，跳过 transform 函数。
   */
  private async derivedResult<T>(
    loader: TransformedFileLoader<T>,
    path: string
  ): Promise<PageContentLoadResult<T>> {
    return this.fileResultFromData(await loader.load(path), path)
  }

  private pageFileContentResultFromData(
    result: { success: boolean; data?: string; error?: string; reason?: string; timestamp?: string; fromCache?: boolean; notModified?: boolean },
    path: string,
  ): PageContentLoadResult<string> {
    const timestamp = this.resultTimestamp(result.timestamp)
    if (result.success) {
      return {
        success: true,
        data: result.data ?? '',
        source: 'remote',
        ...(timestamp !== undefined && { timestamp }),
        ...(result.timestamp !== undefined && { sourceTimestamp: result.timestamp }),
        ...(result.fromCache !== undefined && { fromCache: result.fromCache }),
        ...(result.notModified !== undefined && { notModified: result.notModified }),
      }
    }

    return {
      success: false,
      error: result.error ?? `${path} 加载失败`,
      ...(result.reason !== undefined && { reason: result.reason }),
      ...(timestamp !== undefined && { timestamp }),
    }
  }

  private resultTimestamp(sourceTimestamp: string | undefined): number | undefined {
    if (sourceTimestamp === undefined || sourceTimestamp.trim() === '') return undefined
    const numeric = Number(sourceTimestamp)
    if (Number.isFinite(numeric)) return numeric
    const parsed = Date.parse(sourceTimestamp)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  private latestResultTimestamp(...results: Array<PageContentLoadResult<unknown>>): number | undefined {
    const timestamps = results
      .map(result => result.timestamp)
      .filter((timestamp): timestamp is number => typeof timestamp === 'number' && Number.isFinite(timestamp))
    return timestamps.length > 0 ? Math.max(...timestamps) : undefined
  }

  private toPageFilePath(pageId: string, filename: string): string {
    return PageNodeFilePath.forFile(pageId, filename)
  }


}

export function createPageContentLoader(options?: Partial<PageContentLoaderOptions>): PageContentLoader {
  return new PageContentLoader(options)
}
