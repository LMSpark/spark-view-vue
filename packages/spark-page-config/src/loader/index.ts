/**
 * 配置加载器 - 支持本地/远程配置加载
 */

import type {
  ConfigLoader,
  ConfigLoaderOptions,
  ConfigLoadResult,
  RouteConfig,
  PageConfig,
  RuleConfig,
  PageDataConfig,
  PageScriptConfig,
  ConfigCacheItem
} from '../types'
import { Logger, SharedErrorCodes, getSharedErrorMessage } from '@spark-view/spark-utils'

// 本地 Logger（消除对 spark-app 的反向依赖）
const pageLogger = Logger('PageConfig')

// 本地常量（消除对 spark-app DefaultConfig 的反向依赖）
const CONFIG_CACHE_EXPIRY = 300_000  // 5 分钟
const REQUEST_TIMEOUT = 10_000       // 10 秒

// 使用共享错误码（消除重复定义）
const ErrorCodes = SharedErrorCodes
const getErrorMessage = getSharedErrorMessage

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: Required<ConfigLoaderOptions> = {
  source: 'hybrid',
  apiBaseUrl: '/api',
  localPrefix: '/pages-config',
  enableCache: true,
  cacheExpiry: CONFIG_CACHE_EXPIRY,
  enableValidation: false,
  timeout: REQUEST_TIMEOUT,
  fetchAdapter: globalThis.fetch?.bind(globalThis)
}

/**
 * 配置加载器实现
 */
export class PageConfigLoader implements ConfigLoader {
  private options: Required<ConfigLoaderOptions>
  private cache: Map<string, ConfigCacheItem> = new Map()
  private _fetch: typeof fetch

  constructor(options: Partial<ConfigLoaderOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this._fetch = this.options.fetchAdapter ?? globalThis.fetch?.bind(globalThis)
  }

  /**
   * 加载路由配置
   */
  async loadRoutes(): Promise<ConfigLoadResult<RouteConfig[]>> {
    return this.load<RouteConfig[]>(
      'routes',
      () => this.fetchRoutes()
    )
  }

  /**
   * 加载页面配置（rule + data + script）
   */
  async loadPageConfig(pageId: string): Promise<ConfigLoadResult<PageConfig>> {
    return this.load<PageConfig>(
      `page:${pageId}`,
      async () => {
        const [rule, data, script] = await Promise.all([
          this.fetchRule(pageId),
          this.fetchPageData(pageId),
          this.fetchScript(pageId).catch(() => undefined) // script 可选
        ])

        return {
          pageId,
          rule,
          data,
          script
        }
      }
    )
  }

  /**
   * 加载页面规则
   */
  async loadRule(pageId: string): Promise<ConfigLoadResult<RuleConfig[]>> {
    return this.load<RuleConfig[]>(
      `rule:${pageId}`,
      () => this.fetchRule(pageId)
    )
  }

  /**
   * 加载页面数据
   */
  async loadPageData(pageId: string): Promise<ConfigLoadResult<PageDataConfig>> {
    return this.load<PageDataConfig>(
      `data:${pageId}`,
      () => this.fetchPageData(pageId)
    )
  }

  /**
   * 加载页面脚本
   */
  async loadScript(pageId: string): Promise<ConfigLoadResult<PageScriptConfig>> {
    return this.load<PageScriptConfig>(
      `script:${pageId}`,
      () => this.fetchScript(pageId)
    )
  }

  /**
   * 清除缓存
   */
  clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key)
    } else {
      this.cache.clear()
    }
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }

  /**
   * 通用加载逻辑（带缓存）
   */
  private async load<T>(
    cacheKey: string,
    fetcher: () => Promise<T>
  ): Promise<ConfigLoadResult<T>> {
    try {
      // 检查缓存
      if (this.options.enableCache) {
        const cached = this.getFromCache<T>(cacheKey)
        if (cached) {
          pageLogger.debug('从缓存加载配置', { cacheKey }) // 使用 L1 Logger
          return {
            success: true,
            data: cached,
            source: 'cache',
            timestamp: Date.now()
          }
        }
      }

      // 加载数据
      pageLogger.info('加载配置', { cacheKey, source: this.options.source }) // 使用 L1 Logger
      const data = await fetcher()

      // 更新缓存
      if (this.options.enableCache) {
        this.setCache(cacheKey, data)
        pageLogger.debug('配置已缓存', { cacheKey }) // 使用 L1 Logger
      }

      pageLogger.info('配置加载成功', { cacheKey })
      return {
        success: true,
        data,
        source: this.options.source === 'local' ? 'local' : 'remote',
        timestamp: Date.now()
      }
    } catch (error) {
      pageLogger.error('配置加载失败', { cacheKey, error }) // 使用 L1 Logger
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      }
    }
  }

  /**
   * 获取缓存数据
   */
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key)
    if (!cached) return null

    const now = Date.now()
    if (now - cached.timestamp > this.options.cacheExpiry) {
      this.cache.delete(key)
      return null
    }

    return cached.data as T
  }

  /**
   * 设置缓存
   */
  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
  }

  /**
   * 加载路由配置
   */
  private async fetchRoutes(): Promise<RouteConfig[]> {
    if (this.options.source === 'remote') {
      return this.fetchFromRemote<RouteConfig[]>('/routes')
    }
    if (this.options.source === 'local') {
      return this.fetchFromLocal<RouteConfig[]>('/routes.json')
    }
    // hybrid: 优先远程，失败降级到本地
    try {
      pageLogger.debug('尝试从远程加载路由') // 使用 L1 Logger
      return await this.fetchFromRemote<RouteConfig[]>('/routes')
    } catch {
      pageLogger.debug('远程不可用，使用本地配置') // 使用 L1 Logger
      return this.fetchFromLocal<RouteConfig[]>('/routes.json')
    }
  }

  /**
   * 加载页面规则
   */
  private async fetchRule(pageId: string): Promise<RuleConfig[]> {
    if (this.options.source === 'remote') {
      return this.fetchFromRemote<RuleConfig[]>(`/page/${pageId}/rule`)
    }
    if (this.options.source === 'local') {
      return this.fetchFromLocal<RuleConfig[]>(`/${pageId}/rule.json`)
    }
    // hybrid: 优先远程，失败降级到本地
    try {
      pageLogger.debug('尝试从远程加载规则', { pageId })
      return await this.fetchFromRemote<RuleConfig[]>(`/page/${pageId}/rule`)
    } catch {
      pageLogger.debug('远程不可用，使用本地配置', { pageId })
      return this.fetchFromLocal<RuleConfig[]>(`/${pageId}/rule.json`)
    }
  }

  /**
   * 加载页面数据
   */
  private async fetchPageData(pageId: string): Promise<PageDataConfig> {
    if (this.options.source === 'remote') {
      return this.fetchFromRemote<PageDataConfig>(`/page/${pageId}/data`)
    }
    if (this.options.source === 'local') {
      return this.fetchFromLocal<PageDataConfig>(`/${pageId}/pagedata.json`)
    }
    // hybrid: 优先远程，失败降级到本地
    try {
      pageLogger.debug('尝试从远程加载页面数据', { pageId })
      return await this.fetchFromRemote<PageDataConfig>(`/page/${pageId}/data`)
    } catch {
      pageLogger.debug('远程不可用，使用本地配置', { pageId })
      return this.fetchFromLocal<PageDataConfig>(`/${pageId}/pagedata.json`)
    }
  }

  /**
   * 加载页面脚本
   */
  private async fetchScript(pageId: string): Promise<PageScriptConfig> {
    pageLogger.debug('加载页面脚本', { pageId, source: this.options.source })
    
    if (this.options.source === 'remote') {
      return this.fetchScriptFromRemote(pageId)
    }
    return this.fetchScriptFromLocal(pageId)
  }

  /**
   * 从远程加载 JSON 配置
   */
  private async fetchFromRemote<T>(path: string): Promise<T> {
    const url = `${this.options.apiBaseUrl}${path}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout)

    try {
      pageLogger.debug('发送远程请求', { url })
      
      const response = await this._fetch(url, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json'
        }
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorMsg = getErrorMessage(ErrorCodes.NETWORK_REQUEST_FAILED)
        pageLogger.error('远程请求失败', { url, status: response.status, statusText: response.statusText })
        throw new Error(`${errorMsg}: HTTP ${response.status}`)
      }

      const result = await response.json() as Record<string, unknown>
      
      // 支持标准 API 响应格式: { code, data, message }
      if (result['code'] !== undefined) {
        if (result['code'] === 200 || result['code'] === 0) {
          pageLogger.debug('远程加载成功', { url })
          return result['data'] as T
        }
        pageLogger.error('API返回错误', { url, code: result['code'], message: result['message'] })
        throw new Error((result['message'] as string) ?? getErrorMessage(ErrorCodes.NETWORK_REQUEST_FAILED))
      }

      pageLogger.debug('远程加载成功', { url })
      return result as T
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        const errorMsg = getErrorMessage(ErrorCodes.NETWORK_TIMEOUT)
        pageLogger.error('请求超时', { url, timeout: this.options.timeout })
        throw new Error(`${errorMsg}: ${url}`)
      }
      throw error
    }
  }

  /**
   * 从本地加载 JSON 配置
   */
  private async fetchFromLocal<T>(path: string): Promise<T> {
    const url = `${this.options.localPrefix}${path}`
    
    try {
      pageLogger.debug('加载本地配置', { url })
      
      const response = await this._fetch(url)

      if (!response.ok) {
        const errorMsg = getErrorMessage(ErrorCodes.CONFIG_LOAD_FAILED)
        pageLogger.error('本地配置加载失败', { url, status: response.status })
        throw new Error(`${errorMsg}: ${url}`)
      }

      const result = await response.json() as T
      pageLogger.debug('本地配置加载成功', { url })
      return result
    } catch (error) {
      pageLogger.error('本地配置加载异常', { url, error })
      throw error
    }
  }

  /**
   * 从远程加载脚本
   */
  private async fetchScriptFromRemote(pageId: string): Promise<PageScriptConfig> {
    const url = `${this.options.apiBaseUrl}/page/${pageId}/script`
    
    try {
      pageLogger.debug('加载远程脚本', { pageId, url })
      
      const response = await this._fetch(url)

      if (!response.ok) {
        const errorMsg = getErrorMessage(ErrorCodes.CONFIG_LOAD_FAILED)
        pageLogger.error('远程脚本加载失败', { pageId, url, status: response.status })
        throw new Error(`${errorMsg}: ${url}`)
      }

      const scriptText = await response.text()
      
      pageLogger.debug('远程脚本加载成功', { pageId, size: scriptText.length })
      return scriptText
    } catch (error) {
      pageLogger.error('远程脚本加载异常', { pageId, url, error })
      throw error
    }
  }

  /**
   * 从本地加载脚本
   */
  private async fetchScriptFromLocal(pageId: string): Promise<PageScriptConfig> {
    const url = `${this.options.localPrefix}/${pageId}/script.js?t=${Date.now()}`
    
    try {
      pageLogger.debug('加载本地脚本', { pageId, url })
      
      // 使用 fetch 获取文本内容（不使用 import，因为脚本不是 ES6 模块）
      const response = await this._fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      const scriptText = await response.text()
      pageLogger.debug('本地脚本加载成功', { pageId, size: scriptText.length })
      return scriptText
    } catch {
      // 脚本文件可选，不存在不是错误
      pageLogger.debug('页面无脚本文件，跳过', { pageId })
      return '' // 返回空字符串
    }
  }
}

/**
 * 创建配置加载器
 */
export function createConfigLoader(options?: Partial<ConfigLoaderOptions>): ConfigLoader {
  return new PageConfigLoader(options)
}
