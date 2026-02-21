/**
 * 页面配置层类型定义
 * L2 业务编排层 - 对应 4 个配置文件
 */

import type { RouteRecordRaw } from 'vue-router'
import type { IDataSet } from '@spark-view/spark-data'

/**
 * 路由配置（routes.json）
 */
export interface RouteConfig {
  path: string
  name: string
  pageId: string
  meta?: {
    title?: string
    icon?: string
    requiresAuth?: boolean
    permissions?: string[]
    roles?: string[]
    preloadModels?: string[]
    [key: string]: unknown
  }
}

/**
 * 页面规则配置（rule.json）
 * 组件树结构，描述页面如何渲染
 */
export interface RuleConfig {
  type: string // 组件类型，如 'div', 'el-button', 'spark-ej2-grid'
  props?: Record<string, unknown>
  children?: (RuleConfig | string)[]
  style?: Record<string, string | number>
  class?: string | string[]
  on?: Record<string, string> // 事件名 -> 脚本函数名
  slots?: Record<string, RuleConfig[]>
  [key: string]: unknown
}

/**
 * 页面数据配置（pagedata.json）编译结果
 * parsePageData 执行后得到的 DataSet 实例
 */
export type PageDataConfig = IDataSet

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
 * 完整页面配置
 */
export interface PageConfig {
  pageId: string
  rule: RuleConfig[]
  data: PageDataConfig
  script: PageScriptConfig | undefined
  css: PageCssConfig | undefined
}

/**
 * 配置加载器选项
 */
export interface ConfigLoaderOptions {
  /**
   * 配置源类型
   * - 'local': 从 public/pages-config 加载（SPA 模式）
   * - 'remote': 从服务器 API 加载
   * - 'hybrid': 优先 remote，失败降级到 local
   */
  source: 'local' | 'remote' | 'hybrid'
  
  /**
   * 远程 API 基础路径
   */
  apiBaseUrl?: string
  
  /**
   * FileLoader 缓存存储方式（本地模式使用）
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
}

/**
 * 配置验证错误
 */
export interface ValidationError {
  field: string
  message: string
  value?: unknown
}

/**
 * 配置加载结果
 */
export interface ConfigLoadResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
  source?: 'local' | 'remote'
  timestamp?: number
  validationErrors?: ValidationError[]
}

/**
 * 动态路由注册选项
 */
export interface DynamicRouterOptions {
  /**
   * Vue Router 实例
   */
  router: import('vue-router').Router
  
  /**
   * 配置加载器
   */
  configLoader: ConfigLoader
  
  /**
   * 动态页面组件（必需）
   * 用于渲染配置化页面
   * 
   * @example
   * ```typescript
   * import { PageRenderer } from '@spark-view/spark-component'
   * 
   * const options = {
   *   router,
   *   configLoader,
   *   pageComponent: PageRenderer
   * }
   * ```
   */
  pageComponent: import('vue').Component
  
  /**
   * 路由注册前钩子
   */
  beforeRegister?: (routes: RouteConfig[]) => RouteConfig[] | Promise<RouteConfig[]>
  
  /**
   * 路由注册后钩子
   */
  afterRegister?: (routes: RouteRecordRaw[]) => void
}

/**
 * 配置加载器接口
 */
export interface ConfigLoader {
  /**
   * 加载路由配置
   */
  loadRoutes(): Promise<ConfigLoadResult<RouteConfig[]>>
  
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
   * 清除缓存
   */
  clearCache(key?: string): void
  
  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; keys: string[] }
}

/**
 * 配置版本信息
 */
export interface ConfigVersion {
  version: string
  timestamp: number
  checksum?: string
}
