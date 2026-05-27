/**
 * ═══════════════════════════════════════════════════════════════
 * host/index.ts — Host 层公共入口
 * ═══════════════════════════════════════════════════════════════
 *
 * 【导出策略】按功能域分组：
 *   1. 业务类型与注册（scope-types / registration-types）
 *   2. 业务作用域工厂（business-scope）
 *   3. 业务会话（business-session）
 *   4. 聊天 DTO（chat-types）
 *   5. 会话存储（session-types / default-session-store）
 *   6. APP turn 回调契约与事件类型（transport-types / app-sse-events）
 *   7. 工具循环（tool-loop-runner / turn-event-collector）
 *
 * 【设计原则】
 *   - class 用 export，type 用 export type（遵循 verbatimModuleSyntax）
 *   - 仅导出公共 API，内部实现细节不导出
 *   - 禁止 namespace 合并；公共类型从所属文件显式登记
 *
 * 【消费方】@spark-view/spark-ai（src/index.ts）、spark-page-config、spark-app
 * ═══════════════════════════════════════════════════════════════
 */

// ── 1. 业务类型与注册 ───────────────────────────────────────

export {
  AI_HOST,
  AiHost,
  createAiHost,
} from './business/ai-host'

export type {
  AiHostEnsureRegCommand,
  AiHostEntryMap,
  AiHostRunResult,
  CreateAiHostOptions,
} from './business/ai-host'

export {
  AiHostBusinessRegistration,
} from './business/registration-types'

export {
  AiHostBusinessRuntimeContext,
  AiHostBusinessScope,
  AiHostBusinessTarget,
} from './business/scope-types'

export {
  AiHostBusinessTask,
  createAiHostBusinessTask,
  projectAiHostBusinessRegistration,
} from './business/business-task'

export type {
  AiHostBusinessRegistrationOptions,
} from './business/registration-types'

export type {
  AiHostBusinessInputContract,
  AiHostBusinessKindDefinition,
  AiHostBusinessOrchestrationPlan,
  AiHostBusinessTaskChatOptions,
} from './business/business-task'

export type {
  AiHostBusinessAfterFunctionCallOptions,
  AiHostBusinessLifecycleDirective,
  AiHostBusinessLifecycleStatus,
} from './business/lifecycle-types'

export type {
  AiHostBusinessAppendMessageOptions,
} from './business/scope-types'

export type {
  AiHostOptions,
} from './business/host-options'

// ── 2. 业务作用域工厂 ───────────────────────────────────────

export {
  createAiHostBusinessScope,
  toAiHostRuntimeScope,
} from './business/business-scope'

// ── 3. 业务会话 ─────────────────────────────────────────────

export {
  AiHostBusinessSession,
  createAiHostBusinessSession,
  runAiHostBusiness,
  startRegistrationSession,
} from './business/business-session'

export type {
  AiHostBusinessRunCommand,
  AiHostBusinessRunResult,
} from './business/business-session'

// ── 4. 聊天 DTO ─────────────────────────────────────────────

export type {
  AiHostChatMessage,
  AiHostChatRequest,
  AiHostStreamEvent,
  AiHostToolCallRecord,
  AiHostTurnMeta,
} from './chat/chat-types'

// ── 5. 会话存储契约 ─────────────────────────────────────────

export {
  AiHostSessionStore,
} from './session/session-types'

export type {
  AiHostHistoryEntry,
  AiHostHistoryEntryBase,
  AiHostMessageHistoryEntry,
  AiHostMessageRole,
  AiHostSessionRecord,
  AiHostSessionStatus,
  AiHostStartSessionResult,
} from './session/session-types'

export type {
  AiHostFunctionCallFailure,
  AiHostFunctionCallHistoryEntry,
  AiHostFunctionCallHistoryStatus,
  AiHostFunctionCallResult,
  AiHostMessageSource,
} from './session/session-types'

// ── 6. 内存会话存储实现 ─────────────────────────────────────

export {
  DefaultAiHostSessionStore,
} from './session/default-session-store'

export type {
  DefaultAiHostSessionStoreOptions,
} from './session/default-session-store'

export {
  createAiHostSessionTranscript,
  previewAiHostDiagnosticValue,
  summarizeAiHostSessionRecord,
} from './session/session-diagnostics'

export type {
  AiHostSessionSummary,
  AiHostSessionTranscriptEntry,
  AiHostSessionTranscriptOptions,
} from './session/session-diagnostics'

// ── 7. APP turn 回调契约与类型 ──────────────────────────────

export {
  createAiHostTransportTurn,
} from './transport/transport-turn'

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
} from './transport/transport-types'

export type {
  AiHostTransportTurn,
} from './transport/transport-turn'

export type {
  AiHostAppSseEvent,
  AiHostAppSseEventName,
} from './transport/app-sse-events'

// ── 8. 工具循环执行器 ───────────────────────────────────────

export {
  AiHostToolLoopRunner,
} from './tool-loop/tool-loop-runner'

export {
  createTurnEventCollector,
} from './tool-loop/turn-event-collector'

export type {
  TurnEventCollector,
} from './tool-loop/turn-event-collector'
