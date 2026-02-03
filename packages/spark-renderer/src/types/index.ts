/**
 * 渲染器类型定义 (SOLID原则应用)
 */

import type { IDataSet } from '@spark-view/spark-data'
import type { ConfigLoader } from '@spark-view/spark-page-config'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

/**
 * 页面规则配置
 */
export interface Rule {
  type: string
  name?: string
  props?: Record<string, unknown>
  children?: (Rule | string)[]
  style?: Record<string, string | number>
  class?: string | string[]
  on?: Record<string, Function | string>
  slots?: Record<string, Rule[]>
  dataKey?: string
  contextId?: string
  render?: Function
  [key: string]: unknown
}

/**
 * FormCreate API 接口
 */
export interface FormCreateAPI {
  rule: Rule[]
  formData(): Record<string, unknown>
  setValue(field: string, value: unknown): void
  el(name: string): HTMLElement | null
  [key: string]: unknown
}

/**
 * 页面脚本运行时上下文接口
 * 
 * 作用域：单个动态视图（页面配置）的脚本执行环境
 * 生命周期：页面加载时创建，卸载时销毁
 * 
 * 用途：
 * - 为页面脚本（script.js）提供框架能力访问接口
 * - 支持脚本访问 FormCreate API、路由、数据集等
 * - 提供 DOM 查询、数据刷新等常用操作
 * 
 * 注意：
 * - 此 Context 是"页面配置"级别，非"应用页面"级别
 * - 在 SPA 架构中，多个 PageContext 可能同时存在（如 KeepAlive 场景）
 * - 遵循 DIP 原则：依赖接口（IDataSet）而非具体类型（DataSet）
 * 
 * 典型使用场景：
 * - 页面脚本中通过 window.__pageContext 访问
 * - 事件处理函数中访问当前页面的数据和 API
 */
export interface PageContext {
  $api: FormCreateAPI | null
  $route: RouteLocationNormalizedLoaded
  $data: Record<string, unknown>
  $el: HTMLElement | null
  $query: (selector: string) => HTMLElement | null
  $queryAll: (selector: string) => NodeListOf<Element>
  $rebindRules: () => void
  $refreshData: (key?: string) => Promise<void>
  $dataSet: IDataSet | null  // 使用接口而非具体类
}

/**
 * 页面脚本模块
 */
export interface PageScriptModule {
  [functionName: string]: Function
}

/**
 * 页面配置
 */
export interface PageConfig {
  pageId: string
  rule: Rule[]
  data: Record<string, unknown>
  style?: string
  script?: PageScriptModule
}

/**
 * 渲染器选项
 */
export interface PageRendererOptions {
  /**
   * 配置加载器
   */
  configLoader?: ConfigLoader
  
  /**
   * 页面ID（优先级最高）
   */
  pageId?: string
  
  /**
   * 页面配置（直接传入，跳过加载）
   */
  pageConfig?: PageConfig
  
  /**
   * FormCreate 选项
   */
  formCreateOptions?: Record<string, unknown>
  
  /**
   * 是否启用 CSS 隔离
   */
  enableCssScope?: boolean
  
  /**
   * 是否启用脚本沙箱
   */
  enableScriptSandbox?: boolean
  
  /**
   * 是否启用 DataSet 自动初始化
   */
  enableDataSet?: boolean
  
  /**
   * 页面加载前钩子
   */
  beforeLoad?: (pageId: string) => void | Promise<void>
  
  /**
   * 页面加载后钩子
   */
  afterLoad?: (config: PageConfig) => void | Promise<void>
  
  /**
   * 错误处理
   */
  onError?: (error: Error) => void
}

/**
 * CSS 作用域选项
 */
export interface CssScopeOptions {
  pageId: string
  css: string
}

/**
 * 脚本沙箱选项
 */
export interface ScriptSandboxOptions {
  pageId: string
  context: PageContext
  modules?: Record<string, unknown>
}

import type { DataRow } from '@spark-view/spark-data'

/**
 * DataSet 初始化选项
 */
export interface DataSetInitOptions {
  pageData: Record<string, unknown>
  context: PageContext
  dataLoader?: (tableName: string) => Promise<DataRow[]>
}

/**
 * Rule 绑定选项
 */
export interface RuleBindingOptions {
  rules: Rule[]
  pageData: Record<string, unknown>
  pageFunctions: Record<string, Function>
  dataSet: IDataSet | null  // 使用接口而非具体类
  formApi: FormCreateAPI | null
}
