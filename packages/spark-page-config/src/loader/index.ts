/**
 * 配置加载器 - 支持本地/远程/混合配置加载
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
  RouteConfig,
  PageConfig,
  RuleConfig,
  PageDataConfig,
  PageScriptConfig
} from '../types'
import {
  Logger,
  SharedErrorCodes,
  getSharedErrorMessage,
  createFileLoader
} from '@spark-view/spark-utils'
import type { FileLoader, FileLoadResult } from '@spark-view/spark-utils'

const pageLogger = Logger('PageConfig')

const REQUEST_TIMEOUT = 10_000
const PAGES_CONFIG_FILE_BASE = '/api/pages-config'

const ErrorCodes = SharedErrorCodes
const getErrorMessage = getSharedErrorMessage

const DEFAULT_OPTIONS: Required<ConfigLoaderOptions> = {
  source: 'hybrid',
  apiBaseUrl: '/api',
  fileStorage: 'localStorage',
  enableValidation: false,
  timeout: REQUEST_TIMEOUT
}

export class PageConfigLoader implements ConfigLoader {
  private opts: Required<ConfigLoaderOptions>
  private fileLoader: FileLoader

  constructor(options: Partial<ConfigLoaderOptions> = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options }
    this.fileLoader = createFileLoader({
      baseUrl: PAGES_CONFIG_FILE_BASE,
      storage: this.opts.fileStorage ?? 'localStorage',
      cachePrefix: 'spark_page_',
      fallbackToCache: true,
      timeout: this.opts.timeout
    })
  }

  // ── 公开 API ──────────────────────────────────────────────────────

  async loadRoutes(): Promise<ConfigLoadResult<RouteConfig[]>> {
    pageLogger.info('加载路由配置', { source: this.opts.source })
    return this.hybridLoad<RouteConfig[]>('/routes.json', '/routes')
  }

  async loadRule(pageId: string): Promise<ConfigLoadResult<RuleConfig[]>> {
    pageLogger.info('加载页面规则', { pageId, source: this.opts.source })
    return this.hybridLoad<RuleConfig[]>(`/${pageId}/rule.json`, `/page/${pageId}/rule`)
  }

  async loadPageData(pageId: string): Promise<ConfigLoadResult<PageDataConfig>> {
    pageLogger.info('加载页面数据', { pageId, source: this.opts.source })
    return this.hybridLoad<PageDataConfig>(
      `/${pageId}/pagedata.json`,
      `/page/${pageId}/data`
    )
  }

  async loadScript(pageId: string): Promise<ConfigLoadResult<PageScriptConfig>> {
    pageLogger.debug('加载页面脚本', { pageId, source: this.opts.source })

    if (this.opts.source === 'remote') {
      const script = await this.remoteScript(pageId)
      return { success: true, data: script, source: 'remote', timestamp: Date.now() }
    }

    if (this.opts.source === 'local') {
      return this.localScriptResult(pageId)
    }

    // hybrid: 先尝试远程，失败降级本地
    try {
      const script = await this.remoteScript(pageId)
      return { success: true, data: script, source: 'remote', timestamp: Date.now() }
    } catch {
      pageLogger.debug('远程脚本不可用，降级到本地', { pageId })
      return this.localScriptResult(pageId)
    }
  }

  async loadPageConfig(pageId: string): Promise<ConfigLoadResult<PageConfig>> {
    pageLogger.info('加载完整页面配置', { pageId })

    const [ruleResult, dataResult, scriptResult] = await Promise.all([
      this.loadRule(pageId),
      this.loadPageData(pageId),
      this.loadScript(pageId)
    ])

    if (!ruleResult.success) {
      return { success: false, ...(ruleResult.error !== undefined && { error: ruleResult.error }), timestamp: Date.now() }
    }
    if (!dataResult.success) {
      return { success: false, ...(dataResult.error !== undefined && { error: dataResult.error }), timestamp: Date.now() }
    }

    return {
      success: true,
      data: {
        pageId,
        rule: ruleResult.data ?? [],
        data: dataResult.data ?? {},
        script: scriptResult.data
      },
      ...(ruleResult.source !== undefined && { source: ruleResult.source }),
      timestamp: Date.now()
    }
  }

  clearCache(key?: string): void {
    this.fileLoader.clearCache(key)
  }

  getCacheStats(): { size: number; keys: string[] } {
    return { size: 0, keys: [] }
  }

  // ── 私有辅助 ──────────────────────────────────────────────────────

  /**
   * 统一 local / remote / hybrid 分支。
   * @param localPath  FileLoader 相对路径（如 `/pageId/rule.json`）
   * @param remotePath API 相对路径  （如 `/page/pageId/rule`）
   */
  private async hybridLoad<T>(
    localPath: string,
    remotePath: string
  ): Promise<ConfigLoadResult<T>> {
    const { source } = this.opts

    if (source === 'local') {
      return this.localResult<T>(localPath)
    }

    if (source === 'remote') {
      return this.remoteResult<T>(remotePath)
    }

    // hybrid: 先 remote，失败降级 local
    try {
      pageLogger.debug('hybrid: 尝试远程', { remotePath })
      return await this.remoteResult<T>(remotePath)
    } catch {
      pageLogger.debug('hybrid: 远程失败，降级本地', { localPath })
      return this.localResult<T>(localPath)
    }
  }

  /** FileLoader 加载 → ConfigLoadResult */
  private async localResult<T>(path: string): Promise<ConfigLoadResult<T>> {
    const r = await this.fileLoader.load<T>(path)
    if (!r.success) {
      pageLogger.error('本地配置加载失败', { path, error: r.error })
      return {
        success: false,
        error: `${PAGES_CONFIG_FILE_BASE}${path}: ${r.error ?? ''}`,
        timestamp: Date.now()
      }
    }
    pageLogger.debug('本地配置加载成功', { path, fromCache: r.fromCache })
    return { success: true, ...(r.data !== undefined && { data: r.data }), source: 'local', timestamp: Date.now() }
  }

  /** 远程 JSON fetch → ConfigLoadResult（失败时抛出，由 hybridLoad 捕获） */
  private async remoteResult<T>(path: string): Promise<ConfigLoadResult<T>> {
    const data = await this.fetchFromRemote<T>(path)
    return { success: true, data, source: 'remote', timestamp: Date.now() }
  }

  /** 从本地加载脚本（可选文件，失败返回 success:true, data:''） */
  private async localScriptResult(pageId: string): Promise<ConfigLoadResult<PageScriptConfig>> {
    const r: FileLoadResult<string> = await this.fileLoader.load<string>(
      `/${pageId}/script.js`,
      { parseJSON: false }
    )
    if (!r.success) {
      pageLogger.debug('页面无脚本文件，跳过', { pageId })
      return { success: true, data: '', source: 'local', timestamp: Date.now() }
    }
    pageLogger.debug('本地脚本加载成功', { pageId, size: r.data?.length ?? 0 })
    return { success: true, data: r.data ?? '', source: 'local', timestamp: Date.now() }
  }

  /** 从远程加载脚本文本（失败时抛出） */
  private async remoteScript(pageId: string): Promise<PageScriptConfig> {
    const url = `${this.opts.apiBaseUrl}/page/${pageId}/script`
    pageLogger.debug('加载远程脚本', { pageId, url })

    const response = await globalThis.fetch(url)
    if (!response.ok) {
      const msg = getErrorMessage(ErrorCodes.CONFIG_LOAD_FAILED)
      pageLogger.error('远程脚本加载失败', { pageId, status: response.status })
      throw new Error(`${msg}: ${url}`)
    }

    const text = await response.text()
    pageLogger.debug('远程脚本加载成功', { pageId, size: text.length })
    return text
  }

  /**
   * 从远程 API 加载 JSON 配置。
   * 支持标准封装格式 `{ code, data, message }` 和裸对象两种响应。
   * 失败时抛出，由调用方（hybridLoad / remoteResult）处理或透传。
   */
  private async fetchFromRemote<T>(path: string): Promise<T> {
    const url = `${this.opts.apiBaseUrl}${path}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.opts.timeout)

    try {
      pageLogger.debug('发送远程请求', { url })

      const response = await globalThis.fetch(url, {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const msg = getErrorMessage(ErrorCodes.NETWORK_REQUEST_FAILED)
        pageLogger.error('远程请求失败', { url, status: response.status })
        throw new Error(`${msg}: HTTP ${response.status}`)
      }

      const result = (await response.json()) as Record<string, unknown>

      // 标准 API 封装格式 { code, data, message }
      if (result['code'] !== undefined) {
        if (result['code'] === 200 || result['code'] === 0) {
          pageLogger.debug('远程加载成功', { url })
          return result['data'] as T
        }
        const msg = (result['message'] as string) ?? getErrorMessage(ErrorCodes.NETWORK_REQUEST_FAILED)
        pageLogger.error('API 返回错误', { url, code: result['code'], message: msg })
        throw new Error(msg)
      }

      pageLogger.debug('远程加载成功', { url })
      return result as T
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        const msg = getErrorMessage(ErrorCodes.NETWORK_TIMEOUT)
        pageLogger.error('请求超时', { url, timeout: this.opts.timeout })
        throw new Error(`${msg}: ${url}`)
      }
      throw err
    }
  }
}

export function createConfigLoader(options?: Partial<ConfigLoaderOptions>): ConfigLoader {
  return new PageConfigLoader(options)
}
