// spark-ai public entry — new AI core architecture first.
//
// The package root intentionally exposes the business-first core surface only.
// Legacy global function registries, carrier registries, model/session loops,
// and compatibility tool-calling helpers are implementation leftovers until the
// remaining business adapters are migrated.

export {
  createAiCore,
} from './core'
export type {
  AiCore,
  AiCoreAppendMessage,
  AiCoreAppendMessagesOptions,
  AiCoreEvent,
  AiCoreEventListener,
  AiCoreEventType,
  AiCoreExecuteFunctionCallOptions,
  AiCoreExecuteFunctionCallResult,
  AiCoreFunctionCallRecord,
  AiCoreFunctionCallResult,
  AiCoreFunctionExposure,
  AiCoreFunctionExposureSnapshot,
  AiCoreHistoryMessage,
  AiCoreHistorySnapshot,
  AiCoreInstanceDetail,
  AiCoreInstanceSnapshot,
  AiCoreInstanceStatus,
  AiCoreLifecycleMarker,
  AiCoreMessageRole,
  AiCoreModuleRuntimeSnapshot,
  AiCoreOptions,
  AiCoreStartSessionOptions,
  AiCoreStartSessionResult,
  AiCoreStopMode,
  AiCoreStopSessionOptions,
  AiCoreStopSessionResult,
  FunctionFailureMode,
  FunctionExecutionContext,
  IBusinessDefinition,
  IFunctionCatalogProvider,
  IFunctionDefinition,
  IModule,
  IModuleInstanceAccessor,
  IModulePromptProvider,
  ModuleAfterExecuteContext,
  ModuleBeforeExecuteContext,
  ModuleBeforeExecuteDecision,
  ModulePromptContext,
  ModuleRuntime,
  ModuleRuntimeLifecycleContext,
  ModuleRuntimeReader,
  PostValidationWarning,
} from './core'

export {
  PAGE_DESIGN_BUSINESS,
  PAGE_DESIGN_EDIT_RUNTIME_PROMPT,
  createPageDesignBusinessDefinition,
  createPageCache,
  createEditState,
  getActiveNodeTree,
  bindLiveModelAdapter,
  isEditWriteAction,
  isEditNodeTreeWriteAction,
  isEditDataSetWriteAction,
  isEditTextModelWriteAction,
} from './business/page-design'
export type {
  PageDesignBusinessContext,
  CreatePageDesignBusinessDefinitionOptions,
  PageDesignRuntimeContext,
  PageDesignModuleRuntime,
  EditState,
  EditToolHost,
  PageCacheHandle,
} from './business/page-design'

export { default as COMPONENT_CATALOG_JSON } from './catalog/component-catalog.json'
export {
  projectComponentDirectory,
  projectComponentSpec,
  projectComponentConfigGuide,
  projectHydratedComponent,
  projectDevTypes,
  projectDevPropNames,
  projectDevPropEnums,
} from './catalog/catalog-projections'
export type {
  ComponentDirectoryPayload,
  ComponentSpec,
  ComponentConfigGuide,
  HydratedComponentEntry,
  HydratedPropEntry,
  HydratedEmitEntry,
} from './catalog/catalog-projections'
export type {
  RawComponentCatalog,
  RawComponentEntry,
  ComponentCatalog,
  ComponentEntry,
  ComponentRegistry,
  PropEntry,
  PropSchema,
  EmitEntry,
  PlatformConstraints,
  NestingRule,
  RootFieldEntry,
  CatalogBindingDescriptor,
  SharedTypeDefinition,
} from './catalog/types'
export {
  DEV_TYPES,
  DEV_PROP_NAMES,
  DEV_PROP_ENUMS,
  DEV_TYPE_LABELS,
  DEV_REQUIRED_PROPS,
} from './catalog/catalog-dev-exports'
export type {
  FunctionCatalog,
  FunctionCatalogRegistry,
  FunctionComponentEntry,
  FunctionPropEntry,
} from './catalog/function-catalog-types'
