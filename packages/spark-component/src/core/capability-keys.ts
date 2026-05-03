/**
 * spark-component 能力键定义。
 *
 * ## 三类键：
 * 1. 数据层键（依赖 @spark-view/spark-data 类型）：PAGE_DATASET / DATA_SOURCE / DATA_ROW
 * 2. 渲染层键（原在 spark-utils 中但属于 spark-component 语义）：
 *    MODULE_CONTEXT / PAGE_COMPONENT_REGISTRY / CSS_SCOPE
 * 3. 应用服务与权限键（从 spark-utils 迁入）：
 *    APP_SERVICES / PAGE_SERVICE / PAGE_PERMISSION_MODE / NavPermissionMode
 *
 * 注：IAppServicesCapability / IPageServiceCapability 等依赖 LoggerApi 的类型定义
 * 放在 app-service-types.ts，避免在同一文件里既 import 又 declare module
 * '@spark-view/spark-utils'，防止循环模块增强问题。
 */

import { defineCapability } from '@spark-view/spark-utils'
import type { IDataRow, IDataSet, IDataSource } from '@spark-view/spark-data'
import type {
  NavPermissionMode,
  IPageServiceCapability,
  IAppServicesCapability,
} from './app-service-types.js'

export type {
  NavPermissionMode,
  PageMessageType,
  PageDialogResult,
  PageSelectableValue,
  IPageDialogOptions,
  IPageBrowseFilesOptions,
  IPageSelectedFile,
  IPageUploadFilesOptions,
  IPageUploadedFile,
  IPageSelectorOption,
  IPageSelectEntitiesOptions,
  IPageSelectedEntity,
  IPageServiceCapability,
  IAppServicesCapability,
} from './app-service-types.js'

// ── 主题类型（spark-component 层自有定义，spark-app 用自己本地的副本） ──────

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'auto'

/** 主题服务能力接口（最小契约，不含 Vue 响应式） */
export interface IThemeCapability {
  readonly current: 'light' | 'dark'
  readonly mode: ThemeMode
  setMode(mode: ThemeMode): void
  readonly isDark: boolean
  toggle(): void
}

// ── 模块上下文能力 ────────────────────────────────────────────────────────

/** 模块列表项 */
export interface IModuleContextItem {
  id: string | number
  title: string
}

/** 当前模块上下文快照 */
export interface IModuleContext {
  selected: string | number | null
  items: readonly IModuleContextItem[]
  nodeId: string
}

/** MODULE_CONTEXT 能力接口 */
export interface ModuleContextCapability {
  getCurrent(): IModuleContext | null
  subscribe(handler: (next: IModuleContext | null, prev: IModuleContext | null) => void): () => void
}

// ── 页面组件注册表能力 ─────────────────────────────────────────────────────

export interface PageComponentInstanceEntry {
  id: string
  type: string
  props?: Record<string, unknown>
}

export interface PageComponentApiEntry {
  id: string
  type: string
  api: unknown
}

/** 页面内组件实例/API 注册表能力接口 */
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

// ── CSS 作用域注入能力 ─────────────────────────────────────────────────────

/** 页面作用域 CSS 注入能力（由 SparkPageRenderer 提供） */
export interface PageCssScopeCapability {
  inject(css: string): void
}

// ── CapabilityTypeMap 扩展（数据层键 + 渲染层键 + 应用服务键） ────────────

declare module '@spark-view/spark-utils' {
  interface CapabilityTypeMap {
    'spark:capability:page-dataset': IDataSet
    'spark:capability:data-source': IDataSource
    'spark:capability:data-row': IDataRow
    'spark:capability:page-component-registry': PageComponentRegistry
    'spark:capability:module-context': ModuleContextCapability
    'spark:capability:css-scope': PageCssScopeCapability
    'spark:capability:app-services': IAppServicesCapability
    'spark:capability:page-service': IPageServiceCapability
    'spark:capability:permission-mode': NavPermissionMode
  }
}

// ── 能力键 ────────────────────────────────────────────────────────────────

export const PAGE_DATASET = defineCapability<IDataSet>('spark:capability:page-dataset')
export const DATA_SOURCE = defineCapability<IDataSource>('spark:capability:data-source')
export const DATA_ROW = defineCapability<IDataRow>('spark:capability:data-row')

export const MODULE_CONTEXT = defineCapability<ModuleContextCapability>('spark:capability:module-context')
export const PAGE_COMPONENT_REGISTRY = defineCapability<PageComponentRegistry>('spark:capability:page-component-registry')
export const CSS_SCOPE = defineCapability<PageCssScopeCapability>('spark:capability:css-scope')

export const APP_SERVICES = defineCapability<IAppServicesCapability>('spark:capability:app-services')
export const PAGE_SERVICE = defineCapability<IPageServiceCapability>('spark:capability:page-service')
export const PAGE_PERMISSION_MODE = defineCapability<NavPermissionMode>('spark:capability:permission-mode')
