<template>
  <div class="chat-messages-shell" :class="{ 'chat-messages-shell--compact': compact }">
    <div class="chat-region-toolbar">
      <span class="chat-region-title">{{ title }} ({{ items.length }})</span>
      <div class="chat-region-actions">
        <span v-if="copyStatus !== 'idle'" :class="['copy-status', `copy-status--${copyStatus}`]">{{ copyStatusText }}</span>
        <button class="mini-icon-btn" title="复制结构化诊断数据" :disabled="!canExportDiagnostics" @click="emit('copy')">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v16h13c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 18H8V7h11v16z" />
          </svg>
        </button>
        <button class="mini-icon-btn" title="下载结构化诊断数据" :disabled="!canExportDiagnostics" @click="emit('download')">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
            <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z" />
          </svg>
        </button>
        <button class="mini-icon-btn" title="清空诊断流" @click="emit('clear')">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
          </svg>
        </button>
      </div>
    </div>

    <div ref="streamRef" class="chat-messages">
      <div v-if="items.length === 0" class="chat-empty">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="#c0c4cc">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
        </svg>
        <p>{{ placeholder ?? '有什么可以帮您？' }}</p>
      </div>

      <article
        v-for="{ item, display } in displayItems"
        :key="item.id"
        class="diagnostic-entry"
        :class="`diagnostic-entry--${item.entryType}`"
      >
        <header class="diagnostic-entry__header">
          <span class="diagnostic-entry__time">{{ formatTimestamp(item.timestamp) }}</span>
          <span class="diagnostic-entry__kind">{{ item.kindLabel }}</span>
          <span class="diagnostic-entry__title">{{ item.title }}</span>
          <span v-if="item.subtitle" class="diagnostic-entry__subtitle">{{ item.subtitle }}</span>
        </header>
        <div v-if="item.entryType === 'clarification' && item.clarification" class="clarification-card">
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
                :disabled="!canAnswer || isClarificationAnswered(item.id)"
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
              :disabled="!canAnswer || isClarificationAnswered(item.id)"
              @click="answerClarificationRecommended(item)"
            >按推荐项回答</button>
            <span v-if="isClarificationAnswered(item.id)" class="clarification-answered">已回答</span>
          </div>
        </div>
        <div v-else class="diagnostic-entry__body">
          <p v-if="display.summary" class="diagnostic-summary">{{ display.summary }}</p>
          <div v-if="display.chips.length > 0" class="diagnostic-chips">
            <span v-for="chip in display.chips" :key="chip" class="diagnostic-chip">{{ chip }}</span>
          </div>
          <details v-if="display.showRaw" class="diagnostic-raw" :open="display.openRaw">
            <summary>{{ display.rawLabel }}</summary>
            <pre>{{ display.raw }}</pre>
          </details>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill ai-sse-stream-view
 * @catalogIgnore
 * @catalogInternal
 * @description AI Host SSE/诊断流显示组件，负责渲染流事件、消息快照、反问卡片和复制/清空操作。
 */
import { computed, ref } from 'vue'

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

interface AiSseStreamItem {
  id: string
  timestamp: string
  entryType: 'message' | 'sse' | 'sse-text' | 'log' | 'clarification'
  kindLabel: string
  title: string
  subtitle?: string
  payload: string
  clarification?: ClarificationPayload
  openByDefault?: boolean
}

interface DisplayPayload {
  summary: string
  chips: string[]
  raw: string
  rawLabel: string
  showRaw: boolean
  openRaw: boolean
}

const props = withDefaults(defineProps<{
  items: AiSseStreamItem[]
  placeholder?: string | undefined
  title?: string | undefined
  copyStatus?: 'idle' | 'copied' | 'failed' | undefined
  copyStatusText?: string | undefined
  canExportDiagnostics?: boolean | undefined
  canSend?: boolean | undefined
  compact?: boolean | undefined
}>(), {
  title: '对话',
  copyStatus: 'idle',
  copyStatusText: '',
  canExportDiagnostics: false,
  canSend: true,
  compact: false,
})

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'download'): void
  (e: 'clear'): void
  (e: 'submitClarificationAnswer', answer: string): void
}>()

const streamRef = ref<HTMLDivElement | null>(null)
const answeredClarifications = ref<Record<string, true>>({})
const canAnswer = computed(() => props.canSend)
const canExportDiagnostics = computed(() => props.canExportDiagnostics || props.items.length > 0)
const displayItems = computed(() => props.items.map((item) => ({
  item,
  display: createDisplayPayload(item),
})))

function scrollToBottom(): void {
  const el = streamRef.value
  if (el !== null) {
    el.scrollTop = el.scrollHeight
  }
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
  item: AiSseStreamItem,
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
  item: AiSseStreamItem,
  selections: Array<{ question: ClarificationQuestion; optionIds: string[] }>,
): void {
  if (!canAnswer.value || item.clarification === undefined || isClarificationAnswered(item.id)) return
  const answer = buildClarificationAnswer(item, selections)
  if (answer.trim() === '') return
  answeredClarifications.value = { ...answeredClarifications.value, [item.id]: true }
  emit('submitClarificationAnswer', answer)
}

function answerClarificationOption(item: AiSseStreamItem, question: ClarificationQuestion, option: ClarificationOption): void {
  submitClarificationAnswer(item, [{ question, optionIds: [option.id] }])
}

function answerClarificationRecommended(item: AiSseStreamItem): void {
  const payload = item.clarification
  if (payload === undefined) return
  submitClarificationAnswer(item, payload.questions.map((question) => ({
    question,
    optionIds: question.recommendedOptionIds,
  })))
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

function formatTimestamp(value: string | Date | undefined): string {
  const date = value instanceof Date ? value : new Date(value ?? Date.now())
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJsonPayload(payload: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(payload) }
  } catch {
    return { ok: false }
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function compactValue(value: string, maxLength = 42): string {
  if (value.length <= maxLength) return value
  const headLength = Math.ceil((maxLength - 3) / 2)
  const tailLength = Math.floor((maxLength - 3) / 2)
  return `${value.slice(0, headLength)}...${value.slice(value.length - tailLength)}`
}

function arrayCountLabel(payload: Record<string, unknown>, key: string, label: string): string | null {
  const value = payload[key]
  return Array.isArray(value) ? `${label} ${value.length}` : null
}

function collectPayloadChips(payload: unknown): string[] {
  if (!isRecord(payload)) return []
  const chips: string[] = []
  const ok = payload['ok']
  if (ok === true) chips.push('成功')
  if (ok === false) chips.push('失败')
  const code = optionalString(payload['code'])
  if (code !== undefined) chips.push(code)
  const round = payload['round']
  if (typeof round === 'number') chips.push(`第 ${round} 轮`)
  const kind = optionalString(payload['kind'])
  if (kind !== undefined) chips.push(kind)
  const sessionId = optionalString(payload['sessionId'])
  if (sessionId !== undefined) chips.push(compactValue(sessionId))
  const turnId = optionalString(payload['turnId'])
  if (turnId !== undefined) chips.push(`Turn ${turnId.slice(0, 8)}`)
  for (const item of [
    arrayCountLabel(payload, 'messages', '消息'),
    arrayCountLabel(payload, 'tools', '工具'),
    arrayCountLabel(payload, 'toolCalls', '调用'),
  ]) {
    if (item !== null) chips.push(item)
  }
  return chips
}

function summarizeObjectPayload(payload: Record<string, unknown>): string {
  if (payload['ok'] === false) {
    const code = optionalString(payload['code'])
    const msg = optionalString(payload['msg'])
    if (code !== undefined && msg !== undefined) return `${code}: ${msg}`
    if (msg !== undefined) return msg
  }

  const summary = optionalString(payload['summary'])
  if (summary !== undefined) return summary

  const text = optionalString(payload['text'])
  if (text !== undefined) return text

  const kind = optionalString(payload['kind'])
  if (kind === 'streamTurn') {
    const round = typeof payload['round'] === 'number' ? `第 ${payload['round']} 轮` : '本轮'
    const messageCount = Array.isArray(payload['messages']) ? payload['messages'].length : 0
    const toolCount = Array.isArray(payload['tools']) ? payload['tools'].length : 0
    return `${round} LLM 请求，包含 ${messageCount} 条上下文消息和 ${toolCount} 个可用工具。`
  }
  if (kind === 'appendMessages') {
    const messageCount = Array.isArray(payload['messages']) ? payload['messages'].length : 0
    return `追加 ${messageCount} 条工具上下文给 LLM。`
  }

  const protocolVersion = payload['protocolVersion']
  const sessionId = optionalString(payload['sessionId'])
  if (typeof protocolVersion === 'number' && sessionId !== undefined) {
    return `协议 v${protocolVersion}，会话 ${compactValue(sessionId, 56)}。`
  }

  const keys = Object.keys(payload)
  return keys.length > 0 ? `JSON 事件：${keys.slice(0, 6).join('、')}` : 'JSON 事件'
}

function createDisplayPayload(item: AiSseStreamItem): DisplayPayload {
  const parsed = parseJsonPayload(item.payload)
  if (!parsed.ok) {
    return {
      summary: item.payload,
      chips: [],
      raw: item.payload,
      rawLabel: '完整内容',
      showRaw: false,
      openRaw: false,
    }
  }

  const raw = stringifyPayload(parsed.value)
  if (!isRecord(parsed.value)) {
    return {
      summary: raw,
      chips: [],
      raw,
      rawLabel: '原始数据',
      showRaw: false,
      openRaw: false,
    }
  }

  return {
    summary: summarizeObjectPayload(parsed.value),
    chips: collectPayloadChips(parsed.value),
    raw,
    rawLabel: '查看原始 JSON',
    showRaw: true,
    openRaw: item.openByDefault === true && item.entryType !== 'sse',
  }
}

defineExpose({ scrollToBottom })
</script>

<style scoped>
.chat-messages-shell { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.chat-region-toolbar { display: flex; align-items: center; justify-content: space-between; min-height: 32px; padding: 0 10px 0 12px; border-bottom: 1px solid #ebeef5; background: #fafafa; flex-shrink: 0; gap: 8px; }
.chat-region-title { font-size: 11px; font-weight: 600; color: #909399; }
.chat-region-actions { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
.copy-status { font-size: 11px; white-space: nowrap; }
.copy-status--copied { color: #67c23a; }
.copy-status--failed { color: #f56c6c; }
.chat-messages { flex: 1; overflow-y: auto; padding: 10px; min-height: 0; background: #fff; }
.chat-messages-shell--compact .chat-messages { padding: 8px; }
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
.diagnostic-entry__body { padding: 9px 10px 10px; background: #fff; }
.diagnostic-summary { margin: 0; color: #303133; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.diagnostic-entry--sse .diagnostic-summary { color: #475569; }
.diagnostic-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.diagnostic-chip { display: inline-flex; align-items: center; max-width: 100%; padding: 1px 6px; border-radius: 999px; background: #f1f5f9; color: #64748b; font-size: 11px; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.diagnostic-raw { margin-top: 8px; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; overflow: hidden; }
.diagnostic-raw summary { padding: 6px 9px; color: #64748b; font-size: 11px; cursor: pointer; user-select: none; }
.diagnostic-raw summary:hover { color: #409eff; background: #f1f5f9; }
.diagnostic-raw pre { margin: 0; padding: 9px 10px; max-height: 220px; overflow: auto; border-top: 1px solid #e2e8f0; background: #fff; color: #334155; font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
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
.mini-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: none; background: transparent; color: #c0c4cc; cursor: pointer; border-radius: 4px; flex-shrink: 0; }
.mini-icon-btn:hover:not(:disabled) { background: #ecf5ff; color: #409eff; }
.mini-icon-btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
