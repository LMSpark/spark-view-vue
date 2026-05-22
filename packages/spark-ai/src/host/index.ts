/**
 * ═══════════════════════════════════════════════════════════════
 * host/index.ts — Host 层公共入口
 * ═══════════════════════════════════════════════════════════════
 *
 * 【导出策略】按功能域分组：
 *   1. 业务类型与注册（business-types / business-registry）
 *   2. 业务作用域工厂（business-scope）
 *   3. 业务会话（business-session）
 *   4. 聊天 DTO（chat-types）
 *   5. 会话存储（session-types / default-session-store）
 *   6. 传输层（transport-types / fetch-transport / sse-parser / attachment-upload）
 *   7. 工具循环（tool-loop-runner）
 *
 * 【设计原则】
 *   - class 用 export，type 用 export type（遵循 verbatimModuleSyntax）
 *   - 仅导出公共 API，内部实现细节不导出
 *   - class 和同名 namespace 合并的类型由 class 导出自然覆盖
 *
 * 【消费方】@spark-view/spark-ai（src/index.ts）、spark-page-config、spark-app
 * ═══════════════════════════════════════════════════════════════
 */

// ── 1. 业务类型与注册 ───────────────────────────────────────

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

// ── 2. 业务作用域工厂 ───────────────────────────────────────

export {
  createAiHostBusinessScope,
  toAiHostRuntimeScope,
} from './business/business-scope'

// ── 3. 业务注册表 ───────────────────────────────────────────

export {
  AiHostBusinessRegistry,
} from './business/business-registry'

// ── 4. 业务会话 ─────────────────────────────────────────────

export {
  AiHostBusinessSession,
  createAiHostBusinessSession,
  startRegistrationSession,
} from './business/business-session'

// ── 5. 聊天 DTO ─────────────────────────────────────────────

export type {
  AiHostChatMessage,
  AiHostChatRequest,
  AiHostFcCallRecord,
  AiHostSseEvent,
  AiHostTurnMeta,
} from './chat/chat-types'

// ── 6. 会话存储契约 ─────────────────────────────────────────

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

// ── 7. 内存会话存储实现 ─────────────────────────────────────

export {
  DefaultAiHostSessionStore,
} from './session/default-session-store'

export type {
  DefaultAiHostSessionStoreOptions,
} from './session/default-session-store'

// ── 8. 传输层抽象与类型 ─────────────────────────────────────

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

// ── 9. Fetch + SSE 传输实现 ─────────────────────────────────

export {
  AiHostFetchTransport,
  parseAiHostSseBlocks,
} from './transport/fetch-transport'

export type {
  AiHostParsedSseEvent,
} from './transport/sse-parser'

// ── 10. 附件上传 ────────────────────────────────────────────

export {
  uploadAiHostAttachment,
} from './transport/attachment-upload'

// ── 11. 工具循环执行器 ──────────────────────────────────────

export {
  AiHostToolLoopRunner,
} from './tool-loop/tool-loop-runner'
