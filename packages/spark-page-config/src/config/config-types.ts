/**
 * 页面配置加载域公共类型。
 *
 * 该文件只描述页面四文件的加载契约，不掺入 Vue、路由或编辑器运行时。
 */

import type { DataSet } from '@spark-view/spark-data'
import type { HttpClientBase } from '@spark-view/spark-utils'
import type { SparkNode } from '@spark-view/spark-data'

export type { SparkNode as RuleConfig } from '@spark-view/spark-data'
export type { DataSet as PageDataConfig } from '@spark-view/spark-data'

/**
 * 页面四文件载荷（不含 pageId）。
 *
 * 只描述页面内容本身，不掺入路由、Vue、能力系统等运行时语义。
 */
export type PageConfigFiles = {
  rule: SparkNode[]
  data: DataSet
  script: string | undefined
  css: string | undefined
}

/**
 * 页面配置四文件名。
 */
export const PAGE_CONFIG_FILE_NAMES: readonly ['rule.json', 'pagedata.json', 'script.js', 'style.css'] = [
  'rule.json',
  'pagedata.json',
  'script.js',
  'style.css',
]
export type PageConfigFileName = typeof PAGE_CONFIG_FILE_NAMES[number]

/**
 * 页面配置文件的描述符，用于动态注册文件类型。
 */
export class PageConfigFileDescriptor {
  readonly name: string
  readonly required: boolean

  constructor(params: { name: string; required: boolean }) {
    const name = params.name.trim()
    if (name === '') {
      throw new Error('Page config file descriptor name must be a non-empty string')
    }
    this.name = name
    this.required = params.required
  }
}

/**
 * 页面文件注册表：按文件名映射到描述符。
 */
export type PageFileRegistry = ReadonlyMap<string, PageConfigFileDescriptor>

export class PageConfigFileRegistry extends Map<string, PageConfigFileDescriptor> {
  static default(): PageConfigFileRegistry {
    return new PageConfigFileRegistry(
      PAGE_CONFIG_FILE_NAMES.map((name) => [
        name,
        new PageConfigFileDescriptor({
          name,
          required: name === 'rule.json' || name === 'pagedata.json',
        }),
      ]),
    )
  }
}

/**
 * 创建默认的四文件注册表。
 */
export function createDefaultFileRegistry(): PageConfigFileRegistry {
  return PageConfigFileRegistry.default()
}

export type PageConfigFileLoadOptions = {
  /**
   * 跳过客户端缓存，强制重新请求后端文件接口。
   */
  forceReload?: boolean
  /**
   * 编辑态允许缺失文件以空文档呈现。加载器会在清单已知缺失时短路，
   * 避免继续发起必然 404 的逐文件 GET，同时保持 FileLoader 缓存/时间戳边界。
   */
  allowMissingAsEmpty?: boolean
}

/**
 * 完整页面配置。
 */
export type PageConfig = PageConfigFiles & {
  pageId: string
}

/**
 * 配置加载器选项。
 */
export type ConfigLoaderOptions = {
  /**
   * 远程 API 基础路径。
   *
   * 用于 DataSet、跨项目引用等共享 HTTP client，通常为 `/api`。
   */
  apiBaseUrl?: string

  /**
   * 自定义 HTTP client。
   *
   * 用于复用上层认证、租户作用域或 URL 重写能力；页面四文件读取仍由
   * PageConfigLoader/FileLoader 统一处理。
   */
  httpClient?: HttpClientBase

  /**
   * 页面配置四文件 API 基础路径。
   *
   * 必须指向 `.../pages-config`，用于 rule.json / pagedata.json / script.js / style.css。
   * 多租户项目下应传入 `/api/tenants/{tenantId}/projects/{projectId}/pages-config`。
   * SPA 内切换项目时可传函数，加载器会在每次读取前重新解析当前项目作用域。
   */
  pagesConfigBaseUrl?: string | (() => string)

  /**
   * FileLoader 客户端缓存存储方式。
   * @default 'localStorage'
   */
  fileStorage?: 'localStorage' | 'sessionStorage' | 'memory'

  /**
   * 启用配置验证。
   */
  enableValidation?: boolean

  /**
   * 加载超时（毫秒）。
   */
  timeout?: number

  /**
   * 动态请求头回调（每次请求时调用）。
   * 用于注入认证 / 租户上下文头（如 X-Tenant-Id、X-Project-Id）。
   */
  getHeaders?: () => Record<string, string>

  /**
   * 页面文件注册表，用于动态控制加载哪些文件类型。
   * 未提供时使用默认的四文件注册表。
   */
  fileRegistry?: PageFileRegistry
}

/**
 * 配置加载结果。
 */
export type ConfigLoadResult<T = unknown> = {
  success: boolean
  data?: T
  error?: string
  /** 失败原因：'not-found' 表示页面/文件不存在（404），与其他加载错误区分 */
  reason?: string
  source?: 'remote'
  timestamp?: number
  /** Raw source timestamp returned by the page-config file API. */
  sourceTimestamp?: string
  /** Whether the result was resolved from client cache after a notModified response. */
  fromCache?: boolean
  /** Whether the server reported the source file was unchanged. */
  notModified?: boolean
}

/**
 * 页面配置加载器基类。
 *
 * 加载器是运行期有状态对象：持有缓存、HTTP client、项目作用域等生命周期数据。
 * 因此用抽象 class 承载稳定协议，具体加载器通过继承表达实现关系。
 */
export abstract class BasePageConfigLoader {
  /** 加载完整页面配置。 */
  abstract loadPageConfig(pageId: string): Promise<ConfigLoadResult<PageConfig>>

  /** 加载页面规则。 */
  abstract loadRule(pageId: string): Promise<ConfigLoadResult<SparkNode[]>>

  /** 加载页面数据。 */
  abstract loadPageData(pageId: string): Promise<ConfigLoadResult<DataSet>>

  /** 加载页面脚本。 */
  abstract loadScript(pageId: string): Promise<ConfigLoadResult<string>>

  /** 加载页面样式。 */
  abstract loadCss(pageId: string): Promise<ConfigLoadResult<string>>

  /**
   * 加载单个页面配置文件原文。
   *
   * DevSystem / 编辑器等设计时入口需要拿到原文，再交给 PageModel
   * 维护 dirty、undo/redo 和领域模型同步。
   */
  abstract loadPageFileContent(
    pageId: string,
    filename: PageConfigFileName,
    options?: PageConfigFileLoadOptions,
  ): Promise<ConfigLoadResult<string>>

  /**
   * 按文件名动态加载单个页面配置文件（编译后结果）。
   * 非动态加载器不应吞掉调用错误。
   */
  loadPageFile(
    pageId: string,
    filename: string,
    _options?: PageConfigFileLoadOptions,
  ): Promise<ConfigLoadResult<unknown>> {
    throw new Error(`Page config loader does not support dynamic file loading: ${pageId}/${filename}`)
  }

  /** 清除缓存。 */
  abstract clearCache(key?: string): void

  /** 获取缓存统计。 */
  abstract getCacheStats(): { size: number; keys: string[] }

  /**
   * 获取内部 HTTP 客户端。
   *
   * 渲染层可用该客户端注入到 DataSet，以复用认证/租户请求头与拦截器。
   */
  getHttpClient(): HttpClientBase | undefined {
    return undefined
  }
}
