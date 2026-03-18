/**
 * SPARK 页面沙箱上下文类型
 * =====================================================
 *
 * ## 设计意图：跨前端框架的业务脚本层
 *
 * `script.js` 沙箱的核心目标是**让业务逻辑与具体前端框架解耦**：
 * - 业务脚本只能看到此文件定义的**框架无关抽象接口**（`$page / $route / $dataSet`）
 * - 底层实现（Vue Router / Element Plus）由**渲染层**注入，脚本不感知
 * - 同一份 `script.js` 理论上可在任何实现了 `IScriptContext` 的渲染层上运行
 *
 * 这是 `$page` 替代 `ElMessage`、`$route` 替代 Vue Router 的根本原因——**接口是契约，实现可替换**。
 *
 * ## 约束
 * - ✅ 与前端框架完全无关：无 Vue / Element Plus / Vue Router 依赖
 * - ✅ 可独立测试：不依赖任何渲染层或 DOM 框架
 * - ✅ 稳定边界：变更此文件需同步更新脚本文档
 *
 * ⚠️ **禁止将此文件改名为 `script-api.ts`**（见 copilot-instructions 规划节）
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

// ==================== 脚本沙箱上下文（核心契约）====================

/**
 * 业务脚本沙箱上下文 — 完整 API 契约。
 *
 * 此接口是 `script.js` 可访问的所有变量的类型声明。
 * 脚本在 `with (__ctx)` 沙箱内执行，所有变量均通过此接口注入。
 *
 * **稳定 API（核心框架契约）**：
 * - `$route` — 路由快照（只读，不依赖 Vue Router）
 * - `$el` — 当前页面容器元素
 * - `$query` / `$queryAll` — DOM 查询（谨慎使用）
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
   * 页面级组件访问 API。
   *
   * 可用于按组件 id / type 获取实例快照与容器组件暴露的包装 API。
   */
  $components: IPageComponentAccessInScript

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

  /**
   * 脚本日志接口（已桥接到框架 Logger 传输链）。
   *
   * 在 script.js 中调用 `console.log/info/warn/error/debug`，
   * 会同时进入浏览器控制台与统一日志采集（AI 面板可见）。
   */
  console: Pick<Console, 'log' | 'info' | 'warn' | 'error' | 'debug'>

  /**
   * 模块级上下文（导航系统注入，当前模块无上下文时为 `null`）。
   *
   * 提供当前模块选择器的选中值和可选项，脚本可据此实现按项目/租户/环境加载数据等逻辑。
   *
   * @example
   * ```js
   * // script.js
   * const projectId = $moduleContext?.selected
   * if (projectId) {
   *   view?.loadFromServer({ projectId })
   * }
   * ```
   */
  $moduleContext: IModuleContextInScript | null
}

/**
 * `$page` 的内联类型（结构与 `IPageServiceCapability` 完全等价）。
 *
 * 定义在此文件内，避免对 `capability/index.ts` 产生导入依赖。
 * 渲染层以 `IPageServiceCapability` 作为实现类型；两者通过结构化类型兼容。
 */
export interface IPageServiceInScript {
  /** 通用弹层（APP 层承载，页面层通过 service 调用） */
  showDialog(options: IPageDialogOptionsInScript): Promise<PageDialogResultInScript>
  /** 打开通用实体选择器（APP 层承载，可用于选人/选部门/选商品等） */
  selectEntities(options: IPageSelectEntitiesOptionsInScript): Promise<IPageSelectedEntityInScript[]>
  /** 打开文件浏览选择器（APP 层承载） */
  browseFiles(options?: IPageBrowseFilesOptionsInScript): Promise<IPageSelectedFileInScript[]>
  /** 选择文件并上传（APP 层承载） */
  uploadFiles(options: IPageUploadFilesOptionsInScript): Promise<IPageUploadedFileInScript[]>
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

/** 页面内组件实例快照（脚本可读） */
export interface IPageComponentInstanceInScript {
  id: string
  type: string
  props?: Record<string, unknown>
}

/** 页面级组件访问 API（脚本可用） */
export interface IPageComponentAccessInScript {
  /** 按组件 id 获取实例快照（推荐） */
  get(id: string): IPageComponentInstanceInScript | null
  /** 按组件 id 获取组件 API（推荐） */
  getApi<T = unknown>(id: string): T | null
  /** 列出页面组件实例（可按 type 过滤） */
  list(type?: string): IPageComponentInstanceInScript[]
  /** 列出组件 API（可按 type 过滤） */
  getApis<T = unknown>(type?: string): T[]

  /** @deprecated 使用 get(id) */
  getInstance(id: string): IPageComponentInstanceInScript | null
  /** @deprecated 使用 list(type?) */
  listInstances(type?: string): IPageComponentInstanceInScript[]
}

export type PageDialogResultInScript = 'confirm' | 'cancel' | 'close'

export interface IPageDialogOptionsInScript {
  title?: string
  message?: string
  content?: string
  confirmText?: string
  cancelText?: string
  showCancelButton?: boolean
  dangerouslyUseHTMLString?: boolean
  type?: 'success' | 'error' | 'warning' | 'info'
  width?: string
}

export type PageSelectableValueInScript = string | number | boolean

export interface IPageSelectorOptionInScript {
  label: string
  value: PageSelectableValueInScript
  description?: string
  disabled?: boolean
  raw?: unknown
}

export interface IPageSelectEntitiesOptionsInScript {
  title?: string
  entityName?: string
  placeholder?: string
  multiple?: boolean
  searchable?: boolean
  confirmText?: string
  cancelText?: string
  emptyText?: string
  currentValue?: PageSelectableValueInScript | PageSelectableValueInScript[] | string
  options?: IPageSelectorOptionInScript[]
}

export interface IPageSelectedEntityInScript extends IPageSelectorOptionInScript {}

export interface IPageBrowseFilesOptionsInScript {
  title?: string
  accept?: string
  multiple?: boolean
  currentValue?: string
}

export interface IPageSelectedFileInScript {
  name: string
  size: number
  type: string
  lastModified: number
  file: File
}

export interface IPageUploadFilesOptionsInScript extends IPageBrowseFilesOptionsInScript {
  action: string
  method?: 'POST' | 'PUT' | 'PATCH'
  fieldName?: string
  headers?: Record<string, string>
  data?: Record<string, string | Blob>
  withCredentials?: boolean
  files?: File[]
}

export interface IPageUploadedFileInScript extends IPageSelectedFileInScript {
  response: unknown
  url?: string
}

// ==================== 模块上下文（内联类型）====================

/** 模块上下文选项（结构与 `IModuleContextItem` 等价） */
export interface IModuleContextItemInScript {
  id: string | number
  title: string
}

/**
 * `$moduleContext` 的内联类型（结构与 `IModuleContext` 完全等价）。
 *
 * 定义在此文件内，避免对 `capability/index.ts` 产生导入依赖。
 * 渲染层以 `IModuleContext` 作为实现类型；两者通过结构化类型兼容。
 */
export interface IModuleContextInScript {
  /** 当前选中值 */
  selected: string | number | null
  /** 可选项列表 */
  items: readonly IModuleContextItemInScript[]
  /** 上下文所属导航节点 ID */
  nodeId: string
}
