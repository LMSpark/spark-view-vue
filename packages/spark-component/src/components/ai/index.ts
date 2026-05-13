export { default as AiChatShell } from './AiChatShell.vue'
export { default as AiChatWidget } from './AiChatWidget.vue'
export { default as AppAiPanel } from './AppAiPanel.vue'
export { default as AiLauncherButton } from './AiLauncherButton.vue'

export {
  registerAiCacheEventHandler,
  readCache,
  writeCache,
  removeCache,
  listCache,
  clearCacheByPrefix,
  clearSessionByPageId,
  SESSION_SNAPSHOT_PREFIX,
  PANEL_LAYOUT_PREFIX,
  ALL_AI_CACHE_PREFIXES,
} from './aiSessionCache'
export type { AiCacheEntry } from './aiSessionCache'

export { useAiChat } from './useAiChat'
export type {
  UseAiChatOptions,
  StreamAiChatTextRequest,
  StreamAiChatText,
  FileAttachment,
  TokenUsage,
  ChatMessage,
  ChatMode,
  AiTurnStatus,
  AiTurnOverflowPolicy,
  AiTurnConcurrencyConfig,
  AiTurnRequestMeta,
  RecoveryPolicy,
  CollaborationPolicy,
  ToolLogEntry,
  AiSseEventEntry,
  AiSseEventScope,
  AiSseEventInput,
  AiFcCallRecord,
  AiFcCallInput,
  AiFcErrorReportStatus,
  AiFcErrorReportResult,
  AiFcErrorReporter,
  AiSessionMetaConfig,
  AiSessionPolicies,
  AiSessionSnapshot,
  AiStoredChatMessage,
  AiSessionStorageSnapshot,
  AiChatSendRequest,
  AiChatSender,
} from './useAiChat'

export { useAiPanelStore } from './useAiPanelStore'
export type {
  AiSessionToolLog,
  AiToolSpec,
  AiToolInvocationContext,
  AiToolHandler,
  AiFcLoopConfig,
  AiFeedbackConfig,
  AiSessionEventMap,
  AiSessionEventName,
  AiSessionEventHandler,
  AiSessionHooks,
  AiSessionConfig,
} from './useAiPanelStore'

export {
  toSafeText,
  findLatestUserPrompt,
  pickRecentConversation,
  streamWithFallback,
} from './useAiSenderHelpers'
export type { StreamWithFallbackOptions } from './useAiSenderHelpers'
