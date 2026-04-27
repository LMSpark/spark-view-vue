<template>
  <div class="ai-chat-widget" :class="{ compact: compact }">
    <div class="chat-header">
      <span class="chat-title">{{ title ?? 'AI 助手' }}</span>
      <div class="chat-header-actions">
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

    <div class="chat-messages-shell">
      <div class="chat-region-toolbar">
        <span class="chat-region-title">诊断流 ({{ diagnosticItems.length }})</span>
        <div class="chat-region-actions">
          <span v-if="copyStatus !== 'idle'" :class="['copy-status', `copy-status--${copyStatus}`]">{{ copyStatusText }}</span>
          <button class="mini-icon-btn" title="复制诊断 HTML" :disabled="diagnosticItems.length === 0" @click="copyDiagnosticsHtml">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v16h13c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 18H8V7h11v16z" />
            </svg>
          </button>
          <button class="mini-icon-btn" title="清空诊断流" @click="emit('clearMessages')">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
          </button>
        </div>
      </div>

      <div ref="messagesRef" class="chat-messages">
        <div v-if="diagnosticItems.length === 0" class="chat-empty">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="#c0c4cc">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
          </svg>
          <p>{{ placeholder ?? '有什么可以帮您？' }}</p>
        </div>

        <article
          v-for="item in diagnosticItems"
          :key="item.id"
          class="diagnostic-entry"
          :class="`diagnostic-entry--${item.kind}`"
        >
          <header class="diagnostic-entry__header">
            <span class="diagnostic-entry__time">{{ formatTimestamp(item.timestamp) }}</span>
            <span class="diagnostic-entry__kind">{{ item.kindLabel }}</span>
            <span class="diagnostic-entry__title">{{ item.title }}</span>
            <span v-if="item.subtitle" class="diagnostic-entry__subtitle">{{ item.subtitle }}</span>
          </header>
          <div v-if="item.kind === 'clarification' && item.clarification" class="clarification-card">
            <p v-if="item.clarification.reason" class="clarification-card__reason">{{ item.clarification.reason }}</p>
            <article v-for="question in item.clarification.questions" :key="question.id" class="clarification-question">
              <header class="clarification-question__header">
                <span class="clarification-question__type">{{ question.type === 'multi' ? '多选' : '单选' }}</span>
                <span class="clarification-question__prompt">{{ question.prompt }}</span>
              </header>
              <div class="clarification-options">
                <button
                  v-for="option in question.options"
                  :key="option.id"
                  class="clarification-option"
                  :class="{ 'clarification-option--recommended': isRecommendedOption(question, option) }"
                  :disabled="isStreaming || isClarificationAnswered(item.id)"
                  @click="answerClarificationOption(item, question, option)"
                >
                  <span class="clarification-option__label">{{ option.label }}</span>
                  <span v-if="isRecommendedOption(question, option)" class="clarification-option__badge">推荐</span>
                  <small v-if="option.description" class="clarification-option__desc">{{ option.description }}</small>
                </button>
              </div>
            </article>
            <div class="clarification-actions">
              <button
                v-if="hasRecommendedAnswers(item.clarification)"
                class="clarification-recommend-btn"
                :disabled="isStreaming || isClarificationAnswered(item.id)"
                @click="answerClarificationRecommended(item)"
              >按推荐项回答</button>
              <span v-if="isClarificationAnswered(item.id)" class="clarification-answered">已回答</span>
            </div>
          </div>
          <pre v-else class="diagnostic-entry__payload">{{ item.payload }}</pre>
        </article>
      </div>
    </div>

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
      <div v-if="pendingFiles.length > 0" class="pending-files">
        <span v-for="(f, i) in pendingFiles" :key="f.fileId" class="pending-file-tag">
          📎 {{ f.name }}
          <button class="remove-file" @click="emit('removePendingFile', i)">×</button>
        </span>
      </div>

      <div class="input-row">
        <button class="icon-btn" title="上传文件" :disabled="isStreaming" @click="emit('triggerFileInput')">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
          </svg>
        </button>

        <button class="icon-btn" :class="{ recording: isRecording }" :title="isRecording ? '停止录音' : '语音输入'" :disabled="isStreaming" @click="emit('toggleVoice')">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </button>

        <textarea
          ref="textareaRef"
          :value="inputText"
          class="chat-textarea"
          :placeholder="isRecording ? '正在录音...' : (isStreaming ? 'AI 编辑中，可先输入下一条指令...' : (placeholder ?? '输入消息...'))"
          rows="1"
          @keydown.enter.exact.prevent="emit('send')"
          @input="handleInput"
        />

        <button class="send-btn" :disabled="isStreaming || (inputText.trim() === '' && pendingFiles.length === 0)" @click="emit('send')">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const CLARIFICATION_ACTION = 'interaction.ask'

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
  type: string
  data: string
}

interface FcCallLike {
  id: string
  timestamp: string
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
  kindLabel: string
  title: string
  subtitle?: string
  payload: string
  clarification?: ClarificationPayload
  openByDefault: boolean
}

interface SseTextSegment {
  timestamp: string
  type: string
  sessionId?: string
  chunks: string[]
}

const props = defineProps<{
  messages: ChatMessageLike[]
  pendingFiles: FileAttachment[]
  inputText: string
  isStreaming: boolean
  isRecording: boolean
  error: string | null
  title?: string
  placeholder?: string
  compact?: boolean
  toolLogs?: ToolLogLike[]
  canClearToolLogs?: boolean
  sseEvents?: SseEventLike[]
  fcCalls?: FcCallLike[]
  pageId?: string | undefined
  recoveryPolicy?: RecoveryPolicyLike
  collaborationPolicy?: CollaborationPolicyLike
}>()

const emit = defineEmits<{
  (e: 'update:inputText', value: string): void
  (e: 'send'): void
  (e: 'clear'): void
  (e: 'clearMessages'): void
  (e: 'clearToolLogs'): void
  (e: 'triggerFileInput'): void
  (e: 'toggleVoice'): void
  (e: 'removePendingFile', index: number): void
  (e: 'update:recoveryPolicy', value: RecoveryPolicyLike): void
  (e: 'update:collaborationPolicy', value: CollaborationPolicyLike): void
}>(
)

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

const COLLAB_OPTIONS: PolicyOption<CollaborationPolicyLike>[] = [
  { value: 'auto', short: '自动', label: '自动执行：允许直接执行写入' },
  { value: 'critical-confirm', short: '关键确认', label: '关键确认：删除/替换等高风险动作前先确认' },
  { value: 'plan-confirm', short: '计划确认', label: '计划确认：本轮只规划和读取，不写入' },
  { value: 'step-confirm', short: '逐步', label: '逐步执行：每轮限制为较短执行步' },
  { value: 'human-takeover', short: '接管', label: '人工接管：AI 不执行写入，等待人工操作或下一条指令' },
]

const messagesRef = ref<HTMLDivElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const selectedFcCall = ref<FcCallLike | null>(null)
const copyStatus = ref<'idle' | 'copied' | 'failed'>('idle')
const answeredClarifications = ref<Record<string, true>>({})
let copyStatusTimer: number | undefined

const fcCallItems = computed(() => props.fcCalls ?? [])
const fcErrorCount = computed(() => fcCallItems.value.filter((call) => call.status === 'error').length)
const showFcPanel = computed(() => props.toolLogs !== undefined || fcCallItems.value.length > 0)
const copyStatusText = computed(() => copyStatus.value === 'copied' ? '已复制' : '复制失败')
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

  for (const message of props.messages) {
    const timestamp = toIsoTimestamp(message.timestamp)
    items.push({
      id: `message:${message.id}`,
      timestamp,
      sortTime: toSortTime(timestamp),
      kind: 'message',
      kindLabel: message.role === 'user' ? '用户' : '助手',
      title: message.role === 'user' ? '用户消息' : (message.streaming === true ? 'AI 响应中' : 'AI 响应'),
      payload: formatMessagePayload(message),
      openByDefault: message.streaming === true || message.role === 'user',
      order: order++,
    })
  }

  for (const sseTextItem of buildSseTextDiagnosticItems(props.sseEvents ?? [], props.pageId)) {
    items.push({
      ...sseTextItem,
      order: order++,
    })
  }

  for (const event of props.sseEvents ?? []) {
    if (SSE_TEXT_EVENT_TYPES.has(event.type)) continue
    items.push({
      id: `sse:${event.id}`,
      timestamp: event.timestamp,
      sortTime: toSortTime(event.timestamp),
      kind: 'sse',
      kindLabel: 'SSE事件',
      title: `SSE ${formatSseTypeLabel(event.type)}`,
      ...(event.sessionId !== undefined ? { subtitle: event.sessionId } : {}),
      payload: event.data || '(empty)',
      openByDefault: true,
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
      kindLabel: '反问',
      title: clarification.title,
      ...(call.callId !== undefined ? { subtitle: call.callId } : {}),
      payload: stringifyPayload(clarification),
      clarification,
      openByDefault: true,
      order: order++,
    })
  }

  for (const log of props.toolLogs ?? []) {
    const timestamp = toIsoTimestamp(log.timestamp)
    items.push({
      id: `log:${order}:${log.tag}`,
      timestamp,
      sortTime: toSortTime(timestamp),
      kind: 'log',
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

function normalizeDiagnosticPageId(pageId: string | undefined): string {
  return typeof pageId === 'string' && pageId.trim() !== '' ? pageId : 'global'
}

function buildSseTextDiagnosticItems(events: SseEventLike[], pageId: string | undefined): DiagnosticItem[] {
  const segments: SseTextSegment[] = []

  for (const event of events) {
    if (!SSE_TEXT_EVENT_TYPES.has(event.type)) continue
    if (event.data.trim() === '') continue
    const last = segments.at(-1)
    if (last !== undefined && last.type === event.type && last.sessionId === event.sessionId) {
      last.chunks.push(event.data)
    } else {
      segments.push({
        timestamp: event.timestamp,
        type: event.type,
        ...(event.sessionId !== undefined ? { sessionId: event.sessionId } : {}),
        chunks: [event.data],
      })
    }
  }

  if (segments.length === 0) return []

  const normalizedPageId = normalizeDiagnosticPageId(pageId)
  return segments.map((segment, index): DiagnosticItem => ({
    id: `sse-text:${normalizedPageId}:${index}`,
    timestamp: segment.timestamp,
    sortTime: toSortTime(segment.timestamp),
    kind: 'sse-text',
    kindLabel: 'SSE文本',
    title: `SSE ${formatSseTypeLabel(segment.type)} (${segment.chunks.length}片)`,
    subtitle: formatSseTextSubtitle(normalizedPageId, segment.sessionId),
    payload: segment.chunks.join(''),
    openByDefault: true,
  }))
}

function formatSseTextSubtitle(pageId: string, sessionId: string | undefined): string {
  return sessionId === undefined ? `页面=${pageId}` : `页面=${pageId} · 会话=${sessionId}`
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
    default:
      return `事件 ${type}`
  }
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
  return formatActionTitle(tag)
}

function formatActionTitle(action: string): string {
  const direct = ACTION_TITLE_MAP[action]
  if (direct !== undefined) return direct

  if (action.startsWith('sparkNodeTree.')) return `节点树${formatActionSuffix(action.slice('sparkNodeTree.'.length))}`
  if (action.startsWith('datasetTool.')) return `数据集${formatActionSuffix(action.slice('datasetTool.'.length))}`
  if (action.startsWith('textModel.')) return `文本模型${formatActionSuffix(action.slice('textModel.'.length))}`
  if (action.startsWith('datatable.')) return `数据表${formatActionSuffix(action.slice('datatable.'.length))}`
  if (action.startsWith('dataview.')) return `数据视图${formatActionSuffix(action.slice('dataview.'.length))}`
  if (action.startsWith('relation.')) return `关系${formatActionSuffix(action.slice('relation.'.length))}`
  if (action.startsWith('blueprint.')) return `蓝图${formatActionSuffix(action.slice('blueprint.'.length))}`
  if (action.startsWith('schema.')) return `模型结构${formatActionSuffix(action.slice('schema.'.length))}`

  return action
}

function formatActionSuffix(suffix: string): string {
  const direct = ACTION_SUFFIX_TITLE_MAP[suffix]
  if (direct !== undefined) return direct
  return `操作 ${suffix}`
}

const ACTION_TITLE_MAP: Record<string, string> = {
  'session-ready': '会话就绪',
  'session.describe': '会话状态',
  'stills.capabilities': '能力列表',
  'stills.actionSpec': '动作规格',
  'edit.bootstrap': '初始化编辑会话',
  'catalog.query': '组件目录',
  'catalog.guide': '组件指南',
  queryComponentCatalog: '组件目录',
  queryComponentGuide: '组件指南',
  'interaction.ask': '反问确认',
  'dataset.export': '导出数据集',
  'dataset.bootstrap': '初始化数据集',
  'dataset.describe': '数据集概览',
  'dataset.validate': '校验数据集',
  'dataset.reset': '重置数据集',
  'fc-error-report': 'FC 错误回传',
  '开始 LLM 编辑': '开始 LLM 编辑',
  '未写入': '未写入',
  '编辑失败': '编辑失败',
}

const ACTION_SUFFIX_TITLE_MAP: Record<string, string> = {
  bootstrap: '初始化',
  describe: '概览',
  validate: '校验',
  export: '导出',
  reset: '重置',
  listTables: '表列表',
  getTable: '读取表',
  updateTable: '更新表',
  addTable: '添加表',
  removeTable: '删除表',
  listColumns: '列列表',
  addColumns: '添加列',
  updateColumn: '更新列',
  removeColumn: '删除列',
  addRows: '添加行',
  readRule: '读取规则',
  readPageData: '读取页面数据',
  readScript: '读取脚本',
  readStyle: '读取样式',
  writeRule: '写入规则',
  writePageData: '写入页面数据',
  writeScript: '写入脚本',
  writeStyle: '写入样式',
  countNodes: '统计节点',
  getAllData: '读取全量结构',
  getNode: '读取节点',
  getLocation: '定位节点',
  hasNode: '检查节点',
  getParent: '读取父节点',
  listChildren: '子节点列表',
  findByType: '按类型查找',
  collectDataKeys: '收集数据键',
  collectHandlerNames: '收集处理函数',
  addNode: '添加节点',
  addNodes: '批量添加节点',
  moveNode: '移动节点',
  setProps: '设置属性',
  setPropsBatch: '批量设置属性',
  replaceNode: '替换节点',
  replaceNodes: '批量替换节点',
  removeNode: '删除节点',
  removeNodes: '批量删除节点',
  create: '创建',
  advance: '推进',
  revise: '修订',
  validateCoverage: '校验覆盖范围',
  selfCheck: '自检',
  lock: '锁定',
  add: '添加',
  remove: '删除',
  list: '列表',
}

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
  if (call.toolName !== CLARIFICATION_ACTION || call.status !== 'success') return null
  return normalizeClarificationPayload(call.result) ?? normalizeClarificationPayload(call.args)
}

function isRecommendedOption(question: ClarificationQuestion, option: ClarificationOption): boolean {
  return question.recommendedOptionIds.includes(option.id)
}

function hasRecommendedAnswers(payload: ClarificationPayload): boolean {
  return payload.questions.every((question) => question.recommendedOptionIds.length > 0)
}

function isClarificationAnswered(itemId: string): boolean {
  return answeredClarifications.value[itemId] === true
}

function formatOptionValue(option: ClarificationOption): string {
  if (option.value === undefined) return option.id
  return typeof option.value === 'string' ? option.value : stringifyPayload(option.value)
}

function buildClarificationAnswer(
  item: DiagnosticItem,
  selections: Array<{ question: ClarificationQuestion; optionIds: string[] }>,
): string {
  const payload = item.clarification
  if (payload === undefined) return ''
  const lines = [`【反问回答】${payload.title}`]
  for (const selection of selections) {
    const selectedOptions = selection.optionIds
      .map((optionId) => selection.question.options.find((option) => option.id === optionId))
      .filter((option): option is ClarificationOption => option !== undefined)
    if (selectedOptions.length === 0) continue
    lines.push(`问题：${selection.question.prompt}`)
    lines.push(`选择：${selectedOptions.map((option) => option.label).join('、')}`)
    lines.push(`选项值：${selectedOptions.map(formatOptionValue).join('、')}`)
  }
  return lines.join('\n')
}

function submitClarificationAnswer(
  item: DiagnosticItem,
  selections: Array<{ question: ClarificationQuestion; optionIds: string[] }>,
): void {
  if (props.isStreaming || item.clarification === undefined || isClarificationAnswered(item.id)) return
  const answer = buildClarificationAnswer(item, selections)
  if (answer.trim() === '') return
  answeredClarifications.value = { ...answeredClarifications.value, [item.id]: true }
  emit('update:inputText', answer)
  emit('send')
}

function answerClarificationOption(item: DiagnosticItem, question: ClarificationQuestion, option: ClarificationOption): void {
  submitClarificationAnswer(item, [{ question, optionIds: [option.id] }])
}

function answerClarificationRecommended(item: DiagnosticItem): void {
  const payload = item.clarification
  if (payload === undefined) return
  submitClarificationAnswer(item, payload.questions.map((question) => ({
    question,
    optionIds: question.recommendedOptionIds,
  })))
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
  return lines.length > 0 ? lines.join('\n\n') : '(empty)'
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildDiagnosticsHtml(): string {
  const body = diagnosticItems.value.map((item) => {
    const subtitle = item.subtitle !== undefined ? ` <small>${escapeHtml(item.subtitle)}</small>` : ''
    if (item.clarification !== undefined) {
      return [
        `<article class="spark-ai-diagnostic spark-ai-diagnostic--${item.kind}">`,
        `<header><time>${escapeHtml(item.timestamp)}</time> <strong>${escapeHtml(item.kindLabel)}</strong> ${escapeHtml(item.title)}${subtitle}</header>`,
        buildClarificationHtml(item.clarification),
        '</article>',
      ].join('')
    }
    return [
      `<article class="spark-ai-diagnostic spark-ai-diagnostic--${item.kind}">`,
      `<header><time>${escapeHtml(item.timestamp)}</time> <strong>${escapeHtml(item.kindLabel)}</strong> ${escapeHtml(item.title)}${subtitle}</header>`,
      `<pre>${escapeHtml(item.payload)}</pre>`,
      '</article>',
    ].join('')
  }).join('\n')
  return `<section class="spark-ai-diagnostics">\n${body}\n</section>`
}

function buildClarificationHtml(payload: ClarificationPayload): string {
  const reason = payload.reason !== undefined ? `<p>${escapeHtml(payload.reason)}</p>` : ''
  const questions = payload.questions.map((question) => {
    const options = question.options.map((option) => {
      const recommended = isRecommendedOption(question, option) ? ' <strong>推荐</strong>' : ''
      const description = option.description !== undefined ? `<small>${escapeHtml(option.description)}</small>` : ''
      return `<li data-option-id="${escapeHtml(option.id)}"><span>${escapeHtml(option.label)}</span>${recommended}${description}</li>`
    }).join('')
    return `<section><h4>${escapeHtml(question.prompt)}</h4><ol>${options}</ol></section>`
  }).join('')
  return `<div class="spark-ai-clarification">${reason}${questions}</div>`
}

async function copyDiagnosticsHtml(): Promise<void> {
  if (diagnosticItems.value.length === 0) return
  try {
    await navigator.clipboard.writeText(buildDiagnosticsHtml())
    markCopyStatus('copied')
  } catch {
    markCopyStatus('failed')
  }
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
      const el = messagesRef.value
      if (el !== null) {
        el.scrollTop = el.scrollHeight
      }
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
.chat-header-actions { display: flex; gap: 4px; }
.chat-messages-shell { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.chat-region-toolbar { display: flex; align-items: center; justify-content: space-between; min-height: 32px; padding: 0 10px 0 12px; border-bottom: 1px solid #ebeef5; background: #fafafa; flex-shrink: 0; gap: 8px; }
.chat-region-title { font-size: 11px; font-weight: 600; color: #909399; }
.chat-region-actions { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
.copy-status { font-size: 11px; white-space: nowrap; }
.copy-status--copied { color: #67c23a; }
.copy-status--failed { color: #f56c6c; }
.chat-messages { flex: 1; overflow-y: auto; padding: 10px; min-height: 0; background: #fff; }
.chat-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px; color: #909399; font-size: 14px; }
.diagnostic-entry { border: 1px solid #e4e7ed; border-radius: 6px; background: #fff; overflow: hidden; }
.diagnostic-entry + .diagnostic-entry { margin-top: 8px; }
.diagnostic-entry--message { border-left: 3px solid #409eff; }
.diagnostic-entry--sse { border-left: 3px solid #67c23a; }
.diagnostic-entry--sse-text { border-left: 3px solid #10b981; }
.diagnostic-entry--log { border-left: 3px solid #e6a23c; }
.diagnostic-entry--clarification { border-left: 3px solid #f56c6c; }
.diagnostic-entry__header { display: flex; align-items: center; gap: 6px; padding: 7px 9px; background: #f8fafc; color: #606266; font-size: 12px; min-width: 0; border-bottom: 1px solid #eef2f7; }
.diagnostic-entry__time { color: #909399; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; flex-shrink: 0; }
.diagnostic-entry__kind { color: #409eff; font-weight: 700; font-size: 11px; flex-shrink: 0; }
.diagnostic-entry__title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.diagnostic-entry__subtitle { margin-left: auto; color: #c0c4cc; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.diagnostic-entry__payload { margin: 0; padding: 9px 10px; background: #0f172a; color: #dbeafe; font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; overflow: visible; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
.clarification-card { padding: 10px; background: #fff; color: #303133; }
.clarification-card__reason { margin: 0 0 8px; padding: 8px 10px; border-radius: 6px; background: #fef0f0; color: #a94442; font-size: 12px; line-height: 1.5; }
.clarification-question + .clarification-question { margin-top: 10px; }
.clarification-question__header { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
.clarification-question__type { flex-shrink: 0; padding: 1px 6px; border-radius: 4px; background: #f4f4f5; color: #909399; font-size: 11px; line-height: 1.5; }
.clarification-question__prompt { font-size: 13px; font-weight: 600; line-height: 1.5; color: #303133; }
.clarification-options { display: grid; gap: 6px; }
.clarification-option { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 8px; align-items: center; width: 100%; padding: 8px 10px; border: 1px solid #dcdfe6; border-radius: 6px; background: #fff; color: #606266; cursor: pointer; text-align: left; }
.clarification-option:hover:not(:disabled) { border-color: #409eff; background: #ecf5ff; color: #409eff; }
.clarification-option:disabled { opacity: 0.58; cursor: not-allowed; }
.clarification-option--recommended { border-color: #f3d19e; background: #fdf6ec; }
.clarification-option__label { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clarification-option__badge { justify-self: end; padding: 1px 6px; border-radius: 999px; background: #e6a23c; color: #fff; font-size: 11px; line-height: 1.4; }
.clarification-option__desc { grid-column: 1 / -1; color: #909399; font-size: 11px; line-height: 1.45; }
.clarification-actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.clarification-recommend-btn { padding: 5px 10px; border: none; border-radius: 6px; background: #409eff; color: #fff; font-size: 12px; cursor: pointer; }
.clarification-recommend-btn:hover:not(:disabled) { background: #337ecc; }
.clarification-recommend-btn:disabled { opacity: 0.58; cursor: not-allowed; }
.clarification-answered { color: #67c23a; font-size: 12px; font-weight: 600; }
.chat-error { padding: 8px 16px; background: #fef0f0; color: #f56c6c; font-size: 13px; border-top: 1px solid #fbc4c4; }
.chat-input-area { border-top: 1px solid #e4e7ed; padding: 8px 12px; background: #fafafa; }
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
.ai-chat-widget.compact .chat-messages { padding: 8px; }

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
