/**
 * @packageDocumentation
 *
 * SPARK AI 公共入口。
 *
 * 本包只暴露三块稳定能力：
 * - schema           — LLM JSON Schema 类型定义、构造器、参数校验器
 * - module-semantic  — ModuleKind 语义协议核心 + ModuleSemanticRuntime 组合根
 * - host             — 框架无关的 AI Host 会话管理、传输层、工具循环
 *
 * 旧 runtime / protocol / core 入口已删除，不再提供兼容导出。
 */

// Schema --------------------------------------------------------------------

export {
  anySchema,
  arraySchema,
  booleanSchema,
  coerceJsonValue,
  enumSchema,
  numberSchema,
  objectSchema,
  coerceStrictJsonValue,
  stringSchema,
} from './schema'

export type {
  BooleanSchemaOptions,
  EnumSchemaOptions,
  NumberSchemaOptions,
  ObjectSchemaOptions,
  StringSchemaOptions,
} from './schema'

export {
  LlmSchemaValidator,
  noParamsSchema,
  paramsSchema,
} from './schema'

export type {
  LlmJsonObject,
  LlmJsonParamShape,
  LlmJsonParams,
  LlmJsonSchema,
  LlmJsonSchemaObject,
  LlmJsonSchemaType,
  LlmJsonValue,
} from './schema'

export type {
  LlmParamValidationIssue,
  LlmParamValidationResult,
} from './schema'

// Module semantic protocol --------------------------------------------------

export {
  ModuleCheckEntry,
  ModuleOperationResult,
} from './module-semantic/protocol/module-operation'

export {
  ModulePath,
  ModulePathParseError,
  ModulePathSegment,
} from './module-semantic/protocol/module-path'

export {
  ModuleKind,
} from './module-semantic/protocol/module-kind'

export type {
  ModuleKindConstructor,
} from './module-semantic/protocol/module-kind'

export type {
  ModuleCheckEntryLevel,
  ModuleOperationResultOptions,
} from './module-semantic/protocol/module-operation'

export type {
  ModuleFunctionFailureMode,
  ModuleFunctionMetadata,
  ModuleFunctionResultSchema,
  ModuleAttributeAccessor,
  ModuleAttributeAccess,
  ModuleAttributeMetadata,
  ModuleKindOptions,
  ModuleParameterPayloadMetadata,
} from './module-semantic/protocol/module-metadata'

export type {
  ModuleChildrenLister,
  ModuleHostContext,
  ModuleInstanceFinder,
  ModuleInstanceQuery,
  ModuleInstanceRef,
  ModuleKindOperation,
  ModuleKindRunner,
  ModulePathContext,
} from './module-semantic/protocol/module-context'

export type {
  ModulePathParseErrorCode,
} from './module-semantic/protocol/module-path'

export type {
  ModuleFindInstanceRequest,
  ModuleFunctionInvokeRequest,
  ModuleSetAttributeRequest,
} from './module-semantic/protocol/module-request'

export {
  ModuleSemanticRuntime,
} from './module-semantic/runtime/module-semantic-runtime'

export type {
  ModuleSemanticToolSpec,
} from './module-semantic/internal/protocol-tool-generator'

export type {
  ModuleKindDescription,
} from './module-semantic/internal/navigator'

export {
  ModuleParameterPayloadRegistry,
} from './module-semantic/payloads/module-parameter-payload-registry'

export type {
  ModuleParameterPayloadGuide,
  ModuleParameterPayloadProvider,
  ModuleParameterPayloadQueryFilter,
  ModuleParameterPayloadSummary,
} from './module-semantic/payloads/module-parameter-payload-registry'

export type {
  ProtocolToolArgs,
} from './module-semantic/runtime/module-semantic-runtime'

export type {
  ModuleSemanticKnowledgeFunctionFilter,
  ModuleSemanticKnowledgeFunctionGuide,
  ModuleSemanticKnowledgeFunctionGuideInput,
  ModuleSemanticKnowledgeFunctionSummary,
  ModuleSemanticKnowledgeModuleFilter,
  ModuleSemanticKnowledgeModuleSummary,
  ModuleSemanticKnowledgeSnapshot,
} from './module-semantic/knowledge/knowledge-types'

// Host business/session -----------------------------------------------------

export {
  AI_HOST,
  AiHost,
  createAiHost,
} from './host/business/ai-host'

export type {
  AiHostEnsureRegCommand,
  AiHostEntryMap,
  AiHostRunResult,
  CreateAiHostOptions,
} from './host/business/ai-host'

export {
  AiHostBusinessRegistration,
} from './host/business/registration-types'

export {
  AiHostBusinessRuntimeContext,
  AiHostBusinessScope,
  AiHostBusinessTarget,
} from './host/business/scope-types'

export {
  AiHostBusinessTask,
  createAiHostBusinessTask,
  projectAiHostBusinessRegistration,
} from './host/business/business-task'

export {
  AiHostBusinessSession,
  createAiHostBusinessSession,
  runAiHostBusiness,
  startRegistrationSession,
} from './host/business/business-session'

export {
  createAiHostBusinessScope,
  toAiHostRuntimeScope,
} from './host/business/business-scope'

export {
  AiHostSessionStore,
} from './host/session/session-types'

export {
  createAiHostTransportTurn,
} from './host/transport/transport-turn'

// Host tool loop ------------------------------------------------------------

export {
  AiHostToolLoopRunner,
} from './host/tool-loop/tool-loop-runner'

export {
  createTurnEventCollector,
} from './host/tool-loop/turn-event-collector'

export type {
  AiHostBusinessInputContract,
  AiHostBusinessKindDefinition,
  AiHostBusinessOrchestrationPlan,
  AiHostBusinessTaskChatOptions,
} from './host/business/business-task'

export type {
  AiHostBusinessRunCommand,
  AiHostBusinessRunResult,
} from './host/business/business-session'

export type {
  AiHostBusinessRegistrationOptions,
} from './host/business/registration-types'

export type {
  AiHostBusinessAfterFunctionCallOptions,
  AiHostBusinessLifecycleDirective,
  AiHostBusinessLifecycleStatus,
} from './host/business/lifecycle-types'

export type {
  AiHostBusinessAppendMessageOptions,
} from './host/business/scope-types'

export type {
  AiHostOptions,
} from './host/business/host-options'

export type {
  AiHostChatMessage,
  AiHostChatRequest,
  AiHostStreamEvent,
  AiHostToolCallRecord,
  AiHostTurnMeta,
} from './host/chat/chat-types'

export type {
  AiHostHistoryEntry,
  AiHostHistoryEntryBase,
  AiHostMessageHistoryEntry,
  AiHostMessageRole,
  AiHostSessionRecord,
  AiHostSessionStatus,
  AiHostStartSessionResult,
} from './host/session/session-types'

export type {
  AiHostFunctionCallFailure,
  AiHostFunctionCallHistoryEntry,
  AiHostFunctionCallHistoryStatus,
  AiHostFunctionCallResult,
  AiHostMessageSource,
} from './host/session/session-types'

export type {
  DefaultAiHostSessionStoreOptions,
} from './host/session/default-session-store'

// Host transport types ------------------------------------------------------

export type {
  AiHostAppendMessagesInput,
  AiHostAppSseEventSource,
  AiHostPrepareSessionInput,
  AiHostStreamTurnInput,
  AiHostStreamTurnResult,
  AiHostTurnCallbacks,
  AiHostTransportMessage,
  AiHostTransportToolCall,
  AiHostTransportToolSpec,
} from './host/transport/transport-types'

export type {
  AiHostTransportTurn,
} from './host/transport/transport-turn'

export type {
  AiHostAppSseEvent,
  AiHostAppSseEventName,
} from './host/transport/app-sse-events'

export type {
  TurnEventCollector,
} from './host/tool-loop/turn-event-collector'
