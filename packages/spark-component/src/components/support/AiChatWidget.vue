<template>
  <AiChatShell
    :messages="messages"
    :pending-files="pendingFiles"
    :input-text="inputText"
    :is-streaming="isStreaming"
    :is-recording="isRecording"
    :error="error"
    v-bind="shellProps"
    @update:input-text="inputText = $event"
    @send="handleSend"
    @clear="handleClear"
    @trigger-file-input="triggerFileInput"
    @toggle-voice="toggleVoice"
    @remove-pending-file="removePendingFile"
    @update:recovery-policy="setRecoveryPolicy"
    @update:collaboration-policy="setCollaborationPolicy"
  />
  <input ref="fileInputRef" type="file" multiple class="hidden-file-input" @change="handleFileChange" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AiChatShell from './AiChatShell.vue'
import { useAiChat } from '../../composables/useAiChat'
import type {
  ChatMode,
  FileAttachment,
  AiChatSender,
  StreamAiChatText,
  TokenUsage,
} from '../../composables/useAiChat'

const props = defineProps<{
  mode?: ChatMode
  systemPrompt?: string
  title?: string
  placeholder?: string
  compact?: boolean
  sender?: AiChatSender
  storageKey?: string
  showToolLogs?: boolean
  externalToolLogs?: Array<{ type: 'info' | 'success' | 'error'; tag: string; text: string; timestamp?: string }>
  streamAiChatText?: StreamAiChatText | undefined
  parseTokenUsage?: ((usageRaw: Record<string, unknown>) => TokenUsage) | undefined
  uploadFile?: ((file: File) => Promise<FileAttachment>) | undefined
}>()

const optionalShellProps = computed(() => ({
  ...(props.title !== undefined ? { title: props.title } : {}),
  ...(props.placeholder !== undefined ? { placeholder: props.placeholder } : {}),
  ...(props.compact !== undefined ? { compact: props.compact } : {}),
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
    recoveryPolicy: recoveryPolicy.value,
    collaborationPolicy: collaborationPolicy.value,
  }
})

const {
  messages,
  isStreaming,
  error,
  send,
  uploadFile,
  clear,
  toolLogs,
  recoveryPolicy,
  collaborationPolicy,
  setRecoveryPolicy,
  setCollaborationPolicy,
} = useAiChat({
  mode: () => props.mode ?? 'multi',
  systemPrompt: () => props.systemPrompt,
  sender: () => props.sender,
  pageId: () => props.storageKey,
  storageKey: () => props.storageKey,
  streamAiChatText: props.streamAiChatText,
  parseTokenUsage: props.parseTokenUsage,
  uploadFile: props.uploadFile,
})

const inputText = ref('')
const pendingFiles = ref<FileAttachment[]>([])
const isRecording = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

// ── 语音识别（Web Speech API，浏览器兼容处理） ──────────────────────────

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
      console.error('[AiChatWidget] file upload failed', err)
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
  if (isStreaming.value) return

  inputText.value = ''
  pendingFiles.value = []

  await send(text, files)
}

function handleClear() {
  clear()
  pendingFiles.value = []
  inputText.value = ''
}
</script>

<style scoped>
.hidden-file-input {
  display: none;
}
</style>
