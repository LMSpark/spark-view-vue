// ──【功能分区1】聊天解析工具───────────────────────────────────────────────────
export {
  extractFirstJsonObject,
  parseTokenUsage,
  formatTokenUsage,
} from './core'
export type {
  ProtocolRole,
  ProtocolMessage,
  TokenUsage,
  StreamCallbacks,
} from './core'

// ──【功能分区2】页面缓存──────────────────────────────────────────────────────
export {
  createPageCache,
  type PageCacheHandle,
} from './business/page-design'

// ──【功能分区3】AI组件目录────────────────────────────────────────────────────
// 单一 SSoT JSON + 消费端投影
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

// DevSystem 预计算投影（type 下拉 + 属性名 + 枚举值 + 中文标签 + 必填属性）
export { DEV_TYPES, DEV_PROP_NAMES, DEV_PROP_ENUMS, DEV_TYPE_LABELS, DEV_REQUIRED_PROPS } from './catalog/catalog-dev-exports'

// ──【功能分区4】函数目录 (轻量级)─────────────────────────────────────────────
export type { FunctionCatalog, FunctionCatalogRegistry, FunctionComponentEntry, FunctionPropEntry } from './catalog/function-catalog-types'

// ──【功能分区5】核心函数协议 / 注册表 / 运行时────────────────────────────────────
export {
  AI_FUNCTION_ARCHITECTURE_PROMPT,
} from './core'
export {
  noGuard,
} from './core'
export type {
  FunctionCarrierKey,
  FunctionCarrierContract,
  FunctionBeforeExecuteEvent,
  FunctionAfterExecuteEvent,
  FunctionBeforeExecuteDecision,
  FunctionBeforeExecuteEmitter,
  FunctionAfterExecuteEmitter,
  FunctionCarrierBeforeExecuteHook,
  FunctionCarrierAfterExecuteHook,
  FunctionResult,
  FunctionFailureMode,
  FunctionCatalogRow,
  PostValidationWarning,
  FunctionTraceEntry,
  FunctionRuntimeContext,
  FunctionGuard,
  RegisteredFunctionDefinition,
} from './core'
export {
  missingParam,
  isNonEmptyString,
  formatLlmParamValidationIssues,
  validateLlmDeserializedParams,
} from './core'
export type {
  LlmParamValidationIssue,
  LlmParamValidationOptions,
} from './core'
export {
  createFunctionRuntimeContext,
} from './core'
export {
  registerFunction,
  registerFunctions,
  getFunctionDefinition,
  getAllFunctionDefinitions,
  clearFunctionRegistry,
} from './core'
export {
  actionToCarrierKey,
  registerFunctionCarrier,
  registerFunctionCarriers,
  getFunctionCarrier,
  getFunctionCarrierByAction,
  getAllFunctionCarriers,
  clearFunctionCarrierRegistry,
} from './core'
export {
  executeFunction,
  executeFunctionAsync,
  createMethodBackedDefinitions,
} from './core'

// ──【功能分区6】会话编排器（会话级工具循环编排）──────────────────────────────────
export {
  runFunctionLoop,
} from './core'
export type {
  DialogueTurn,
  FunctionTurnResult,
  LlmResponse,
  SessionBackend,
  SessionBackendSseEvent,
  SessionBackendTurnOptions,
  SessionAppendMessage,
  SessionConversationMessage,
  MonitorContext,
  SessionMonitor,
  FollowUpBuildContext,
  FollowUpPolicy,
  OrchestratorConfig,
  OrchestratorResult,
  ToolCall,
  ToolResult,
  FcDispatchResult,
  ToolDefinition,
  JsonSchema,
  JsonSchemaProperty,
} from './core'

// ──【功能分区7】会话后端（会话后端 HTTP 客户端）────────────────────────────────────
export {
  createSessionBackend,
} from './core'
export type { SessionBackendOptions } from './core'

// ──【功能分区8】重复检测（核心通用监控器）────────────────────────────────────────
export {
  createRepeatDetectionMonitor,
  type RepeatDetectionConfig,
} from './core'

// ──【功能分区9】FC 工具定义与后续策略─────────────────────────────────────────
export {
  actionToFunctionName,
  functionNameToAction,
  functionToToolDefinition,
  generateToolDefinitions,
} from './core'
export {
  formatWarningsAsFollowUp,
  createDefaultFollowUpPolicy,
  type FollowUpDecorations,
} from './core'

// ──【功能分区11】知识函数─────────────────────────────────────────────────────
export {
  coreKnowledgeFunctions,
  knowledgeAsk,
  knowledgeGuidePayload,
  knowledgeGuideTool,
  knowledgeQueryPayloads,
  knowledgeQueryTools,
} from './core'
export {
  clearKnowledgeRegistry,
  getKnowledgePayloadProvider,
  getKnowledgePayloadProviders,
  registerKnowledgePayloadProvider,
} from './core'
export type {
  KnowledgeGuidePayloadParams,
  KnowledgePayloadCategory,
  KnowledgePayloadGuide,
  KnowledgePayloadKey,
  KnowledgePayloadProvider,
  KnowledgePayloadProviderSummary,
  KnowledgePayloadQueryFilter,
  KnowledgePayloadRef,
  KnowledgePayloadSummary,
  KnowledgeQueryPayloadCatalogResult,
  KnowledgeQueryPayloadProvidersResult,
  KnowledgeQueryPayloadsParams,
} from './core'
export type {
  KnowledgeModuleSummary,
  KnowledgeToolGuide,
  KnowledgeToolSummary,
} from './core'

// ──【功能分区12】业务函数（页面设计业务）────────────────────────────────────────────
export {
  PAGE_DESIGN_BUSINESS,
  PAGE_DESIGN_EDIT_RUNTIME_PROMPT,
  registerPageDesignEditFunctions,
  createPageModelSessionBackend,
  createPageModelSessionHost,
  createPageModelEditSession,
  createEditState,
  getActiveNodeTree,
  bindLiveModelAdapter,
  isEditWriteAction,
  isEditNodeTreeWriteAction,
  isEditDataSetWriteAction,
  isEditTextModelWriteAction,
  type PageDesignBusinessContext,
  type EditState,
  type EditToolHost,
  type PageModelFunctionContext,
  type PageModelSessionHostRuntime,
  type PageModelSessionHostState,
  type PageModelSessionHostController,
  type CreatePageModelSessionHostOptions,
  type PageModelEditLogEntry,
  type PageModelEditSessionState,
  type StartPageModelIterateSessionOptions,
  type PageModelEditSessionRuntime,
  type PageModelEditSessionOptions,
  type PageModelEditRunHooks,
  type PageModelEditRunOptions,
  type PageModelEditBootstrapOptions,
  type PageModelEditSessionController,
} from './business/page-design'