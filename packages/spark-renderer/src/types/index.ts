/**
 * 渲染器类型定义
 */

import type { DataSet } from '@spark-view/spark-data'
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
 * 页面上下文
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
  $dataSet: DataSet | null
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
  formCreateOptions?: Record<string, any>
  
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
  modules?: Record<string, any>
}

/**
 * DataSet 初始化选项
 */
export interface DataSetInitOptions {
  pageData: Record<string, unknown>
  context: PageContext
  dataLoader?: (tableName: string) => Promise<any[]>
}

/**
 * Rule 绑定选项
 */
export interface RuleBindingOptions {
  rules: Rule[]
  pageData: Record<string, unknown>
  pageFunctions: Record<string, Function>
  dataSet: DataSet | null
  formApi: FormCreateAPI | null
}
