/**
 * @packageDocumentation
 *
 * Cross-framework AI Host session, transport, and tool-loop runtime.
 */

export {
  AiHostBusinessRegistration,
  AiHostBusinessRuntimeContext,
  AiHostBusinessScope,
  AiHostBusinessTarget,
} from './business/business-types'

export type {
  AiHostBusinessAfterFunctionCallOptions,
  AiHostBusinessAppendMessageOptions,
  AiHostBusinessLifecycleDirective,
  AiHostBusinessLifecycleStatus,
  AiHostBusinessRegistrationOptions,
  AiHostOptions,
  AiHostSender,
} from './business/business-types'

export {
  createAiHostBusinessScope,
  toAiHostRuntimeScope,
} from './business/business-scope'

export {
  AiHostBusinessRegistry,
} from './business/business-registry'

export {
  AiHostBusinessSession,
  createAiHostBusinessSession,
  startRegistrationSession,
} from './business/business-session'

export type {
  AiHostChatMessage,
  AiHostChatRequest,
  AiHostFcCallRecord,
  AiHostSseEvent,
  AiHostTurnMeta,
} from './chat/chat-types'

export {
  AiHostSessionStore,
} from './session/session-types'

export type {
  AiHostFunctionCallFailure,
  AiHostFunctionCallHistoryEntry,
  AiHostFunctionCallHistoryStatus,
  AiHostFunctionCallResult,
  AiHostHistoryEntry,
  AiHostHistoryEntryBase,
  AiHostMessageHistoryEntry,
  AiHostMessageRole,
  AiHostMessageSource,
  AiHostSessionRecord,
  AiHostSessionStatus,
  AiHostStartSessionResult,
} from './session/session-types'

export {
  DefaultAiHostSessionStore,
} from './session/default-session-store'

export type {
  DefaultAiHostSessionStoreOptions,
} from './session/default-session-store'

export {
  AiHostTransport,
} from './transport/transport-types'

export type {
  AiHostAppendMessagesInput,
  AiHostFetch,
  AiHostFetchTransportOptions,
  AiHostHeadersProvider,
  AiHostStreamTurnInput,
  AiHostStreamTurnResult,
  AiHostTransportMessage,
  AiHostTransportToolCall,
  AiHostTransportToolSpec,
  AiHostUploadedAttachment,
} from './transport/transport-types'

export {
  AiHostFetchTransport,
  parseAiHostSseBlocks,
} from './transport/fetch-transport'

export type {
  AiHostParsedSseEvent,
} from './transport/sse-parser'

export {
  uploadAiHostAttachment,
} from './transport/attachment-upload'

export {
  AiHostToolLoopRunner,
} from './tool-loop/tool-loop-runner'
