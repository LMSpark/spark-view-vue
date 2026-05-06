// Core Layer — protocol + registry + runtime + knowledge

// Protocol
export {
  noGuard,
} from './protocol/function-contracts'
export type {
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
  actionToFunctionName,
  functionNameToAction,
  functionToToolDefinition,
} from './protocol/function-call-schema'
export {
  createMethodBackedDefinitions,
} from './protocol/method-backed-definition-builder'
export {
  AI_FUNCTION_ARCHITECTURE_PROMPT,
} from './protocol/architecture-prompt'
export {
  missingParam,
  isNonEmptyString,
  formatLlmParamValidationIssues,
  validateLlmDeserializedParams,
} from './protocol/llm-params-validator'
export type {
  LlmParamValidationIssue,
  LlmParamValidationOptions,
} from './protocol/llm-params-validator'
export type {
  DialogueTurn,
  FunctionTurnResult,
  LlmResponse,
  SessionBackend,
  SessionBackendSseEvent,
  SessionBackendTurnOptions,
  SessionAppendMessage,
  SessionConversationMessage,
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
  ProtocolRole,
  ProtocolMessage,
  TokenUsage,
  StreamCallbacks,
  AskOption,
  AskQuestion,
  AskParams,
} from './protocol/session-contracts'
export {
  extractFirstJsonObject,
  parseTokenUsage,
  formatTokenUsage,
  parseActionAddress,
} from './protocol/invocation-helpers'
export type {
  ActionAddressParts,
} from './protocol/invocation-helpers'

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
} from './protocol/invocation-helpers'
export {
  registerFunctionCarrier,
  registerFunctionCarriers,
  getFunctionCarrier,
  getFunctionCarrierByAction,
  getAllFunctionCarriers,
  clearFunctionCarrierRegistry,
} from './registry/function-carrier-registry'

// Runtime
export {
  createFunctionRuntimeContext,
} from './runtime/function-runtime-context'
export {
  executeFunction,
  executeFunctionAsync,
} from './runtime/function-dispatcher'
export {
  createSessionBackend,
} from './runtime/session-backend'
export type { SessionBackendOptions } from './runtime/session-backend'
export {
  createRepeatDetectionMonitor,
  type RepeatDetectionConfig,
} from './runtime/repeat-detection-monitor'
export {
  createDefaultFollowUpPolicy,
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
export {
  generateToolDefinitions,
} from './runtime/tool-schema-builder'

// Lifecycle config registry
export {
  CORE_LIFECYCLE_CONFIG_TREE,
  CORE_SESSION_LIFECYCLE_STAGES,
  listLifecycleConfigPaths,
  listCoreLifecycleConfigPaths,
  getLifecycleConfigTree,
  getCoreLifecycleTree,
} from './protocol/lifecycle-config-paths'
export type {
  LifecycleStage,
  LifecycleConfigNode,
  LifecycleConfigTree,
  LifecycleOwnerTree,
  LifecycleConfigPath,
} from './protocol/lifecycle-config-paths'

// Knowledge
export {
  coreKnowledgeFunctions,
  knowledgeQueryTools,
  knowledgeGuideTool,
  knowledgeQueryPayloads,
  knowledgeGuidePayload,
  knowledgeAsk,
} from './knowledge/knowledge-functions'
export {
  clearKnowledgeRegistry,
  getKnowledgePayloadProvider,
  getKnowledgePayloadProviders,
  registerKnowledgePayloadProvider,
} from './knowledge/payload-provider-registry'
export type {
  KnowledgeGuidePayloadParams,
  KnowledgePayloadCategory,
  KnowledgePayloadGuide,
  KnowledgePayloadKey,
  KnowledgePayloadProvider,
  KnowledgePayloadProviderSummary,
  KnowledgePayloadQueryFilter,
  KnowledgePayloadRef,
  KnowledgePayloadSummary,
  KnowledgeQueryPayloadCatalogResult,
  KnowledgeQueryPayloadProvidersResult,
  KnowledgeQueryPayloadsParams,
} from './protocol/knowledge-payload-contracts'
export type {
  KnowledgeModuleSummary,
  KnowledgeToolGuide,
  KnowledgeToolSummary,
} from './protocol/knowledge-query-contracts'
