// ── Chat Parsing Utilities ───────────────────────────────────────────────────
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

// ── Page Cache ───────────────────────────────────────────────────────────────
export {
  createPageCache,
} from './business/page-design/page-cache'
export type { PageCacheHandle } from './business/page-design/page-cache'

// ── AI Component Catalog ─────────────────────────────────────────────────────
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

// ── Stills Catalog (Lightweight) ─────────────────────────────────────────────
export type { StillsCatalog, StillsCatalogRegistry, StillsComponentEntry, StillsPropEntry } from './catalog/stills-catalog-types'

// ── System Prompts（提示词前端 SSoT）────────────────────────────────────────
export {
  STILLS_PROTOCOL_BASE,
} from './core/stills/stills-prompts'
export { STILLS_EDIT_RUNTIME_PROMPT } from './business/page-design/prompts/edit-runtime-prompt'

// ── Stills Core Runtime（注册机 / dispatcher / domain）──────────────────────
export {
  registerStill,
  registerAll,
  getStill,
  getAllStills,
  clearRegistry,
  executeStill,
} from './core/stills/dispatcher'
export {
  registerDomain,
  getDomain,
  clearDomains,
  createBareSession,
} from './core/stills/domain'
export {
  registerCoreStills,
} from './core/stills/register-core-stills'
export type {
  DomainState,
  IStillSession,
  StillGuard,
  StillResult,
  StillDefinition,
  PatchEntry,
  DomainProvider,
  PostValidationWarning,
} from './core/stills/types'

// ── Session Orchestrator（会话级工具循环编排）──────────────────────────────────
export {
  runStillsLoop,
} from './core/orchestration/session-orchestrator'
export type {
  DialogueTurn,
  StillTurnResult,
  LlmResponse,
  SessionBackend,
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
} from './core/session/session-contracts'

// ── Session Backend（会话后端 HTTP 客户端）────────────────────────────────────
export {
  createSessionBackend,
  SessionBackendImpl,
} from './core/session/session-backend'
export type { SessionBackendImplOptions } from './core/session/session-backend'

// ── Repeat Detection（核心通用监控器）────────────────────────────────────────
export {
  createRepeatDetectionMonitor,
  type RepeatDetectionConfig,
} from './core/session/repeat-detection-monitor'

// ── Function Calling Adapter（FC 模式工具调用适配层）─────────────────────────
export {
  actionToFunctionName,
  functionNameToAction,
  stillToToolDefinition,
  generateToolDefinitions,
} from './core/fc-schema'
export {
  dispatchToolCall,
  dispatchToolCalls,
  formatToolResultContent,
  buildAssistantToolCallMessage,
  buildToolResultMessage,
} from './core/fc-dispatcher'

// ── Follow-Up Policy（核心通用）──────────────────────────────────────────────
export {
  formatWarningsAsFollowUp,
  DefaultFollowUpPolicy,
  createDefaultFollowUpPolicy,
  type FollowUpDecorations,
} from './core/session/default-follow-up-policy'

// ── Business Domains（业务域）───────────────────────────────────────────────
export {
  PAGE_DESIGN_DOMAIN,
  registerPageDesignEditStills,
  createPageModelSessionBackend,
  createPageModelSessionHost,
  createPageModelEditSession,
  getEditState,
  getActiveNodeTree,
  bindLiveModelAdapter,
  isEditWriteAction,
  isEditNodeTreeWriteAction,
  isEditDataSetWriteAction,
  isEditTextModelWriteAction,
  type PageDesignBusinessContext,
  type EditDomainState,
  type EditToolHost,
  type PageModelStillsSession,
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
