/**
 * SPARK Business Script API — 业务脚本 API 权威定义
 * =====================================================
 *
 * 此文件是 `script.js` 业务脚本 **唯一**的 API 契约来源。
 *
 * 设计原则：
 * - ✅ 与前端框架完全无关：无 Vue / Element Plus / FormCreate / Vue Router 依赖
 * - ✅ 可独立测试：不依赖任何渲染层或 DOM 框架
 * - ✅ 稳定边界：变更此文件需同步更新脚本文档
 *
 * 注意：
 * - `IPageServiceCapability`（$page）定义在 `capability/symbols.ts`，因其同时是能力系统的一部分
 * - `SparkData` 命名空间 和 `h` 函数（Vue 渲染函数）是渲染层附加注入，不属于核心契约
 *
 * @module script-api
 */

// ==================== 路由快照 ====================

/**
 * 框架无关的路由信息快照。
 *
 * 替代 Vue Router 的 `RouteLocationNormalizedLoaded`，业务脚本通过 `$route` 访问，
 * 无 Vue Router 依赖。
 *
 * @example
 * ```js
 * // script.js
 * const orderId = $route.params.id
 * const tab = $route.query.tab
 * ```
 */
export interface IPageRoute {
  /** 当前路径，如 `/users/123` */
  path: string
  /** 含 search/hash 的完整 URL，如 `/users/123?tab=info#detail` */
  fullPath: string
  /** 路由名称（若有） */
  name: string | null | symbol
  /** 路径参数，如 `{ id: '123' }` */
  params: Record<string, string | string[]>
  /** Query 参数，如 `{ tab: 'info' }` */
  query: Record<string, string | string[] | null>
  /** Hash 片段，如 `#detail` */
  hash: string
}

// ==================== 表单操作 API ====================

/**
 * 框架无关的表单操作接口。
 *
 * 替代直接使用 FormCreate API，业务脚本通过 `$api` 访问，
 * 无 FormCreate 库依赖。
 *
 * @example
 * ```js
 * // script.js
 * $api?.setValue('name', '张三')
 * $api?.hidden(true, ['password', 'confirm'])
 * ```
 */
export interface IFormAPI {
  /** 读取单个字段值 */
  getValue(field: string): unknown
  /** 设置字段值（单字段或批量） */
  setValue(field: string | Record<string, unknown>, value?: unknown): void
  /** 获取全部表单数据 */
  formData(): Record<string, unknown>
  /** 校验表单，结果通过回调返回 */
  validate(callback: (valid: boolean) => void): void
  /** 重置字段值到初始状态 */
  resetFields(fields?: string | string[]): void
  /** 清除验证状态 */
  clearValidateState(fields?: string | string[]): void
  /** 启用/禁用字段 */
  disabled(disabled: boolean, field?: string | string[]): void
  /** 显示/隐藏字段 */
  hidden(hidden: boolean, field?: string | string[]): void
  /** 更新字段规则/属性（如 `{ props: { placeholder: '...' } }`） */
  updateRule(field: string, rule: Record<string, unknown>): void
  /** 获取字段 DOM 元素（仅限渲染函数场景） */
  el(id: string): unknown
  /** 监听表单事件 */
  on(event: string, callback: (...args: unknown[]) => void): void
}

// ==================== 脚本沙箱上下文（核心契约）====================

/**
 * 业务脚本沙箱上下文 — 完整 API 契约。
 *
 * 此接口是 `script.js` 可访问的所有变量的类型声明。
 * 脚本在 `with (__ctx)` 沙箱内执行，所有变量均通过此接口注入。
 *
 * **稳定 API（核心框架契约）**：
 * - `$api` — 表单操作（可为 null，非表单页面时）
 * - `$route` — 路由快照（只读，不依赖 Vue Router）
 * - `$el` — 当前页面容器元素
 * - `$query` / `$queryAll` — DOM 查询（谨慎使用）
 * - `$rebindRules` — 触发 form-create 重建规则
 * - `$refreshData` — 刷新数据（可选指定表名）
 * - `$page` — UI 交互服务（消息 / 确认 / 导航）
 *
 * **渲染层附加（非核心契约，实现层注入）**：
 * - `$dataSet` — DataSet 实例（由渲染层以具体类型注入，不在此契约层定义）
 * - `SparkData` — SPARK 数据工具命名空间（在 IScriptContext 外单独注入）
 * - `h` — Vue 渲染函数（仅供 Render* 渲染函数，非业务逻辑）
 *
 * @example
 * ```js
 * // script.js（沙箱内所有变量直接可用，无需 this.xxx）
 *
 * // 操作表单
 * $api?.setValue('name', '张三')
 *
 * // 读取路由参数
 * const id = $route.params.id
 *
 * // UI 交互（框架无关）
 * await $page.showConfirm('是否确认提交？')
 * $page.showMessage('保存成功', 'success')
 * $page.navigate('/orders')
 * ```
 */
export interface IScriptContext {
  /**
   * 表单操作 API（底层 FormCreate 实现，script.js 仅见此接口）。
   * 非表单页面或 form-create 尚未初始化时为 `null`。
   */
  $api: IFormAPI | null

  /**
   * 当前路由快照（底层 Vue Router 实现，只读，framework-agnostic）。
   * 通过代理实时反映当前路由，但接口类型不依赖 Vue Router。
   */
  $route: IPageRoute

  /** 当前页面容器 DOM 元素（可用于 focus、scroll 等操作） */
  $el: () => HTMLElement | null

  /** 通过 CSS 选择器查询页面内单个元素 */
  $query: (selector: string) => HTMLElement | null

  /** 通过 CSS 选择器查询页面内所有匹配元素 */
  $queryAll: (selector: string) => NodeListOf<Element>

  /**
   * 触发 form-create 重建规则（谨慎调用，会重置展开状态等 UI 临时状态）。
   * 仅当 `_pageState` 中的值改变且渲染函数需要读取新值时才调用。
   * DataView 驱动的数据变更（`view.replaceRows` 等）无需调用此方法。
   */
  $rebindRules: () => void

  /**
   * 刷新数据——重新触发 DataTable 的加载接口。
   * @param key 可选表名；省略则刷新所有 `autoLoad: true` 的视图
   */
  $refreshData: (key?: string) => Promise<void>

  /**
   * UI 交互服务（框架无关，替代 ElMessage / ElMessageBox）。
   *
   * ✅ 推荐：所有消息提示、确认框、输入框、导航均通过此接口调用。
   *
   * 注意：此接口类型声明为 `unknown`（使用导入类型时改为具体类型）；
   * 实际运行时注入 `IPageServiceCapability` 实现。
   * 为保持此文件对 capability 系统无依赖，此处使用结构等价的内联类型。
   */
  $page: IPageServiceInScript
}

/**
 * `$page` 的内联类型（结构与 `IPageServiceCapability` 完全等价）。
 *
 * 定义在此文件内，避免 `script-api.ts` 对 `capability/symbols.ts` 产生导入依赖。
 * 渲染层以 `IPageServiceCapability` 作为实现类型；两者通过结构化类型兼容。
 */
export interface IPageServiceInScript {
  /** 消息提示（替代 ElMessage） */
  showMessage(message: string, type?: 'success' | 'error' | 'warning' | 'info'): void
  /** 确认框，返回 true=确定 / false=取消（替代 ElMessageBox.confirm） */
  showConfirm(
    message: string,
    title?: string,
    options?: { confirmText?: string; cancelText?: string; type?: 'warning' | 'info' | 'error' | 'success' }
  ): Promise<boolean>
  /** 输入框，返回输入值；取消返回 null（替代 ElMessageBox.prompt） */
  showPrompt(
    message: string,
    title?: string,
    options?: { placeholder?: string; defaultValue?: string }
  ): Promise<string | null>
  /** 纯提示框，仅确定按钮（替代 ElMessageBox.alert） */
  showAlert(
    message: string,
    title?: string,
    options?: { type?: 'warning' | 'info' | 'error' | 'success' }
  ): Promise<void>
  /** 全局加载遮罩 */
  showLoading(show: boolean, text?: string): void
  /** 路由导航 */
  navigate(path: string, params?: Record<string, unknown>): void
}
