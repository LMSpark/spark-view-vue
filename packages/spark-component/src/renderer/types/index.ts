/**
 * 渲染器类型定义
 *
 * - BindRule: 框架无关的运行时规则类型（绑定管线 + SPARK 渲染线共用）
 * - Rule: FormCreate 官方类型（仅 FC 渲染线的 form-create 边界使用）
 * - FormCreateAPI: form-create API 精简接口
 * - PageContext / FCPageContext: 脚本沙箱上下文
 * - PageRendererOptions: FC 页面渲染器配置
 * - RuleBindingOptions: 规则绑定配置
 */

import type { h as VueH } from 'vue'
import type { IDataSet, SparkData } from '@spark-view/spark-data'
import type { ConfigLoader, PageConfig, IPageRoute, IFormAPI } from '@spark-view/spark-page-config'
import type { IPageServiceCapability, IModuleContext } from '@spark-view/spark-utils'
import type { ComponentRegistry } from '../../core/types.js'

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
 * FC 渲染器在 form-create 边界将 `BindRule[]` 向下转型为 {@link Rule}。
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

// ── FC 专用的 form-create 类型 ─────────────────────────────────────────────

// 导入 FormCreate 官方类型
import type { Rule as FormCreateRule } from '@form-create/element-ui'

/**
 * FC 渲染线专用规则类型（form-create 官方类型）
 *
 * 仅在 form-create 边界使用（FCPageRenderer 模板中 `:rule` prop 向下转型）。
 * 绑定管线（bindRules / bind-*-delegate）统一使用 {@link BindRule}。
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
 * 页面脚本运行时上下文（两条渲染线共享基础）。
 *
 * 不含 form-create 特有的 `$api` / `$rebindRules`，
 * SPARK 原生渲染线直接使用此类型，FC 渲染线通过 {@link FCPageContext} 扩展。
 */
export interface PageContext {
  $dataSet: IDataSet | null
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
 * FC 渲染器脚本上下文（含 form-create API）。
 *
 * 扩展 {@link PageContext}，追加 `$api`（form-create 实例）和
 * `$rebindRules`（触发 form-create 规则重建）。
 */
export interface FCPageContext extends PageContext {
  $api: IFormAPI | null
  $rebindRules: () => void
}

/**
 * 两条渲染线共享的页面渲染器 Props 基接口
 *
 * FC 渲染线通过 {@link FCPageRendererProps} 扩展（追加 formCreateOptions）。
 * SPARK 渲染线直接使用此接口（与 FC 共享完整加载流水线）。
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
 * FC 渲染线页面渲染器 Props（含 form-create 配置）
 *
 * 扩展 {@link PageRendererProps}，追加 `formCreateOptions`。
 *
 * @deprecated 请使用 {@link FCPageRendererProps}，`PageRendererOptions` 为旧名保留的别名。
 */
export interface FCPageRendererProps extends PageRendererProps {
  /** FormCreate 配置选项 */
  formCreateOptions?: Record<string, unknown>
}

/**
 * 向后兼容别名 — 原 FC 渲染线 Props 类型
 * @deprecated 使用 {@link FCPageRendererProps}
 */
export type PageRendererOptions = FCPageRendererProps

/**
 * Rule 绑定选项
 */
export interface RuleBindingOptions {
  rules: BindRule[]
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


