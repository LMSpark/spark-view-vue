/**
 * 页面配置层类型定义
 * L2 业务编排层 - 对应 4 个配置文件
 */

import type { DataSet } from '@spark-view/spark-data'
import type { HttpClient } from '@spark-view/spark-utils'
import type { SparkNode } from '../spark-node'

/**
 * 页面规则配置（rule.json）。
 */
export type RuleConfig = SparkNode

export type { SparkNode, SparkNodeChildren } from '../spark-node'

/**
 * 页面数据配置（pagedata.json）编译结果
 * parsePageData 统一编译为 DataSet 实例
 */
export type PageDataConfig = DataSet

/**
 * 页面脚本配置（script.js）
 * 页面交互逻辑 - 纯文本形式
 * 
 * 注意：
 * - 脚本是纯函数定义，不使用 ES6 export 或 CommonJS exports
 * - 由 PageRenderer 使用 Function 构造器编译和执行
 */
export type PageScriptConfig = string

/**
 * 页面样式配置（style.css）
 * 页面级 CSS 文本，由渲染器通过 <style> 标签注入。
 *
 * 后续可加：作用域前缀注入、CSS 变量展开、预处理器编译结果缓存。
 */
export type PageCssConfig = string

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
  script: PageScriptConfig | undefined
  css: PageCssConfig | undefined
}

/**
 * 页面配置四文件名。
 */
export const PAGE_CONFIG_FILE_NAMES = [
  'rule.json',
  'pagedata.json',
  'script.js',
  'style.css',
] as const
export type PageConfigFileName = typeof PAGE_CONFIG_FILE_NAMES[number]

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
}

/**
 * 配置加载器接口
 */
export interface ConfigLoader {
  /**
   * 加载页面配置
   */
  loadPageConfig(pageId: string): Promise<ConfigLoadResult<PageConfig>>
  
  /**
   * 加载页面规则
   */
  loadRule(pageId: string): Promise<ConfigLoadResult<RuleConfig[]>>
  
  /**
   * 加载页面数据
   */
  loadPageData(pageId: string): Promise<ConfigLoadResult<PageDataConfig>>
  
  /**
   * 加载页面脚本
   */
  loadScript(pageId: string): Promise<ConfigLoadResult<PageScriptConfig>>

  /**
   * 加载页面样式
   */
  loadCss(pageId: string): Promise<ConfigLoadResult<PageCssConfig>>

  /**
   * 加载单个页面配置文件原文。
   *
   * DevSystem / 编辑器等设计时入口需要拿到原文，再交给各自的
   * PageFileDocument 维护 dirty、undo/redo 和领域模型同步。
   */
  loadPageFileContent(
    pageId: string,
    filename: PageConfigFileName,
    options?: PageConfigFileLoadOptions,
  ): Promise<ConfigLoadResult<string>>
  
  /**
   * 清除缓存
   */
  clearCache(key?: string): void
  
  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; keys: string[] }

  /**
   * 获取内部 HTTP 客户端（可选）。
   *
   * 渲染层可用该客户端注入到 DataSet，以复用认证/租户请求头与拦截器。
   */
  getHttpClient?(): HttpClient
}
