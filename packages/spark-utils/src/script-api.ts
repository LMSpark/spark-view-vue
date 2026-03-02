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

// ==================== DataSet / DataView 脚本接口 ====================

/**
 * 数据行。键为字段名，值为任意类型。
 * 与 spark-data 中 `IDataRow` 结构完全对齐，但定义在 spark-utils 层，
 * 避免脚本层对 spark-data 产生包依赖。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IScriptDataRow = Record<string, any>

/**
 * DataView 事件映射——供脚本订阅 `view.events.on(...)` 时获得类型推断。
 *
 * 与 `DataViewEventMap`（spark-data 内部）结构完全对齐。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface IScriptDataViewEventMap extends Record<string, any[]> {
  /** 当前行变化 */
  currentRowChanged: [currentRow: IScriptDataRow | null, originatorId?: string]
  /** 选中行变化 */
  selectedRowsChanged: [selectedRows: IScriptDataRow[], originatorId?: string]
  /** 行数据批量变化（防抖 16ms） */
  rowsChanged: []
  /** 数据已清空 */
  cleared: []
  /** 请求状态变化（'idle' | 'loading' | 'loaded' | 'failed'） */
  requestStateChanged: [requestState: string]
  /** CRUD 变更中状态变化 */
  mutatingChanged: [mutating: boolean]
  /** summaryRow 已重算 */
  summaryChanged: []
  /** selectionSummaryRow 已重算 */
  selectionSummaryChanged: []
}

/**
 * DataView 脚本可用接口。
 *
 * 与 `DataView` 类（spark-data）暴露的公开 API 完全对齐，
 * 定义在 spark-utils 层，无包循环依赖，享受完整 IDE 补全。
 *
 * @example
 * ```js
 * // script.js
 * function __init__() {
 *   const view = $dataSet?.getView('Orders', 'default')
 *   if (!view) return
 *
 *   // 读取当前行
 *   const row = view.currentRow
 *
 *   // 替换所有行
 *   view.replaceRows([{ id: 1, name: '张三' }])
 *
 *   // 订阅行数据变化
 *   view.events.on('rowsChanged', () => {
 *     console.log('行数据已变化，当前数量：', view.rows.length)
 *   })
 *
 *   // 订阅当前行变化
 *   view.events.on('currentRowChanged', (row) => {
 *     console.log('当前行：', row)
 *   })
 * }
 * ```
 */
export interface IScriptDataView {
  // ── 标识 ──────────────────────────────────────────────────────────────
  /** 所属数据表名 */
  readonly tableName: string
  /** 视图 ID（默认为 `'default'`） */
  readonly viewId: string

  // ── 行数据（可直接读写，写操作推荐走对应方法以触发事件） ──────────────
  /** 当前视图的全量行数据 */
  rows: IScriptDataRow[]
  /** 当前聚焦行（null = 未选中） */
  readonly currentRow: IScriptDataRow | null
  /** 当前多选行集合 */
  readonly selectedRows: IScriptDataRow[]
  /** 全部行聚合汇总行（由 aggregates 配置驱动，自动维护） */
  readonly summaryRow: Readonly<IScriptDataRow>
  /** 选中行聚合汇总行（仅选中行的聚合，自动维护） */
  readonly selectionSummaryRow: Readonly<IScriptDataRow>

  // ── 分页 ──────────────────────────────────────────────────────────────
  /** 当前页码（1-based） */
  page: number
  /** 每页行数 */
  pageSize: number
  /** 总行数（服务端分页时表示全量总数） */
  total: number

  // ── 状态 ──────────────────────────────────────────────────────────────
  /**
   * 请求状态机：`'idle' | 'loading' | 'loaded' | 'failed'`。
   * 可通过 `events.on('requestStateChanged', state => ...)` 监听变化。
   */
  requestState: string
  /** CRUD 增删改批请求进行中（与 requestState 独立） */
  mutating: boolean

  // ── 事件总线 ──────────────────────────────────────────────────────────
  /** 视图事件总线，用于订阅行变化、选择变化等（见 IScriptDataViewEventMap） */
  events: IEventEmitterLike<IScriptDataViewEventMap>

  // ── 行 CRUD ───────────────────────────────────────────────────────────
  /** 替换全量行数据（触发 rowsChanged 事件，自动重算 summaryRow） */
  replaceRows(rows: IScriptDataRow[]): void
  /** 追加单行（触发 rowsChanged 事件，自动重算 summaryRow） */
  appendRow(row: IScriptDataRow): void
  /**
   * 按主键更新单行的部分字段。
   * @returns true=更新成功，false=指定 id 不存在
   */
  updateRowById(id: string | number, data: Partial<IScriptDataRow>): boolean
  /**
   * 按主键删除单行。
   * @returns true=删除成功，false=指定 id 不存在
   */
  deleteRowById(id: string | number): boolean

  // ── 选择操作 ──────────────────────────────────────────────────────────
  /** 设置当前行（传 null 清空当前行，触发 currentRowChanged 事件） */
  setCurrentRow(row: IScriptDataRow | null): void
  /** 设置多选行集合（触发 selectedRowsChanged 事件，自动重算 selectionSummaryRow） */
  setSelectedRows(rows: IScriptDataRow[]): void
  /** 清空选中行（等效于 setSelectedRows([])） */
  clearSelectedRows(): void

  // ── 计算列 ────────────────────────────────────────────────────────────
  /**
   * 注入计算列上下文（对应 `ctx.xxx` 表达式）。
   * `setComputedContext` 后自动重算所有计算列并触发 rowsChanged。
   *
   * @example view.setComputedContext({ taxRate: 0.13 })
   */
  setComputedContext(ctx: Record<string, unknown>): void
  /** 强制重算所有计算列（通常无需手动调用，行操作后自动触发） */
  recomputeColumns(): void

  // ── 分页操作（服务端分页）──────────────────────────────────────────────
  /** 跳转到指定页码（服务端分页时触发请求） */
  setPage(page: number): Promise<void>
  /** 更新每页行数（服务端分页时触发请求） */
  setPageSize(pageSize: number): Promise<void>
}

/**
 * 最小事件总线接口（IEventEmitter 的结构子集），
 * 供 `IScriptDataView.events` 字段使用，不引入 IEventEmitter 全部方法。
 *
 * 运行时注入的是完整 `IEventEmitter<DataViewEventMap>` 实例，
 * 结构类型兼容无需强转。
 */
export interface IEventEmitterLike<TMap extends Record<string, unknown[]>> {
  on<K extends string & keyof TMap>(event: K, handler: (...args: TMap[K]) => void): void
  off<K extends string & keyof TMap>(event: K, handler: (...args: TMap[K]) => void): void
}

/**
 * DataSet 脚本可用接口（框架无关，不依赖 @spark-view/spark-data 包）。
 *
 * 与 `IDataSet`（spark-data）公开 API 完全对齐，`getView()` 返回
 * `IScriptDataView`（完整视图接口），为脚本提供完善的 IDE 补全与类型安全。
 *
 * @example
 * ```js
 * // script.js
 * const view = $dataSet?.getView('Orders', 'default')
 * const rows = view?.rows                         // IScriptDataRow[]
 * await $dataSet?.getView('Orders')?.setPage(2)  // 翻页
 * ```
 */
export interface IDataSetLike {
  /** 数据集名称 */
  readonly dataSetName: string
  /**
   * 获取数据视图（DataView）。
   *
   * 视图提供行数据读写、选择操作、事件订阅等完整 API（见 `IScriptDataView`）。
   * @param tableName 数据表名
   * @param viewId    视图 ID（缺省 `'default'`）
   */
  getView(tableName: string, viewId?: string): IScriptDataView | undefined
  /**
   * 订阅 DataSet 级别的加载事件（覆盖所有已注册表的所有视图）。
   * @returns 取消订阅函数（组件卸载时调用）
   */
  on(
    event: 'loadSuccess' | 'loadError',
    handler: (payload: { tableName: string; viewId: string; error?: Error }) => void
  ): () => void
  /**
   * 订阅此 DataSet 内任意视图的状态变化。
   * @returns 取消订阅函数（组件卸载时调用）
   */
  onAnyViewChange(handlers: {
    currentRowChanged?: (tableName: string, viewId: string, currentRow: IScriptDataRow | null) => void
    selectedRowsChanged?: (tableName: string, viewId: string, selectedRows: IScriptDataRow[]) => void
    rowsChanged?: (tableName: string, viewId: string) => void
    cleared?: (tableName: string, viewId: string) => void
    requestStateChanged?: (tableName: string, viewId: string, state: string) => void
  }): () => void
  /** 触发所有 `autoLoad: true` 视图自动加载（渲染层已自动调用，脚本无需手动触发） */
  triggerAutoLoad(): void
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
 * - `$dataSet` — DataSet 实例（数据唯一入口，见 DataKey 规范）
 * - `$page` — UI 交互服务（消息 / 确认 / 导航）
 *
 * **渲染层附加（非核心契约，实现层注入）**：
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
 * // 访问数据
 * const view = $dataSet?.getView('Orders', 'default')
 * const rows = view?.rows               // IScriptDataRow[]
 * const current = view?.currentRow      // IScriptDataRow | null
 *
 * // 订阅事件
 * view?.events.on('rowsChanged', () => { console.log('数据已刷新') })
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
   * 页面级 DataSet 实例（数据唯一入口）。
   *
   * `getView(tableName, viewId?)` 返回 `IScriptDataView`，提供：
   * - `rows / currentRow / selectedRows / summaryRow / selectionSummaryRow`
   * - `replaceRows / appendRow / updateRowById / deleteRowById`
   * - `setCurrentRow / setSelectedRows / clearSelectedRows`
   * - `setPage / setPageSize`（服务端分页）
   * - `events.on('rowsChanged' | 'currentRowChanged' | ...)`
   *
   * @see IScriptDataView — 视图完整 API
   * @see IDataSetLike — DataSet 完整 API
   */
  $dataSet: IDataSetLike | null

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
