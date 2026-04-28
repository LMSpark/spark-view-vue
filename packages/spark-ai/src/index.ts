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
export { validateGeneratedConfig } from './business/project-planning/validation/config-validator'
export type {
  GeneratedPageFiles,
  ConfigValidationCategory,
  ConfigValidationSeverity,
  ConfigValidationIssue,
  ConfigValidationSummary,
  ConfigValidationReport,
} from './business/project-planning/validation/config-validator'

// ── Navigation Auto-Register ─────────────────────────────────────────────────
export { createNavRegister } from './business/project-planning/nav-register'
export type { NavRegister, NavRegistrationOptions, NavRegistrationResult } from './business/project-planning/nav-register'

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

// ── Shared Constants ─────────────────────────────────────────────────────────
export { DATAKEY_RE, HTML_TYPES, VALID_TYPE_PREFIXES } from './business/project-planning/validation/shared-constants'

// ── Nav Planner Prompt ───────────────────────────────────────────────────────
export { NAV_PLANNER_SYSTEM_PROMPT } from './business/project-planning/nav-planner-prompt'

// ── System Prompts（提示词前端 SSoT）────────────────────────────────────────

export { PAGE_SYSTEM_PROMPT } from './business/project-planning/prompts/page-system-prompt'
export {
  STILLS_PROTOCOL_BASE,
  STILLS_DATASET_DOMAIN,
  STILLS_RUNTIME_PROMPT,
  STILLS_EDIT_RUNTIME_PROMPT,
  STILLS_BLUEPRINT_PROMPT,
} from './core/stills/stills-prompts'
export {
  buildPageSystemPrompt,
  getSystemPrompt,
  registerPromptMode,
  detectRelevantSkillTypes,
} from './business/project-planning/prompts/prompt-builder'
export type {
  PromptBuildContext,
  ISkillMetadataProvider,
  BuildPagePromptOptions,
  PromptMode,
} from './business/project-planning/prompts/prompt-builder'

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
  isEditWriteAction,
  isEditNodeTreeWriteAction,
  isEditDataSetWriteAction,
  isEditTextModelWriteAction,
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
  EditToolHost,
} from './stills'

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
  SessionBackendImpl,
} from './core/session/session-backend'

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

// ── Monitors（可插拔编排监控器）──────────────────────────────────────────────
export {
  createRepeatDetectionMonitor,
  createBlueprintOrchestrationMonitor,
  createTerminalActionsMonitor,
  createExportCompletionMonitor,
  createMonitorsForScenario,
  createDefaultMonitors,
  type OrchestrationScenario,
} from './business/project-planning'

// ── Business Orchestration（业务层编排配置工厂）─────────────────────────────
export {
  formatWarningsAsFollowUp,
  DefaultFollowUpPolicy,
  createDefaultFollowUpPolicy,
} from './core/session/default-follow-up-policy'

// ── Business Orchestration（业务层编排配置工厂）─────────────────────────────
export {
  formatWarningsAsFollowUpBusiness,
  BusinessFollowUpPolicy,
  createBusinessFollowUpPolicy,
  createOrchestratorConfig,
  createGenerateConfig,
  createIterateConfig,
  createDebugConfig,
  type OrchestratorConfigFactoryOptions,
  type RepeatDetectionConfig,
} from './business/project-planning'

// ── Bootstrap（应用层一键启动入口）─────────────────────────────────────────
export {
  createSessionBackend,
  startAiOrchestration,
  startGenerateSession,
  startIterateSession,
  startDebugSession,
  type BootstrapOptions,
} from './business/project-planning'

// ── Business Domains（业务域）───────────────────────────────────────────────
export {
  PAGE_DESIGN_DOMAIN,
  createPageModelSessionBackend,
  createPageModelSessionHost,
  createPageModelEditSession,
  type PageDesignBusinessContext,
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

export {
  PROJECT_PLANNING_DOMAIN,
  type ProjectPlanningBusinessContext,
} from './business/project-planning'

