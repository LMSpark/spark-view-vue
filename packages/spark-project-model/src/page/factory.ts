import { createRequest } from '@spark-appworks/spark-utils'
import type { HttpClientBase } from '@spark-appworks/spark-utils'
import type { BasePageContentLoader, PageContentLoaderOptions } from '../infra/loader/types'
import { PageNodeFileApi } from '../infra/file/api'
import { PageNodeFileCache } from '../infra/file/cache'
import { createPageContentLoader } from '../infra/loader/loader'
import { ProjectModel } from '../project/model'
import type { ConfigPageNode, PageNodeLike } from './config-page'
import { trimTrailingSlash } from '../infra/util'
import { installHeaderInterceptor } from '../infra/util'

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
  private readonly project: ProjectModel<ConfigPageNode>
  private readonly getPagesConfigBaseUrl: () => string

  constructor(options: PageNodeFactoryOptions = {}) {
    const apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? '/api')
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
    this.project = new ProjectModel<ConfigPageNode>({
      projectId: '__page-node-factory__',
      fileApi: this.fileApi,
      fileCache: this.fileCache,
      contentLoaderFactory: () => this.loader,
    })
  }

  create(pageId: string): ConfigPageNode {
    const normalized = pageId.trim()
    if (!normalized) {
      throw new Error('pageId 不能为空')
    }
    return this.project.openConfigPage(normalized)
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

function resolveUrlOption(apiBaseUrl: string, option: string | (() => string) | undefined, fallbackSuffix: string): string {
  const raw = option === undefined
    ? `${apiBaseUrl}${fallbackSuffix}`
    : (typeof option === 'function' ? option() : option)
  return trimTrailingSlash(raw)
}

function resolvePagesConfigBaseUrl(apiBaseUrl: string, option: string | (() => string) | undefined): string {
  return resolveUrlOption(apiBaseUrl, option, '/pages-config')
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
