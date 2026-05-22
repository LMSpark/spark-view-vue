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

export {
  anySchema,
  arraySchema,
  booleanSchema,
  enumSchema,
  LlmSchemaValidator,
  noParamsSchema,
  numberSchema,
  objectSchema,
  paramsSchema,
  stringSchema,
} from './schema'

export type {
  LlmJsonObject,
  LlmJsonSchema,
  LlmJsonSchemaObject,
  LlmJsonSchemaType,
  LlmJsonValue,
  LlmParamValidationIssue,
  LlmParamValidationResult,
} from './schema'

export {
  ModuleCheckEntry,
  ModuleKind,
  ModuleKindConflictError,
  ModuleKindNotFoundError,
  ModuleOperationResult,
  ModulePath,
  ModulePathParseError,
  ModulePathSegment,
  ModuleSemanticRuntime,
  ModuleSemanticToolCodec,
  PROTOCOL_TOOL_NAMES,
} from './module-semantic'

export type {
  ModuleActionFailureMode,
  ModuleActionMetadata,
  ModuleActionResultSchema,
  ModuleAttributeAccess,
  ModuleAttributeMetadata,
  ModuleCheckEntryLevel,
  ModuleChildrenLister,
  ModuleHostContext,
  ModuleInstanceFinder,
  ModuleInstanceQuery,
  ModuleInstanceRef,
  ModuleKindDescription,
  ModuleKindOperation,
  ModuleKindOptions,
  ModuleKindRunner,
  ModuleOperationResultOptions,
  ModulePathContext,
  ModulePathParseErrorCode,
  ModuleSemanticToolSpec,
  ProtocolToolArgs,
  ProtocolToolName,
} from './module-semantic'

export {
  AiHostBusinessRegistration,
  AiHostBusinessRegistry,
  AiHostBusinessRuntimeContext,
  AiHostBusinessScope,
  AiHostBusinessSession,
  AiHostBusinessTarget,
  AiHostFetchTransport,
  AiHostSessionStore,
  AiHostToolLoopRunner,
  AiHostTransport,
  createAiHostBusinessScope,
  createAiHostBusinessSession,
  parseAiHostSseBlocks,
  startRegistrationSession,
  toAiHostRuntimeScope,
  uploadAiHostAttachment,
} from './host'

export type {
  AiHostAppendMessagesInput,
  AiHostBusinessAfterFunctionCallOptions,
  AiHostBusinessAppendMessageOptions,
  AiHostBusinessLifecycleDirective,
  AiHostBusinessLifecycleStatus,
  AiHostBusinessRegistrationOptions,
  AiHostChatMessage,
  AiHostChatRequest,
  AiHostFcCallRecord,
  AiHostFetch,
  AiHostFetchTransportOptions,
  AiHostFunctionCallFailure,
  AiHostFunctionCallHistoryEntry,
  AiHostFunctionCallHistoryStatus,
  AiHostFunctionCallResult,
  AiHostHeadersProvider,
  AiHostHistoryEntry,
  AiHostHistoryEntryBase,
  AiHostMessageHistoryEntry,
  AiHostMessageRole,
  AiHostMessageSource,
  AiHostOptions,
  AiHostParsedSseEvent,
  AiHostSender,
  AiHostSessionRecord,
  AiHostSessionStatus,
  AiHostSseEvent,
  AiHostStartSessionResult,
  AiHostStreamTurnInput,
  AiHostStreamTurnResult,
  AiHostTransportMessage,
  AiHostTransportToolCall,
  AiHostTransportToolSpec,
  AiHostTurnMeta,
  AiHostUploadedAttachment,
  DefaultAiHostSessionStoreOptions,
} from './host'
