// ── Protocol (unified @@ parsing primitives) ─────────────────────────────────
export {
  extractBlocks,
  extractBlocks as extractProtocolBlocks,
  stripBlocks as stripProtocolBlocks,
  stripBlocksWithUnclosed as stripProtocolBlocksWithUnclosed,
  extractProposalBlocks,
  stripProposalBlocks,
  extractToolBlocks,
  stripToolBlocks,
  parseToolPayload,
  extractFirstJsonObject,
  parseTokenUsage,
  formatTokenUsage,
  extractUiConfirmBlocks,
  stripUiBlocks,
} from './protocol'
export type {
  ProtocolRole,
  ProtocolMessage,
  ProtocolBlock as UnifiedProtocolBlock,
  ToolProtocolBlock,
  ProposalProtocolBlock,
  TokenUsage,
  StreamCallbacks,
  ProtocolBlockFilter,
  ToolBlockFilter,
  UiConfirmOption,
  UiConfirmQuestion,
  UiConfirmPayload,
} from './protocol'

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
export { COMPONENT_CATALOG } from './catalog/component-props-catalog'
export type {
  ComponentCatalog,
  ComponentEntry,
  ComponentRegistry,
  PropEntry,
  EmitEntry,
  PlatformConstraints,
  NestingRule,
  RootFieldEntry,
} from './catalog/types'

// ── SAP Catalog (Lightweight) ────────────────────────────────────────────────
export type { SapCatalog, SapCatalogRegistry, SapComponentEntry, SapPropEntry } from './catalog/sap-catalog-types'

// ── Shared Constants ─────────────────────────────────────────────────────────
export { DATAKEY_RE, HTML_TYPES, VALID_TYPE_PREFIXES } from './validation/shared-constants'

// ── Nav Planner Prompt ───────────────────────────────────────────────────────
export { NAV_PLANNER_SYSTEM_PROMPT } from './prompts/nav-planner-prompt'

// ── System Prompts（提示词前端 SSoT）────────────────────────────────────────
export { PAGE_SYSTEM_PROMPT } from './prompts/page-system-prompt'
export {
  SAP_SYSTEM_PROMPT,
  STILLS_PROTOCOL_BASE,
  STILLS_DATASET_DOMAIN,
  STILLS_RUNTIME_PROMPT,
  STILLS_BLUEPRINT_PROMPT,
  STILLS_SYSTEM_PROMPT,
} from './prompts/sap-prompts'
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

// ── Stills（SAP 协议动作引擎）────────────────────────────────────────────────
export {
  registerAllStills,
  registerStill,
  getStill,
  getAllStills,
  clearRegistry,
  clearDomains,
  executeStill,
  createSession,
  registerDomain,
  getDomain,
  getDataSetState,
  findCandidateActions,
  scoreCandidateAction,
  validateLlmDeserializedParams,
  formatLlmParamValidationIssues,
  DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE,
  DATASET_CRUD_TOOL_STILLS_CAPABILITY_TABLE,
  getDataSetCrudToolStillParameterRow,
  getDataSetCrudToolStillCapabilityRow,
  validateDataSetCrudToolStillParams,
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
  DesignPhase,
  DataSetDomainState,
  PostValidationWarning,
  LlmParamObjectSchema,
  LlmParamArraySchema,
  LlmParamValidationIssue,
  LlmParamValidationResult,
  LlmParamValidationOptions,
  DatasetCrudToolStillFailureMode,
  DatasetCrudToolStillType,
  DatasetCrudToolStillTarget,
  DatasetCrudToolStillParameterRow,
  DatasetCrudToolStillCapabilityRow,
} from './stills'

// ── SAP Runtime Bridge（协议解析 → Stills 调度 → 响应格式化）───────────────────
export {
  formatResponseBlock,
  dispatchBlock,
  processSapBlocks,
} from './sap-runtime'
export type {
  SapDispatchResult,
  SapProcessingResult,
} from './sap-runtime'

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

// ── Monitors（可插拔编排监控器）──────────────────────────────────────────────
export {
  createRepeatDetectionMonitor,
  createBlueprintOrchestrationMonitor,
  createTerminalActionsMonitor,
} from './runtime/monitors'
