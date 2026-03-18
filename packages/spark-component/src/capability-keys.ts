/**
 * 能力键定义
 *
 * 能力系统属于 spark-component / spark-app 层；
 * spark-data 是纯数据层，不关心组件树或能力 DI。
 *
 * ── 数据能力链 ──
 *   PageRenderer
 *     provide(PAGE_DATASET, dataSet)      ← DataSet 实例（页面级）
 *       ↓
 *   容器组件（r-table / r-tree）
 *     consume(PAGE_DATASET)               ← 取 DataSet，解析 dataKey → DataView
 *     provide(DATA_SOURCE, dataView)      ← DataView 实例（组件级）
 *       ↓
 *   子组件（行 / 单元格）
 *     consume(DATA_SOURCE)                ← 取 DataView（IDataSource）
 *
 * ── Renderer 容器 → 字段能力链 ──
 *   容器组件（r-table / r-form / r-detail）
 *     provide(FIELD_CONTEXT, 'form')      ← 当前渲染上下文
 *     provide(CONTEXT_DATA, formModel)    ← 可写响应式数据对象
 *       ↓
 *   字段组件（r-text / r-number …）
 *     consume(FIELD_CONTEXT) ?? 'detail'
 *     consume(CONTEXT_DATA)  ?? {}
 */

import { defineCapability } from '@spark-view/spark-utils'
import type { IDataSet, IDataSource, IDataRow } from '@spark-view/spark-data'

/** 字段渲染上下文类型 */
export type FieldContext = 'table' | 'form' | 'detail' | 'tree' | 'list'

/**
 * r-table 对外暴露的稳定 API（包装层）
 *
 * 设计目标：
 * - 优先暴露 DataView 驱动能力，避免脚本层绑定具体 UI 组件实现
 * - 保留 getNativeTable 作为 escape hatch，满足少量命令式场景
 */
export interface RendererTableApi {
  getDataSource(): IDataSource | null
  getRows(): IDataRow[]
  getCurrentRow(): IDataRow | null
  getSelectedRows(): IDataRow[]
  refresh(): Promise<void>
  appendRow(row: IDataRow): void
  updateRowById(id: string | number, patch: Partial<IDataRow>): boolean
  deleteRowById(id: string | number): boolean
  setCurrentRow(row: IDataRow | null): void
  setCurrentRowById(id: string | number | null): boolean
  setSelectedRows(rows: IDataRow[]): void
  setSelectedRowsById(ids: Array<string | number>): number
  clearSelectedRows(): void
  clearUiSelection(): void
  toggleUiRowSelection(row: IDataRow, selected?: boolean): void
  doLayout(): void
  getNativeTable(): unknown
}

/** 页面内组件实例快照 */
export interface PageComponentInstanceEntry {
  id: string
  type: string
  props?: Record<string, unknown>
}

/** 页面内组件 API 条目 */
export interface PageComponentApiEntry {
  id: string
  type: string
  api: unknown
}

/** 页面级组件注册中心（实例 + API） */
export interface PageComponentRegistry {
  registerInstance(entry: PageComponentInstanceEntry): void
  unregisterInstance(id: string): void
  listInstances(type?: string): PageComponentInstanceEntry[]
  getInstance(id: string): PageComponentInstanceEntry | null

  registerApi(entry: PageComponentApiEntry): void
  unregisterApi(id: string): void
  listApis(type?: string): PageComponentApiEntry[]
  getApi<T = unknown>(id: string): T | null
  getApisByType<T = unknown>(type: string): T[]
}

// 将能力键合并到 CapabilityTypeMap，消费方按字符串名称即可得到精确类型，
// 无需 import 能力符号对象。
declare module '@spark-view/spark-utils' {
  interface CapabilityTypeMap {
    /** 页面级 DataSet（PageRenderer provide） */
    'spark:capability:page-dataset': IDataSet
    /** 组件级 DataView / IDataSource（容器组件 provide） */
    'spark:capability:data-source':  IDataSource
    /** 容器告知字段组件当前渲染上下文（table/form/detail/tree/list） */
    'app:field-context': FieldContext
    /** 容器向字段组件提供可写的响应式数据对象 */
    'app:context-data': Record<string, unknown>
    /** r-table 包装 API（稳定契约 + 底层实例 escape hatch） */
    'app:r-table-api': RendererTableApi
    /** 页面级组件注册中心（整页实例与组件 API） */
    'app:page-component-registry': PageComponentRegistry
  }
}

/**
 * 页面级 DataSet 能力键
 *
 * 由 PageRenderer 在 initDataSet 后 provide，
 * 容器组件通过 consume 获取后解析 dataKey → DataView。
 */
export const PAGE_DATASET = defineCapability<IDataSet>('spark:capability:page-dataset')

/**
 * 组件级数据视图能力键（DataView / IDataSource）
 *
 * 由容器组件在解析完 DataView 后 provide，
 * 子组件通过 consume 获取行数据、选中状态等。
 * 与已有的 CURRENT_ROW / SELECTION 能力配合使用。
 */
export const DATA_SOURCE = defineCapability<IDataSource>('spark:capability:data-source')

/**
 * 字段渲染上下文能力键
 * 容器组件 provide，字段组件 consume，决定字段的渲染形态
 */
export const FIELD_CONTEXT = defineCapability<FieldContext>('app:field-context')

/**
 * 字段数据上下文能力键
 * 容器组件 provide 响应式数据对象，字段组件 consume 后读写字段值
 */
export const CONTEXT_DATA = defineCapability<Record<string, unknown>>('app:context-data')

/**
 * r-table 包装 API 能力键
 *
 * 由 RendererTable provide，子组件可通过 consume 获取稳定 API。
 */
export const TABLE_API = defineCapability<RendererTableApi>('app:r-table-api')

/**
 * 页面级组件注册中心能力键
 *
 * 由渲染器根节点 provide；所有组件可向其登记实例与 API，
 * 供脚本层按 id/type 查询与批量访问。
 */
export const PAGE_COMPONENT_REGISTRY = defineCapability<PageComponentRegistry>('app:page-component-registry')
