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
  AI_AGENT_HOST,
  AiAgentHost,
  createAiAgentHost,
} from './business/ai-host'

export type {
  AiAgentHostEnsureCommand,
  AiAgentHostEntryMap,
  AiAgentHostRunResult,
  CreateAiAgentHostOptions,
} from './business/ai-host'

export {
  AiAgentRegistration,
} from './business/registration-types'

export {
  AiAgentRuntimeContext,
  AiAgentScope,
  AiAgentTarget,
} from './business/scope-types'

export {
  AiAgentTask,
  createAiAgentTask,
  createAiAgentRegistration,
} from './business/business-task'

export type {
  AiAgentRegistrationOptions,
} from './business/registration-types'

export type {
  AiAgentInputContract,
  AiAgentDefinition,
  AiAgentOrchestrationPlan,
  AiAgentTaskChatOptions,
} from './business/business-task'

export type {
  AiAgentAfterFunctionCallOptions,
  AiAgentLifecycleDirective,
  AiAgentLifecycleStatus,
} from './business/lifecycle-types'

export type {
  AiAgentAppendMessageOptions,
} from './business/scope-types'

export type {
  AiAgentOptions,
} from './business/host-options'

// ── 2. 业务作用域工厂 ───────────────────────────────────────

export {
  createAiAgentScope,
  toAiAgentRuntimeScope,
} from './business/business-scope'

// ── 3. 业务会话 ─────────────────────────────────────────────

export {
  AiAgentSession,
  createAiAgentSession,
  runAiAgent,
  startAiAgentRegistrationSession,
} from './business/business-session'

export type {
  AiAgentRunCommand,
  AiAgentRunResult,
} from './business/business-session'

// ── 4. 聊天 DTO ─────────────────────────────────────────────

export type {
  AiAgentChatMessage,
  AiAgentChatRequest,
  AiAgentStreamEvent,
  AiAgentToolCallRecord,
  AiAgentTurnMeta,
} from './chat/chat-types'

// ── 5. 会话存储契约 ─────────────────────────────────────────

export {
  AiAgentSessionStore,
} from './session/session-types'

export type {
  AiAgentHistoryEntry,
  AiAgentHistoryEntryBase,
  AiAgentMessageHistoryEntry,
  AiAgentMessageRole,
  AiAgentSessionRecord,
  AiAgentSessionStatus,
  AiAgentStartSessionResult,
} from './session/session-types'

export type {
  AiAgentFunctionCallFailure,
  AiAgentFunctionCallHistoryEntry,
  AiAgentFunctionCallHistoryStatus,
  AiAgentFunctionCallResult,
  AiAgentMessageSource,
} from './session/session-types'

// ── 6. 内存会话存储实现 ─────────────────────────────────────

export {
  DefaultAiAgentSessionStore,
} from './session/default-session-store'

export type {
  DefaultAiAgentSessionStoreOptions,
} from './session/default-session-store'

export {
  createAiAgentSessionTranscript,
  previewAiAgentDiagnosticValue,
  summarizeAiAgentSessionRecord,
} from './session/session-diagnostics'

export type {
  AiAgentSessionSummary,
  AiAgentSessionTranscriptEntry,
  AiAgentSessionTranscriptOptions,
} from './session/session-diagnostics'

// ── 7. APP turn 回调契约与类型 ──────────────────────────────

export {
  createAiAgentTransportTurn,
} from './transport/transport-turn'

export type {
  AiAgentAppendMessagesInput,
  AiAgentAppSseEventSource,
  AiAgentPrepareSessionInput,
  AiAgentStreamTurnInput,
  AiAgentStreamTurnResult,
  AiAgentTurnCallbacks,
  AiAgentTransportMessage,
  AiAgentTransportToolCall,
  AiAgentTransportToolSpec,
} from './transport/transport-types'

export type {
  AiAgentTransportTurn,
} from './transport/transport-turn'

export type {
  AiAgentAppSseEvent,
  AiAgentAppSseEventName,
} from './transport/app-sse-events'

// ── 8. 工具循环执行器 ───────────────────────────────────────

export {
  AiAgentToolLoopRunner,
} from './tool-loop/tool-loop-runner'

export {
  createTurnEventCollector,
} from './tool-loop/turn-event-collector'

export type {
  TurnEventCollector,
} from './tool-loop/turn-event-collector'
