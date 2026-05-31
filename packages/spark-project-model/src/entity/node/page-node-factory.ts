import { createRequest } from '@spark-view/spark-utils'
import type { HttpClientBase, RequestInterceptor } from '@spark-view/spark-utils'
import type { BasePageContentLoader, PageContentLoaderOptions } from '../../service/loader/page-content-types'
import { PageNodeFileApi } from '../../service/file/page-file-api'
import { PageNodeFileCache } from '../../service/file/page-file-cache'
import { createPageContentLoader } from '../../service/loader/page-content-loader'
import { NavigationConfigClient } from '../../service/navigation/client'
import { ConfigPageNode, type PageNodeLike } from './project-node-model'

export type PageNodeFileStorage = 'localStorage' | 'sessionStorage' | 'memory'

export type PageNodeFactoryOptions = {
  apiBaseUrl?: string
  pagesConfigBaseUrl?: string | (() => string)
  navigationApiBaseUrl?: string | (() => string)
  timeout?: number
  getHeaders?: () => Record<string, string>
  fileStorage?: PageNodeFileStorage
  httpClient?: HttpClientBase
}

export type PageNodeFactoryLike = {
  create(pageId: string): PageNodeLike
  clearPageCache(pageId: string): void
  clearAllCache(): { size: number; keys: string[] }
  getCacheStats(): { size: number; keys: string[] }
  getHttpClient(): HttpClientBase | undefined
}

export class PageNodeFactory implements PageNodeFactoryLike {
  private readonly http: HttpClientBase
  private readonly loader: BasePageContentLoader
  private readonly fileApi: PageNodeFileApi
  private readonly fileCache: PageNodeFileCache
  private readonly navClient: NavigationConfigClient
  private readonly getPagesConfigBaseUrl: () => string

  constructor(options: PageNodeFactoryOptions = {}) {
    const apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl ?? '/api')
    this.http = options.httpClient ?? createRequest({
      baseURL: apiBaseUrl,
      ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    })
    installHeaderInterceptor(this.http, options.getHeaders)

    this.getPagesConfigBaseUrl = () => resolvePagesConfigBaseUrl(apiBaseUrl, options.pagesConfigBaseUrl)
    this.loader = createPageContentLoader(toLoaderOptions(apiBaseUrl, this.http, options))
    this.fileApi = new PageNodeFileApi({
      getPageFilesApi: this.getPagesConfigBaseUrl,
      http: this.http,
    })
    this.fileCache = new PageNodeFileCache({
      contentLoaderFactory: () => this.loader,
    })
    this.navClient = new NavigationConfigClient({
      getNavigationApi: () => resolveNavigationApiBaseUrl(apiBaseUrl, options.navigationApiBaseUrl),
      http: this.http,
    })
  }

  create(pageId: string): ConfigPageNode {
    const normalized = pageId.trim()
    if (!normalized) {
      throw new Error('pageId 不能为空')
    }
    const page = new ConfigPageNode({
      node: {
        id: normalized,
        title: normalized,
        nodeKind: 'page',
        path: `/${normalized}`,
        icon: 'Document',
      },
      pid: null,
      pageId: normalized,
      fileApi: this.fileApi,
      fileCache: this.fileCache,
      contentLoaderFactory: () => this.loader,
      navClient: this.navClient,
    })
    page.navigation.navNode = null
    return page
  }

  clearPageCache(pageId: string): void {
    const normalized = pageId.trim()
    if (!normalized) return
    this.fileCache.clearPageCache(normalized)
  }

  clearAllCache(): { size: number; keys: string[] } {
    const stats = this.loader.getCacheStats()
    this.loader.clearCache()
    return stats
  }

  getCacheStats(): { size: number; keys: string[] } {
    return this.loader.getCacheStats()
  }

  getHttpClient(): HttpClientBase | undefined {
    return this.loader.getHttpClient()
  }
}

export function createPageNodeFactory(options: PageNodeFactoryOptions = {}): PageNodeFactory {
  return new PageNodeFactory(options)
}

export function createPageNode(pageId: string, options: PageNodeFactoryOptions = {}): ConfigPageNode {
  return createPageNodeFactory(options).create(pageId)
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return '/api'
  return trimmed.replace(/\/+$/, '')
}

function resolveUrlOption(apiBaseUrl: string, option: string | (() => string) | undefined, fallbackSuffix: string): string {
  const raw = option === undefined
    ? `${apiBaseUrl}${fallbackSuffix}`
    : (typeof option === 'function' ? option() : option)
  return raw.replace(/\/+$/, '')
}

function resolvePagesConfigBaseUrl(apiBaseUrl: string, option: string | (() => string) | undefined): string {
  return resolveUrlOption(apiBaseUrl, option, '/pages-config')
}

function resolveNavigationApiBaseUrl(apiBaseUrl: string, option: string | (() => string) | undefined): string {
  return resolveUrlOption(apiBaseUrl, option, '/navigation')
}

function installHeaderInterceptor(http: HttpClientBase, getHeaders: (() => Record<string, string>) | undefined): void {
  if (getHeaders === undefined) return
  const interceptor: RequestInterceptor = {
    onRequest: (config) => {
      config.headers = { ...config.headers, ...getHeaders() }
      return config
    },
  }
  http.interceptors.request.use(interceptor)
}

function toLoaderOptions(
  apiBaseUrl: string,
  http: HttpClientBase,
  options: PageNodeFactoryOptions,
): Partial<PageContentLoaderOptions> {
  const loaderOptions: Partial<PageContentLoaderOptions> = {
    apiBaseUrl,
    httpClient: http,
  }
  if (options.pagesConfigBaseUrl !== undefined) loaderOptions.pagesConfigBaseUrl = options.pagesConfigBaseUrl
  if (options.timeout !== undefined) loaderOptions.timeout = options.timeout
  if (options.getHeaders !== undefined) loaderOptions.getHeaders = options.getHeaders
  if (options.fileStorage !== undefined) loaderOptions.fileStorage = options.fileStorage
  return loaderOptions
}
