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
  mode?: ChatMode
  systemPrompt?: string
  title?: string
  placeholder?: string
  compact?: boolean
  sender?: AiChatSender
  storageKey?: string
  pageId?: string
  showToolLogs?: boolean
  externalToolLogs?: Array<{ type: 'info' | 'success' | 'error'; tag: string; text: string; timestamp?: string }>
  clearExternalToolLogs?: (() => void) | undefined
  reportFcError?: AiFcErrorReporter | undefined
  turnConcurrency?: AiTurnConcurrencyConfig | undefined
  streamAiChatText?: StreamAiChatText | undefined
  parseTokenUsage?: ((usageRaw: Record<string, unknown>) => TokenUsage) | undefined
  uploadFile?: ((file: File) => Promise<FileAttachment>) | undefined
  draftActions?: readonly AiDraftActionConfig[] | undefined
  actionTitleMap?: Record<string, string> | undefined
  actionPrefixTitleMap?: Record<string, string> | undefined
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
