/**
 * 页面配置层类型定义
 * L2 业务编排层 - 对应 4 个配置文件
 */

import type { DataSet } from '@spark-view/spark-data'
import type { HttpClientBase } from '@spark-view/spark-utils'
import type { SparkNode } from '../spark-node'

/**
 * 页面规则配置（rule.json）。
 */
export interface RuleConfig extends SparkNode {}

export type { SparkNode, SparkNodeChildren } from '../spark-node'

/**
 * 页面数据配置（pagedata.json）编译结果
 * parsePageData 统一编译为 DataSet 实例
 */
export interface PageDataConfig extends DataSet {}

/**
 * 页面脚本配置（script.js）
 * 页面交互逻辑 - 纯文本形式
 * 
 * 注意：
 * - 脚本是纯函数定义，不使用 ES6 export 或 CommonJS exports
 * - 由 PageRenderer 使用 Function 构造器编译和执行
 */
// 这里不再为 JS 基础类型保留导出别名，直接使用原生 string。

/**
 * 页面样式配置（style.css）
 * 页面级 CSS 文本，由渲染器通过 <style> 标签注入。
 *
 * 后续可加：作用域前缀注入、CSS 变量展开、预处理器编译结果缓存。
 */

/**
 * 页面四文件载荷（不含 pageId）
 *
 * 只描述页面内容本身，不掺入路由、Vue、能力系统等运行时语义。
 * SparkPageRenderer 会将该四文件 bundle 编排为：
 * - rule   → pageChildren
 * - data   → DataSet 运行时
 * - script → 沙箱函数表
 * - css    → 作用域样式文本
 */
export interface PageConfigFiles {
  rule: RuleConfig[]
  data: PageDataConfig
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
export interface PageConfigFileDescriptor {
  /** 文件名，如 'rule.json' */
  name: string
  /** 是否必需（加载失败时是否阻断） */
  required: boolean
}

/**
 * 页面文件注册表：按文件名映射到描述符。
 */
export interface PageFileRegistry extends ReadonlyMap<string, PageConfigFileDescriptor> {}

/**
 * 创建默认的四文件注册表。
 */
export function createDefaultFileRegistry(): PageFileRegistry {
  return new Map(
    PAGE_CONFIG_FILE_NAMES.map((name) => [
      name,
      { name, required: name === 'rule.json' || name === 'pagedata.json' },
    ]),
  )
}

export interface PageConfigFileLoadOptions {
  /**
   * 跳过客户端缓存，强制重新请求后端文件接口。
   */
  forceReload?: boolean
}

/**
 * 完整页面配置
 */
export interface PageConfig extends PageConfigFiles {
  pageId: string
}

/**
 * 配置加载器选项
 */
export interface ConfigLoaderOptions {
  /**
   * 远程 API 基础路径。
   *
   * 用于 DataSet、跨项目引用等共享 HTTP client，通常为 `/api`。
   */
  apiBaseUrl?: string

  /**
   * 页面配置四文件 API 基础路径。
   *
   * 必须指向 `.../pages-config`，用于 rule.json / pagedata.json / script.js / style.css。
  * 多租户项目下应传入 `/api/tenants/{tenantId}/projects/{projectId}/pages-config`。
  * SPA 内切换项目时可传函数，加载器会在每次读取前重新解析当前项目作用域。
   */
  pagesConfigBaseUrl?: string | (() => string)

  /**
   * FileLoader 客户端缓存存储方式
   * @default 'localStorage'
   */
  fileStorage?: 'localStorage' | 'sessionStorage' | 'memory'

  /**
   * 启用配置验证
   */
  enableValidation?: boolean

  /**
   * 加载超时（毫秒）
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
 * 配置加载结果
 */
export interface ConfigLoadResult<T = unknown> {
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
  abstract loadRule(pageId: string): Promise<ConfigLoadResult<RuleConfig[]>>

  /** 加载页面数据。 */
  abstract loadPageData(pageId: string): Promise<ConfigLoadResult<PageDataConfig>>

  /** 加载页面脚本。 */
  abstract loadScript(pageId: string): Promise<ConfigLoadResult<string>>

  /** 加载页面样式。 */
  abstract loadCss(pageId: string): Promise<ConfigLoadResult<string>>

  /**
   * 加载单个页面配置文件原文。
   *
   * DevSystem / 编辑器等设计时入口需要拿到原文，再交给各自的
   * PageFileDocument 维护 dirty、undo/redo 和领域模型同步。
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
