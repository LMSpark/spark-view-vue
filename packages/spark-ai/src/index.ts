// ── AI Loop (core engine) ────────────────────────────────────────────────────
export {
  configureAILoopHttp,
  logUpdateSignal,
  AIPageLoop,
  PageLogCollector,
  writePageFiles,
  readPageFile,
  readPageFiles,
  setupHotReload,
  setAutoIterating,
  isAutoIterating,
  pageRefreshKey,
  triggerPageRefresh,
  initAILoop,
  getAILoop,
} from './ai-loop'
export type { PageFiles, AIResponse, LogSnapshot, AIPageLoopOptions } from './ai-loop'

// ── SSE Events ───────────────────────────────────────────────────────────────
export {
  ServerEventType,
  onServerEvent,
  onPageConfigChange,
} from './sse-events'
export type { ServerEventTypeName, FileChangeEvent } from './sse-events'

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
  useDesignSession,
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
