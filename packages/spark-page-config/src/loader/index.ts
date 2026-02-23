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
  PageScriptConfig,
  PageCssConfig
} from '../types'
import {
  Logger,
  SharedErrorCodes,
  getSharedErrorMessage,
  createFileLoader
} from '@spark-view/spark-utils'
import type { FileLoader, DerivedLoader } from '@spark-view/spark-utils'
import { DataSet } from '@spark-view/spark-data'

const pageLogger = Logger('PageConfig')

const REQUEST_TIMEOUT = 10_000
const PAGES_CONFIG_FILE_BASE = '/api/pages-config'

const ErrorCodes = SharedErrorCodes
const getErrorMessage = getSharedErrorMessage

// ── 编译函数（模块级，named 函数名即默认 transformKey）──────────────────────

/**
 * rule.json 原始字符串 → 规范化 RuleConfig[]
 *
 * 规范化内容：
 * - 顶层确保是 Array（单对象自动包装）
 * - 每条规则：type 强制 string；props 缺省 {}；children null→undefined，递归规范化
 * - 后续可在此加：类型别名展开、dataKey 格式校验、props 默认值注入
 */
export function compileRule(raw: string): RuleConfig[] {
  const parsed: unknown = JSON.parse(raw)
  const arr = Array.isArray(parsed) ? parsed : [parsed]
  return arr.map(normalizeRuleNode)
}

export function normalizeRuleNode(node: unknown): RuleConfig {
  if (typeof node === 'string') return { type: node }
  if (!node || typeof node !== 'object') return { type: String(node) }
  // 先把 children 从展开中排除，避免 null 被带入结果
  const { children: rawChildren, ...rest } = node as Record<string, unknown>
  const children =
    rawChildren === null || rawChildren === undefined
      ? undefined
      : (rawChildren as unknown[]).map((c) =>
          typeof c === 'string' ? c : normalizeRuleNode(c)
        )
  return {
    ...rest,
    type: String(rest['type'] ?? 'div'),
    props: (rest['props'] as Record<string, unknown> | undefined) ?? {},
    ...(children !== undefined && { children })
  } as RuleConfig
}

/**
 * pagedata.json 原始字符串 → DataSet 实例
 *
 * 调用 DataSet.fromJSON() 构建完整实例：分配对象、建各表的 DataTable/DataView，
 * 建立 DataSet → DataTable → DataView 引用链。
 * 实例缓存在内存派生缓存中，timestamp 不变时直接复用，
 * 同一页面多次访问跳过重建，冷启动仍需跑一次（但无网络请求）。
 */
export function parsePageData(raw: string): PageDataConfig {
  // pagedata.json can be one of two shapes:
  // 1. A full DataSet metadata string (the format used by tests and
  //    by some server-side generators).  In this case we want to use
  //    the fast path `DataSet.fromJSON` which simply parses and feeds
  //    the object to the constructor.
  // 2. An arbitrary key/value map produced by page authors.  We
  //    normalise this into a DataSet using `DataSet.fromPageData`,
  //    which knows how to convert arrays/objects/primitive values
  //    into one-table-per-key.  The function also handles the
  //    legacy nested `dataset` field.
  //
  // Previously we blindly delegated to `fromJSON`, which meant that
  //  any pagedata not conforming to the metadata shape (e.g. the demo
  //  pages that include `currentUser`/`responseData`) would produce
  //  an object without a `tables` property.  The DataSet constructor
  //  then attempted `Object.entries(config.tables)` and exploded with
  //  “Cannot convert undefined or null to object” during runtime.
  
  const parsed: unknown = JSON.parse(raw)
  if (parsed === null || parsed === undefined) {
    return DataSet.fromConfig({ dataSetName: 'PageDataSet', tables: {} })
  }
  if (typeof parsed !== 'object') {
    return DataSet.fromPageData({ value: parsed })
  }
  const obj = parsed as Record<string, unknown>
  // metadata shape has top‑level `tables` key; keep the existing
  // fast path for it so we preserve the name that may be carried by
  // the JSON string itself.
  if ('tables' in obj) {
    // reuse the existing utility which already handles
    // string→object→DataSet conversion and avoids a second parse.
    return DataSet.fromJSON(raw)
  }
  // otherwise treat it as generic page data
  return DataSet.fromPageData(obj)
}

/**
 * script.js 原始字符串 → PageScriptConfig（脚本文本）
 *
 * 当前：透传（占位）。
 * 后续可加：语法检查、沙箱包装、依赖提取、压缩。
 */
export function parseScript(raw: string): PageScriptConfig {
  return raw
}

/**
 * style.css 原始字符串 → PageCssConfig（样式文本）
 *
 * 当前：透传（占位）。
 * 后续可加：CSS 变量提取、作用域前缀注入、压缩。
 */
export function parseCss(raw: string): PageCssConfig {
  return raw
}

// ─────────────────────────────────────────────────────────────────────────────

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
    this.fileLoader = createFileLoader({
      baseUrl: PAGES_CONFIG_FILE_BASE,
      storage: this.opts.fileStorage ?? 'localStorage',
      cachePrefix: 'spark_page_',
      fallbackToCache: true,
      timeout: this.opts.timeout,
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

  async loadRoutes(): Promise<ConfigLoadResult<RouteConfig[]>> {
    pageLogger.info('加载路由配置', { source: this.opts.source })
    return this.hybridLoad<RouteConfig[]>('/routes.json', '/routes')
  }

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
    // remote 或 hybrid: 先尝试远程
    try {
      return await this.remoteResult<PageCssConfig>(`/page/${pageId}/css`)
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

    return {
      success: true,
      data: {
        pageId,
        rule: ruleResult.data ?? [],
        // dataResult.success 已验证，data 必定存在
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
    return { size: 0, keys: [] }
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
   * 通过 DerivedLoader 加载本地文件并转为 ConfigLoadResult。
   * timestamp 未变时直接命中编译缓存，跳过 transform 函数。
   */
  private async derivedResult<T>(
    loader: DerivedLoader<T>,
    path: string
  ): Promise<ConfigLoadResult<T>> {
    const r = await loader.load(path)
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

  /**
   * 从本地加载脚本（可选文件，失败返回 success:true, data:''）。
   * 使用 scriptLoader（withTransform(parseScript)）：
   *   - fileLoader 内部以 parseJSON:false 读取原始文本并缓存
   *   - parseScript 变换结果（当前透传）单独缓存，timestamp 未变直接返回
   */
  private async localScriptResult(pageId: string): Promise<ConfigLoadResult<PageScriptConfig>> {
    const r = await this.scriptLoader.load(`/${pageId}/script.js`)
    if (!r.success) {
      pageLogger.debug('页面无脚本文件，跳过', { pageId })
      return { success: true, data: '', source: 'local', timestamp: Date.now() }
    }
    pageLogger.debug('本地脚本加载成功', { pageId, size: r.data?.length ?? 0 })
    return { success: true, data: r.data ?? '', source: 'local', timestamp: Date.now() }
  }

  /**
   * 本地加载 CSS：文件可选，缺失时静默返回空字符串。
   * - style.css 存在 → 经 parseCss 变换后返回
   * - 文件缺失   → success:true, data:''（CSS 为可选资源）
   */
  private async localCssResult(pageId: string): Promise<ConfigLoadResult<PageCssConfig>> {
    const r = await this.cssLoader.load(`/${pageId}/style.css`)
    if (!r.success) {
      pageLogger.debug('页面无样式文件，跳过', { pageId })
      return { success: true, data: '', source: 'local', timestamp: Date.now() }
    }
    pageLogger.debug('本地样式加载成功', { pageId, size: r.data?.length ?? 0 })
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
