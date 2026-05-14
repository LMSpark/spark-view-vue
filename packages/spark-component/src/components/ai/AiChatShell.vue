<template>
  <div class="ai-chat-widget" :class="{ compact: compact }">
    <div class="chat-header">
      <span class="chat-title">{{ title ?? 'AI 助手' }}</span>
      <div class="chat-header-actions">
        <span v-if="showTurnStatus" class="turn-status" :title="turnStatusTitle">
          并行 {{ activeTurnCountDisplay }}/{{ maxParallelTurnsDisplay }}<template v-if="queuedTurnCountDisplay > 0"> · 队列 {{ queuedTurnCountDisplay }}</template>
        </span>
        <template v-if="toolLogs !== undefined">
          <button
            v-for="opt in RECOVERY_OPTIONS"
            :key="opt.value"
            class="policy-btn"
            :class="{ 'policy-btn--active': recoveryPolicy === opt.value }"
            :title="opt.label"
            @click="emit('update:recoveryPolicy', opt.value)"
          >{{ opt.short }}</button>
          <span class="policy-sep" />
          <button
            v-for="opt in COLLAB_OPTIONS"
            :key="opt.value"
            class="policy-btn"
            :class="{ 'policy-btn--active': collaborationPolicy === opt.value }"
            :title="opt.label"
            @click="emit('update:collaborationPolicy', opt.value)"
          >{{ opt.short }}</button>
          <span class="policy-sep" />
        </template>
        <button class="icon-btn" title="清空会话" :disabled="isStreaming" @click="emit('clear')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
          </svg>
        </button>
      </div>
    </div>

    <AiSseStreamView
      ref="sseStreamRef"
      :items="visibleStreamItems"
      :placeholder="placeholder"
      title="对话"
      :copy-status="copyStatus"
      :copy-status-text="copyStatusText"
      :can-export-diagnostics="canExportDiagnostics"
      :can-send="canSendForUi"
      :compact="compact"
      @copy="copyDiagnosticsData"
      @download="downloadDiagnosticsData"
      @clear="emit('clearMessages')"
      @submit-clarification-answer="handleClarificationAnswer"
    />

    <div v-if="error !== null" class="chat-error">⚠️ {{ error }}</div>

    <section v-if="showFcPanel" class="fc-call-panel">
      <header class="fc-call-summary">
        <span>FC 调用记录 ({{ fcCallItems.length }})</span>
        <span v-if="fcErrorCount > 0" class="fc-call-summary__error">错误 {{ fcErrorCount }}</span>
        <button v-if="canClearToolLogs !== false" class="mini-icon-btn" title="清空 FC 记录" @click="emit('clearToolLogs')">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
          </svg>
        </button>
      </header>
      <div v-if="fcCallItems.length === 0" class="fc-call-empty">暂无 FC 调用</div>
      <div v-else class="fc-call-list">
        <button
          v-for="call in fcCallItems"
          :key="call.id"
          :class="['fc-call-entry', `fc-call-entry--${call.status}`]"
          @click="openFcCallDetail(call)"
        >
          <span class="fc-call-entry__time">{{ formatTimestamp(call.timestamp) }}</span>
          <span class="fc-call-entry__name" :title="call.toolName">{{ formatActionTitle(call.toolName) }}</span>
          <span class="fc-call-entry__meta">第 {{ call.round }} 轮</span>
          <span class="fc-call-entry__status">{{ call.status === 'success' ? '成功' : '失败' }}</span>
          <span v-if="call.status === 'error'" class="fc-call-entry__report">{{ formatFcReportStatus(call) }}</span>
        </button>
      </div>
    </section>

    <div v-if="selectedFcCall !== null" class="fc-dialog-mask" @click.self="closeFcCallDetail">
      <section class="fc-dialog" role="dialog" aria-label="FC 调用详情">
        <header class="fc-dialog__header">
          <div>
            <div class="fc-dialog__title">{{ formatActionTitle(selectedFcCall.toolName) }}</div>
            <div class="fc-dialog__meta">{{ formatTimestamp(selectedFcCall.timestamp) }} · 第 {{ selectedFcCall.round }} 轮 · {{ selectedFcCall.status === 'success' ? '成功' : '失败' }} · 原始工具 {{ selectedFcCall.toolName }}</div>
          </div>
          <button class="mini-icon-btn" title="关闭" @click="closeFcCallDetail">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
              <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z" />
            </svg>
          </button>
        </header>
        <div class="fc-dialog__body">
          <section class="fc-dialog__section">
            <h3>参数</h3>
            <pre>{{ stringifyPayload(selectedFcCall.args) }}</pre>
          </section>
          <section class="fc-dialog__section">
            <h3>执行情况</h3>
            <pre>{{ selectedFcPayload }}</pre>
          </section>
        </div>
      </section>
    </div>

    <div class="chat-input-area">
      <div v-if="draftActions.length > 0" class="draft-action-row">
        <button
          v-for="action in draftActions"
          :key="action.id"
          class="draft-action-btn"
          :disabled="!canSendForUi || draftLoadingId === action.id"
          @click="emit('triggerDraftAction', action.id)"
        >
          <span v-if="action.icon" class="draft-action-btn__icon">{{ action.icon }}</span>
          <span>{{ action.label }}</span>
        </button>
      </div>

      <div v-if="pendingFiles.length > 0" class="pending-files">
        <span v-for="(f, i) in pendingFiles" :key="f.fileId" class="pending-file-tag">
          📎 {{ f.name }}
          <button class="remove-file" @click="emit('removePendingFile', i)">×</button>
        </span>
      </div>

      <div class="input-row">
        <button class="icon-btn" title="上传文件" :disabled="!canSendForUi" @click="emit('triggerFileInput')">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
          </svg>
        </button>

        <button class="icon-btn" :class="{ recording: isRecording }" :title="isRecording ? '停止录音' : '语音输入'" :disabled="!canSendForUi" @click="emit('toggleVoice')">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </button>

        <textarea
          ref="textareaRef"
          :value="inputText"
          class="chat-textarea"
          :placeholder="inputPlaceholder"
          rows="1"
          @keydown.enter.exact.prevent="emit('send')"
          @input="handleInput"
        />

        <button class="send-btn" :disabled="!canSendForUi || (inputText.trim() === '' && pendingFiles.length === 0)" @click="emit('send')">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill ai-chat-shell
 * @catalogInternal
 * @description AI 聊天壳层组件，负责渲染消息列表、输入区、附件、工具日志、SSE/FC 调试信息和策略切换事件；适合被 AiChatWidget 等上层会话容器托管。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AiSseStreamView from './AiSseStreamView.vue'

interface FileAttachment {
  fileId: string
  name: string
  size: number
  mimeType: string
}

interface TokenUsageLike {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  promptCacheHitTokens?: number
  promptCacheMissTokens?: number
}

interface ChatMessageLike {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  attachments?: FileAttachment[]
  timestamp?: Date | string
  streaming?: boolean
  turnId?: string
  turnSeq?: number
  turnStatus?: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  usage?: TokenUsageLike
}

interface ToolLogLike {
  type: 'info' | 'success' | 'error'
  tag: string
  text: string
  timestamp?: string
}

interface SseEventLike {
  id: string
  timestamp: string
  sessionId?: string
  streamKey?: string
  scope?: {
    businessRegistrationId?: string
    businessInstanceId?: string
    eventModuleId?: string
    turnId?: string
  }
  type: string
  data: string
}

interface FcCallLike {
  id: string
  timestamp: string
  turnId?: string
  toolName: string
  args: unknown
  round: number
  callId?: string
  status: 'success' | 'error'
  result?: unknown
  error?: string
  durationMs?: number
  reportStatus?: 'pending' | 'reported' | 'failed'
  reportId?: string
  reportError?: string
  reportedAt?: string
}

interface DraftActionLike {
  id: string
  label: string
  icon?: string
}

interface ClarificationOption {
  id: string
  label: string
  value?: unknown
  description?: string
}

interface ClarificationQuestion {
  id: string
  prompt: string
  type: 'single' | 'multi'
  options: ClarificationOption[]
  recommendedOptionIds: string[]
}

interface ClarificationPayload {
  title: string
  reason?: string
  questions: ClarificationQuestion[]
}

interface DiagnosticItem {
  id: string
  timestamp: string
  sortTime: number
  kind: 'message' | 'sse' | 'sse-text' | 'log' | 'clarification'
  source: 'human' | 'assistant' | 'sse' | 'tool-log' | 'clarification'
  kindLabel: string
  title: string
  subtitle?: string
  payload: string
  clarification?: ClarificationPayload
  openByDefault: boolean
}

interface SseStreamItem {
  id: string
  timestamp: string
  entryType: DiagnosticItem['kind']
  kindLabel: string
  title: string
  subtitle?: string
  payload: string
  clarification?: ClarificationPayload
  openByDefault?: boolean
}

interface SseTextSegment {
  key: string
  timestamp: string
  sortTime: number
  order: number
  type: string
  turnId?: string
  sessionId?: string
  streamKey?: string
  chunks: string[]
}

interface StructuredDiagnosticItem {
  id: string
  timestamp: string
  source: DiagnosticItem['source']
  kind: DiagnosticItem['kind']
  label: string
  title: string
  payload: string
  subtitle?: string
  clarification?: ClarificationPayload
  turnId?: string
  turnSeq?: number
}

interface StructuredFcCallRecord {
  id: string
  timestamp: string
  turnId?: string
  toolName: string
  args: unknown
  round: number
  status: 'success' | 'error'
  callId?: string
  result?: unknown
  error?: string
  durationMs?: number
  reportStatus?: 'pending' | 'reported' | 'failed'
  reportId?: string
  reportError?: string
  reportedAt?: string
}

interface StructuredToolLogRecord {
  timestamp: string
  type: 'success' | 'info' | 'error'
  tag: string
  title: string
  text: string
}

type SemanticTimelineSource = 'message' | 'llm-request' | 'llm-append' | 'fc-call' | 'fc-result' | 'sse' | 'sse-text' | 'clarification'

interface StructuredSemanticTimelineItem {
  timestamp: string
  speaker: 'system' | 'user' | 'LLM'
  text: string
  tokenUsage?: TokenUsageLike
  payload?: unknown
}

interface StructuredTurnDiagnosticRecord {
  turnId: string
  turnSeq?: number
  status?: ChatMessageLike['turnStatus']
  sessionIds: string[]
  timeline: StructuredSemanticTimelineItem[]
}

interface StructuredDiagnosticsSnapshot {
  version: 3
  generatedAt: string
  pageId: string
  counts: {
    turns: number
    totalTimelineItems: number
    humanInputs: number
    assistantMessages: number
    llmRequests: number
    llmAppends: number
    sseEvents: number
    sseTextSegments: number
    toolLogs: number
    clarifications: number
    fcCalls: number
    semanticItems: number
  }
  turns: StructuredTurnDiagnosticRecord[]
  toolLogs: StructuredToolLogRecord[]
}

const props = defineProps<{
  /** Chat message list; 按时间顺序渲染用户、系统和 LLM 消息。 */
  messages: ChatMessageLike[]
  /** Pending file attachments; 尚未发送、等待随下一条消息上传的文件。 */
  pendingFiles: FileAttachment[]
  /** Current input text; 与输入框内容双向同步。 */
  inputText: string
  /** Streaming state; true 表示当前有 AI turn 正在输出或执行。 */
  isStreaming: boolean
  /** Active turn count; 当前正在运行的并发 turn 数。 */
  activeTurnCount?: number
  /** Queued turn count; 已提交但等待执行的 turn 数。 */
  queuedTurnCount?: number
  /** Max parallel turns; UI 展示允许并发执行的 turn 上限。 */
  maxParallelTurns?: number
  /** Send availability; false 时禁用发送入口。 */
  canSend?: boolean
  /** Voice recording state; true 表示正在录音输入。 */
  isRecording: boolean
  /** Error message; 展示当前聊天流程的错误提示。 */
  error: string | null
  /** Panel title; 显示在 chat shell 顶部。 */
  title?: string
  /** Input placeholder; 空输入时的提示文案。 */
  placeholder?: string
  /** Compact layout; true 时使用更紧凑的聊天面板间距。 */
  compact?: boolean
  /** Tool log list; 展示 AI 工具调用、调试或流程日志。 */
  toolLogs?: ToolLogLike[]
  /** Whether tool logs can be cleared; true 时显示清空工具日志操作。 */
  canClearToolLogs?: boolean
  /** SSE event timeline; 展示流式响应的底层事件轨迹。 */
  sseEvents?: SseEventLike[]
  /** Function-call records; 展示本轮 AI 调用的函数调用明细。 */
  fcCalls?: FcCallLike[]
  /** Page id; 标记当前 AI 会话所属页面上下文。 */
  pageId?: string | undefined
  /** Draft action list; LLM 可触发的草稿操作入口。 */
  draftActions?: readonly DraftActionLike[]
  /** Draft loading id; 当前正在执行的草稿 action id。 */
  draftLoadingId?: string | null
  /** Recovery policy; 控制 AI 出错或偏航时的恢复策略。 */
  recoveryPolicy?: RecoveryPolicyLike
  /** Collaboration policy; 控制 AI 与人工确认之间的协作强度。 */
  collaborationPolicy?: CollaborationPolicyLike
  /** Action title map; 为 action id 覆盖展示标题。 */
  actionTitleMap?: Record<string, string>
  /** Action prefix title map; 为 action id 增加标题前缀。 */
  actionPrefixTitleMap?: Record<string, string>
  /** Action suffix title map; 为 action id 增加标题后缀。 */
  actionSuffixTitleMap?: Record<string, string>
}>()

const emit = defineEmits<{
  /**
   * Input text changed; 同步用户输入框内容。
   * @param value Next input text.
   */
  (e: 'update:inputText', value: string): void
  /** Send requested; 用户提交当前输入内容。 */
  (e: 'send'): void
  /** Clear input requested; 清空当前输入区。 */
  (e: 'clear'): void
  /** Clear messages requested; 清空当前聊天消息列表。 */
  (e: 'clearMessages'): void
  /** Clear tool logs requested; 清空工具日志面板。 */
  (e: 'clearToolLogs'): void
  /** File picker requested; 打开外部文件选择器。 */
  (e: 'triggerFileInput'): void
  /** Voice input toggled; 切换录音输入状态。 */
  (e: 'toggleVoice'): void
  /**
   * Remove pending file; 从待发送附件列表移除一项。
   * @param index Pending file index.
   */
  (e: 'removePendingFile', index: number): void
  /**
   * Recovery policy changed; 同步 AI 恢复策略。
   * @param value Next recovery policy.
   */
  (e: 'update:recoveryPolicy', value: RecoveryPolicyLike): void
  /**
   * Collaboration policy changed; 同步人工确认协作策略。
   * @param value Next collaboration policy.
   */
  (e: 'update:collaborationPolicy', value: CollaborationPolicyLike): void
  /**
   * Draft action triggered; 用户点击或 LLM 请求执行草稿动作。
   * @param actionId Draft action id.
   */
  (e: 'triggerDraftAction', actionId: string): void
}>(
)

const draftActions = computed(() => props.draftActions ?? [])
const draftLoadingId = computed(() => props.draftLoadingId ?? null)
const activeTurnCountDisplay = computed(() => props.activeTurnCount ?? (props.isStreaming ? 1 : 0))
const queuedTurnCountDisplay = computed(() => props.queuedTurnCount ?? 0)
const maxParallelTurnsDisplay = computed(() => Math.max(1, props.maxParallelTurns ?? 1))
const canSendForUi = computed(() => props.canSend ?? !props.isStreaming)
const showTurnStatus = computed(() => (
  maxParallelTurnsDisplay.value > 1 ||
  activeTurnCountDisplay.value > 0 ||
  queuedTurnCountDisplay.value > 0
))
const turnStatusTitle = computed(() => `当前运行 ${activeTurnCountDisplay.value} 个 turn，排队 ${queuedTurnCountDisplay.value} 个，最大并行 ${maxParallelTurnsDisplay.value}`)
const inputPlaceholder = computed(() => {
  if (props.isRecording) return '正在录音...'
  if (props.isStreaming && !canSendForUi.value) return 'AI 编辑中，可先输入下一条指令...'
  if (props.isStreaming) return 'AI 执行中，可继续输入下一条指令...'
  return props.placeholder ?? '输入消息...'
})

type RecoveryPolicyLike = 'layered' | 'manual' | 'strict'
type CollaborationPolicyLike = 'auto' | 'critical-confirm' | 'plan-confirm' | 'step-confirm' | 'human-takeover'

interface PolicyOption<T extends string> {
  value: T
  short: string
  label: string
}

const RECOVERY_OPTIONS: PolicyOption<RecoveryPolicyLike>[] = [
  { value: 'layered', short: '分层', label: '分层恢复：保留节奏提醒并允许模型换路径自修正' },
  { value: 'manual', short: '手动', label: '手动恢复：降低自动纠偏强度，更多交给人工继续指令' },
  { value: 'strict', short: '严格', label: '严格恢复：更快暴露重复/错误，减少无效尝试' },
]

const SSE_TEXT_EVENT_TYPES = new Set(['delta', 'reasoning'])
const TIMELINE_SSE_EVENT_TYPES = new Set(['llm-request', 'llm-append', 'tool-result', 'result', 'error', 'done'])

const COLLAB_OPTIONS: PolicyOption<CollaborationPolicyLike>[] = [
  { value: 'auto', short: '自动', label: '自动执行：允许直接执行写入' },
  { value: 'critical-confirm', short: '关键确认', label: '关键确认：删除/替换等高风险动作前先确认' },
  { value: 'plan-confirm', short: '计划确认', label: '计划确认：本轮只规划和读取，不写入' },
  { value: 'step-confirm', short: '逐步', label: '逐步执行：每轮限制为较短执行步' },
  { value: 'human-takeover', short: '接管', label: '人工接管：AI 不执行写入，等待人工操作或下一条指令' },
]

type AiSseStreamViewInstance = InstanceType<typeof AiSseStreamView>

const sseStreamRef = ref<AiSseStreamViewInstance | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const selectedFcCall = ref<FcCallLike | null>(null)
const copyStatus = ref<'idle' | 'copied' | 'failed'>('idle')
let copyStatusTimer: number | undefined

const fcCallItems = computed(() => props.fcCalls ?? [])
const fcErrorCount = computed(() => fcCallItems.value.filter((call) => call.status === 'error').length)
const showFcPanel = computed(() => props.toolLogs !== undefined || fcCallItems.value.length > 0)
const copyStatusText = computed(() => copyStatus.value === 'copied' ? '已复制' : '复制失败')
const canExportDiagnostics = computed(() => diagnosticItems.value.length > 0)
const selectedFcPayload = computed(() => {
  const call = selectedFcCall.value
  if (call === null) return ''
  return stringifyPayload({
    status: call.status,
    durationMs: call.durationMs,
    reportStatus: call.reportStatus,
    reportId: call.reportId,
    reportError: call.reportError,
    reportedAt: call.reportedAt,
    result: call.result,
    error: call.error,
    callId: call.callId,
  })
})

const diagnosticItems = computed<DiagnosticItem[]>(() => {
  const items: Array<DiagnosticItem & { order: number }> = []
  let order = 0
  const humanInputTexts = collectHumanInputTexts(props.messages)

  for (const message of props.messages) {
    const timestamp = toIsoTimestamp(message.timestamp)
    const isHumanInput = message.role === 'user'
    items.push({
      id: `message:${message.id}`,
      timestamp,
      sortTime: toSortTime(timestamp),
      kind: 'message',
      source: isHumanInput ? 'human' : 'assistant',
      kindLabel: isHumanInput ? '人工输入' : '助手',
      title: isHumanInput ? '用户消息' : formatAssistantMessageTitle(message),
      payload: formatMessagePayload(message),
      openByDefault: message.streaming === true || message.role === 'user',
      order: order++,
    })
  }

  for (const call of props.fcCalls ?? []) {
    const clarification = extractClarificationPayload(call)
    if (clarification === null) continue
    items.push({
      id: `clarification:${call.id}`,
      timestamp: call.timestamp,
      sortTime: toSortTime(call.timestamp),
      kind: 'clarification',
      source: 'clarification',
      kindLabel: '反问',
      title: clarification.title,
      ...(call.callId !== undefined ? { subtitle: call.callId } : {}),
      payload: stringifyPayload(clarification),
      clarification,
      openByDefault: true,
      order: order++,
    })
  }

  const visibleSseEvents = (props.sseEvents ?? []).filter(isVisibleSseEvent)
  for (const sseTextItem of buildSseTextDiagnosticItems(visibleSseEvents, props.pageId)) {
    items.push({
      ...sseTextItem,
      order: order++,
    })
  }

  for (const event of visibleSseEvents) {
    if (!TIMELINE_SSE_EVENT_TYPES.has(event.type)) continue
    const timestamp = toIsoTimestamp(event.timestamp)
    const subtitle = formatSseEventSubtitle(event, props.pageId)
    items.push({
      id: `sse:${event.id}`,
      timestamp,
      sortTime: toSortTime(timestamp),
      kind: 'sse',
      source: 'sse',
      kindLabel: 'SSE',
      title: formatSseTimelineTitle(event.type),
      ...(subtitle !== undefined ? { subtitle } : {}),
      payload: event.data,
      openByDefault: event.type === 'llm-request' || event.type === 'llm-append' || event.type === 'done',
      order: order++,
    })
  }

  for (const log of props.toolLogs ?? []) {
    if (log.type !== 'error') continue
    if (isRawSseToolLog(log)) continue
    if (isDuplicateHumanInputLog(log, humanInputTexts)) continue
    const timestamp = toIsoTimestamp(log.timestamp)
    items.push({
      id: `log:${order}:${log.tag}`,
      timestamp,
      sortTime: toSortTime(timestamp),
      kind: 'log',
      source: 'tool-log',
      kindLabel: formatLogTypeLabel(log.type),
      title: formatDiagnosticLogTitle(log.tag),
      ...(formatDiagnosticLogTitle(log.tag) !== log.tag ? { subtitle: log.tag } : {}),
      payload: log.text,
      openByDefault: log.type === 'error',
      order: order++,
    })
  }

  return items.sort((left, right) => left.sortTime - right.sortTime || left.order - right.order)
})

const sseStreamItems = computed<SseStreamItem[]>(() => diagnosticItems.value.map((item) => ({
  id: item.id,
  timestamp: item.timestamp,
  entryType: item.kind,
  kindLabel: item.kindLabel,
  title: item.title,
  ...(item.subtitle !== undefined ? { subtitle: item.subtitle } : {}),
  payload: item.payload,
  ...(item.clarification !== undefined ? { clarification: item.clarification } : {}),
  openByDefault: item.openByDefault,
})))

const visibleStreamItems = computed<SseStreamItem[]>(() => sseStreamItems.value.filter((item) => (
  item.entryType === 'message' || item.entryType === 'clarification' || item.entryType === 'log'
)))

function collectHumanInputTexts(messages: readonly ChatMessageLike[]): Set<string> {
  const texts = new Set<string>()
  for (const message of messages) {
    if (message.role === 'user') texts.add(normalizeDiagnosticText(message.content))
  }
  return texts
}

function normalizeDiagnosticText(value: string): string {
  return value.trim().replace(/\r\n?/g, '\n')
}

function isDuplicateHumanInputLog(log: ToolLogLike, humanInputTexts: ReadonlySet<string>): boolean {
  return log.tag === '人工输入' && humanInputTexts.has(normalizeDiagnosticText(log.text))
}

function isRawSseToolLog(log: ToolLogLike): boolean {
  return log.tag.startsWith('SSE ') || log.tag === 'SSE 错误'
}

function normalizeDiagnosticPageId(pageId: string | undefined): string {
  return typeof pageId === 'string' && pageId.trim() !== '' ? pageId : 'global'
}

function isVisibleSseEvent(event: SseEventLike): boolean {
  const data = event.data.trim()
  return data !== '' && !(event.type === 'done' && data === '{}')
}

function buildSseTextDiagnosticItems(events: SseEventLike[], pageId: string | undefined): DiagnosticItem[] {
  const segments = new Map<string, SseTextSegment>()
  let order = 0

  for (const event of events) {
    if (!SSE_TEXT_EVENT_TYPES.has(event.type)) continue
    if (event.data.trim() === '') continue
    const key = `${event.type}:${getSseEventTurnKey(event)}`
    const segment = segments.get(key)
    if (segment !== undefined) {
      segment.chunks.push(event.data)
      continue
    }
    const timestamp = toIsoTimestamp(event.timestamp)
    const turnId = getSseEventTurnId(event)
    segments.set(key, {
      key,
      timestamp,
      sortTime: toSortTime(timestamp),
      order: order++,
      type: event.type,
      ...(turnId !== undefined ? { turnId } : {}),
      ...(event.sessionId !== undefined ? { sessionId: event.sessionId } : {}),
      ...(event.streamKey !== undefined ? { streamKey: event.streamKey } : {}),
      chunks: [event.data],
    })
  }

  if (segments.size === 0) return []

  const normalizedPageId = normalizeDiagnosticPageId(pageId)
  return Array.from(segments.values())
    .sort((left, right) => left.sortTime - right.sortTime || left.order - right.order)
    .map((segment): DiagnosticItem => ({
      id: `sse-text:${normalizedPageId}:${segment.key}`,
      timestamp: segment.timestamp,
      sortTime: segment.sortTime,
      kind: 'sse-text',
      source: 'sse',
      kindLabel: 'SSE文本',
      title: `SSE ${formatSseTypeLabel(segment.type)} (${segment.chunks.length}片)`,
      subtitle: formatSseTextSubtitle(normalizedPageId, segment),
      payload: segment.chunks.join(''),
      openByDefault: true,
    }))
}

function getSseEventTurnId(event: SseEventLike): string | undefined {
  return event.scope?.turnId
}

function getSseEventTurnKey(event: SseEventLike): string {
  return getSseEventTurnId(event) ?? event.streamKey ?? event.sessionId ?? event.id
}

function formatSseTurnLabel(turnId: string | undefined, turnSeq: number | undefined): string | undefined {
  if (turnId !== undefined) return `Turn ${turnId.slice(0, 8)}`
  if (turnSeq !== undefined) return `Turn #${turnSeq}`
  return undefined
}

function formatSseTextSubtitle(pageId: string, segment: SseTextSegment): string {
  const parts = [`页面=${pageId}`]
  const turnLabel = formatSseTurnLabel(segment.turnId, undefined)
  if (turnLabel !== undefined) parts.push(turnLabel)
  if (segment.sessionId !== undefined) parts.push(`会话=${segment.sessionId}`)
  return parts.join(' · ')
}

function formatSseEventSubtitle(event: SseEventLike, pageId: string | undefined): string | undefined {
  const parts: string[] = []
  const turnLabel = formatSseTurnLabel(getSseEventTurnId(event), undefined)
  if (turnLabel !== undefined) parts.push(turnLabel)
  if (event.sessionId !== undefined) parts.push(event.sessionId)
  if (event.sessionId === undefined && pageId !== undefined) parts.push(normalizeDiagnosticPageId(pageId))
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function formatSseTypeLabel(type: string): string {
  switch (type) {
    case 'delta':
      return '文本增量'
    case 'reasoning':
      return '推理'
    case 'result':
      return '结果'
    case 'error':
      return '错误'
    case 'done':
      return '完成'
    case 'message':
      return '消息'
    case 'llm-request':
      return 'LLM请求'
    case 'llm-append':
      return 'LLM追加'
    case 'tool-result':
      return '工具结果'
    default:
      return `事件 ${type}`
  }
}

function formatSseTimelineTitle(type: string): string {
  if (type === 'done') return 'AI诊断流落成'
  return `SSE ${formatSseTypeLabel(type)}`
}

function formatLogTypeLabel(type: ToolLogLike['type']): string {
  switch (type) {
    case 'info':
      return '信息'
    case 'success':
      return '成功'
    case 'error':
      return '错误'
  }
}

function formatDiagnosticLogTitle(tag: string): string {
  if (tag.startsWith('SSE ')) {
    return `SSE ${formatSseTypeLabel(tag.slice(4))}`
  }
  if (tag.startsWith('LLM → ')) return tag
  return formatActionTitle(tag)
}

function formatActionTitle(action: string): string {
  const direct = actionTitleMap.value[action]
  if (direct !== undefined) return direct

  const sortedPrefixes = Object.entries(actionPrefixTitleMap.value).sort((a, b) => b[0].length - a[0].length)
  for (const [prefix, label] of sortedPrefixes) {
    if (action.startsWith(prefix)) {
      return `${label}${formatActionSuffix(action.slice(prefix.length))}`
    }
  }

  const signature = parseActionSignature(action)
  if (signature !== null) {
    return `${signature.moduleLabel}${formatActionSuffix(signature.functionPart)}`
  }

  return action
}

function formatActionSuffix(suffix: string): string {
  const direct = actionSuffixTitleMap.value[suffix]
  if (direct !== undefined) return direct
  return `操作 ${suffix}`
}

function parseActionSignature(action: string): { moduleLabel: string; functionPart: string } | null {
  if (action.includes('@')) {
    const parts = action.split('@').filter((part) => part.length > 0)
    if (parts.length >= 3) {
      return { moduleLabel: parts[parts.length - 2] ?? '', functionPart: parts[parts.length - 1] ?? '' }
    }
  }
  if (action.includes('/')) {
    const parts = action.split('/').filter((part) => part.length > 0)
    if (parts.length >= 2) {
      return { moduleLabel: parts[parts.length - 2] ?? '', functionPart: parts[parts.length - 1] ?? '' }
    }
  }
  if (action.includes('.')) {
    const parts = action.split('.').filter((part) => part.length > 0)
    if (parts.length >= 2) {
      return { moduleLabel: parts[parts.length - 2] ?? '', functionPart: parts[parts.length - 1] ?? '' }
    }
  }
  return null
}

const DEFAULT_ACTION_SUFFIX_TITLE_MAP: Record<string, string> = {
  bootstrap: '初始化',
  describe: '概览',
  validate: '校验',
  export: '导出',
  create: '创建',
  guide: '指南',
  query: '查询',
  read: '读取',
  write: '写入',
  update: '更新',
  add: '添加',
  remove: '删除',
  list: '列表',
  reset: '重置',
}

const DEFAULT_ACTION_TITLE_MAP: Record<string, string> = {
  'session-ready': '会话就绪',
  'pageDesign/knowledge/queryPayloads': '参数荷载目录',
  'page-designer@knowledge@queryPayloads': '参数荷载目录',
}

const actionTitleMap = computed(() => ({
  ...DEFAULT_ACTION_TITLE_MAP,
  ...(props.actionTitleMap ?? {}),
}))

const actionPrefixTitleMap = computed(() => props.actionPrefixTitleMap ?? {})

const actionSuffixTitleMap = computed(() => ({
  ...DEFAULT_ACTION_SUFFIX_TITLE_MAP,
  ...(props.actionSuffixTitleMap ?? {}),
}))

function toIsoTimestamp(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.trim() !== '') return value
  return new Date().toISOString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function normalizeClarificationOption(raw: unknown): ClarificationOption | null {
  if (!isRecord(raw)) return null
  const id = optionalString(raw['id'])
  const label = optionalString(raw['label'])
  const description = optionalString(raw['description'])
  if (id === undefined || label === undefined) return null
  return {
    id,
    label,
    ...(raw['value'] !== undefined ? { value: raw['value'] } : {}),
    ...(description !== undefined ? { description } : {}),
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
}

function normalizeClarificationQuestion(raw: unknown): ClarificationQuestion | null {
  if (!isRecord(raw)) return null
  const id = optionalString(raw['id'])
  const prompt = optionalString(raw['prompt'])
  const type = raw['type'] === 'multi' ? 'multi' : raw['type'] === 'single' ? 'single' : null
  const rawOptions = Array.isArray(raw['options']) ? raw['options'] : []
  const options = rawOptions.map(normalizeClarificationOption).filter((item): item is ClarificationOption => item !== null)
  const optionIds = new Set(options.map((option) => option.id))
  const recommendedOptionIds = normalizeStringArray(raw['recommendedOptionIds']).filter((optionId) => optionIds.has(optionId))
  if (id === undefined || prompt === undefined || type === null || options.length === 0 || recommendedOptionIds.length === 0) return null
  return { id, prompt, type, options, recommendedOptionIds }
}

function normalizeClarificationPayload(raw: unknown): ClarificationPayload | null {
  if (!isRecord(raw)) return null
  const title = optionalString(raw['title'])
  const reason = optionalString(raw['reason'])
  const rawQuestions = Array.isArray(raw['questions']) ? raw['questions'] : []
  const questions = rawQuestions.map(normalizeClarificationQuestion).filter((item): item is ClarificationQuestion => item !== null)
  if (title === undefined || questions.length === 0) return null
  return {
    title,
    ...(reason !== undefined ? { reason } : {}),
    questions,
  }
}

function extractClarificationPayload(call: FcCallLike): ClarificationPayload | null {
  if (call.status !== 'success') return null
  return normalizeClarificationPayload(call.result) ?? normalizeClarificationPayload(call.args)
}

function handleClarificationAnswer(answer: string): void {
  if (!canSendForUi.value || answer.trim() === '') return
  emit('update:inputText', answer)
  emit('send')
}

function toSortTime(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatTimestamp(value: string | Date | undefined): string {
  const date = value instanceof Date ? value : new Date(value ?? Date.now())
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

function formatAssistantMessageTitle(message: ChatMessageLike): string {
  if (message.turnStatus === 'queued') return 'AI 排队中'
  if (message.streaming === true) return 'AI 响应中'
  if (message.turnStatus === 'cancelled') return 'AI 已取消'
  return 'AI 响应'
}

function formatMessagePayload(message: ChatMessageLike): string {
  const lines: string[] = []
  if (message.content.trim() !== '') lines.push(message.content)
  if (message.reasoning !== undefined && message.reasoning.trim() !== '') {
    lines.push(`[reasoning]\n${message.reasoning}`)
  }
  if (message.usage !== undefined) {
    lines.push(`[usage]\n${stringifyPayload(message.usage)}`)
  }
  if (message.attachments !== undefined && message.attachments.length > 0) {
    lines.push(`[attachments]\n${stringifyPayload(message.attachments)}`)
  }
  if (lines.length > 0) return lines.join('\n\n')
  if (message.turnStatus === 'queued') return '排队中...'
  if (message.streaming === true) return '等待响应...'
  return '(empty)'
}

function formatSemanticMessageText(message: ChatMessageLike): string {
  const lines: string[] = []
  if (message.content.trim() !== '') lines.push(message.content)
  if (message.reasoning !== undefined && message.reasoning.trim() !== '') {
    lines.push(`[reasoning]\n${message.reasoning}`)
  }
  if (message.attachments !== undefined && message.attachments.length > 0) {
    lines.push(`[attachments]\n${stringifyPayload(message.attachments)}`)
  }
  if (lines.length > 0) return lines.join('\n\n')
  if (message.turnStatus === 'queued') return '排队中...'
  if (message.streaming === true) return '等待响应...'
  return '(empty)'
}

function toMessageDiagnosticItem(message: ChatMessageLike): StructuredDiagnosticItem {
  const isHumanInput = message.role === 'user'
  const timestamp = toIsoTimestamp(message.timestamp)
  return {
    id: `message:${message.id}`,
    timestamp,
    source: isHumanInput ? 'human' : 'assistant',
    kind: 'message',
    label: isHumanInput ? '人工输入' : '助手',
    title: isHumanInput ? '用户消息' : formatAssistantMessageTitle(message),
    payload: formatMessagePayload(message),
    ...(message.turnId !== undefined ? { turnId: message.turnId } : {}),
    ...(message.turnSeq !== undefined ? { turnSeq: message.turnSeq } : {}),
  }
}

function stringifyPayload(value: unknown): string {
  if (value === undefined) return '(undefined)'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function toStructuredFcCallRecord(call: FcCallLike): StructuredFcCallRecord {
  return {
    id: call.id,
    timestamp: call.timestamp,
    ...(call.turnId !== undefined ? { turnId: call.turnId } : {}),
    toolName: call.toolName,
    args: call.args,
    round: call.round,
    status: call.status,
    ...(call.callId !== undefined ? { callId: call.callId } : {}),
    ...(call.result !== undefined ? { result: call.result } : {}),
    ...(call.error !== undefined ? { error: call.error } : {}),
    ...(call.durationMs !== undefined ? { durationMs: call.durationMs } : {}),
    ...(call.reportStatus !== undefined ? { reportStatus: call.reportStatus } : {}),
    ...(call.reportId !== undefined ? { reportId: call.reportId } : {}),
    ...(call.reportError !== undefined ? { reportError: call.reportError } : {}),
    ...(call.reportedAt !== undefined ? { reportedAt: call.reportedAt } : {}),
  }
}

function toStructuredToolLogRecord(log: ToolLogLike): StructuredToolLogRecord {
  const title = formatDiagnosticLogTitle(log.tag)
  return {
    timestamp: toIsoTimestamp(log.timestamp),
    type: log.type,
    tag: log.tag,
    title,
    text: log.text,
  }
}

interface TurnDiagnosticDraft {
  order: number
  turnId: string
  turnSeq?: number
  status?: ChatMessageLike['turnStatus']
  sessionIds: Set<string>
  timeline: Array<StructuredSemanticTimelineItem & {
    source: SemanticTimelineSource
    title: string
    sortTime: number
    order: number
  }>
}

function createTurnDiagnosticDraft(turnId: string, order: number): TurnDiagnosticDraft {
  return {
    order,
    turnId,
    sessionIds: new Set<string>(),
    timeline: [],
  }
}

function createSemanticItem(
  item: StructuredSemanticTimelineItem & { source: SemanticTimelineSource; title: string },
): StructuredSemanticTimelineItem & { source: SemanticTimelineSource; title: string; sortTime: number; order: number } {
  return {
    ...item,
    sortTime: toSortTime(item.timestamp),
    order: 0,
  }
}

function pushSemanticItem(
  draft: TurnDiagnosticDraft,
  item: StructuredSemanticTimelineItem & { source: SemanticTimelineSource; title: string },
): void {
  const next = createSemanticItem(item)
  next.order = draft.timeline.length
  draft.timeline.push(next)
}

function parseJsonPayload(data: string): unknown {
  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}

function messageLine(value: unknown): string | null {
  if (!isRecord(value)) return null
  const role = optionalString(value['role']) ?? 'message'
  const content = typeof value['content'] === 'string' ? value['content'] : stringifyPayload(value['content'])
  return `${role}: ${content}`
}

function formatTransportMessages(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => messageLine(item) ?? stringifyPayload(item))
}

function toolNameOf(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value['function'])) return null
  return optionalString(value['function']['name']) ?? null
}

function formatToolNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(toolNameOf).filter((name): name is string => name !== null)
}

function formatLlmRequestText(payload: unknown): string {
  if (!isRecord(payload)) return stringifyPayload(payload)
  const lines: string[] = []
  const systemPrompt = optionalString(payload['systemPrompt'])
  if (systemPrompt !== undefined) lines.push(`system:\n${systemPrompt}`)
  const messages = formatTransportMessages(payload['messages'])
  if (messages.length > 0) lines.push(`messages:\n${messages.join('\n')}`)
  const tools = formatToolNames(payload['tools'])
  if (tools.length > 0) lines.push(`tools:\n${tools.map((tool) => `- ${tool}`).join('\n')}`)
  return lines.length === 0 ? stringifyPayload(payload) : lines.join('\n\n')
}

function formatLlmAppendText(payload: unknown): string {
  if (!isRecord(payload)) return stringifyPayload(payload)
  const messages = formatTransportMessages(payload['messages'])
  return messages.length === 0
    ? stringifyPayload(payload)
    : `messages:\n${messages.join('\n')}`
}

function semanticItemFromSseEvent(
  event: SseEventLike,
): (StructuredSemanticTimelineItem & { source: SemanticTimelineSource; title: string }) | null {
  if (SSE_TEXT_EVENT_TYPES.has(event.type)) return null
  const payload = parseJsonPayload(event.data)
  if (event.type === 'llm-request') {
    return {
      timestamp: event.timestamp,
      speaker: 'system',
      source: 'llm-request',
      title: '提交给 LLM',
      text: formatLlmRequestText(payload),
      payload,
    }
  }
  if (event.type === 'llm-append') {
    return {
      timestamp: event.timestamp,
      speaker: 'system',
      source: 'llm-append',
      title: '追加给 LLM',
      text: formatLlmAppendText(payload),
      payload,
    }
  }
  if (event.type === 'tool-result') {
    return {
      timestamp: event.timestamp,
      speaker: 'system',
      source: 'sse',
      title: 'FC 结果',
      text: stringifyPayload(payload),
      payload,
    }
  }
  if (event.type === 'result') {
    const text = isRecord(payload) && typeof payload['text'] === 'string'
      ? payload['text']
      : stringifyPayload(payload)
    return {
      timestamp: event.timestamp,
      speaker: 'LLM',
      source: 'sse',
      title: 'LLM 结果',
      text,
      payload,
    }
  }
  if (event.type === 'done') {
    return {
      timestamp: event.timestamp,
      speaker: 'system',
      source: 'sse',
      title: 'AI诊断流落成',
      text: stringifyPayload(payload),
      payload,
    }
  }
  return {
    timestamp: event.timestamp,
    speaker: 'system',
    source: 'sse',
    title: formatSseTimelineTitle(event.type),
    text: stringifyPayload(payload),
    payload,
  }
}

function pushFcCallSemanticItems(draft: TurnDiagnosticDraft, call: StructuredFcCallRecord): void {
  const title = formatActionTitle(call.toolName)
  pushSemanticItem(draft, {
    timestamp: call.timestamp,
    speaker: 'LLM',
    source: 'fc-call',
    title: `FC 调用：${title}`,
    text: `args:\n${stringifyPayload(call.args)}`,
    payload: {
      toolName: call.toolName,
      args: call.args,
      ...(call.callId !== undefined ? { callId: call.callId } : {}),
    },
  })

  const resultText = call.status === 'error'
    ? (call.error ?? stringifyPayload(call.result))
    : stringifyPayload(call.result)
  pushSemanticItem(draft, {
    timestamp: call.timestamp,
    speaker: 'system',
    source: 'fc-result',
    title: `FC 结果：${title}`,
    text: resultText,
    payload: {
      toolName: call.toolName,
      status: call.status,
      ...(call.result !== undefined ? { result: call.result } : {}),
      ...(call.error !== undefined ? { error: call.error } : {}),
    },
  })
}

function buildTurnDiagnostics(
  visibleSseEvents: SseEventLike[],
  fcCalls: StructuredFcCallRecord[],
): StructuredTurnDiagnosticRecord[] {
  const drafts = new Map<string, TurnDiagnosticDraft>()
  let order = 0

  const ensureDraft = (turnId: string): TurnDiagnosticDraft => {
    let draft = drafts.get(turnId)
    if (draft === undefined) {
      draft = createTurnDiagnosticDraft(turnId, order++)
      drafts.set(turnId, draft)
    }
    return draft
  }

  const turnKeyBySeq = new Map<number, string>()
  const messageTurnIds = new Set<string>()
  for (const message of props.messages) {
    const turnId = message.turnId ?? `message:${message.id}`
    messageTurnIds.add(turnId)
    const draft = ensureDraft(turnId)
    if (message.turnSeq !== undefined) {
      draft.turnSeq = draft.turnSeq ?? message.turnSeq
      turnKeyBySeq.set(message.turnSeq, turnId)
    }
    if (message.turnStatus !== undefined) draft.status = message.turnStatus
    pushSemanticItem(draft, {
      timestamp: toIsoTimestamp(message.timestamp),
      speaker: message.role === 'user' ? 'user' : 'LLM',
      source: 'message',
      title: message.role === 'user' ? '用户消息' : formatAssistantMessageTitle(message),
      text: formatSemanticMessageText(message),
      ...(message.role === 'assistant' && message.usage !== undefined ? { tokenUsage: message.usage } : {}),
      payload: toMessageDiagnosticItem(message),
    })
  }

  const singleMessageTurnId = messageTurnIds.size === 1 ? Array.from(messageTurnIds)[0] : undefined
  for (const event of visibleSseEvents) {
    const turnId = getSseEventTurnId(event) ?? singleMessageTurnId ?? `sse:${event.sessionId ?? event.id}`
    const draft = ensureDraft(turnId)
    if (event.sessionId !== undefined) draft.sessionIds.add(event.sessionId)
    const semantic = semanticItemFromSseEvent(event)
    if (semantic !== null) pushSemanticItem(draft, semantic)
  }

  for (const call of fcCalls) {
    const turnId = call.turnId
      ?? turnKeyBySeq.get(call.round)
      ?? singleMessageTurnId
      ?? `round:${call.round}`
    const draft = ensureDraft(turnId)
    pushFcCallSemanticItems(draft, call)
    const clarification = extractClarificationPayload(call)
    if (clarification !== null) {
      pushSemanticItem(draft, {
        timestamp: call.timestamp,
        speaker: 'LLM',
        source: 'clarification',
        title: clarification.title,
        text: stringifyPayload(clarification),
        payload: clarification,
      })
    }
  }

  return Array.from(drafts.values())
    .sort((left, right) => left.order - right.order)
    .map((draft): StructuredTurnDiagnosticRecord => {
      return {
        turnId: draft.turnId,
        ...(draft.turnSeq !== undefined ? { turnSeq: draft.turnSeq } : {}),
        ...(draft.status !== undefined ? { status: draft.status } : {}),
        sessionIds: Array.from(draft.sessionIds),
        timeline: draft.timeline
          .sort((left, right) => left.sortTime - right.sortTime || left.order - right.order)
          .map(({ sortTime: _sortTime, order: _order, source: _source, title: _title, ...item }) => item),
      }
    })
}

function buildDiagnosticsData(): StructuredDiagnosticsSnapshot {
  const items = diagnosticItems.value
  const humanInputTexts = collectHumanInputTexts(props.messages)
  const toolLogs = (props.toolLogs ?? [])
    .filter((log) => !isRawSseToolLog(log) && !isDuplicateHumanInputLog(log, humanInputTexts))
    .map(toStructuredToolLogRecord)
  const fcCalls = (props.fcCalls ?? []).map(toStructuredFcCallRecord)
  const visibleSseEvents = (props.sseEvents ?? []).filter(isVisibleSseEvent)
  const sseTextSegments = buildSseTextDiagnosticItems(visibleSseEvents, props.pageId)
  const turns = buildTurnDiagnostics(visibleSseEvents, fcCalls)
  const semanticItems = turns.reduce((sum, turn) => sum + turn.timeline.length, 0)
  const llmRequests = visibleSseEvents.filter((event) => event.type === 'llm-request').length
  const llmAppends = visibleSseEvents.filter((event) => event.type === 'llm-append').length
  return {
    version: 3,
    generatedAt: new Date().toISOString(),
    pageId: normalizeDiagnosticPageId(props.pageId),
    counts: {
      turns: turns.length,
      totalTimelineItems: items.length,
      humanInputs: items.filter((item) => item.source === 'human').length,
      assistantMessages: items.filter((item) => item.source === 'assistant').length,
      llmRequests,
      llmAppends,
      sseEvents: visibleSseEvents.length,
      sseTextSegments: sseTextSegments.length,
      toolLogs: toolLogs.length,
      clarifications: items.filter((item) => item.kind === 'clarification').length,
      fcCalls: fcCalls.length,
      semanticItems,
    },
    turns,
    toolLogs,
  }
}

async function copyDiagnosticsData(): Promise<void> {
  if (diagnosticItems.value.length === 0) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(buildDiagnosticsData(), null, 2))
    markCopyStatus('copied')
  } catch {
    markCopyStatus('failed')
  }
}

function formatDiagnosticDownloadFileName(): string {
  const pageId = normalizeDiagnosticPageId(props.pageId).replace(/[^\w.-]+/g, '-')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${pageId}-ai-diagnostics-${timestamp}.json`
}

function downloadDiagnosticsData(): void {
  if (diagnosticItems.value.length === 0) return
  const blob = new Blob([JSON.stringify(buildDiagnosticsData(), null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = formatDiagnosticDownloadFileName()
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function markCopyStatus(status: 'copied' | 'failed'): void {
  copyStatus.value = status
  if (copyStatusTimer !== undefined) window.clearTimeout(copyStatusTimer)
  copyStatusTimer = window.setTimeout(() => {
    copyStatus.value = 'idle'
    copyStatusTimer = undefined
  }, 1500)
}

function openFcCallDetail(call: FcCallLike): void {
  selectedFcCall.value = call
}

function closeFcCallDetail(): void {
  selectedFcCall.value = null
}

function formatFcReportStatus(call: FcCallLike): string {
  switch (call.reportStatus) {
    case 'pending':
      return '回传中'
    case 'reported':
      return '已回传'
    case 'failed':
      return '回传失败'
    default:
      return '未回传'
  }
}

onBeforeUnmount(() => {
  if (copyStatusTimer !== undefined) {
    window.clearTimeout(copyStatusTimer)
  }
})

function autoResize() {
  const el = textareaRef.value
  if (el === null) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
}

function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  emit('update:inputText', target.value)
  autoResize()
}

watch(
  () => diagnosticItems.value.map((item) => `${item.id}:${item.payload}`).join('|'),
  () => {
    void nextTick(() => {
      sseStreamRef.value?.scrollToBottom()
    })
  },
)
</script>

<style scoped>
.ai-chat-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.chat-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #f5f7fa; border-bottom: 1px solid #e4e7ed; }
.chat-title { font-weight: 600; font-size: 14px; color: #303133; }
.chat-header-actions { display: flex; align-items: center; gap: 4px; }
.turn-status { flex-shrink: 0; padding: 2px 7px; border-radius: 999px; background: #ecf5ff; color: #409eff; font-size: 11px; line-height: 1.6; white-space: nowrap; }
.chat-error { padding: 8px 16px; background: #fef0f0; color: #f56c6c; font-size: 13px; border-top: 1px solid #fbc4c4; }
.chat-input-area { border-top: 1px solid #e4e7ed; padding: 8px 12px; background: #fafafa; }
.draft-action-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.draft-action-btn { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border: 1px solid #dcdfe6; border-radius: 6px; background: #fff; color: #606266; font-size: 12px; cursor: pointer; }
.draft-action-btn:hover:not(:disabled) { border-color: #409eff; color: #409eff; background: #ecf5ff; }
.draft-action-btn:disabled { opacity: 0.58; cursor: not-allowed; }
.draft-action-btn__icon { font-size: 12px; line-height: 1; }
.pending-files { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.pending-file-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; font-size: 12px; background: #ecf5ff; color: #409eff; border-radius: 4px; }
.remove-file { background: none; border: none; cursor: pointer; font-size: 14px; color: #909399; padding: 0 2px; line-height: 1; }
.remove-file:hover { color: #f56c6c; }
.input-row { display: flex; align-items: flex-end; gap: 6px; }
.chat-textarea { flex: 1; resize: none; border: 1px solid #dcdfe6; border-radius: 8px; padding: 8px 12px; font-size: 14px; line-height: 1.5; outline: none; font-family: inherit; max-height: 120px; overflow-y: auto; }
.chat-textarea:focus { border-color: #409eff; }
.icon-btn { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: none; color: #909399; cursor: pointer; border-radius: 6px; flex-shrink: 0; }
.icon-btn:hover:not(:disabled) { background: #f0f2f5; color: #409eff; }
.icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mini-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: none; background: transparent; color: #c0c4cc; cursor: pointer; border-radius: 4px; flex-shrink: 0; }
.mini-icon-btn:hover:not(:disabled) { background: #ecf5ff; color: #409eff; }
.mini-icon-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.icon-btn.recording { color: #f56c6c; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
.send-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: #409eff; color: #fff; cursor: pointer; border-radius: 8px; flex-shrink: 0; transition: background 0.2s; }
.send-btn:hover:not(:disabled) { background: #337ecc; }
.send-btn:disabled { background: #a0cfff; cursor: not-allowed; }
.ai-chat-widget.compact { border-radius: 12px; max-width: 400px; max-height: 600px; }
.ai-chat-widget.compact .chat-header { padding: 8px 12px; }

.policy-btn {
  padding: 2px 7px;
  border: 1px solid #dcdfe6;
  background: #fff;
  border-radius: 4px;
  font-size: 11px;
  color: #909399;
  cursor: pointer;
  line-height: 1.6;
  transition: all 0.15s;
}
.policy-btn:hover { border-color: #409eff; color: #409eff; }
.policy-btn--active { background: #ecf5ff; border-color: #409eff; color: #409eff; font-weight: 600; }
.policy-sep { width: 1px; height: 14px; background: #dcdfe6; align-self: center; flex-shrink: 0; }

.fc-call-panel { border-top: 1px solid #e4e7ed; background: #fafafa; max-height: 170px; flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; }
.fc-call-summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 12px; font-size: 11px; font-weight: 600; color: #909399; background: #f5f7fa; border-bottom: 1px solid #e4e7ed; }
.fc-call-summary__error { margin-left: auto; color: #f56c6c; }
.fc-call-empty { padding: 12px; color: #c0c4cc; font-size: 12px; text-align: center; }
.fc-call-list { padding: 6px 8px; overflow: auto; }
.fc-call-entry { width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto auto; gap: 6px; align-items: center; padding: 5px 6px; border: none; border-radius: 4px; background: transparent; color: #606266; cursor: pointer; text-align: left; font-size: 11px; }
.fc-call-entry:hover { background: #ecf5ff; color: #409eff; }
.fc-call-entry + .fc-call-entry { margin-top: 2px; }
.fc-call-entry__time { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; color: #909399; }
.fc-call-entry__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.fc-call-entry__meta { color: #c0c4cc; white-space: nowrap; }
.fc-call-entry__status { white-space: nowrap; font-weight: 600; }
.fc-call-entry__report { white-space: nowrap; color: #909399; }
.fc-call-entry--success .fc-call-entry__status { color: #67c23a; }
.fc-call-entry--error .fc-call-entry__status { color: #f56c6c; }
.fc-dialog-mask { position: fixed; inset: 0; z-index: 4000; background: rgba(15, 23, 42, 0.35); display: flex; align-items: center; justify-content: center; padding: 24px; }
.fc-dialog { width: min(720px, 92vw); max-height: min(720px, 86vh); display: flex; flex-direction: column; background: #fff; border-radius: 8px; box-shadow: 0 18px 48px rgba(15, 23, 42, 0.28); overflow: hidden; }
.fc-dialog__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid #e4e7ed; background: #f8fafc; }
.fc-dialog__title { font-weight: 700; color: #303133; font-size: 14px; }
.fc-dialog__meta { margin-top: 3px; font-size: 12px; color: #909399; }
.fc-dialog__body { padding: 14px 16px; overflow: auto; }
.fc-dialog__section + .fc-dialog__section { margin-top: 14px; }
.fc-dialog__section h3 { margin: 0 0 8px; font-size: 12px; color: #606266; }
.fc-dialog__section pre { margin: 0; padding: 10px; border-radius: 6px; background: #0f172a; color: #dbeafe; font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; max-height: 260px; overflow: auto; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
</style>
