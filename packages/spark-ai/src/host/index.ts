/**
 * @packageDocumentation
 *
 * 跨框架 AI Host 协议与运行时。
 */

export type {
  AiHostAppendMessagesInput,
  AiHostBusinessAfterFunctionCallOptions,
  AiHostBusinessAppendMessageOptions,
  AiHostBusinessExecuteFunctionCallOptions,
  AiHostBusinessLifecycleDirective,
  AiHostBusinessLifecycleStatus,
  AiHostBusinessRegistration,
  AiHostBusinessRuntimeContext,
  AiHostBusinessScope,
  AiHostBusinessSession,
  AiHostBusinessTarget,
  AiHostChatRequest,
  AiHostFcCallRecord,
  AiHostFunctionCallFailure,
  AiHostFunctionCallHistoryEntry,
  AiHostFunctionCallHistoryStatus,
  AiHostFunctionCallResult,
  AiHostHistoryEntry,
  AiHostHistoryEntryBase,
  AiHostMessageHistoryEntry,
  AiHostMessageRole,
  AiHostMessageSource,
  AiHostOptions,
  AiHostSelectedBusiness,
  AiHostSender,
  AiHostSessionRecord,
  AiHostSessionStatus,
  AiHostSessionStore,
  AiHostSseEvent,
  AiHostStartSessionResult,
  AiHostStreamTurnInput,
  AiHostStreamTurnResult,
  AiHostTransport,
  AiHostTransportMessage,
  AiHostTransportToolCall,
  AiHostTransportToolSpec,
  AiHostTurnMeta,
} from './types'

export {
  createAiHostBusinessScope,
  createAiHostBusinessSessionId,
  createAiHostBusinessStorageKey,
  createAiHostStreamKey,
  normalizeAiHostBusinessTarget,
  toAiHostRuntimeScope,
} from './scope'

export {
  latestUserInput,
  normalizeTurn,
  toCurrentTurnMessages,
} from './turn-utils'

export {
  AiHostBusinessRegistry,
} from './business-registry'

export {
  DefaultAiHostSessionStore,
} from './session-store'

export type {
  DefaultAiHostSessionStoreOptions,
} from './session-store'

export {
  AiHostToolLoopRunner,
} from './tool-loop'

export {
  actionModuleId,
  emitLlmDiagnosticEvent,
  eventModuleIdFromProtocolCall,
  stringifyAiHostPayload,
} from './diagnostics'

export {
  AiHostMessageSender,
  createAiHostBusinessSession,
  startRegistrationSession,
} from './sending'

export type {
  AiHostSendContext,
  AiHostSendInput,
} from './sending'

export {
  AiHostFetchTransport,
  parseAiHostSseBlocks,
  uploadAiHostAttachment,
} from './fetch-transport'

export type {
  AiHostFetch,
  AiHostFetchTransportOptions,
  AiHostHeadersProvider,
  AiHostParsedSseEvent,
  AiHostUploadedAttachment,
} from './fetch-transport'
