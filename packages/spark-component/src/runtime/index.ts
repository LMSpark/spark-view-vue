/**
 * @module @spark-appworks/spark-component:runtime/index
 * @spark-appworks/spark-component 的 runtime/index 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
export {
  PAGE_RUNTIME_SERVICES,
} from './app-services'

export type {
  PageDialogOptions,
  PageDialogResult,
  PageMessageType,
  PageRouterService,
  PageRuntimeServicesCapability,
  PageServiceCapability,
} from './app-services'

export type {
  PageBrowseFilesOptions,
  PageSelectedFile,
  PageUploadFilesOptions,
  PageUploadedFile,
} from './app-services'

export type {
  PageSelectedEntity,
  PageSelectEntitiesOptions,
  PageSelectorOption,
} from './app-services'

export type {
  PageComponentAccessInScript,
  PageRoute,
  ScriptContext,
} from './script-context-types'

export type {
  PermissionApiInScript,
} from './script-context-types'
