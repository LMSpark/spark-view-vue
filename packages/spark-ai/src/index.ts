// ── Protocol (unified @@ parsing primitives) ─────────────────────────────────
export {
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
  triggerPageRefresh,
  initAILoop,
  getAILoop,
} from './ai-loop'
export type {
  PageFiles,
  AIResponse,
  LogSnapshot,
  AIPageLoopOptions,
  LogIssueSummary,
  LogBatchSummary,
  PageDiagnosticsReport,
} from './ai-loop'

// ── Config Validator ────────────────────────────────────────────────────────
export { validateGeneratedConfig } from './config-validator'
export type {
  GeneratedPageFiles,
  ConfigValidationCategory,
  ConfigValidationSeverity,
  ConfigValidationIssue,
  ConfigValidationSummary,
  ConfigValidationReport,
} from './config-validator'

// ── Navigation Auto-Register ─────────────────────────────────────────────────
export { registerPageNavigation, configureNavRegister } from './nav-register'
export type { NavRegistrationOptions, NavRegistrationResult } from './nav-register'

// ── Page Cache ───────────────────────────────────────────────────────────────
export {
  setConfigLoader,
  clearPageCache,
  clearAllCache,
  getCacheStats,
} from './page-cache'

// ── Design Session ───────────────────────────────────────────────────────────
export {
  typeLabel,
  typeIcon,
  extractBlocks,
  extractProposals,
  stripProposalTags,
  extractComponentQueries,
  resolveComponentQuery,
  buildGenerationPrompt,
  AUTO_QUERY_PREFIX,
  DESIGN_SYSTEM_PROMPT,
} from './design-session'
export type {
  ProposalType,
  ProposalStatus,
  SessionPhase,
  DesignProposal,
  ProtocolBlock,
  ValidationFeedback,
  ReviewChecklistItem,
} from './design-session'

// ── Response Pipeline ────────────────────────────────────────────────────────
export {
  ResponsePipeline,
  BlockExtractorProcessor,
  ProposalValidatorProcessor,
  SchemaCheckerProcessor,
  QueryResolverProcessor,
  AutoResponderProcessor,
} from './response-pipeline'
export type {
  ComponentQuery,
  AutoMessage,
  PipelineContext,
  ResponseProcessor,
} from './response-pipeline'

// ── Component Props Catalog ──────────────────────────────────────────────────
export { COMPONENT_PROPS_CATALOG } from './component-props-catalog'

// ── Blueprint Types ──────────────────────────────────────────────────────────
export {
  getAllPageNodes,
  getAllModuleNodes,
  getBlueprintStats,
  resolveTableRelations,
  validateBlueprintTree,
} from './blueprint-types'
export type {
  BlueprintDataModel,
} from './blueprint-types'
// ── Blueprint Planner Prompt ─────────────────────────────────────────────────
export { BLUEPRINT_SYSTEM_PROMPT } from './blueprint-prompt'

// ── Nav Planner Prompt ───────────────────────────────────────────────────────
export { NAV_PLANNER_SYSTEM_PROMPT } from './nav-planner-prompt'