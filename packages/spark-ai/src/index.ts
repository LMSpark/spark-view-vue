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
  enumSchema,
  numberSchema,
  objectSchema,
  stringSchema,
} from './schema/schema-builders-api'

export {
  LlmSchemaValidator,
  noParamsSchema,
  paramsSchema,
} from './schema/schema-params-api'

export type {
  LlmJsonObject,
  LlmJsonSchema,
  LlmJsonSchemaObject,
  LlmJsonSchemaType,
  LlmJsonValue,
} from './schema/schema-core-api'

export type {
  LlmParamValidationIssue,
  LlmParamValidationResult,
} from './schema/schema-params-api'

// Module semantic protocol --------------------------------------------------

export {
  ModuleCheckEntry,
  ModuleKind,
  ModuleOperationResult,
  ModulePath,
  ModulePathParseError,
  ModulePathSegment,
} from './module-semantic/protocol-core-api'

export type {
  ModuleCheckEntryLevel,
} from './module-semantic/protocol-core-api'

export type {
  ModuleActionFailureMode,
  ModuleActionMetadata,
  ModuleActionResultSchema,
  ModuleKindOperation,
  ModuleKindRunner,
  ModuleOperationResultOptions,
} from './module-semantic/protocol-action-api'

export type {
  ModuleAttributeAccess,
  ModuleAttributeMetadata,
  ModuleKindOptions,
  ModuleParameterPayloadMetadata,
} from './module-semantic/protocol-metadata-api'

export type {
  ModuleChildrenLister,
  ModuleHostContext,
  ModuleInstanceFinder,
  ModuleInstanceQuery,
  ModuleInstanceRef,
} from './module-semantic/protocol-instance-api'

export type {
  ModulePathContext,
  ModulePathParseErrorCode,
} from './module-semantic/protocol-path-api'

export {
  ModuleSemanticRuntime,
} from './module-semantic/runtime/module-semantic-runtime'

export {
  ModuleSemanticToolCodec,
} from './module-semantic/host/index'

export {
  PROTOCOL_TOOL_NAMES,
} from './module-semantic/internal/protocol-tool-generator'

export type {
  ModuleSemanticToolSpec,
  ProtocolToolName,
} from './module-semantic/internal/protocol-tool-generator'

export type {
  ModuleKindDescription,
} from './module-semantic/internal/navigator'

export {
  ModuleKindConflictError,
  ModuleKindNotFoundError,
} from './module-semantic/internal/module-kind-registry'

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
  ModuleSemanticKnowledgeModuleSummary,
  ModuleSemanticKnowledgeSnapshot,
} from './module-semantic/knowledge/module-semantic-knowledge'

// Host business/session -----------------------------------------------------

export {
  AiHostBusinessRegistration,
  AiHostBusinessRuntimeContext,
  AiHostBusinessScope,
  AiHostBusinessTarget,
} from './host/business/business-registration-api'

export {
  AiHostBusinessRegistry,
} from './host/business/business-registry'

export {
  AiHostBusinessSession,
  createAiHostBusinessSession,
  startRegistrationSession,
} from './host/business/business-session'

export {
  createAiHostBusinessScope,
  toAiHostRuntimeScope,
} from './host/business/business-scope'

export {
  AiHostSessionStore,
} from './host/session/session-record-api'

export {
  AiHostTransport,
} from './host/transport/transport-core-api'

// Host transport ------------------------------------------------------------

export {
  AiHostFetchTransport,
  parseAiHostSseBlocks,
} from './host/transport/fetch-transport'

export {
  createAiHostAppSseEventHub,
  subscribeAiHostAppSseEvents,
} from './host/transport/app-sse-events'

export {
  uploadAiHostAttachment,
} from './host/transport/attachment-upload'

// Host tool loop ------------------------------------------------------------

export {
  AiHostToolLoopRunner,
} from './host/tool-loop/tool-loop-runner'

export type {
  AiHostBusinessLifecycleDirective,
  AiHostBusinessLifecycleStatus,
  AiHostBusinessRegistrationOptions,
} from './host/business/business-registration-api'

export type {
  AiHostBusinessAfterFunctionCallOptions,
  AiHostBusinessAppendMessageOptions,
  AiHostOptions,
  AiHostSender,
} from './host/business/business-host-api'

export type {
  AiHostChatMessage,
  AiHostChatRequest,
  AiHostFcCallRecord,
  AiHostSseEvent,
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
} from './host/session/session-record-api'

export type {
  AiHostFunctionCallFailure,
  AiHostFunctionCallHistoryEntry,
  AiHostFunctionCallHistoryStatus,
  AiHostFunctionCallResult,
  AiHostMessageSource,
} from './host/session/session-function-call-api'

export type {
  DefaultAiHostSessionStoreOptions,
} from './host/session/default-session-store'

// Host transport types ------------------------------------------------------

export type {
  AiHostStreamTurnInput,
  AiHostStreamTurnResult,
  AiHostTransportMessage,
  AiHostTransportToolCall,
  AiHostTransportToolSpec,
  AiHostUploadedAttachment,
} from './host/transport/transport-core-api'

export type {
  AiHostAppendMessagesInput,
  AiHostFetch,
  AiHostFetchTransportOptions,
  AiHostHeadersProvider,
} from './host/transport/transport-fetch-api'

export type {
  AiHostParsedSseEvent,
} from './host/transport/sse-parser'

export type {
  AiHostAppSseEvent,
  AiHostAppSseEventName,
  AiHostAppSseEventHub,
  AiHostAppSseListener,
  AiHostAppSseSubscribeOptions,
  AiHostAppSseSubscription,
} from './host/transport/app-sse-events'
