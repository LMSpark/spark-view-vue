/**
 * 页面四文件加载域公共类型。
 *
 * 该文件只描述 PageNode 内容配置四文件的加载契约，不掺入 Vue、路由或编辑器运行时。
 * navigation 也是 PageNode 配置项，但它属于导航树配置资产，由 NavigationConfigClient 管理。
 *
 * ## CRUD 角色
 * - 本文件所有类型服务于 **Read** 管线（加载 + 解析）。
 * - 四文件名由 PageNodeFileName 固定约束，不做动态注册。
 */

import type { DataSet } from '@spark-appworks/spark-data'
import type { HttpClientBase } from '@spark-appworks/spark-utils'
import type { SparkNode } from '@spark-appworks/spark-data'
import type { PageContentLoadResult, PageNodeLoadOptions, PageNodeFileName } from '../../model/page/file'

// ── 页面四文件载荷类型 ───────────────────────────────────

/**
 * 页面四文件载荷（不含 pageId）。
 *
 * 只描述页面内容本身，不掺入路由、Vue、能力系统等运行时语义。
 */
export type PageContentConfigFiles = {
  rule: SparkNode[]
  data: DataSet
  script: string | undefined
  css: string | undefined
}

export type PageContentConfig = PageContentConfigFiles & {
  pageId: string
}

export type PageContentLoaderOptions = {
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
   * PageContentLoader/FileLoader 统一处理。
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

}

// ═══════════════ BasePageContentLoader 抽象契约 ═══════════════

/**
 * 页面内容加载器基类。
 *
 * 加载器是运行期有状态对象：持有缓存、HTTP client、项目作用域等生命周期数据。
 * 因此用抽象 class 承载稳定协议，具体加载器通过继承表达实现关系。
 */
export abstract class BasePageContentLoader {
  /** 加载页面四文件内容配置。 */
  abstract loadPageContentConfig(pageId: string): Promise<PageContentLoadResult<PageContentConfig>>

  /** 加载页面规则。 */
  abstract loadRule(pageId: string): Promise<PageContentLoadResult<SparkNode[]>>

  /** 加载页面数据。 */
  abstract loadPageData(pageId: string): Promise<PageContentLoadResult<DataSet>>

  /** 加载页面脚本。 */
  abstract loadScript(pageId: string): Promise<PageContentLoadResult<string>>

  /** 加载页面样式。 */
  abstract loadCss(pageId: string): Promise<PageContentLoadResult<string>>

  /**
   * 加载单个页面配置文件原文。
   *
   * DevSystem / 编辑器等设计时入口需要拿到原文，再交给 PageNode
   * 维护 dirty、undo/redo 和领域模型同步。
   */
  abstract loadPageFileContent(
    pageId: string,
    filename: PageNodeFileName,
    options?: PageNodeLoadOptions,
  ): Promise<PageContentLoadResult<string>>

  /**
   * 按文件名动态加载单个页面配置文件（编译后结果）。
   * 非动态加载器不应吞掉调用错误。
   */
  loadPageFile(
    pageId: string,
    filename: PageNodeFileName,
    _options?: PageNodeLoadOptions,
  ): Promise<PageContentLoadResult<unknown>> {
    throw new Error(`Page content loader does not support dynamic file loading: ${pageId}/${filename}`)
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
