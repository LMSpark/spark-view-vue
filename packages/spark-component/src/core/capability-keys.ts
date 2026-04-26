import { defineCapability } from './capability-system.js'
import type { IModuleContext } from './capability-system.js'
import type { IDataRow, IDataSet, IDataSource } from '@spark-view/spark-data'
import type { NavPermissionMode } from '@spark-view/spark-utils'
import type { SparkNode } from './types.js'

/** 页面内组件实例快照：记录当前页面上出现过的组件元信息。 */
export interface PageComponentInstanceEntry {
  id: string
  type: string
  props?: Record<string, unknown>
}

/** 页面内组件 API 条目：供脚本或页面级逻辑按 id/type 反查组件公开 API。 */
export interface PageComponentApiEntry {
  id: string
  type: string
  api: unknown
}

/** 页面级组件注册中心：统一维护实例快照和 API 映射。 */
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

/** 模块上下文能力（页面级） */
export interface ModuleContextCapability {
  getCurrent(): IModuleContext | null
  subscribe(handler: (next: IModuleContext | null, prev: IModuleContext | null) => void): () => void
}

/** 页面 CSS 作用域注入能力 */
export interface PageCssScopeCapability {
  inject(css: string): void
}

/** 动作执行能力接口 */
export interface SparkActionCapability {
  isDisabled(action: SparkNode): boolean
  execute(action: SparkNode): void
}

declare module './capability-system.js' {
  interface CapabilityTypeMap {
    'spark:capability:page-dataset': IDataSet
    'spark:capability:data-source': IDataSource
    'spark:capability:data-row': IDataRow
    'app:page-component-registry': PageComponentRegistry
    'app:module-context': ModuleContextCapability
    'spark:capability:css-scope': PageCssScopeCapability
    'spark:capability:permission-mode': NavPermissionMode
    'spark:capability:action-host': SparkActionCapability
  }
}

export const PAGE_DATASET = defineCapability<IDataSet>('spark:capability:page-dataset')
export const DATA_SOURCE = defineCapability<IDataSource>('spark:capability:data-source')
export const DATA_ROW = defineCapability<IDataRow>('spark:capability:data-row')
export const PAGE_COMPONENT_REGISTRY = defineCapability<PageComponentRegistry>('app:page-component-registry')
export const MODULE_CONTEXT = defineCapability<ModuleContextCapability>('app:module-context')
export const CSS_SCOPE = defineCapability<PageCssScopeCapability>('spark:capability:css-scope')

export const ACTION_CAPABILITY = defineCapability<SparkActionCapability>('spark:capability:action-host')
