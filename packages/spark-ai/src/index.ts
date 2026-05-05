// ──【功能分区1】聊天解析工具───────────────────────────────────────────────────
export {
  extractFirstJsonObject,
  parseTokenUsage,
  formatTokenUsage,
} from './protocol-parser'
export type {
  ProtocolRole,
  ProtocolMessage,
  TokenUsage,
  StreamCallbacks,
} from './types'

// ──【功能分区2】页面缓存──────────────────────────────────────────────────────
export {
  createPageCache,
} from './business/page-design/page-cache'
export type { PageCacheHandle } from './business/page-design/page-cache'

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
} from './core/protocol/architecture-prompt'
export { PAGE_DESIGN_EDIT_RUNTIME_PROMPT } from './business/page-design/prompts/edit-runtime-prompt'
export {
  createFunctionRuntimeContext,
  noGuard,
} from './core/protocol/function-contracts'
export type {
  FunctionKind,
  FunctionResult,
  FunctionFailureMode,
  PostValidationWarning,
  FunctionTraceEntry,
  FunctionRuntimeContext,
  FunctionGuard,
  RegisteredFunctionDefinition,
} from './core/protocol/function-contracts'
export {
  registerFunction,
  registerFunctions,
  getFunctionDefinition,
  getAllFunctionDefinitions,
  clearFunctionRegistry,
} from './core/registry/function-registry'
export {
  executeFunction,
} from './core/runtime/function-dispatcher'

// ──【功能分区6】会话编排器（会话级工具循环编排）──────────────────────────────────
export {
  runFunctionLoop,
} from './core/runtime/session-orchestrator'
export type {
  DialogueTurn,
  FunctionTurnResult,
  LlmResponse,
  SessionBackend,
  MonitorContext,
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
} from './core/protocol/session-contracts'

// ──【功能分区7】会话后端（会话后端 HTTP 客户端）────────────────────────────────────
export {
  createSessionBackend,
  SessionBackendImpl,
} from './core/runtime/session-backend'
export type { SessionBackendImplOptions } from './core/runtime/session-backend'

// ──【功能分区8】重复检测（核心通用监控器）────────────────────────────────────────
export {
  createRepeatDetectionMonitor,
  type RepeatDetectionConfig,
} from './core/runtime/repeat-detection-monitor'

// ──【功能分区9】函数调用适配器（FC 模式工具调用适配层）─────────────────────────
export {
  actionToFunctionName,
  functionNameToAction,
  functionToToolDefinition,
  generateToolDefinitions,
} from './core/protocol/fc-schema'
export {
  dispatchToolCall,
  dispatchToolCalls,
  formatToolResultContent,
  buildAssistantToolCallMessage,
  buildToolResultMessage,
} from './core/runtime/fc-dispatcher'

// ──【功能分区10】后续策略（核心通用）──────────────────────────────────────────────
export {
  formatWarningsAsFollowUp,
  DefaultFollowUpPolicy,
  createDefaultFollowUpPolicy,
  type FollowUpDecorations,
} from './core/runtime/default-follow-up-policy'

// ──【功能分区11】知识函数─────────────────────────────────────────────────────
export {
  registerCoreKnowledgeFunctions,
} from './core/knowledge/register-knowledge-functions'
export {
  coreKnowledgeFunctions,
  knowledgeAsk,
  knowledgeGuidePayload,
  knowledgeGuideTool,
  knowledgeQueryPayloads,
  knowledgeQueryTools,
} from './core/knowledge/query-actions'
export {
  clearKnowledgeRegistry,
  getKnowledgePayloadProvider,
  getKnowledgePayloadProviders,
  registerKnowledgePayloadProvider,
} from './core/knowledge/registry'
export type {
  KnowledgePayloadGuide,
  KnowledgePayloadProvider,
  KnowledgePayloadSummary,
} from './core/knowledge/types'

// ──【功能分区12】业务函数（页面设计业务）────────────────────────────────────────────
export {
  PAGE_DESIGN_BUSINESS,
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