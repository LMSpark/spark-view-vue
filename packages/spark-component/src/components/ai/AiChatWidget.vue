<template>
  <AiChatShell
    :messages="messages"
    :pending-files="pendingFiles"
    :input-text="inputText"
    :is-streaming="isStreaming"
    :active-turn-count="activeTurnCount"
    :queued-turn-count="queuedTurnCount"
    :max-parallel-turns="maxParallelTurns"
    :can-send="canSend"
    :is-recording="isRecording"
    :error="error"
    :sse-events="sseEvents"
    :fc-calls="fcCalls"
    :page-id="pageId"
    :draft-actions="draftActions"
    :draft-loading-id="draftLoadingActionId"
    v-bind="shellProps"
    @update:input-text="inputText = $event"
    @send="handleSend"
    @clear="handleClear"
    @clear-messages="handleClearMessages"
    @clear-tool-logs="handleClearToolLogs"
    @trigger-file-input="triggerFileInput"
    @toggle-voice="toggleVoice"
    @remove-pending-file="removePendingFile"
    @update:recovery-policy="setRecoveryPolicy"
    @update:collaboration-policy="setCollaborationPolicy"
    @trigger-draft-action="handleTriggerDraftAction"
  />
  <input ref="fileInputRef" type="file" multiple class="hidden-file-input" @change="handleFileChange" />
</template>

<script setup lang="ts">
/**
 * @skill ai-chat-widget
 * @catalogInternal
 * @description AI 聊天会话容器，封装 useAiChat 状态、消息发送、附件上传、工具日志和草稿动作；适合直接挂到页面或全局 AI 面板中。
 */
import { computed, ref } from 'vue'
import { Logger } from '@spark-view/spark-utils'
import AiChatShell from './AiChatShell.vue'
import { useAiChat } from './useAiChat'
import type { AiDraftActionConfig } from './useAiPanelStore'
import type {
  ChatMode,
  FileAttachment,
  AiChatSender,
  AiTurnConcurrencyConfig,
  AiFcErrorReporter,
  StreamAiChatText,
  TokenUsage,
} from './useAiChat'

const logger = Logger('AiChatWidget')

const props = defineProps<{
  /** Chat mode; 控制单轮或多轮会话行为。 */
  mode?: ChatMode
  /** System prompt; 注入给 AI 的系统级指令。 */
  systemPrompt?: string
  /** Panel title; 传递给聊天壳层顶部标题。 */
  title?: string
  /** Input placeholder; 传递给消息输入框的提示文案。 */
  placeholder?: string
  /** Compact layout; true 时使用更紧凑的聊天 UI。 */
  compact?: boolean
  /** Custom sender; 覆盖默认 AI 消息发送实现。 */
  sender?: AiChatSender
  /** Storage key; 用于持久化会话和面板状态。 */
  storageKey?: string
  /** Disable persistence; true 时不读写本地会话缓存。 */
  disablePersistence?: boolean | undefined
  /** Page id; 当前 AI 会话绑定的页面上下文。 */
  pageId?: string
  /** Show tool logs; true 时展示内置工具日志。 */
  showToolLogs?: boolean
  /** External tool logs; 由宿主传入并接管展示的工具日志。 */
  externalToolLogs?: Array<{ type: 'info' | 'success' | 'error'; tag: string; text: string; timestamp?: string }>
  /** Clear external tool logs; 宿主提供的外部日志清空函数。 */
  clearExternalToolLogs?: (() => void) | undefined
  /** Function-call error reporter; 上报 AI 函数调用错误。 */
  reportFcError?: AiFcErrorReporter | undefined
  /** Turn concurrency config; 控制 AI turn 的并发和排队行为。 */
  turnConcurrency?: AiTurnConcurrencyConfig | undefined
  /** Streaming chat implementation; 由宿主注入真实 LLM 流式调用。 */
  streamAiChatText?: StreamAiChatText | undefined
  /** Token usage parser; 将 provider 原始 usage 转成统一 token 统计。 */
  parseTokenUsage?: ((usageRaw: Record<string, unknown>) => TokenUsage) | undefined
  /** File upload implementation; 由宿主接管附件上传并返回可引用信息。 */
  uploadFile?: ((file: File) => Promise<FileAttachment>) | undefined
  /** Draft actions; 可由 AI 或用户触发的草稿编辑动作。 */
  draftActions?: readonly AiDraftActionConfig[] | undefined
  /** Action title map; 为 action id 覆盖展示标题。 */
  actionTitleMap?: Record<string, string> | undefined
  /** Action prefix title map; 为 action id 增加标题前缀。 */
  actionPrefixTitleMap?: Record<string, string> | undefined
  /** Action suffix title map; 为 action id 增加标题后缀。 */
  actionSuffixTitleMap?: Record<string, string> | undefined
}>()

const optionalShellProps = computed(() => ({
  ...(props.title !== undefined ? { title: props.title } : {}),
  ...(props.placeholder !== undefined ? { placeholder: props.placeholder } : {}),
  ...(props.compact !== undefined ? { compact: props.compact } : {}),
  ...(props.actionTitleMap !== undefined ? { actionTitleMap: props.actionTitleMap } : {}),
  ...(props.actionPrefixTitleMap !== undefined ? { actionPrefixTitleMap: props.actionPrefixTitleMap } : {}),
  ...(props.actionSuffixTitleMap !== undefined ? { actionSuffixTitleMap: props.actionSuffixTitleMap } : {}),
}))

const shellProps = computed(() => ({
  ...optionalShellProps.value,
  ...toolLogProps.value,
}))

const toolLogProps = computed(() => {
  const hasExternal = props.externalToolLogs !== undefined
  if (!props.showToolLogs && !hasExternal) return {}
  return {
    toolLogs: hasExternal ? (props.externalToolLogs ?? []) : toolLogs.value,
    canClearToolLogs: !hasExternal || props.clearExternalToolLogs !== undefined,
    recoveryPolicy: recoveryPolicy.value,
    collaborationPolicy: collaborationPolicy.value,
  }
})

const {
  messages,
  isStreaming,
  activeTurnCount,
  queuedTurnCount,
  maxParallelTurns,
  canSend,
  error,
  send,
  uploadFile,
  clear,
  clearMessages,
  clearToolLogs,
  appendToolLog,
  toolLogs,
  sseEvents,
  fcCalls,
  recoveryPolicy,
  collaborationPolicy,
  setRecoveryPolicy,
  setCollaborationPolicy,
} = useAiChat({
  mode: () => props.mode ?? 'multi',
  systemPrompt: () => props.systemPrompt,
  sender: () => props.sender,
  pageId: () => props.pageId,
  storageKey: () => props.storageKey,
  disablePersistence: () => props.disablePersistence,
  turnConcurrency: () => props.turnConcurrency,
  streamAiChatText: props.streamAiChatText,
  parseTokenUsage: props.parseTokenUsage,
  uploadFile: props.uploadFile,
  reportFcError: () => props.reportFcError,
})

const inputText = ref('')
const pendingFiles = ref<FileAttachment[]>([])
const isRecording = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const draftLoadingActionId = ref<string | null>(null)
const draftActions = computed(() => props.draftActions ?? [])

// ── 语音识别（Web Speech API，浏览器能力检测） ──────────────────────────

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}

let recognition: SpeechRecognitionLike | null = null

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  const w = window as unknown as Record<string, unknown>
  const ctor = w['SpeechRecognition'] ?? w['webkitSpeechRecognition']
  return typeof ctor === 'function' ? ctor as new () => SpeechRecognitionLike : undefined
}

function toggleVoice() {
  if (isRecording.value) {
    recognition?.stop()
    isRecording.value = false
    return
  }

  const Ctor = getSpeechRecognitionCtor()
  if (Ctor === undefined) {
    alert('当前浏览器不支持语音识别')
    return
  }

  recognition = new Ctor()
  recognition.lang = 'zh-CN'
  recognition.continuous = false
  recognition.interimResults = true

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map((r) => r[0].transcript)
      .join('')
    inputText.value = transcript
  }

  recognition.onend = () => {
    isRecording.value = false
  }

  recognition.onerror = () => {
    isRecording.value = false
  }

  recognition.start()
  isRecording.value = true
}

// ── 文件处理 ──────────────────────────────────────────────────────────────

function triggerFileInput() {
  fileInputRef.value?.click()
}

async function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const files = target.files
  if (files === null) return

  for (const file of Array.from(files)) {
    try {
      const attachment = await uploadFile(file)
      pendingFiles.value.push(attachment)
    } catch (err) {
      logger.error('file upload failed', err)
    }
  }
  target.value = '' // 重置 input
}

function removePendingFile(index: number) {
  pendingFiles.value.splice(index, 1)
}

// ── 发送 ──────────────────────────────────────────────────────────────────

async function handleSend() {
  const text = inputText.value.trim()
  const files = pendingFiles.value.length > 0 ? [...pendingFiles.value] : undefined

  if (text === '' && files === undefined) return
  if (!canSend.value) return

  inputText.value = ''
  pendingFiles.value = []

  await send(text, files)
}

function handleClear() {
  clear()
  props.clearExternalToolLogs?.()
  pendingFiles.value = []
  inputText.value = ''
}

function handleClearMessages() {
  clearMessages()
  pendingFiles.value = []
  inputText.value = ''
}

function handleClearToolLogs() {
  clearToolLogs()
  if (props.externalToolLogs !== undefined) {
    props.clearExternalToolLogs?.()
  }
}

function mergeDraftToInput(content: string): void {
  const trimmed = content.trim()
  if (trimmed === '') return
  if (inputText.value.trim() === '') {
    inputText.value = trimmed
    return
  }
  inputText.value = `${inputText.value.trimEnd()}\n\n${trimmed}`
}

async function handleTriggerDraftAction(actionId: string): Promise<void> {
  if (draftLoadingActionId.value !== null) return
  const action = draftActions.value.find((item) => item.id === actionId)
  if (action === undefined) {
    throw new Error(`草稿动作不存在: ${actionId}`)
  }

  draftLoadingActionId.value = action.id
  try {
    const content = await action.builder()
    const payload = action.prefix ? `${action.prefix}\n${content}` : content
    mergeDraftToInput(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    appendToolLog({ type: 'error', tag: 'draft-action', text: `${action.label}: ${message}` })
    logger.error('draft action failed', { actionId: action.id, error })
  } finally {
    draftLoadingActionId.value = null
  }
}
</script>

<style scoped>
.hidden-file-input {
  display: none;
}
</style>
