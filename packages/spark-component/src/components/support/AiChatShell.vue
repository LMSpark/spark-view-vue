<template>
  <div class="ai-chat-widget" :class="{ compact: compact }">
    <div class="chat-header">
      <span class="chat-title">{{ title ?? 'AI 助手' }}</span>
      <div class="chat-header-actions">
        <!-- 策略控制（仅当传入 toolLogs 时表示） -->
        <template v-if="toolLogs !== undefined">
          <button
            v-for="opt in RECOVERY_OPTIONS"
            :key="opt.value"
            class="policy-btn"
            :class="{ 'policy-btn--active': recoveryPolicy === opt.value }"
            :title="opt.label"
            @click="emit('update:recoveryPolicy', opt.value)"
          >{{ opt.short }}</button>
          <span class="policy-sep">|</span>
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

    <div ref="messagesRef" class="chat-messages">
      <div v-if="messages.length === 0" class="chat-empty">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="#c0c4cc">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
        </svg>
        <p>{{ placeholder ?? '有什么可以帮您？' }}</p>
      </div>

      <div v-for="msg in messages" :key="msg.id" class="chat-message" :class="msg.role">
        <div class="msg-avatar">{{ msg.role === 'user' ? 'U' : 'AI' }}</div>
        <div class="msg-body">
          <div v-if="msg.attachments !== undefined && msg.attachments.length > 0" class="msg-attachments">
            <span v-for="att in msg.attachments" :key="att.fileId" class="attachment-tag">📎 {{ att.name }}</span>
          </div>

          <details v-if="msg.reasoning !== undefined && msg.reasoning !== ''" class="msg-reasoning">
            <summary class="reasoning-toggle">
              思考过程
              <span v-if="msg.streaming === true && msg.content === ''" class="reasoning-status">思考中...</span>
            </summary>
            <div class="reasoning-content"><VueMarkdown :source="msg.reasoning ?? ''" /></div>
          </details>

          <div v-if="msg.role === 'user'" class="msg-content" v-text="msg.content" />
          <div v-else class="msg-content msg-markdown"><VueMarkdown :source="msg.content ?? ''" /></div>
          <span v-if="msg.streaming === true" class="streaming-cursor" />
          <div v-if="msg.usage !== undefined && msg.streaming !== true" class="msg-usage">{{ formatUsage(msg.usage) }}</div>
        </div>
      </div>
    </div>

    <div v-if="error !== null" class="chat-error">⚠️ {{ error }}</div>

    <!-- 工具调用日志（可折叠） -->
    <details v-if="toolLogs !== undefined && toolLogs.length > 0" class="tool-log-panel" open>
      <summary class="tool-log-summary">工具日志 ({{ toolLogs.length }})</summary>
      <div class="tool-log-list">
        <div
          v-for="(entry, i) in toolLogs"
          :key="i"
          :class="['tool-log-entry', `tool-log-entry--${entry.type}`]"
        >
          <span class="tool-log-entry__tag">{{ entry.tag }}</span>
          <span class="tool-log-entry__text">{{ entry.text }}</span>
        </div>
      </div>
    </details>

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
import { nextTick, ref, watch } from 'vue'
import VueMarkdown from 'vue-markdown-render'

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
  streaming?: boolean
  usage?: TokenUsageLike
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
  recoveryPolicy?: RecoveryPolicyLike
  collaborationPolicy?: CollaborationPolicyLike
}>()

const emit = defineEmits<{
  (e: 'update:inputText', value: string): void
  (e: 'send'): void
  (e: 'clear'): void
  (e: 'triggerFileInput'): void
  (e: 'toggleVoice'): void
  (e: 'removePendingFile', index: number): void
  (e: 'update:recoveryPolicy', value: RecoveryPolicyLike): void
  (e: 'update:collaborationPolicy', value: CollaborationPolicyLike): void
}>(
)

interface ToolLogLike {
  type: 'info' | 'success' | 'error'
  tag: string
  text: string
  timestamp?: string
}

type RecoveryPolicyLike = 'layered' | 'manual' | 'strict'
type CollaborationPolicyLike = 'auto' | 'critical-confirm' | 'plan-confirm' | 'step-confirm' | 'human-takeover'

interface PolicyOption<T extends string> {
  value: T
  short: string
  label: string
}

const RECOVERY_OPTIONS: PolicyOption<RecoveryPolicyLike>[] = [
  { value: 'layered', short: '分层', label: '分层恢复（默认）' },
  { value: 'manual', short: '手动', label: '手动恢复' },
  { value: 'strict', short: '严格', label: '严格模式' },
]

const COLLAB_OPTIONS: PolicyOption<CollaborationPolicyLike>[] = [
  { value: 'auto', short: '自动', label: '自动执行' },
  { value: 'critical-confirm', short: '关键确认', label: '关键操作需确认（默认）' },
  { value: 'plan-confirm', short: '计划确认', label: '执行前先展示计划' },
  { value: 'step-confirm', short: '逐步', label: '每步确认' },
  { value: 'human-takeover', short: '接管', label: '人工接管' },
]

const messagesRef = ref<HTMLDivElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

function formatUsage(usage: TokenUsageLike): string {
  const total = usage.totalTokens ?? 0
  const prompt = usage.promptTokens ?? 0
  const completion = usage.completionTokens ?? 0
  const hit = usage.promptCacheHitTokens ?? 0
  const miss = usage.promptCacheMissTokens ?? 0
  const segments = [`total ${total}`, `prompt ${prompt}`, `completion ${completion}`]
  if (hit > 0 || miss > 0) {
    segments.push(`cache-hit ${hit}`)
    segments.push(`cache-miss ${miss}`)
  }
  return segments.join(' · ')
}

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
  () => {
    const last = props.messages[props.messages.length - 1]
    return last != null ? `${last.content}|${last.reasoning ?? ''}` : ''
  },
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
.chat-messages { flex: 1; overflow-y: auto; padding: 16px; }
.chat-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px; color: #909399; font-size: 14px; }
.chat-message { display: flex; gap: 8px; margin-bottom: 16px; }
.chat-message.user { flex-direction: row-reverse; }
.msg-avatar { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; color: #606266; }
.msg-body { max-width: 75%; }
.chat-message.user .msg-body { text-align: right; }
.msg-content { display: inline-block; padding: 8px 12px; border-radius: 12px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; text-align: left; }
.chat-message.user .msg-content { background: #409eff; color: #fff; border-radius: 12px 12px 2px 12px; }
.chat-message.assistant .msg-content { background: #f0f2f5; color: #303133; border-radius: 12px 12px 12px 2px; }
.msg-markdown { white-space: normal; }
.msg-markdown :deep(p) { margin: 0 0 8px 0; }
.msg-markdown :deep(p:last-child) { margin-bottom: 0; }
.msg-markdown :deep(pre) { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 6px; overflow-x: auto; margin: 8px 0; font-size: 13px; line-height: 1.5; }
.msg-markdown :deep(code) { background: #e8eaed; padding: 1px 4px; border-radius: 3px; font-size: 13px; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; }
.msg-markdown :deep(pre code) { background: none; padding: 0; border-radius: 0; font-size: inherit; color: inherit; }
.msg-markdown :deep(ul), .msg-markdown :deep(ol) { margin: 4px 0; padding-left: 20px; }
.msg-markdown :deep(li) { margin-bottom: 2px; }
.msg-markdown :deep(blockquote) { margin: 8px 0; padding: 4px 12px; border-left: 3px solid #409eff; color: #606266; background: #f9f9fb; border-radius: 0 4px 4px 0; }
.msg-markdown :deep(table) { border-collapse: collapse; margin: 8px 0; font-size: 13px; width: 100%; }
.msg-markdown :deep(th), .msg-markdown :deep(td) { border: 1px solid #dcdfe6; padding: 4px 8px; text-align: left; }
.msg-markdown :deep(th) { background: #f5f7fa; font-weight: 600; }
.msg-markdown :deep(h1), .msg-markdown :deep(h2), .msg-markdown :deep(h3), .msg-markdown :deep(h4) { margin: 8px 0 4px; line-height: 1.4; }
.msg-markdown :deep(h1) { font-size: 1.3em; }
.msg-markdown :deep(h2) { font-size: 1.15em; }
.msg-markdown :deep(h3) { font-size: 1.05em; }
.msg-markdown :deep(hr) { border: none; border-top: 1px solid #e4e7ed; margin: 8px 0; }
.msg-markdown :deep(a) { color: #409eff; text-decoration: none; }
.msg-markdown :deep(a:hover) { text-decoration: underline; }
.msg-markdown :deep(img) { max-width: 100%; border-radius: 4px; }
.reasoning-content :deep(p) { margin: 0 0 6px 0; }
.reasoning-content :deep(p:last-child) { margin-bottom: 0; }
.msg-attachments { margin-bottom: 4px; }
.attachment-tag { display: inline-block; padding: 2px 8px; margin: 2px; font-size: 12px; background: #ecf5ff; color: #409eff; border-radius: 4px; }
.streaming-cursor { display: inline-block; width: 8px; height: 16px; background: #409eff; margin-left: 2px; vertical-align: text-bottom; animation: blink 0.8s infinite; }
@keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
.msg-reasoning { margin-bottom: 6px; border: 1px solid #e4e7ed; border-radius: 8px; overflow: hidden; font-size: 13px; }
.reasoning-toggle { padding: 6px 10px; background: #fafafa; cursor: pointer; color: #909399; font-size: 12px; user-select: none; }
.reasoning-toggle:hover { background: #f0f2f5; }
.reasoning-status { margin-left: 6px; color: #e6a23c; font-style: italic; }
.reasoning-content { padding: 8px 10px; background: #fafcff; color: #606266; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow-y: auto; border-top: 1px solid #e4e7ed; }
.msg-usage { margin-top: 4px; font-size: 11px; color: #c0c4cc; }
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
.icon-btn.recording { color: #f56c6c; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
.send-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: #409eff; color: #fff; cursor: pointer; border-radius: 8px; flex-shrink: 0; transition: background 0.2s; }
.send-btn:hover:not(:disabled) { background: #337ecc; }
.send-btn:disabled { background: #a0cfff; cursor: not-allowed; }
.ai-chat-widget.compact { border-radius: 12px; max-width: 400px; max-height: 600px; }
.ai-chat-widget.compact .chat-header { padding: 8px 12px; }
.ai-chat-widget.compact .chat-messages { padding: 12px; }
.ai-chat-widget.compact .msg-body { max-width: 85%; }

/* 策略按鈕 */
.policy-btn {
  padding: 2px 7px;
  border: 1px solid #dcdfe6;
  background: none;
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

/* 工具日志面板 */
.tool-log-panel {
  border-top: 1px solid #e4e7ed;
  background: #fafafa;
  max-height: 180px;
  overflow: hidden;
  flex-shrink: 0;
}
.tool-log-panel[open] { overflow: auto; }
.tool-log-summary {
  padding: 5px 12px;
  font-size: 11px;
  font-weight: 600;
  color: #909399;
  cursor: pointer;
  user-select: none;
  list-style: none;
  background: #f5f7fa;
  border-bottom: 1px solid #e4e7ed;
}
.tool-log-summary::-webkit-details-marker { display: none; }
.tool-log-list { padding: 4px 8px; }
.tool-log-entry {
  display: flex;
  gap: 6px;
  padding: 3px 4px;
  font-size: 11px;
  line-height: 1.5;
  border-radius: 3px;
}
.tool-log-entry + .tool-log-entry { margin-top: 2px; }
.tool-log-entry--info { color: #606266; }
.tool-log-entry--success { color: #67c23a; }
.tool-log-entry--error { color: #f56c6c; }
.tool-log-entry__tag { font-family: ui-monospace, monospace; font-weight: 600; flex-shrink: 0; }
.tool-log-entry__text { color: inherit; opacity: 0.85; word-break: break-word; }
</style>
