/**
 * 组件层入口。
 *
 * 聚合所有可渲染组件、组件内部注册函数以及少量对外暴露的组件级 composable。
 */

// ── AI 面板 Composable ─────────────────────────────────────────────────────────
export { registerAiCacheEventHandler, readCache, writeCache, removeCache, listCache, clearCacheByPrefix, clearSessionByPageId } from '../composables/aiSessionCache'
export { SESSION_SNAPSHOT_PREFIX, PANEL_LAYOUT_PREFIX, ALL_AI_CACHE_PREFIXES } from '../composables/aiSessionCache'
export type { AiCacheEntry } from '../composables/aiSessionCache'
export { useAiChat } from '../composables/useAiChat'
export type { UseAiChatOptions, StreamAiChatTextRequest, StreamAiChatText, FileAttachment, TokenUsage, ChatMessage, ChatMode, RecoveryPolicy, CollaborationPolicy, ToolLogEntry, AiSseEventEntry, AiSseEventInput, AiFcCallRecord, AiFcCallInput, AiFcErrorReportStatus, AiFcErrorReportResult, AiFcErrorReporter, AiSessionMetaConfig, AiSessionPolicies, AiSessionSnapshot, AiChatSendRequest, AiChatSender } from '../composables/useAiChat'
export { useAiPanelStore } from '../composables/useAiPanelStore'
export type { AiSessionToolLog, AiToolSpec, AiToolInvocationContext, AiToolHandler, AiFcLoopConfig, AiFeedbackConfig, AiSessionEventMap, AiSessionEventName, AiSessionEventHandler, AiSessionHooks, AiSessionConfig } from '../composables/useAiPanelStore'
export { toSafeText, findLatestUserPrompt, pickRecentConversation, streamWithFallback } from '../composables/useAiSenderHelpers'
export type { StreamWithFallbackOptions } from '../composables/useAiSenderHelpers'

// ── 支持组件 ──────────────────────────────────────────────────────────────────
export { default as SparkComponentRenderer } from './SparkComponentRenderer.vue'
export { default as SparkCodeEditor } from './support/SparkCodeEditor.vue'
export { default as SparkJsonEditor } from './support/SparkJsonEditor.vue'
export { default as JsonTreeEditor } from './support/JsonTreeEditor.vue'
export { default as AiChatShell } from './support/AiChatShell.vue'
export { default as AiChatWidget } from './support/AiChatWidget.vue'
export { default as AppAiPanel } from './support/AppAiPanel.vue'
export { default as AiLauncherButton } from './support/AiLauncherButton.vue'
export * from './support/jsonTreeEditor.js'

// ── 组件 re-exports（leaf barrel 统一导出）──────────────────────────────────
export * from './containers/data-components/index.js'
export * from './containers/non-data-components/index.js'
export * from './fields/data-components/index.js'
export * from './fields/non-data-components/index.js'
export * from './display/data-components/index.js'
export * from './display/non-data-components/index.js'

// ── 注册 & composable ────────────────────────────────────────────────────────
export { registerAllRenderers } from './register-renderers.js'
export { useFieldPermission } from './fields/context/useFieldPermission.js'
