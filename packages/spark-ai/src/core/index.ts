// Core Layer — AI Session Lifecycle View
// 1) Session Contract
// 2) Session Runtime (backend)
// 3) Tooling (FC schema + dispatch)
// 4) Orchestration (loop + monitors)
// 5) Lifecycle Registry (tree + query helpers)
// 6) Stills Runtime (registry + dispatcher + domain session)

// 1) Session Contract
export type {
  DialogueTurn,
  StillTurnResult,
  LlmResponse,
  SessionBackend,
  SessionBackendSseEvent,
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
} from './session/session-contracts'

// 2) Session Runtime
export { SessionBackendImpl } from './session/session-backend'

// Session Monitors & Policies
export {
  createRepeatDetectionMonitor,
  type RepeatDetectionConfig,
} from './session/repeat-detection-monitor'
export {
  createDefaultFollowUpPolicy,
  DefaultFollowUpPolicy,
  formatWarningsAsFollowUp,
  buildInlineActionSpec,
  buildErrorFollowUp,
  toParamsSignature,
  countConsecutiveSameFailedSignature,
} from './session/default-follow-up-policy'
export type { FollowUpDecorations } from './session/default-follow-up-policy'

// 4) Orchestration
export {
  runStillsLoop,
} from './orchestration/session-orchestrator'

// 3) Tooling
export {
  actionToFunctionName,
  functionNameToAction,
  stillToToolDefinition,
  generateToolDefinitions,
} from './fc-schema'

export {
  dispatchToolCall,
  dispatchToolCalls,
  formatToolResultContent,
  buildAssistantToolCallMessage,
  buildToolResultMessage,
} from './fc-dispatcher'

// 5) Lifecycle Registry
export {
  CORE_LIFECYCLE_CONFIG_TREE,
  CORE_SESSION_LIFECYCLE_STAGES,
  listLifecycleConfigPaths,
  listCoreLifecycleConfigPaths,
  getLifecycleConfigTree,
  getCoreLifecycleTree,
} from './lifecycle-config-paths'
export type {
  LifecycleStage,
  LifecycleConfigNode,
  LifecycleConfigTree,
  LifecycleOwnerTree,
  LifecycleConfigPath,
} from './lifecycle-config-paths'

// 6) Stills Runtime
export {
  registerStill,
  registerAll,
  getStill,
  getAllStills,
  clearRegistry,
  executeStill,
} from './stills/dispatcher'
export {
  registerDomain,
  getDomain,
  clearDomains,
  createBareSession,
} from './stills/domain'
export {
  registerCoreStills,
} from './stills/register-core-stills'
export type {
  DomainState,
  StillGuard,
  StillResult,
  StillDefinition,
  PatchEntry,
  IStillSession,
  DomainProvider,
  PostValidationWarning,
} from './stills/types'
