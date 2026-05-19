/**
 * @packageDocumentation
 *
 * 跨框架 AI Host 协议与运行时。
 *
 * 提供框架无关的显式业务会话、工具调用循环和传输层契约，
 * 不依赖 Vue/React/Angular 等前端框架。
 */

// 类型定义
export type {
  AiHostAppendMessagesInput,
  AiHostBusinessAfterFunctionCallOptions,
  AiHostBusinessAppendMessageOptions,
  AiHostBusinessExecuteFunctionCallOptions,
  AiHostBusinessLifecycleDirective,
  AiHostBusinessLifecycleStatus,
  AiHostBusinessRuntime,
  AiHostBusinessRuntimeContext,
  AiHostBusinessScope,
  AiHostBusinessSession,
  AiHostBusinessTarget,
  AiHostChatRequest,
  AiHostFcCallRecord,
  AiHostOptions,
  AiHostSelectedBusiness,
  AiHostSender,
  AiHostStreamTurnInput,
  AiHostStreamTurnResult,
  AiHostSseEvent,
  AiHostTransport,
  AiHostTransportMessage,
  AiHostTransportToolCall,
  AiHostTransportToolSpec,
  AiHostTurnMeta,
} from './types'

// 作用域工具
export {
  createAiHostBusinessScope,
  createAiHostBusinessSessionId,
  createAiHostBusinessStorageKey,
  createAiHostStreamKey,
  normalizeAiHostBusinessTarget,
  toAiHostRuntimeScope,
} from './scope'

// Turn 工具
export {
  latestUserInput,
  normalizeTurn,
  toCurrentTurnMessages,
} from './turn-utils'

// 业务注册表
export {
  AiHostBusinessRegistry,
} from './business-registry'

// 工具调用循环
export {
  AiHostToolLoopRunner,
} from './tool-loop'

// 诊断工具
export {
  actionModuleId,
  emitLlmDiagnosticEvent,
  stringifyAiHostPayload,
} from './diagnostics'

// 消息发送（框架无关的 send 核心逻辑）
export {
  AiHostMessageSender,
  createAiHostBusinessSession,
} from './sending'

export type {
  AiHostSendContext,
  AiHostSendInput,
} from './sending'
