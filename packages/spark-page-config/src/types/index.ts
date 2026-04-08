/**
 * 页面配置层类型定义
 * L2 业务编排层 - 对应 4 个配置文件
 */

import type { DataSet } from '@spark-view/spark-data'
import type { HttpClient } from '@spark-view/spark-utils'

/**
 * 页面规则配置（rule.json）
 *
 * 这是 spark-page-config 侧的声明式组件树，只表达“页面想渲染什么”。
 * 它不直接等同 spark-component 运行时的 SparkNode：
 * - 根级业务字段仍保留在声明位置
 * - on 仍是配置值，不是闭包
 * - props 合并 / 事件绑定 / id 去重由 spark-component 的 binding 层完成
 */
export interface RuleConfig {
  type: string // 组件类型，如 'div', 'el-button', 'r-table'
  props?: Record<string, unknown>
  children?: Array<RuleConfig | string>
  style?: Record<string, string | number>
  class?: string | string[]
  on?: Record<string, string> // 事件名 -> 脚本函数名
  slots?: Record<string, RuleConfig[]>
  [key: string]: unknown
}

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
   * 配置源类型
  * - 'local': 从本地 pages-config 静态目录加载（兼容 / 开发模式）
  * - 'remote': 从服务器 pages-config API 加载
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
  source?: 'local' | 'remote'
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
