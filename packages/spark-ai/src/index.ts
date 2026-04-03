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

// ── Shared Constants ─────────────────────────────────────────────────────────
export { DATAKEY_RE, HTML_TYPES, VALID_TYPE_PREFIXES } from './validation/shared-constants'

// ── Nav Planner Prompt ───────────────────────────────────────────────────────
export { NAV_PLANNER_SYSTEM_PROMPT } from './prompts/nav-planner-prompt'

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
  getDataSetSlot,
} from './stills'
export type {
  IStillSession,
  StillGuard,
  StillResult,
  StillDefinition,
  ExecutionBlueprint,
  BlueprintPlanItem,
  BlueprintCheckpoint,
  PatchEntry,
  DomainProvider,
  DesignStep,
  DataSetSlot,
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
