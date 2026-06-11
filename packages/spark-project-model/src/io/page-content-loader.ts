/**
 * 页面内容加载器 - 统一读取四文件原文
 *
 * 职责：通过后端页面配置文件 API 加载四文件原文，并管理客户端缓存策略。
 *
 * ## 数据流
 * ```
 * loadPageFileContent(pageId, filename)
 *   └── fileLoader.load(path, { parseJSON: false }) → PageContentLoadResult<string>
 * ```
 *
 * ## 缓存策略
 * - FileLoader 时间戳协议（localStorage / sessionStorage / memory）
 * - 后端 API 走 timestamp/notModified + 客户端缓存
 */

import type { PageContentLoadResult, PageNodeLoadOptions } from '../page/page-file'
import {
  Logger,
  createFileLoader,
  createRequest
} from '@spark-appworks/spark-utils'
import type { FileLoader, HttpClientBase } from '@spark-appworks/spark-utils'
import {
  pageFilePath,
  pageFilePaths,
  type PageNodeFileName,
} from '../page/page-file'
import { trimTrailingSlash, installHeaderInterceptor } from './http'

const pageLogger = Logger('PageContentLoader')

const REQUEST_TIMEOUT = 10_000

/** Page Content Loader Options 的调用配置。 */
export type PageContentLoaderOptions = {
    /** api Base Url 地址。 */
apiBaseUrl?: string
    /** http Client 字段。 */
httpClient?: HttpClientBase
    /** pages Config Base Url 地址。 */
pagesConfigBaseUrl?: string | (() => string)
    /** file Storage 字段。 */
fileStorage?: 'localStorage' | 'sessionStorage' | 'memory'
    /** 超时时间。 */
timeout?: number
    /** get Headers 回调。 */
getHeaders?: () => Record<string, string>
}

// ═══ 选项解析：加载器构造参数的默认值与归一化 ═══

/** 必填字段默认值（getHeaders / pagesConfigBaseUrl 可选，不在此列） */
const DEFAULT_OPTIONS = {
  apiBaseUrl: '/api',
  fileStorage: 'localStorage',
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

/** Page Content Loader 的语义模型。 */
export class PageContentLoader {
  private opts: ResolvedPageContentLoaderOptions
  private fileLoader!: FileLoader
  /** 共享 axios 请求实例（远程 API 调用统一通道，自动注入 auth/tenant headers） */
  private request: HttpClientBase
  private pagesConfigBase = ''

    /** 创建 Page Content Loader 实例。 */
constructor(options: Partial<PageContentLoaderOptions> = {}) {
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

  // ── 公开 API ──────────────────────────────────────────────────────

    /** 加载 Page File Content。 */
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

    /** 清空 Cache。 */
clearCache(key?: string): void {
    this.ensurePageFileContext()
    this.fileLoader.clearCache(key)
  }

    /** 清空 All Cache。 */
clearAllCache(): { size: number; keys: string[] } {
    this.clearCache()
    return this.getCacheStats()
  }

    /** 读取 Cache Stats。 */
getCacheStats(): { size: number; keys: string[] } {
    this.ensurePageFileContext()
    return this.fileLoader.getCacheStats()
  }

    /** 读取 Http Client。 */
getHttpClient(): HttpClientBase {
    return this.request
  }

    /** 清空 Page Cache。 */
clearPageCache(pageId: string): void {
    const normalized = pageId.trim()
    if (!normalized) return
    for (const path of pageFilePaths(normalized)) this.clearCache(path)
  }

  // ── 私有辅助 ──────────────────────────────────────────────────────

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

  private toPageFilePath(pageId: string, filename: string): string {
    return pageFilePath(pageId, filename)
  }
}
