/**
 * 渲染器类型定义 (SOLID原则应用)
 * 
 * 类型层次说明：
 * - RuleConfig: 配置文件中的规则格式（来自 @spark-view/spark-page-config）
 * - Rule: 运行时的规则格式（FormCreate 官方类型）
 * 
 * 转换流程：
 * 1. 配置加载器读取 rule.json → RuleConfig[]
 * 2. PageRenderer 接收 RuleConfig[] → 转换为 Rule[]
 * 3. 绑定和渲染使用 Rule[]（FormCreate 标准格式）
 */

import type { IDataSet } from '@spark-view/spark-data'
import type { ConfigLoader, PageConfig } from '@spark-view/spark-page-config'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

// PageConfig 来自 spark-page-config（数据配置层的权威定义），此处仅做重导出
export type { PageConfig }

// 导入 FormCreate 官方类型
import type { Rule as FormCreateRule, Api as FormCreateApi } from '@form-create/element-ui'

/**
 * 页面规则类型（使用 FormCreate 官方类型）
 * 用于运行时的规则绑定和渲染
 * 
 * 注意：虽然配置文件使用 RuleConfig，但由于结构兼容，
 * FormCreate 能够正确识别和处理我们的配置格式。
 */
export type Rule = FormCreateRule

/**
 * FormCreate API 接口（使用官方 Api 类型）
 * 
 * 说明：直接使用 @form-create/element-ui 的 Api 类型
 * 官方文档：https://www.form-create.com/v3/instance/
 */
export type FormCreateAPI = FormCreateApi

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
  $el: () => HTMLElement | null
  $query: (selector: string) => HTMLElement | null
  $queryAll: (selector: string) => NodeListOf<Element>
  $rebindRules: () => void
  $refreshData: (key?: string) => Promise<void>
  $dataSet: IDataSet | null  // DataSet 实例（依赖接口而非具体类）
  
  // 沙箱全局变量
  ElMessage: typeof import('element-plus')['ElMessage']  // Element Plus 消息提示
  ElMessageBox: typeof import('element-plus')['ElMessageBox']  // Element Plus 消息框
  SparkData: typeof import('@spark-view/spark-data')['SparkData']  // SPARK 数据空间命名空间
  h: typeof import('vue')['h']  // Vue h 函数
}

/**
 * PageRenderer 组件选项接口
 * 
 * 用于配置页面渲染器的行为，包括配置加载、样式隔离、数据管理等功能。
 * 
 * @interface PageRendererOptions
 */
export interface PageRendererOptions {
  /**
   * 配置加载器实例
   * 用于从本地或远程加载页面配置（rule.json, pagedata.json, script.js）
   * 
   * @type {ConfigLoader}
   * @optional
   * @example
   * ```typescript
   * import { SparkPageConfig } from '@spark-view/spark-page-config'
   * 
   * const configLoader = SparkPageConfig.createLoader({
   *   source: 'local',
   *   apiBaseUrl: '/api/config'
   * })
   * ```
   */
  configLoader?: ConfigLoader
  
  /**
   * 页面唯一标识符（优先级最高）
   * 如果提供，则直接使用此 ID 加载配置，忽略路由参数
   * 
   * @type {string}
   * @optional
   * @example 'user-list' | 'dashboard' | 'settings'
   */
  pageId?: string
  
  /**
   * 页面配置对象（直接传入，跳过加载）
   * 提供此选项时，configLoader 和 pageId 将被忽略
   * 
   * @type {PageConfig}
   * @optional
   * @example
   * ```typescript
   * {
   *   pageId: 'user-form',
   *   rule: [...],
   *   data: { users: [] },
   *   style: '.user-form { padding: 20px; }',
   *   script: 'console.log("Page loaded");'
   * }
   * ```
   */
  pageConfig?: PageConfig
  
  /**
   * FormCreate 配置选项
   * 传递给 form-create 的额外配置，用于自定义表单行为
   * 
   * @type {Record<string, unknown>}
   * @optional
   * @default {}
   * @see https://www.form-create.com/v3/guide/global.html
   * @example
   * ```typescript
   * {
   *   form: { labelWidth: '120px', size: 'large' },
   *   submitBtn: false,
   *   resetBtn: false
   * }
   * ```
   */
  formCreateOptions?: Record<string, unknown>
  
  /**
   * 是否启用 CSS 作用域隔离
   * 开启后，页面样式会自动添加作用域前缀，避免全局污染
   * 
   * @type {boolean}
   * @optional
   * @default true
   * @example true | false
   */
  enableCssScope?: boolean
  
  /**
   * 是否启用 DataSet 自动初始化
   * 开启后，根据页面配置的 relations 自动创建 DataSet 实例
   * 
   * @type {boolean}
   * @optional
   * @default true
   * @example true | false
   */
  enableDataSet?: boolean
  
  /**
   * UI 消息服务接口（可注入替代 ElementPlus）
   * 用于显示成功、警告、错误等提示消息，便于测试和 UI 框架解耦
   * 
   * @type {Object}
   * @optional
   * @default ElementPlus Message
   * @example
   * ```typescript
   * {
   *   success: (msg) => console.log('✓', msg),
   *   warning: (msg) => console.warn('⚠', msg),
   *   error: (msg) => console.error('✗', msg),
   *   info: (msg) => console.info('ℹ', msg)
   * }
   * ```
   */
  messageService?: {
    success: (msg: string) => void
    warning: (msg: string) => void
    error: (msg: string) => void
    info: (msg: string) => void
  }
  
  /**
   * UI 确认对话框服务接口（可注入替代 ElementPlus）
   * 用于显示确认和提示对话框，便于测试和 UI 框架解耦
   * 
   * @type {Object}
   * @optional
   * @default ElementPlus MessageBox
   * @example
   * ```typescript
   * {
   *   confirm: async (msg, title) => {
   *     return window.confirm(`${title}: ${msg}`)
   *   },
   *   alert: async (msg, title) => {
   *     window.alert(`${title}: ${msg}`)
   *   }
   * }
   * ```
   */
  confirmService?: {
    confirm: (msg: string, title?: string) => Promise<unknown>
    alert: (msg: string, title?: string) => Promise<unknown>
  }
  
  /**
   * 页面加载前钩子函数
   * 在开始加载页面配置之前调用，可用于权限检查、数据预加载等
   * 
   * @type {Function}
   * @optional
   * @param {string} pageId - 即将加载的页面 ID
   * @returns {void | Promise<void>}
   * @example
   * ```typescript
   * async (pageId) => {
   *   console.log('Loading page:', pageId)
   *   // 可以在这里做权限检查
   *   if (!hasPermission(pageId)) {
   *     throw new Error('No permission')
   *   }
   * }
   * ```
   */
  beforeLoad?: (pageId: string) => void | Promise<void>
  
  /**
   * 页面加载后钩子函数
   * 在页面配置加载完成、规则绑定完成后调用
   * 
   * @type {Function}
   * @optional
   * @param {PageConfig} config - 加载的页面配置对象
   * @returns {void | Promise<void>}
   * @example
   * ```typescript
   * async (config) => {
   *   console.log('Page loaded:', config.pageId)
   *   // 可以在这里做额外的初始化
   *   await initializePageData(config.data)
   * }
   * ```
   */
  afterLoad?: (config: PageConfig) => void | Promise<void>
  
  /**
   * 错误处理函数
   * 当页面加载或渲染过程中发生错误时调用
   * 
   * @type {Function}
   * @optional
   * @param {Error} error - 错误对象
   * @returns {void}
   * @example
   * ```typescript
   * (error) => {
   *   console.error('Page error:', error)
   *   // 可以上报错误到监控系统
   *   reportError(error)
   * }
   * ```
   */
  onError?: (error: Error) => void
}

/**
 * Rule 绑定选项
 */
export interface RuleBindingOptions {
  rules: Rule[]
  /**
   * 脚本运行时状态（PageContext.$data）——仅由脚本写入，不再用于 pagedata.json 数据。
   * pagedata.json 数据统一通过 DataSet + DataKey（`scope@tableName@viewId@field`）访问。
   */
  pageData: Record<string, unknown>
  pageFunctions: Record<string, (...args: unknown[]) => unknown>
  dataSet: IDataSet | null  // DataSet 实例（依赖接口而非具体类）

}
