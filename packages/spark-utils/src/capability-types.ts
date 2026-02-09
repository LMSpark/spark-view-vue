/**
 * 能力系统 - 集中接口定义
 *
 * 所有 SPARK 能力的 TypeScript 接口集中定义在此，
 * 与 capability-symbols.ts 中的 Symbol 常量配对使用。
 *
 * 使用方式：
 * ```ts
 * import { APP_SERVICES } from '@spark-view/spark-utils'
 * import type { AppServicesCapability } from '@spark-view/spark-utils'
 *
 * provide(APP_SERVICES, { router, logger })
 * const svc = consume(APP_SERVICES) // 类型自动推断为 AppServicesCapability | null
 * ```
 */

// ============================================================================
// 应用层能力接口
// ============================================================================

/**
 * APP Router 能力
 */
export interface AppRouterCapability {
  /** 导航到新路由 */
  push(to: string | { path: string; query?: Record<string, unknown> }): Promise<void | unknown>
  /** 替换当前路由 */
  replace(to: string | { path: string; query?: Record<string, unknown> }): Promise<void | unknown>
  /** 返回上一页 */
  back(): void
  /** 当前路由 */
  currentRoute: unknown
}

/**
 * APP Logger 能力
 */
export interface AppLoggerCapability {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/**
 * APP Services 能力（路由、日志等）
 * 由页面层（PageRenderer）提供，组件消费
 */
export interface AppServicesCapability {
  router?: AppRouterCapability
  logger?: AppLoggerCapability
  configLoader?: unknown
  authService?: unknown
}

// ============================================================================
// 数据层能力接口
// ============================================================================

/**
 * 数据源能力（提供原始数据）
 */
export interface DataSourceCapability {
  /** 获取数据 */
  getData(): unknown[] | unknown
  /** 刷新数据 */
  refresh?(): void | Promise<void>
}

/**
 * DataSet 基础类型（避免循环依赖，使用结构化类型）
 */
export interface IDataSetLike {
  dataSetName: string
  tables: Record<string, IDataTableLike>
  [key: string]: unknown
}

export interface IDataTableLike {
  tableName: string
  columns: unknown[]
  rows: unknown[]
  [key: string]: unknown
}

/**
 * DataSet 状态能力（DataSet 数据和表访问）
 */
export interface DataSetStateCapability {
  /** 获取 DataSet 实例 */
  getDataSet(): IDataSetLike
  /** 获取指定表 */
  getTable(name: string): IDataTableLike | undefined
  /** 获取页面参数 */
  getPageParams(): Record<string, unknown>
  /** 获取页面权限 */
  getPagePermission(): Record<string, boolean>
  /** 监听表变化 */
  onTableChange(tableName: string, callback: (table: IDataTableLike) => void): () => void
}

/**
 * 全局数据能力（用户信息、字典等）
 */
export interface GlobalDataCapability {
  /** 获取用户信息 */
  getUserInfo(): { id: string; name: string; roles: string[] }
  /** 获取全局配置 */
  getConfig(key: string): unknown
  /** 获取字典数据 */
  getDictionary(type: string): Array<{ label: string; value: unknown }>
}

/**
 * 页面服务能力（消息、导航等）
 */
export interface PageServiceCapability {
  /** 显示消息 */
  showMessage(message: string, type: 'success' | 'error' | 'warning'): void
  /** 显示确认对话框 */
  showConfirm(message: string): Promise<boolean>
  /** 显示/隐藏加载状态 */
  showLoading(show: boolean): void
  /** 页面导航 */
  navigate(path: string, params?: Record<string, unknown>): void
}

/**
 * API 客户端能力
 */
export interface ApiClientCapability {
  /** 发起请求 */
  request<T = unknown>(config: {
    url: string
    method?: string
    params?: Record<string, unknown>
    data?: unknown
  }): Promise<T>
}

/**
 * 字段元数据能力（字段标签、类型、图标等）
 */
export interface FieldMetadataCapability {
  /** 字段元数据映射 */
  [field: string]: {
    label: string
    icon?: string
    type?: string
    [key: string]: unknown
  }
}

/**
 * 行数据能力（单行数据访问）
 */
export interface RowDataCapability {
  /** 获取完整数据 */
  getData(): unknown
  /** 获取指定字段值 */
  getField(field: string): unknown
  /** 检查行是否选中 */
  isSelected?(): boolean
}

// ============================================================================
// 交互层能力接口
// ============================================================================

/**
 * 选择能力（行选择、多选等）
 */
export interface SelectionCapability {
  /** 选中指定 ID */
  select(id: number | string): void
  /** 取消选中指定 ID */
  deselect(id: number | string): void
  /** 检查是否选中 */
  isSelected(id: number | string): boolean
  /** 全选 */
  selectAll?(): void
  /** 清空选择 */
  clearSelection(): void
  /** 获取所有选中的 ID */
  getSelected(): (number | string)[]
}

/**
 * 验证能力（数据验证）
 */
export interface ValidationCapability {
  /** 验证指定字段 */
  validate(field?: string): boolean | Promise<boolean>
  /** 获取错误消息 */
  getErrors(): Record<string, string[]>
  /** 清除错误 */
  clearErrors(field?: string): void
}

// ============================================================================
// 事件层能力接口
// ============================================================================

/**
 * 事件能力基础接口
 */
export interface EventsCapability {
  /** 监听事件 */
  on(event: string, handler: (...args: unknown[]) => void): void
  /** 取消监听 */
  off(event: string, handler: (...args: unknown[]) => void): void
  /** 触发事件 */
  emit?(event: string, ...args: unknown[]): void
}

/**
 * Grid 事件能力（表格级事件）
 */
export type GridEventsCapability = EventsCapability

/**
 * 行事件能力（行级事件）
 */
export type RowEventsCapability = EventsCapability

// ============================================================================
// EJ2 Grid 特有能力接口
// ============================================================================

/**
 * Grid 实例能力
 */
export interface GridInstanceCapability {
  /** EJ2 Grid 实例 */
  instance: unknown
}

/**
 * 列管理器能力
 */
export interface ColumnManagerCapability {
  /** 添加列 */
  addColumn(column: Record<string, unknown>): void
  /** 删除列 */
  removeColumn(field: string): void
  /** 获取所有列配置 */
  getColumns(): unknown[]
}

/**
 * 列配置能力
 */
export interface ColumnConfigCapability {
  /** 添加子列 */
  addChildColumn(): void
  /** 移除子列 */
  removeChildColumn(): void
}
