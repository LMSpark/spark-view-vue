/**
 * 渲染器类型定义
 *
 * 功能分区：
 * 1) 脚本沙箱上下文与组件访问 API（执行层）
 * 2) 页面渲染器参数（编排层）
 */

import type { IDataSet, SparkData } from '@spark-view/spark-data'
import type { ConfigLoader, PageConfig, IPageRoute, IScriptContext } from '@spark-view/spark-page-config'
import type { IPageServiceCapability, IModuleContext } from '@spark-view/spark-utils'
import type { PageComponentInstanceEntry } from '../../core/capabilities.js'

// ── 基础重导出 ────────────────────────────────────────────────────────────

// PageConfig 来自 spark-page-config（数据配置层权威定义），本文件仅透出类型
export type { PageConfig }
// IPageRoute 重导出供渲染层实现层使用
export type { IPageRoute }

// ── 分区 C：脚本沙箱能力（页面运行时访问面） ─────────────────────────────────

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
 * 继承 `IScriptContext`（spark-page-config，框架无关契约），
 * 在此基础上添加 spark-component 层具体注入字段：
 * - `$dataSet` — DataSet 实例（具体类型）
 * - `$components` — 覆盖为更完整的 `PageComponentAccessApi`
 * - `SparkData` — 数据工具命名空间
 * - `h` — 渲染函数（Render* 专用）
 * - Timer API — 沙箱白名单
 */
export interface PageContext extends IScriptContext {
  /** 页面 DataSet（比 IScriptContext 额外注入的具体类型） */
  $dataSet: IDataSet | null
  /** 组件访问 API（覆盖 IScriptContext 基类，提供更丰富方法） */
  $components: PageComponentAccessApi
  /** SPARK 数据空间工具命名空间（createTreeManager 等，Render* 函数用） */
  SparkData: typeof SparkData
  /** 渲染函数（框架无关签名，运行时由渲染层注入，Render* 函数专用） */
  h: (type: unknown, ...args: unknown[]) => unknown

  // Timer API（沙箱白名单）
  setTimeout: (handler: (...args: unknown[]) => void, timeout?: number) => number
  clearTimeout: (id?: number) => void
  setInterval: (handler: (...args: unknown[]) => void, timeout?: number) => number
  clearInterval: (id?: number) => void
}

// ── 分区 D：渲染器编排入参 ──────────────────────────────────────────────────

/**
 * 页面渲染器 Props — 对齐 h(type, props, children)
 *
 * SparkPageRenderer 的输入本质是 PageConfig 四文件 + 运行时选项：
 *
 * | 四文件         | PageConfig 字段 | 渲染器视角                              |
 * |----------------|----------------|-----------------------------------------|
 * | rule.json      | config.rule    | → normalizeRuleChildren → **children**  |
 * | pagedata.json  | config.data    | → DataSet → sparkProvide(PAGE_DATASET)  |
 * | script.js      | config.script  | → compileFunctions → Render* 注册       |
 * | style.css      | config.css     | → setScopedCss（作用域隔离注入）         |
 *
 * 四文件来源二选一：pageConfig（直传）或 configLoader + pageId（异步加载）。
 */
export interface PageRendererProps {
  // ── 四文件来源（二选一） ──────────────────────────────────────────

  /** 配置加载器实例（与 pageId 搭配，异步加载四文件） */
  configLoader?: ConfigLoader
  /** 页面唯一标识符（优先级最高） */
  pageId?: string
  /** 页面配置对象（直接传入四文件，跳过加载） */
  pageConfig?: PageConfig

  // ── 功能开关 ─────────────────────────────────────────────────────

  /** 是否启用 CSS 作用域隔离 @default true */
  enableCssScope?: boolean
  /** 是否启用 DataSet 自动初始化 @default true */
  enableDataSet?: boolean

  // ── UI 服务注入（框架无关，可替换 ElementPlus 默认实现） ─────────

  /** UI 消息服务接口 */
  messageService?: {
    success: (msg: string) => void
    warning: (msg: string) => void
    error: (msg: string) => void
    info: (msg: string) => void
  }
  /** UI 确认对话框服务接口 */
  confirmService?: {
    confirm: (msg: string, title?: string) => Promise<unknown>
    alert: (msg: string, title?: string) => Promise<unknown>
    prompt?: (msg: string, title?: string) => Promise<string | null>
  }
  /** APP 层注入的页面服务扩展（弹层/文件能力等） */
  pageService?: Partial<IPageServiceCapability>

  // ── 外部上下文 ───────────────────────────────────────────────────

  /** 模块级上下文（导航系统提供，注入沙箱 $moduleContext） */
  moduleContext?: IModuleContext | null

  // ── 生命周期钩子 ─────────────────────────────────────────────────

  /** 页面加载前钩子（fetchConfig 之前） */
  beforeLoad?: (pageId: string) => void | Promise<void>
  /** 页面加载后钩子（applyConfig 之后） */
  afterLoad?: (config: PageConfig) => void | Promise<void>
  /** 错误处理函数 */
  onError?: (error: Error) => void
}



