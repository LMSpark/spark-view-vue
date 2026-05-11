/**
 * 配置加载器 - 统一页面配置加载
 *
 * 职责：**从哪里加载**（本地/远程 + 缓存策略）。
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
 * - 远程 API 也走 timestamp/notModified + 本地缓存
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
  PageCssConfig
} from '../types'
import {
  Logger,
  createFileLoader,
  createRequest
} from '@spark-view/spark-utils'
import type { FileLoader, DerivedLoader, HttpClient, FileLoaderEventMap } from '@spark-view/spark-utils'

// 编译函数从 compiler 模块导入（职责分离：loader 管加载，compiler 管解析）
import { compileRule, parsePageData, parseScript, parseCss } from '../compiler'

// re-export 编译函数，允许消费方从 './loader' 直接导入
export { compileRule, normalizeRuleNode, parsePageData, parseScript, parseCss } from '../compiler'

const pageLogger = Logger('PageConfig')

const REQUEST_TIMEOUT = 10_000
const MISSING_REMOTE_RULE_NODE_TYPE = 'section'

// ─────────────────────────────────────────────────────────────────────────────

/** 必填字段默认值（getHeaders 可选，不在此列） */
const DEFAULT_OPTIONS = {
  source: 'remote' as const,
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
  private readonly recentMissingFiles = new Set<string>()

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
      fallbackToCache: false,
      timeout: this.opts.timeout,
      // 动态请求头（认证 / 租户上下文）
      ...(this.opts.getHeaders && { getHeaders: this.opts.getHeaders }),
      // 分级过期策略配置（可选，使用默认值）
      defaultExpirationLevel: 3,  // 默认15天
      maxCacheSize: 50             // 最多缓存 50 个页面配置
    })

    // 订阅 FileLoader 事件：将文件缺失转为可消费状态，避免上层只能依赖字符串兜底。
    this.fileLoader.on('file-missing', (evt: FileLoaderEventMap['file-missing']) => {
      this.recentMissingFiles.add(evt.fileName)
      pageLogger.debug('捕获文件缺失事件', { fileName: evt.fileName, status: evt.status })
    })
    this.fileLoader.on('file-loaded', (evt: FileLoaderEventMap['file-loaded']) => {
      this.recentMissingFiles.delete(evt.fileName)
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
    const path = this.toPageFilePath(pageId, 'rule.json')
    const result = await this.loadRequiredPageFile(pageId, 'rule.json', this.ruleLoader)
    if (this.isRemoteFileNotFound(result, path)) {
      return this.remoteMissingRuleResult(pageId, 'rule.json')
    }
    return result
  }

  async loadPageData(pageId: string): Promise<ConfigLoadResult<PageDataConfig>> {
    pageLogger.info('加载页面数据', { pageId, source: this.opts.source })
    return this.loadRequiredPageFile(pageId, 'pagedata.json', this.dataLoader)
  }

  async loadCss(pageId: string): Promise<ConfigLoadResult<PageCssConfig>> {
    pageLogger.debug('加载页面样式', { pageId, source: this.opts.source })
    return this.loadRequiredPageFile(pageId, 'style.css', this.cssLoader)
  }

  async loadScript(pageId: string): Promise<ConfigLoadResult<PageScriptConfig>> {
    pageLogger.debug('加载页面脚本', { pageId, source: this.opts.source })
    return this.loadRequiredPageFile(pageId, 'script.js', this.scriptLoader)
  }

  async loadPageConfig(pageId: string): Promise<ConfigLoadResult<PageConfig>> {
    pageLogger.info('加载完整页面配置', { pageId })

    // rule 先加载：缺失时直接生成可渲染占位；其他错误 fail-fast。
    const ruleResult = await this.loadRule(pageId)
    if (!ruleResult.success) return this.failFrom(ruleResult.error, ruleResult.reason)

    const dataPath = this.toPageFilePath(pageId, 'pagedata.json')
    const dataResult = await this.loadPageData(pageId)
    const dataMissing = this.isRemoteFileNotFound(dataResult, dataPath)
    if (!dataResult.success && !dataMissing) return this.failFrom(dataResult.error, dataResult.reason)

    // 附加资源并行校验：远程缺失继续渲染可见占位，其他错误 fail-fast。
    const [scriptResult, cssResult] = await Promise.all([
      this.loadRequiredPageFile(pageId, 'script.js', this.scriptLoader),
      this.loadRequiredPageFile(pageId, 'style.css', this.cssLoader),
    ])

    const scriptPath = this.toPageFilePath(pageId, 'script.js')
    const cssPath = this.toPageFilePath(pageId, 'style.css')
    const scriptMissing = this.isRemoteFileNotFound(scriptResult, scriptPath)
    const cssMissing = this.isRemoteFileNotFound(cssResult, cssPath)
    if (!scriptResult.success && !scriptMissing) return this.failFrom(scriptResult.error, scriptResult.reason)
    if (!cssResult.success && !cssMissing) return this.failFrom(cssResult.error, cssResult.reason)

    pageLogger.debug('页面附加资源加载完成', {
      pageId,
      hasScript: Boolean(scriptResult.data),
      scriptSize: scriptResult.data?.length ?? 0,
      hasCss: Boolean(cssResult.data),
      cssSize: cssResult.data?.length ?? 0,
    })

    const rules = [
      ...(ruleResult.data ?? []),
      ...(dataMissing ? this.createMissingRemoteFileRule(pageId, 'pagedata.json') : []),
      ...(scriptMissing ? this.createMissingRemoteFileRule(pageId, 'script.js') : []),
      ...(cssMissing ? this.createMissingRemoteFileRule(pageId, 'style.css') : []),
    ]

    return {
      success: true,
      data: {
        pageId,
        rule: rules,
        data: dataMissing ? this.createEmptyPageData() : (dataResult.data as PageDataConfig),
        script: scriptMissing ? '' : scriptResult.data,
        css: cssMissing ? '' : cssResult.data
      },
      ...(ruleResult.source !== undefined && { source: ruleResult.source }),
      timestamp: Date.now()
    }
  }

  async loadPageFileContent(
    pageId: string,
    filename: PageConfigFileName,
    options?: PageConfigFileLoadOptions,
  ): Promise<ConfigLoadResult<string>> {
    const path = this.toPageFilePath(pageId, filename)
    const result = await this.fileLoader.load<string>(path, {
      parseJSON: false,
      forceRefresh: options?.forceReload === true,
    })
    if (filename === 'rule.json' && this.isRemoteFileNotFound(result, path)) {
      return {
        success: true,
        data: this.createMissingRemoteRuleText(pageId, filename),
        source: this.opts.source,
        timestamp: Date.now(),
      }
    }
    return this.pageFileContentResultFromData(result, path)
  }

  clearCache(key?: string): void {
    this.fileLoader.clearCache(key)
    if (!key) this.recentMissingFiles.clear()
  }

  getCacheStats(): { size: number; keys: string[] } {
    return this.fileLoader.getCacheStats()
  }

  getHttpClient(): HttpClient {
    return this.request
  }

  /** 从失败的 ConfigLoadResult 构建错误响应（DRY）*/
  private failFrom(error: string | undefined, reason?: string): ConfigLoadResult<never> {
    return { success: false, ...(error !== undefined && { error }), ...(reason !== undefined && { reason }), timestamp: Date.now() }
  }

  // ── 私有辅助 ──────────────────────────────────────────────────────

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

  /**
   * FileLoader 加载结果转换为 ConfigLoadResult。
   * 只转换文件 API 的结果，不触发其他来源补读。
   */
  private fileResultFromData<T>(
    r: { success: boolean; error?: string; fromCache?: boolean; data?: T; reason?: string },
    path: string
  ): ConfigLoadResult<T> {
    if (!r.success) {
      const rawError = r.error ?? ''
      const fromEvent = this.recentMissingFiles.has(path)
      const isNotFound = r.reason === 'not-found' || fromEvent || /404|not\s*found/i.test(rawError)
      if (isNotFound) {
        if (this.opts.source === 'remote') {
          pageLogger.debug('远程页面配置文件不存在', { path })
        } else {
          pageLogger.warn('页面配置文件不存在', { source: this.opts.source, path })
        }
      } else {
        pageLogger.error('页面配置加载失败', { source: this.opts.source, path, error: r.error })
      }
      return {
        success: false,
        error: `${this.pagesConfigBase}${path}: ${r.error ?? ''}`,
        ...(isNotFound ? { reason: 'not-found' as const } : (r.reason !== undefined ? { reason: r.reason } : {})),
        timestamp: Date.now()
      }
    }
    pageLogger.debug('页面配置加载成功', { path, source: this.opts.source, fromCache: r.fromCache })
    return { success: true, ...(r.data !== undefined && { data: r.data }), source: this.opts.source, timestamp: Date.now() }
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

  private isRemoteFileNotFound(
    result: { success: boolean; error?: string; reason?: string },
    path: string,
  ): boolean {
    if (this.opts.source !== 'remote' || result.success) return false
    const rawError = result.error ?? ''
    return result.reason === 'not-found'
      || this.recentMissingFiles.has(path)
      || /404|not\s*found/i.test(rawError)
  }

  private createMissingRemoteFileRule(pageId: string, filename: PageConfigFileName): RuleConfig[] {
    const target = `${pageId}/${filename}`
    return [{
      type: MISSING_REMOTE_RULE_NODE_TYPE,
      id: `missing-${filename.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
      props: {
        class: 'spark-page-config-missing-file',
        style: {
          padding: '24px',
          border: '1px solid #f56c6c',
          borderRadius: '6px',
          color: '#9f1239',
          background: '#fff1f2',
        },
      },
      children: [
        {
          type: 'h3',
          id: `missing-${filename.replace(/[^a-zA-Z0-9_-]/g, '-')}-title`,
          children: ['远程页面配置文件不存在'],
        },
        {
          type: 'p',
          id: `missing-${filename.replace(/[^a-zA-Z0-9_-]/g, '-')}-path`,
          children: [`${target} 不存在。`],
        },
        {
          type: 'p',
          id: `missing-${filename.replace(/[^a-zA-Z0-9_-]/g, '-')}-policy`,
          children: ['请在页面配置服务中创建该文件后重新加载。'],
        },
      ],
    }]
  }

  private createMissingRemoteRuleText(pageId: string, filename: PageConfigFileName): string {
    return `${JSON.stringify(this.createMissingRemoteFileRule(pageId, filename), null, 2)}\n`
  }

  private remoteMissingRuleResult(pageId: string, filename: PageConfigFileName): ConfigLoadResult<RuleConfig[]> {
    pageLogger.debug('远程页面配置文件不存在，生成可渲染占位 SparkNode', { pageId, filename })
    return {
      success: true,
      data: this.createMissingRemoteFileRule(pageId, filename),
      source: this.opts.source,
      timestamp: Date.now(),
    }
  }

  private createEmptyPageData(): PageDataConfig {
    return parsePageData('{"dataSetName":"MissingRemotePageData","tables":{}}')
  }

  private pageFileContentResultFromData(
    result: { success: boolean; data?: string; error?: string; reason?: string },
    path: string,
  ): ConfigLoadResult<string> {
    if (result.success) {
      return { success: true, data: result.data ?? '', source: this.opts.source, timestamp: Date.now() }
    }

    return {
      success: false,
      error: result.error ?? `${path} 加载失败`,
      ...(result.reason !== undefined && { reason: result.reason }),
      timestamp: Date.now(),
    }
  }

  private toPageFilePath(pageId: string, filename: string): string {
    if (this.opts.source === 'local') {
      return `/${pageId}/${filename}`
    }
    return `/${encodeURIComponent(pageId)}/${encodeURIComponent(filename)}`
  }

}

export function createConfigLoader(options?: Partial<ConfigLoaderOptions>): ConfigLoader {
  return new PageConfigLoader(options)
}
