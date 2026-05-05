// Core Layer — protocol + registry + runtime + knowledge

// Protocol
export {
  createFunctionRuntimeContext,
  noGuard,
} from './protocol/function-contracts'
export type {
  FunctionKind,
  FunctionCarrierKey,
  FunctionCarrierContract,
  FunctionBeforeExecuteEvent,
  FunctionAfterExecuteEvent,
  FunctionBeforeExecuteDecision,
  FunctionBeforeExecuteEmitter,
  FunctionAfterExecuteEmitter,
  FunctionCarrierBeforeExecuteHook,
  FunctionCarrierAfterExecuteHook,
  FunctionResult,
  FunctionFailureMode,
  FunctionCatalogRow,
  PostValidationWarning,
  FunctionTraceEntry,
  FunctionRuntimeContext,
  FunctionGuard,
  RegisteredFunctionDefinition,
} from './protocol/function-contracts'
export {
  missingParam,
  isNonEmptyString,
  buildExecutionTraceSummary,
} from './protocol/function-utils'
export {
  actionToFunctionName,
  functionNameToAction,
  functionToToolDefinition,
  generateToolDefinitions,
} from './protocol/fc-schema'
export {
  AI_FUNCTION_ARCHITECTURE_PROMPT,
} from './protocol/architecture-prompt'
export {
  formatLlmParamValidationIssues,
  validateLlmDeserializedParams,
} from './protocol/function-params-validator'
export type {
  LlmParamValidationIssue,
  LlmParamValidationOptions,
} from './protocol/function-params-validator'
export type {
  DialogueTurn,
  FunctionTurnResult,
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
} from './protocol/session-contracts'

// Registry
export {
  registerFunction,
  registerFunctions,
  getFunctionDefinition,
  getAllFunctionDefinitions,
  clearFunctionRegistry,
} from './registry/function-registry'
export {
  actionToCarrierKey,
  registerFunctionCarrier,
  registerFunctionCarriers,
  getFunctionCarrier,
  getFunctionCarrierByAction,
  getAllFunctionCarriers,
  clearFunctionCarrierRegistry,
} from './registry/function-carrier-registry'

// Runtime
export {
  executeFunction,
  executeFunctionAsync,
} from './runtime/function-dispatcher'
export {
  invokeNamedMethod,
  toErrorMessage,
} from './runtime/method-invoker'
export {
  createMethodBackedDefinitions,
} from './runtime/method-backed-definitions'
export {
  dispatchToolCall,
  dispatchToolCallAsync,
  dispatchToolCalls,
  dispatchToolCallsAsync,
  formatToolResultContent,
  buildAssistantToolCallMessage,
  buildToolResultMessage,
} from './runtime/fc-dispatcher'
export {
  SessionBackendImpl,
} from './runtime/session-backend'
export type { SessionBackendImplOptions } from './runtime/session-backend'
export {
  createRepeatDetectionMonitor,
  type RepeatDetectionConfig,
} from './runtime/repeat-detection-monitor'
export {
  createDefaultFollowUpPolicy,
  DefaultFollowUpPolicy,
  formatWarningsAsFollowUp,
  buildInlineFunctionGuide,
  buildErrorFollowUp,
  toParamsSignature,
  countConsecutiveSameFailedSignature,
} from './runtime/default-follow-up-policy'
export type { FollowUpDecorations } from './runtime/default-follow-up-policy'
export {
  runFunctionLoop,
} from './runtime/session-orchestrator'

// Lifecycle config registry
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

// Knowledge
export {
  registerCoreKnowledgeFunctions,
} from './knowledge/register-knowledge-functions'
export {
  coreKnowledgeFunctions,
  knowledgeQueryTools,
  knowledgeGuideTool,
  knowledgeQueryPayloads,
  knowledgeGuidePayload,
  knowledgeAsk,
} from './knowledge/query-actions'
export {
  clearKnowledgeRegistry,
  getKnowledgePayloadProvider,
  getKnowledgePayloadProviders,
  registerKnowledgePayloadProvider,
} from './knowledge/registry'
export type {
  KnowledgePayloadGuide,
  KnowledgePayloadProvider,
  KnowledgePayloadSummary,
} from './knowledge/types'
