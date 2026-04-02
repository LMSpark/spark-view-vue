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

// ── Design Session ───────────────────────────────────────────────────────────
export {
  typeLabel,
  typeIcon,
  extractProposals,
  stripProposalTags,
  extractComponentQueries,
  resolveComponentQuery,
  buildGenerationPrompt,
  AUTO_QUERY_PREFIX,
  AUTO_SKILL_PREFIX,
  extractClarifyBlocks,
  extractCompareBlocks,
  extractSkillQueryRequests,
} from './session/design-session'
export type {
  ProposalType,
  ProposalStatus,
  SessionPhase,
  DesignProposal,
  ValidationFeedback,
  ReviewChecklistItem,
  ClarifyBlock,
  CompareBlock,
  SkillQueryRequest,
} from './session/design-session'

// ── Design System Prompt ───────────────────────────────────────────────
export { DESIGN_SYSTEM_PROMPT } from './prompts/design-prompt'

// ── Response Pipeline ────────────────────────────────────────────────────────
export {
  ResponsePipeline,
  BlockExtractorProcessor,
  ProposalValidatorProcessor,
  SchemaCheckerProcessor,
  QueryResolverProcessor,
  SkillQueryProcessor,
  RegistryValidatorProcessor,
  AutoResponderProcessor,
  createStandardPipeline,
} from './session/response-pipeline'
export type {
  ComponentQuery,
  AutoMessage,
  PipelineContext,
  ResponseProcessor,
} from './session/response-pipeline'

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

// ── Skill Catalog (设计模式库) ──────────────────────────────────────────────
export { SKILL_CATALOG, SKILL_CATEGORY_INDEX, resolveSkillQuery } from './catalog/skill-catalog'
export type { SkillCatalogEntry, SkillCategory } from './catalog/skill-catalog'

// ── Nav Planner Prompt ───────────────────────────────────────────────────────
export { NAV_PLANNER_SYSTEM_PROMPT } from './prompts/nav-planner-prompt'

// ── Session State（设计会话持久化状态 + 名册类型）───────────────────────────────
export {
  STEP_REGISTRY,
  createEmptySession,
  // ── 读取辅助 ──
  isDataRegistryLocked,
  getRegisteredTableNames,
  getRegisteredColumnNames,
  getRegisteredViewKeys,
  getDependentProposals,
  // ── 步骤推进 ──
  advanceStep,
  canAdvanceTo,
  // ── 名册A 写入 ──
  registerTable,
  lockDataRegistry,
  // ── 名册B 写入 ──
  registerView,
  appendUIRegistry,
  // ── 提案记录 ──
  recordAcceptedProposal,
  // ── 依赖图操作 ──
  addDependency,
  removeDependency,
  // ── 级联校验 ──
  checkCascadeImpact,
  formatCascadeNotification,
  // ── 提案自动写入 ──
  applyProposalToSession,
  // ── 上下文提示词 ──
  buildSessionContextPrompt,
  // ── 序列化 ──
  serializeSession,
  deserializeSession,
  // ── 全量校验 ──
  runFullValidation,
} from './session/session-state'
export type {
  PassAStep,
  PassBStep,
  DesignStep,
  StepMeta,
  RegistryColumn,
  RegistryRelation,
  RegistryTable,
  DataRegistry,
  RegistryView,
  ViewRegistry,
  UIRegistry,
  AcceptedProposalSnapshot,
  PersistedDesignSession,
  CascadeImpact,
  ApplyResult,
  FullValidationIssue,
} from './session/session-state'

// ── Stills（SAP 协議動作引擎）────────────────────────────────────────────────
export {
  registerAllStills,
  registerStill,
  getStill,
  getAllStills,
  clearRegistry,
  clearDomains,
  executeStill,
  createSession,
} from './stills'
export type {
  IStillSession,
  StillGuard,
  StillResult,
  StillDefinition,
  ExecutionBlueprint,
  BlueprintCheckpoint,
  PatchEntry,
  DomainProvider,
  DesignStep as StillDesignStep,
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