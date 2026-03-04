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

import type { Component } from 'vue'
import type { h as VueH } from 'vue'
import type { IDataSet } from '@spark-view/spark-data'
import type { SparkData } from '@spark-view/spark-data'
import type { ConfigLoader, PageConfig } from '@spark-view/spark-page-config'
import type { IPageServiceCapability } from '@spark-view/spark-utils'
import type { IScriptContext } from '@spark-view/spark-page-config'
import type { ComponentRegistry } from '../../core/types.js'

// PageConfig 来自 spark-page-config（数据配置层的权威定义），此处仅做重导出
export type { PageConfig }

// 导入 FormCreate 官方类型
import type { Rule as FormCreateRule } from '@form-create/element-ui'

/**
 * 页面规则类型（使用 FormCreate 官方类型）
 *
 * 使用 `interface extends` 而非 `type =`，创建名义类型边界：
 * form-create 的 Rule 泛型包含递归子类型（Rule → Creator → Rule），
 * `type` 别名是透明的，vue-tsc 会在每个引用点展开底层泛型导致指数级膨胀；
 * `interface extends` 让 TypeScript 使用接口名称匹配，跳过结构展开。
 */
 
export interface Rule extends FormCreateRule {}

/**
 * FormCreate API 精简接口
 *
 * form-create 官方 `Api<OptionAttrs, CreatorAttrs, RuleAttrs, ApiAttrs>` 包含
 * 深度递归泛型（Rule → Creator → Rule），直接使用会导致 vue-tsc 在 `Ref<Api>`
 * 结构检查时触发指数级类型展开（~116KB 错误输出）。
 *
 * 本接口仅声明项目中实际用到的 11 个方法，完全规避递归泛型；
 * 运行时 form-create 注入的完整 Api 对象天然满足此子集约束。
 *
 * @see IFormAPI — 沙箱侧更窄的接口（script-context-types.ts）
 * @see https://www.form-create.com/v3/instance/
 */
export interface FormCreateAPI {
  /** 获取指定 field 的组件实例 / DOM 元素 */
  el(id: string): unknown
  /** 获取单个字段值 */
  getValue(field: string): unknown
  /** 设置字段值（单字段或批量对象） */
  setValue(field: string | Record<string, unknown>, value?: unknown): void
  /** 获取全部表单数据 */
  formData(): Record<string, unknown>
  /** 表单校验 */
  validate(callback: (valid: boolean) => void): void
  /** 重置字段 */
  resetFields(fields?: string | string[]): void
  /** 清除校验状态 */
  clearValidateState(fields?: string | string[]): void
  /** 启用 / 禁用字段 */
  disabled(disabled: boolean, field?: string | string[]): void
  /** 显示 / 隐藏字段 */
  hidden(hidden: boolean, field?: string | string[]): void
  /** 更新字段规则 */
  updateRule(field: string, rule: Record<string, unknown>): void
  /** 监听表单事件 */
  on(event: string, callback: (...args: unknown[]) => void): void
}

/**
 * 页面脚本运行时上下文接口（完整沙箱 API）。
 *
 * 继承 `IScriptContext`（spark-utils 中的框架无关核心契约），
 * 在渲染层用具体类型覆盖泛型字段，并附加 `SparkData` / `h` 两个渲染层专有注入。
 *
 * **稳定 API（继承自 IScriptContext）**：
 * `$api` / `$route` / `$el` / `$query` / `$queryAll` /
 * `$rebindRules` / `$refreshData` / `$dataSet` / `$page`
 *
 * **渲染层附加（非脚本 API 核心契约）**：
 * `SparkData`（数据工具命名空间）/ `h`（Vue 渲染函数，仅 Render* 函数使用）
 */
export interface PageContext extends IScriptContext {
  /** 页面级 DataSet 实例（渲染层注入，类型来自 @spark-view/spark-data） */
  $dataSet: IDataSet | null

  /**
   * @override 覆盖 IScriptContext.$page：从结构等价的 `IPageServiceInScript` 精化为
   * `IPageServiceCapability`（能力系统的官方接口，与 PAGE_SERVICE 能力键匹配）。
   */
  $page: IPageServiceCapability

  /** SPARK 数据工具命名空间（`createTreeManager` 等工具），沙箱内直接可用 */
  SparkData: typeof SparkData

  /**
   * Vue `h` 函数 — 仅供 `Render*` 渲染函数使用，业务逻辑不应依赖。
   * 如需显示消息/导航，请使用 `$page`。
   */
  h: typeof VueH
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
  pageFunctions: Record<string, (...args: unknown[]) => unknown>
  dataSet: IDataSet | null  // DataSet 实例（依赖接口而非具体类）
  /** 组件注册表（可选）——用于查询 dataKey 行为元数据，替代硬编码的组件白名单 */
  registry?: ComponentRegistry
  /**
   * 当前 useRuleBinding 实例的唯一标识（可选）。
   *
   * 注入后，setCurrentRow/setSelectedRows 会将 originatorId 传递给事件回调，
   * useRuleBinding 的 onAnyViewChange 过滤逻辑可据此只跳过本实例的回写，
   * 同一 DataView 的其他 binding 实例仍会收到通知并同步 UI。
   */
  bindingId?: string
}

/**
 * JsonRenderer 组件选项接口
 * 
 * 用于从 JSON 配置文件动态渲染 SPARK 组件的渲染器。
 * 支持远程加载配置、本地配置传入、自定义组件等场景。
 * 
 * @interface JsonRendererOptions
 * @example
 * ```vue
 * <!-- 远程加载配置 -->
 * <JsonRenderer configUrl="/api/config/user-grid.json" />
 * 
 * <!-- 直接传入配置 -->
 * <JsonRenderer :config="{ type: 'user-grid', props: {...} }" />
 * 
 * <!-- 自定义组件 -->
 * <JsonRenderer 
 *   :config="config" 
 *   :component="UserGrid" 
 * />
 * ```
 */
export interface JsonRendererOptions {
  /**
   * 配置文件 URL（远程加载）
   * 提供此选项时，组件会从远程加载 JSON 配置
   * 
   * @type {string}
   * @optional
   * @example '/user-grid-demo.json' | '/api/config/dashboard.json'
   */
  configUrl?: string | undefined
  
  /**
   * 配置对象（直接传入，跳过加载）
   * 提供此选项时，configUrl 将被忽略
   * 
   * @type {Record<string, unknown>}
   * @optional
   * @example
   * ```typescript
   * {
   *   type: 'user-grid',
   *   id: 'demo-grid',
   *   props: {
   *     dataset: { ... }
   *   }
   * }
   * ```
   */
  config?: Record<string, unknown> | undefined
  
  /**
   * 渲染组件（自定义组件）
   * 如果不提供，将根据配置中的 type 字段从 SPARK 注册表查找组件
   * 
   * @type {Component}
   * @optional
   * @example import UserGrid from './UserGrid.vue'
   */
  component?: Component | undefined
  
  /**
   * 是否显示配置查看器（调试用）
   * 开启后，会显示一个可折叠面板，展示 JSON 配置内容
   * 
   * @type {boolean}
   * @optional
   * @default false
   */
  showConfigViewer?: boolean | undefined
  
  /**
   * 配置加载前钩子函数
   * 在开始加载配置之前调用，可用于权限检查、预处理等
   * 
   * @type {Function}
   * @optional
   * @param {string} url - 即将加载的配置 URL
   * @returns {void | Promise<void>}
   */
  beforeLoad?: ((url: string) => void | Promise<void>) | undefined
  
  /**
   * 配置加载后钩子函数
   * 在配置加载完成后调用，可用于配置验证、转换等
   * 
   * @type {Function}
   * @optional
   * @param {Record<string, unknown>} config - 加载的配置对象
   * @returns {void | Promise<void> | Record<string, unknown>}
   */
  afterLoad?: ((config: Record<string, unknown>) => void | Promise<void> | Record<string, unknown>) | undefined
  
  /**
   * 错误处理函数
   * 当配置加载或渲染过程中发生错误时调用
   * 
   * @type {Function}
   * @optional
   * @param {Error} error - 错误对象
   * @returns {void}
   */
  onError?: ((error: Error) => void) | undefined
}
