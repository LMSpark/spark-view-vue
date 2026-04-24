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

// ── Config Validator ────────────────────────────────────────────────────────
export { validateGeneratedConfig } from './validation/config-validator'
export type {
  GeneratedPageFiles,
  ConfigValidationCategory,
  ConfigValidationSeverity,
  ConfigValidationIssue,
  ConfigValidationSummary,
  ConfigValidationReport,
} from './validation/config-validator'

// ── Navigation Auto-Register ─────────────────────────────────────────────────
export { createNavRegister } from './runtime/nav-register'
export type { NavRegister, NavRegistrationOptions, NavRegistrationResult } from './runtime/nav-register'

// ── Page Cache ───────────────────────────────────────────────────────────────
export {
  createPageCache,
} from './runtime/page-cache'
export type { PageCacheHandle } from './runtime/page-cache'

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

// ── Shared Constants ─────────────────────────────────────────────────────────
export { DATAKEY_RE, HTML_TYPES, VALID_TYPE_PREFIXES } from './validation/shared-constants'

// ── Nav Planner Prompt ───────────────────────────────────────────────────────
export { NAV_PLANNER_SYSTEM_PROMPT } from './prompts/nav-planner-prompt'

// ── System Prompts（提示词前端 SSoT）────────────────────────────────────────

export { PAGE_SYSTEM_PROMPT } from './prompts/page-system-prompt'
export {
  STILLS_PROTOCOL_BASE,
  STILLS_DATASET_DOMAIN,
  STILLS_RUNTIME_PROMPT,
  STILLS_EDIT_RUNTIME_PROMPT,
  STILLS_BLUEPRINT_PROMPT,
} from './prompts/stills-prompts'
export {
  buildPageSystemPrompt,
  getSystemPrompt,
  registerPromptMode,
  detectRelevantSkillTypes,
} from './prompts/prompt-builder'
export type {
  PromptBuildContext,
  ISkillMetadataProvider,
  BuildPagePromptOptions,
  PromptMode,
} from './prompts/prompt-builder'

// ── Stills（动作引擎）────────────────────────────────────────────────────────
export {
  registerAllStills,
  registerEditStills,
  registerStill,
  getStill,
  getAllStills,
  clearRegistry,
  clearDomains,
  executeStill,
  createSession,
  registerDomain,
  getDomain,
  getEditState,
  getActiveNodeTree,
  bindLiveModelAdapter,
  captureBaselineSnapshot,
  createCurrentEditModel,
} from './stills'
export type {
  DomainState,
  IStillSession,
  StillGuard,
  StillResult,
  StillDefinition,
  ExecutionBlueprint,
  BlueprintPlanItem,
  BlueprintCheckpoint,
  PatchEntry,
  DomainProvider,
  PostValidationWarning,
  EditDomainState,
  EditLiveModelAdapter,
} from './stills'

// ── Session Orchestrator（会话级工具循环编排）──────────────────────────────────
export {
  runStillsLoop,
  formatWarningsAsFollowUp,
} from './runtime/session-orchestrator'
export type {
  DialogueTurn,
  StillTurnResult,
  LlmResponse,
  SessionBackend,
  MonitorContext,
  SessionMonitor,
  OrchestratorConfig,
  OrchestratorResult,
  ToolCall,
  ToolResult,
  FcDispatchResult,
  ToolDefinition,
  JsonSchema,
  JsonSchemaProperty,
} from './session-contracts'

// ── Session Backend（会话后端 HTTP 客户端）────────────────────────────────────
export {
  SessionBackendImpl,
} from './session-backend'

// ── Function Calling Adapter（FC 模式工具调用适配层）─────────────────────────
export {
  actionToFunctionName,
  functionNameToAction,
  loadFcCatalog,
  stillToToolDefinition,
  generateToolDefinitions,
} from './fc-schema'
export type {
  FcCatalogToolEntry,
  FcCatalogJson,
} from './fc-schema'
export {
  dispatchToolCall,
  dispatchToolCalls,
  formatToolResultContent,
  buildAssistantToolCallMessage,
  buildToolResultMessage,
} from './fc-dispatcher'

// ── Monitors（可插拔编排监控器）──────────────────────────────────────────────
export {
  createRepeatDetectionMonitor,
  createBlueprintOrchestrationMonitor,
  createTerminalActionsMonitor,
  createExportCompletionMonitor,
} from './runtime/monitors'
