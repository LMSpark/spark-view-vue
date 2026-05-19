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
 * 注：AppServicesCapability / PageServiceCapability 等依赖 LoggerApi 的类型定义
 * 放在 app-service-types.ts，避免在同一文件里既 import 又 declare module
 * '@spark-view/spark-utils'，防止循环模块增强问题。
 */

import { defineCapability } from '@spark-view/spark-utils'
import type { DataRow, DataSetContract, DataSource } from '@spark-view/spark-data'
import type {
  NavPermissionMode,
  PageServiceCapability,
  AppServicesCapability,
} from './app-service-types.js'

export type {
  NavPermissionMode,
  PageMessageType,
  PageDialogResult,
  PageSelectableValue,
  PageDialogOptions,
  PageBrowseFilesOptions,
  PageSelectedFile,
  PageUploadFilesOptions,
  PageUploadedFile,
  PageSelectorOption,
  PageSelectEntitiesOptions,
  PageSelectedEntity,
  PageServiceCapability,
  AppServicesCapability,
} from './app-service-types.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCallable(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function'
}

function hasCallable(record: Record<string, unknown>, key: string): boolean {
  return isCallable(record[key])
}

// ── 主题类型（spark-component 层自有定义，spark-app 用自己本地的副本） ──────

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'auto'

/** 主题服务能力接口（最小契约，不含 Vue 响应式） */
export interface ThemeCapability {
  readonly current: 'light' | 'dark'
  readonly mode: ThemeMode
  setMode(mode: ThemeMode): void
  readonly isDark: boolean
  toggle(): void
}

// ── 模块上下文能力 ────────────────────────────────────────────────────────

/** 模块列表项 */
export interface ModuleContextItem {
  id: string | number
  title: string
}

/** 当前模块上下文快照 */
export interface ModuleContext {
  selected: string | number | null
  items: readonly ModuleContextItem[]
  nodeId: string
}

/** MODULE_CONTEXT 能力接口 */
export interface ModuleContextCapability {
  getCurrent(): ModuleContext | null
  subscribe(handler: (next: ModuleContext | null, prev: ModuleContext | null) => void): () => void
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
    'spark:capability:page-dataset': DataSetContract
    'spark:capability:data-source': DataSource
    'spark:capability:data-row': DataRow
    'spark:capability:page-component-registry': PageComponentRegistry
    'spark:capability:module-context': ModuleContextCapability
    'spark:capability:css-scope': PageCssScopeCapability
    'spark:capability:app-services': AppServicesCapability
    'spark:capability:page-service': PageServiceCapability
    'spark:capability:permission-mode': NavPermissionMode
  }
}

function isDataSetContract(value: unknown): value is DataSetContract {
  if (!isRecord(value)) return false
  return typeof value['dataSetName'] === 'string'
    && isRecord(value['tables'])
    && hasCallable(value, 'getChildRelations')
    && hasCallable(value, 'getParentRelations')
    && hasCallable(value, 'getTableChildRelations')
    && hasCallable(value, 'getTableParentRelations')
    && hasCallable(value, 'addTable')
    && hasCallable(value, 'removeTable')
    && hasCallable(value, 'getTable')
    && hasCallable(value, 'getView')
    && hasCallable(value, 'saveChanges')
    && hasCallable(value, 'setAppServices')
    && hasCallable(value, 'setPageRoute')
    && hasCallable(value, 'getRequestTemplateParams')
    && hasCallable(value, 'toJson')
    && hasCallable(value, 'on')
    && hasCallable(value, 'onAnyViewChange')
    && hasCallable(value, 'triggerAutoLoad')
    && hasCallable(value, 'destroy')
}

function isDataSource(value: unknown): value is DataSource {
  return isRecord(value)
}

function isDataRow(value: unknown): value is DataRow {
  return isRecord(value)
}

function isModuleContextCapability(value: unknown): value is ModuleContextCapability {
  if (!isRecord(value)) return false
  return hasCallable(value, 'getCurrent') && hasCallable(value, 'subscribe')
}

function isPageComponentRegistry(value: unknown): value is PageComponentRegistry {
  if (!isRecord(value)) return false
  return hasCallable(value, 'registerInstance')
    && hasCallable(value, 'unregisterInstance')
    && hasCallable(value, 'listInstances')
    && hasCallable(value, 'getInstance')
    && hasCallable(value, 'registerApi')
    && hasCallable(value, 'unregisterApi')
    && hasCallable(value, 'listApis')
    && hasCallable(value, 'getApi')
    && hasCallable(value, 'getApisByType')
}

function isPageCssScopeCapability(value: unknown): value is PageCssScopeCapability {
  return isRecord(value) && hasCallable(value, 'inject')
}

function isAppServicesCapability(value: unknown): value is AppServicesCapability {
  return isRecord(value)
}

function isPageServiceCapability(value: unknown): value is PageServiceCapability {
  if (!isRecord(value)) return false
  return hasCallable(value, 'showMessage')
    && hasCallable(value, 'showConfirm')
    && hasCallable(value, 'showPrompt')
    && hasCallable(value, 'showAlert')
    && hasCallable(value, 'showDialog')
    && hasCallable(value, 'selectEntities')
    && hasCallable(value, 'browseFiles')
    && hasCallable(value, 'uploadFiles')
    && hasCallable(value, 'showLoading')
    && hasCallable(value, 'navigate')
}

function isNavPermissionMode(value: unknown): value is NavPermissionMode {
  return value === 'none' || value === 'masked' || value === 'invisible'
}

// ── 能力键 ────────────────────────────────────────────────────────────────

export const PAGE_DATASET = defineCapability<DataSetContract>('spark:capability:page-dataset', isDataSetContract)
export const DATA_SOURCE = defineCapability<DataSource>('spark:capability:data-source', isDataSource)
export const DATA_ROW = defineCapability<DataRow>('spark:capability:data-row', isDataRow)

export const MODULE_CONTEXT = defineCapability<ModuleContextCapability>('spark:capability:module-context', isModuleContextCapability)
export const PAGE_COMPONENT_REGISTRY = defineCapability<PageComponentRegistry>('spark:capability:page-component-registry', isPageComponentRegistry)
export const CSS_SCOPE = defineCapability<PageCssScopeCapability>('spark:capability:css-scope', isPageCssScopeCapability)

export const APP_SERVICES = defineCapability<AppServicesCapability>('spark:capability:app-services', isAppServicesCapability)
export const PAGE_SERVICE = defineCapability<PageServiceCapability>('spark:capability:page-service', isPageServiceCapability)
export const PAGE_PERMISSION_MODE = defineCapability<NavPermissionMode>('spark:capability:permission-mode', isNavPermissionMode)
