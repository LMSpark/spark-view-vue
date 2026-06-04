/**
 * spark-component 能力键定义。
 *
 * ## 三类键：
 * 1. 数据层键（依赖 @spark-appworks/spark-data 类型）：PAGE_DATASET / DATA_SOURCE / DATA_ROW
 * 2. 渲染层键（原在 spark-utils 中但属于 spark-component 语义）：
 *    MODULE_CONTEXT / PAGE_COMPONENT_REGISTRY / CSS_SCOPE
 * 3. 页面 UI 服务与权限键（从 spark-utils 迁入）：
 *    PAGE_SERVICE / PAGE_PERMISSION_MODE / NavPermissionMode
 * 4. 字段渲染局部策略：
 *    SUBTREE_FIELD_POLICY
 *
 * 注：PageServiceCapability 等运行时服务契约以
 * @spark-appworks/spark-component/runtime 为 SSOT。
 */

import { defineCapability, isCallable, isRecord } from '@spark-appworks/spark-utils'
import { DataView, isDataRow, type DataRow, type DataSetContract } from '@spark-appworks/spark-data'
import type {
  NavPermissionMode,
} from '@spark-appworks/spark-project-model'
import type {
  PageServiceCapability,
} from '../runtime'

export type {
  NavPermissionMode,
} from '@spark-appworks/spark-project-model'

/** 子树级字段输入策略 — 仅描述子树内字段输入行为，不改变全局 permissionMode。 */
export type SubtreeFieldPolicy = 'unrestricted'

export type {
  PageMessageType,
  PageDialogResult,
  PageDialogOptions,
  PageBrowseFilesOptions,
  PageSelectedFile,
  PageUploadFilesOptions,
  PageUploadedFile,
  PageSelectorOption,
  PageSelectEntitiesOptions,
  PageSelectedEntity,
  PageServiceCapability,
} from '../runtime'

function hasCallable(record: Record<string, unknown>, key: string): boolean {
  return isCallable(record[key])
}

// ── 主题类型（spark-component 为 SSOT；spark-app 通过 extends 扩展）──────

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'auto'

/** 主题服务能力接口（最小契约，不含 Vue 响应式） */
export type ThemeCapability = {
  readonly current: 'light' | 'dark'
  readonly mode: ThemeMode
  setMode(mode: ThemeMode): void
  readonly isDark: boolean
  toggle(): void}

// ── 模块上下文能力 ────────────────────────────────────────────────────────

/** 模块列表项 */
export type ModuleContextItem = {
  id: string | number
  title: string}

/** 当前模块上下文快照 */
export type ModuleContext = {
  selected: string | number | null
  items: readonly ModuleContextItem[]
  nodeId: string}

/** MODULE_CONTEXT 能力接口 */
export type ModuleContextCapability = {
  getCurrent(): ModuleContext | null
  subscribe(handler: (next: ModuleContext | null, prev: ModuleContext | null) => void): () => void}

// ── 页面组件注册表能力 ─────────────────────────────────────────────────────

export type PageComponentInstanceEntry = {
  id: string
  type: string
  props?: Record<string, unknown>}

export type PageComponentApiEntry = {
  id: string
  type: string
  api: unknown}

/** 页面内组件实例/API 注册表能力接口 */
export type PageComponentRegistry = {
  registerInstance(entry: PageComponentInstanceEntry): void
  unregisterInstance(id: string): void
  listInstances(type?: string): PageComponentInstanceEntry[]
  getInstance(id: string): PageComponentInstanceEntry | null

  registerApi(entry: PageComponentApiEntry): void
  unregisterApi(id: string): void
  listApis(type?: string): PageComponentApiEntry[]
  getApi<T = unknown>(id: string): T | null
  getApisByType<T = unknown>(type: string): T[]}

// ── CSS 作用域注入能力 ─────────────────────────────────────────────────────

/** 页面作用域 CSS 注入能力（由 SparkPageRenderer 提供） */
export type PageCssScopeCapability = {
  inject(css: string): void}

// ── CapabilityTypeMap 扩展（数据层键 + 渲染层键 + 页面 UI/权限键） ────────

declare module '@spark-appworks/spark-utils' {
  interface CapabilityTypeMap {
    'spark:capability:page-dataset': DataSetContract
    'spark:capability:data-source': DataView
    'spark:capability:data-row': DataRow
    'spark:capability:page-component-registry': PageComponentRegistry
    'spark:capability:module-context': ModuleContextCapability
    'spark:capability:css-scope': PageCssScopeCapability
    'spark:capability:page-service': PageServiceCapability
    'spark:capability:permission-mode': NavPermissionMode
    'spark:capability:subtree-field-policy': SubtreeFieldPolicy
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

function isDataView(value: unknown): value is DataView {
  return value instanceof DataView
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

function isSubtreeFieldPolicy(value: unknown): value is SubtreeFieldPolicy {
  return value === 'unrestricted'
}

// ── 能力键 ────────────────────────────────────────────────────────────────

export const PAGE_DATASET = defineCapability<DataSetContract>('spark:capability:page-dataset', isDataSetContract)
export const DATA_SOURCE = defineCapability<DataView>('spark:capability:data-source', isDataView)
export const DATA_ROW = defineCapability<DataRow>('spark:capability:data-row', isDataRow)

export const MODULE_CONTEXT = defineCapability<ModuleContextCapability>('spark:capability:module-context', isModuleContextCapability)
export const PAGE_COMPONENT_REGISTRY = defineCapability<PageComponentRegistry>('spark:capability:page-component-registry', isPageComponentRegistry)
export const CSS_SCOPE = defineCapability<PageCssScopeCapability>('spark:capability:css-scope', isPageCssScopeCapability)

export const PAGE_SERVICE = defineCapability<PageServiceCapability>('spark:capability:page-service', isPageServiceCapability)
export const PAGE_PERMISSION_MODE = defineCapability<NavPermissionMode>('spark:capability:permission-mode', isNavPermissionMode)
export const SUBTREE_FIELD_POLICY = defineCapability<SubtreeFieldPolicy>('spark:capability:subtree-field-policy', isSubtreeFieldPolicy)
