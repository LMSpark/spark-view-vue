/**
 * 能力系统 — 符号 + 接口 (一体化)
 *
 * 本文件定义了能力键（Symbol）及其类型接口，按功能分区组织：
 *
 * **功能分区**：
 * - 应用服务：应用级和页面级服务能力
 * - 数据访问：数据集、数据表、数据视图能力
 * - UI交互：用户界面交互能力
 * - 事件系统：组件间事件通信能力
 *
 * **核心理念**：
 * 能力是固定的抽象概念，可在任意合适的上下文层级中提供和消费。
 * 这里的组织方式按功能分区，便于查找和理解相关能力。
 *
 * 每个能力定义 = Symbol 常量 + 配套接口，放在同一位置方便查阅。
 *
 * **使用示例**：
 * ```ts
 * import { Cap } from '@spark-view/spark-utils'
 * provide(Cap.APP_SERVICES, { router, logger })
 * const svc = consume(Cap.APP_SERVICES)   // AppServicesCapability | null
 * ```
 */

// ==================== 基础类型和工具 ====================

/**
 * 带类型信息的能力键
 *
 * 通过 branded intersection 将泛型参数 T 编码到 symbol 类型中，
 * 使得 provide/consume 函数可以根据键自动推断实现类型。
 *
 * @template T 能力实现的接口类型
 */
export type CapabilityKey<T> = symbol & { readonly __capabilityType?: T }

/**
 * 定义一个类型安全的能力键
 *
 * @template T 能力实现的接口类型
 * @param name Symbol.for() 的全局注册名
 * @returns 带类型参数的 CapabilityKey<T>
 */
export function defineCapability<T>(name: string): CapabilityKey<T> {
  return Symbol.for(name) as CapabilityKey<T>
}

// ==================== 应用服务分区 ====================

/** APP Router 能力 */
export interface IAppRouterCapability {
  push(to: string | { path: string; query?: Record<string, unknown> }): Promise<void | unknown>
  replace(to: string | { path: string; query?: Record<string, unknown> }): Promise<void | unknown>
  back(): void
  currentRoute: unknown
}

/** APP Logger 能力 */
export interface IAppLoggerCapability {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/** 租户信息 */
export interface ITenantInfo {
  tenantId: string
  tenantName?: string
  [key: string]: unknown
}

/**
 * APP Services 能力（应用全局服务）
 * 由 PageRenderer / 应用根组件提供，整个组件树可消费
 */
export interface IAppServicesCapability {
  router?: IAppRouterCapability
  logger?: IAppLoggerCapability
  tenant?: ITenantInfo
  configLoader?: unknown
  authService?: unknown
}

/** APP 服务能力（router, logger, auth, configLoader, tenant） */
export const APP_SERVICES = defineCapability<IAppServicesCapability>('spark:capability:app-services')

/**
 * 页面服务能力（UI 交互服务）
 * 由 PageRenderer 提供，封装 ElMessage/ElMessageBox 等页面级 UI
 */
export interface IPageServiceCapability {
  showMessage(message: string, type?: 'success' | 'error' | 'warning' | 'info'): void
  showConfirm(message: string, title?: string): Promise<boolean>
  showLoading(show: boolean): void
  navigate(path: string, params?: Record<string, unknown>): void
}

/** 页面服务能力（showMessage, showConfirm, showLoading, navigate） */
export const PAGE_SERVICE = defineCapability<IPageServiceCapability>('spark:capability:page-service')

// ==================== 数据访问分区 ====================

/** DataSet 基础类型（避免循环依赖，使用结构化类型） */
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

/** DataSet 能力（暴露 DataSet 实例） */
export interface IDataSetCapability {
  dataSet: IDataSetLike
}

/** DataSet 能力 */
export const DATA_SET = defineCapability<IDataSetCapability>('spark:capability:dataset')

/** DataTable 能力（管理列、视图、通用 CRUD API） */
export interface IDataTableCapability {
  dataTable: IDataTableLike
}

/** DataTable 能力 */
export const DATA_TABLE = defineCapability<IDataTableCapability>('spark:capability:datatable')

/** DataView 基础类型 */
export interface IDataViewLike {
  tableName: string
  rows: unknown[]
  currentRow: unknown | null
  currentRowIndex: number | null
  selectedRows: unknown[]
  [key: string]: unknown
}

/** DataView 能力（过滤/排序/分页视图） */
export interface IDataViewCapability {
  dataView: IDataViewLike
}

/** DataView 能力 */
export const DATA_VIEW = defineCapability<IDataViewCapability>('spark:capability:dataview')

// ==================== UI交互分区 ====================

/** 当前行能力 */
export interface ICurrentRowCapability {
  getRow(): unknown | null
  getIndex(): number | null
  setRow(row: unknown | null): void
}

/** 当前行能力 */
export const CURRENT_ROW = defineCapability<ICurrentRowCapability>('spark:capability:current-row')

/** 选择能力（行选择、多选等） */
export interface ISelectionCapability {
  select(id: number | string): void
  deselect(id: number | string): void
  isSelected(id: number | string): boolean
  selectAll?(): void
  clearSelection(): void
  getSelected(): (number | string)[]
}

/** 选择行能力 */
export const SELECTION = defineCapability<ISelectionCapability>('spark:capability:selection')

/** 行数据能力（单行数据访问） */
export interface IRowDataCapability {
  getData(): unknown
  getField(field: string): unknown
  isSelected?(): boolean
}

/** 行数据能力 */
export const ROW_DATA = defineCapability<IRowDataCapability>('spark:capability:row-data')

// ==================== 事件系统分区 ====================

import type { IEventEmitter } from './types.js'

/** 事件能力基础接口（= IEventEmitter） */
export type IEventsCapability = IEventEmitter

/** 表级事件能力 */
export type IGridEventsCapability = IEventEmitter

/** 表级事件能力 */
export const GRID_EVENTS = defineCapability<IGridEventsCapability>('spark:capability:grid-events')

/** 行级事件能力 */
export type IRowEventsCapability = IEventEmitter

/** 行级事件能力 */
export const ROW_EVENTS = defineCapability<IRowEventsCapability>('spark:capability:row-events')
