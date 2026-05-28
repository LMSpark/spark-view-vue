import { createRequest, type HttpClientBase, type RequestInterceptor } from '@spark-view/spark-utils'
import {
  PAGE_CONFIG_FILE_NAMES,
  PageConfigFileApi,
  createConfigLoader,
  type BasePageConfigLoader,
  type ConfigLoaderOptions,
} from '../config'
import { NavigationConfigClient } from '../navigation'
import { PageModel, type PageModelLike } from './page-model'

export type PageModelFileStorage = 'localStorage' | 'sessionStorage' | 'memory'

export type PageModelFactoryOptions = {
  apiBaseUrl?: string
  pagesConfigBaseUrl?: string | (() => string)
  navigationApiBaseUrl?: string | (() => string)
  timeout?: number
  getHeaders?: () => Record<string, string>
  fileStorage?: PageModelFileStorage
  httpClient?: HttpClientBase
}

export type PageModelFactoryLike = {
  create(pageId: string): PageModelLike
  clearCache(key?: string): void
  getCacheStats(): { size: number; keys: string[] }
  getHttpClient(): HttpClientBase | undefined
}

/**
 * PageModel 工厂。
 *
 * 消费端只通过 create(pageId) 获取页面模型；loader/file-api/nav-client 均封装在工厂内部。
 */
export class PageModelFactory implements PageModelFactoryLike {
  private readonly http: HttpClientBase
  private readonly loader: BasePageConfigLoader
  private readonly fileApi: PageConfigFileApi
  private readonly navClient: NavigationConfigClient
  private readonly getPagesConfigBaseUrl: () => string

  constructor(options: PageModelFactoryOptions = {}) {
    const apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl ?? '/api')
    this.http = options.httpClient ?? createRequest({
      baseURL: apiBaseUrl,
      ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    })
    installHeaderInterceptor(this.http, options.getHeaders)

    this.getPagesConfigBaseUrl = () => resolvePagesConfigBaseUrl(apiBaseUrl, options.pagesConfigBaseUrl)
    this.loader = createConfigLoader(toLoaderOptions(apiBaseUrl, this.http, options))
    this.fileApi = new PageConfigFileApi({
      getPageConfigApi: this.getPagesConfigBaseUrl,
      http: this.http,
    })
    this.navClient = new NavigationConfigClient({
      getNavigationApi: () => resolveNavigationApiBaseUrl(apiBaseUrl, options.navigationApiBaseUrl),
      http: this.http,
    })
  }

  create(pageId: string): PageModel {
    return new PageModel(pageId, this.fileApi, () => this.loader, this.navClient)
  }

  clearCache(key?: string): void {
    this.loader.clearCache(key)
  }

  clearPageCache(pageId: string): void {
    const normalized = pageId.trim()
    if (!normalized) return
    for (const file of PAGE_CONFIG_FILE_NAMES) {
      this.loader.clearCache(`/${normalized}/${file}`)
    }
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

export function createPageModelFactory(options: PageModelFactoryOptions = {}): PageModelFactory {
  return new PageModelFactory(options)
}

export function createPageModel(pageId: string, options: PageModelFactoryOptions = {}): PageModel {
  return createPageModelFactory(options).create(pageId)
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
  options: PageModelFactoryOptions,
): Partial<ConfigLoaderOptions> {
  const loaderOptions: Partial<ConfigLoaderOptions> = {
    apiBaseUrl,
    httpClient: http,
  }
  if (options.pagesConfigBaseUrl !== undefined) loaderOptions.pagesConfigBaseUrl = options.pagesConfigBaseUrl
  if (options.timeout !== undefined) loaderOptions.timeout = options.timeout
  if (options.getHeaders !== undefined) loaderOptions.getHeaders = options.getHeaders
  if (options.fileStorage !== undefined) loaderOptions.fileStorage = options.fileStorage
  return loaderOptions
}
