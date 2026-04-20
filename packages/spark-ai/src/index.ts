// ── Protocol (unified @@ parsing primitives) ─────────────────────────────────
export {
  extractBlocks,
  stripBlocks,
  stripBlocksWithUnclosed,
  extractProposalBlocks,
  stripProposalBlocks,
  extractFirstJsonObject,
  parseTokenUsage,
  formatTokenUsage,
  extractUiConfirmBlocks,
  stripUiBlocks,
} from './protocol-parser'
export type {
  ProtocolRole,
  ProtocolMessage,
  ProtocolBlock as UnifiedProtocolBlock,
  ProposalProtocolBlock,
  TokenUsage,
  StreamCallbacks,
  ProtocolBlockFilter,
  UiConfirmOption,
  UiConfirmQuestion,
  UiConfirmPayload,
} from './types'

// ── AI Loop (core engine) ────────────────────────────────────────────────────
export {
  configureAILoopHttp,
  onLogUpdate,
  onPageRefresh,
  AIPageLoop,
  PageLogCollector,
  summarizeLogBatch,
  writePageFiles,
  readPageFile,
  readPageFiles,
  setupHotReload,
  setAutoIterating,
  isAutoIterating,
  configureAutoIterateTimeout,
  triggerPageRefresh,
  initAILoop,
  getAILoop,
} from './runtime/ai-loop'
export type {
  PageFiles,
  AIResponse,
  LogSnapshot,
  AIPageLoopOptions,
  LogIssueSummary,
  LogBatchSummary,
  PageDiagnosticsReport,
} from './runtime/ai-loop'

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
export { registerPageNavigation, configureNavRegister } from './runtime/nav-register'
export type { NavRegistrationOptions, NavRegistrationResult } from './runtime/nav-register'

// ── Page Cache ───────────────────────────────────────────────────────────────
export {
  setConfigLoader,
  clearPageCache,
  clearAllCache,
  getCacheStats,
} from './runtime/page-cache'

// ── AI Component Catalog ─────────────────────────────────────────────────────
// 单一 SSoT JSON + 消费端投影
export { default as COMPONENT_CATALOG_JSON } from './catalog/component-catalog.json'
export {
  projectFcDirectory,
  projectFcSpec,
  projectHydratedComponent,
  projectDevTypes,
  projectDevPropNames,
  projectDevPropEnums,
} from './catalog/catalog-projections'
export type {
  FcDirectoryPayload,
  FcComponentSpec,
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
} from './runtime/session-orchestrator'

// ── Session Backend（会话后端 HTTP 客户端）────────────────────────────────────
export {
  SessionBackendImpl,
  configureSessionBackend,
  createGenerateSessionBackend,
} from './session-backend'
export type { GenerateSessionBackendOptions } from './session-backend'

// ── Function Calling Adapter（FC 模式工具调用适配层）─────────────────────────
export {
  actionToFunctionName,
  functionNameToAction,
  stillToToolDefinition,
  generateToolDefinitions,
  dispatchToolCall,
  dispatchToolCalls,
  formatToolResultContent,
  buildAssistantToolCallMessage,
  buildToolResultMessage,
} from './tool-calling'
export type {
  ToolCall,
  ToolResult,
  FcDispatchResult,
  ToolDefinition,
  JsonSchema,
  JsonSchemaProperty,
} from './tool-calling'

// ── Monitors（可插拔编排监控器）──────────────────────────────────────────────
export {
  createRepeatDetectionMonitor,
  createBlueprintOrchestrationMonitor,
  createTerminalActionsMonitor,
} from './runtime/monitors'
