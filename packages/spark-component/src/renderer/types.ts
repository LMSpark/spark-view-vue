/**
 * 渲染器类型定义
 *
 * - BindRule: 框架无关的运行时规则类型（绑定管线使用）
 * - PageContext: 脚本沙箱上下文
 * - PageRendererProps: 页面渲染器配置
 * - RuleBindingOptions: 规则绑定配置
 */

import type { h as VueH } from 'vue'
import type { IDataSet, SparkData } from '@spark-view/spark-data'
import type { ConfigLoader, PageConfig, IPageRoute } from '@spark-view/spark-page-config'
import type { IPageServiceCapability, IModuleContext } from '@spark-view/spark-utils'
import type { ComponentRegistry } from '../types.js'
import type { PageComponentInstanceEntry } from '../capability-keys.js'

// PageConfig 来自 spark-page-config（数据配置层的权威定义），此处仅做重导出
export type { PageConfig }

// ── 框架无关的运行时规则类型 ───────────────────────────────────────────────────

/**
 * 框架无关的运行时规则类型（绑定管线使用）
 *
 * `RuleConfig`（JSON 配置输入）经过 `bindDataToRules` 处理后的运行时表示：
 * - `on`: 字符串函数名 → 可调用函数
 * - `props`: 注入 DataView / 响应式 getter 等运行时对象
 * - `children`: 子规则递归处理后的运行时数组
 *
 * SPARK 渲染器将 `BindRule` 向下转型为 `ComponentConfig`。
 */
export interface BindRule {
  type: string
  name?: string
  props?: Record<string, unknown>
  children?: Array<BindRule | string>
  on?: Record<string, unknown>
  /** 索引签名覆盖 dataKey / display / options / style / class / slots 等动态属性 */
  [key: string]: unknown
}

/** 页面脚本组件访问 API（由渲染器根节点注入） */
export interface PageComponentAccessApi {
  /** 按组件 id 获取实例快照（推荐） */
  get(id: string): PageComponentInstanceEntry | null
  /** 按组件 id 获取组件 API（推荐） */
  getApi<T = unknown>(id: string): T | null
  /** 列出页面组件实例（可按 type 过滤） */
  list(type?: string): PageComponentInstanceEntry[]
  /** 列出组件 API（可按 type 过滤） */
  getApis<T = unknown>(type?: string): T[]

  /** @deprecated 使用 get(id) */
  getInstance(id: string): PageComponentInstanceEntry | null
  /** @deprecated 使用 list(type?) */
  listInstances(type?: string): PageComponentInstanceEntry[]
}

/**
 * 页面脚本运行时上下文。
 *
 * SPARK 渲染器的脚本沙箱使用此类型。
 */
export interface PageContext {
  $dataSet: IDataSet | null
  $components: PageComponentAccessApi
  $route: IPageRoute
  $moduleContext: IModuleContext | null
  $el: () => HTMLElement | null
  $query: (selector: string) => HTMLElement | null
  $queryAll: (selector: string) => NodeListOf<Element>
  $refreshData: (key?: string) => Promise<void>
  $page: IPageServiceCapability
  console: Pick<Console, 'log' | 'info' | 'warn' | 'error' | 'debug'>
  SparkData: typeof SparkData
  h: typeof VueH

  // Timer APIs
  setTimeout: (handler: (...args: unknown[]) => void, timeout?: number) => number
  clearTimeout: (id?: number) => void
  setInterval: (handler: (...args: unknown[]) => void, timeout?: number) => number
  clearInterval: (id?: number) => void
}

/**
 * 页面渲染器 Props
 */
export interface PageRendererProps {
  /** 配置加载器实例 */
  configLoader?: ConfigLoader
  /** 页面唯一标识符（优先级最高） */
  pageId?: string
  /** 页面配置对象（直接传入，跳过加载） */
  pageConfig?: PageConfig
  /** 是否启用 CSS 作用域隔离 @default true */
  enableCssScope?: boolean
  /** 是否启用 DataSet 自动初始化 @default true */
  enableDataSet?: boolean
  /** UI 消息服务接口（可注入替代 ElementPlus） */
  messageService?: {
    success: (msg: string) => void
    warning: (msg: string) => void
    error: (msg: string) => void
    info: (msg: string) => void
  }
  /** UI 确认对话框服务接口（可注入替代 ElementPlus） */
  confirmService?: {
    confirm: (msg: string, title?: string) => Promise<unknown>
    alert: (msg: string, title?: string) => Promise<unknown>
    prompt?: (msg: string, title?: string) => Promise<string | null>
  }
  /** APP 层注入的页面服务扩展（弹层/文件能力等） */
  pageService?: Partial<IPageServiceCapability>
  /** 模块级上下文（导航系统提供，注入沙箱 $moduleContext） */
  moduleContext?: IModuleContext | null
  /** 页面加载前钩子函数 */
  beforeLoad?: (pageId: string) => void | Promise<void>
  /** 页面加载后钩子函数 */
  afterLoad?: (config: PageConfig) => void | Promise<void>
  /** 错误处理函数 */
  onError?: (error: Error) => void
}

/**
 * Rule 绑定选项
 */
export interface RuleBindingOptions {
  rules: BindRule[]
  pageFunctions: Record<string, (...args: unknown[]) => unknown>
  dataSet: IDataSet | null
  /** 组件注册表（可选）——用于查询 dataKey 行为元数据，替代硬编码的组件白名单 */
  registry?: ComponentRegistry
}


