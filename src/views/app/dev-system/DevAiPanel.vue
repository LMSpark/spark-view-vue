<template>
  <Teleport to="body">
    <div
      v-show="state.aiPanelVisible.value"
      class="ai-float"
      :style="panelStyle"
      :class="{ 'ai-float--dragging': isDragging }"
    >
      <!-- ═══ Header (draggable) ═══ -->
      <div class="ai-float__header" @mousedown.prevent="startDrag">
        <span class="ai-float__title">🤖 AI · /{{ pageId || 'dev' }}</span>
        <div class="ai-float__header-actions">
          <button class="hdr-btn" title="预览页面" :disabled="!pageId.trim()" @click="navigateToPage">
            📄 页面
          </button>
          <button class="hdr-btn hdr-btn--close" @click="state.aiPanelVisible.value = false">✕</button>
        </div>
      </div>

      <!-- ═══ Messages ═══ -->
      <div ref="messagesRef" class="ai-float__body">
        <template v-if="messages.length === 0">
          <div class="welcome">
            <p class="welcome__main">输入页面描述，AI 将自动生成 SPARK 页面配置。</p>
            <p class="welcome__hint">例如：「创建一个用户管理页面，包含表格和搜索」</p>
            <p class="welcome__hint">💡 点击 🔧 调试 可将当前页面错误发送给 AI 自动修复</p>
          </div>
        </template>

        <div v-for="msg in messages" :key="msg.id" class="bubble" :class="msg.role">
          <div class="bubble__avatar">{{ msg.role === 'user' ? '🧑' : '🤖' }}</div>
          <div class="bubble__body">
            <!-- Phase indicator (streaming) -->
            <div v-if="msg.streaming && msg.phase" class="bubble__phase">⏳ {{ msg.phase }}</div>

            <!-- Reasoning -->
            <details v-if="msg.reasoning" class="bubble__reasoning" open>
              <summary>
                💭 思考过程
                <span v-if="msg.streaming && !msg.content" class="thinking-dot">思考中...</span>
              </summary>
              <div class="reasoning-body"><VueMarkdown :source="msg.reasoning" /></div>
            </details>

            <!-- Content -->
            <div v-if="msg.content" class="bubble__text" :class="{ 'bubble__text--user': msg.role === 'user' }">
              <VueMarkdown v-if="msg.role === 'assistant'" :source="msg.content" />
              <span v-else>{{ msg.content }}</span>
            </div>
            <span v-if="msg.streaming" class="cursor-blink" />

            <!-- Files -->
            <details v-if="msg.files !== null && Object.keys(msg.files).length > 0" class="bubble__files">
              <summary>📂 生成 {{ Object.keys(msg.files).length }} 个文件</summary>
              <div v-for="(code, name) in msg.files" :key="name" class="file-block">
                <div class="file-block__name">{{ name }}</div>
                <pre class="file-block__code">{{ code }}</pre>
              </div>
            </details>
          </div>
        </div>
      </div>

      <!-- ═══ Log bar ═══ -->
      <div class="ai-float__logbar" @click="logExpanded = !logExpanded">
        <span>📋 {{ logs.length }} 条日志 ({{ errorCount }} 错误)</span>
        <span class="logbar__toggle">{{ logExpanded ? '▲' : '▼' }}</span>
      </div>
      <div v-show="logExpanded" class="ai-float__logs">
        <div v-for="(log, idx) in logs.slice(0, 80)" :key="idx" class="log-line">
          <span class="log-line__level">{{ formatLogLevel(log.level) }}</span>
          <span class="log-line__text">{{ log.message }}</span>
        </div>
        <div v-if="logs.length === 0" class="log-empty">暂无日志</div>
      </div>

      <!-- ═══ Input ═══ -->
      <div class="ai-float__input">
        <input
          v-model="pageId"
          class="input-pid"
          placeholder="Page ID"
          :disabled="loading"
        />
        <textarea
          ref="promptRef"
          v-model="prompt"
          class="input-prompt"
          placeholder="描述你想要的页面..."
          rows="1"
          :disabled="loading"
          @keydown.ctrl.enter.prevent="handleSend"
          @input="autoResize"
        />
        <div class="input-actions">
          <button class="act-btn act-btn--icon" title="清空对话" @click="clearMessages">🗑️</button>
          <button class="act-btn act-btn--debug" :disabled="loading" title="收集错误日志，发送给 AI 自动修复" @click="handleDebug">🔧 调试</button>
          <button class="act-btn act-btn--send" :disabled="loading || !canSend" @click="handleSend">
            {{ loading ? '⏳' : '📤' }} 发送
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import VueMarkdown from 'vue-markdown-render'
import { useTenantRouter } from '@/composables/useTenantRouter'
import {
  getAILoop,
  readPageFiles,
  type PageFiles,
  type LogSnapshot,
  type StreamCallbacks,
} from '@spark-view/spark-ai'
import { onPageConfigChange, onServerEvent, type FileChangeEvent } from '@spark-view/spark-utils'
import type { DevState } from './useDevState'

// ── Types ──

interface PanelMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  reasoning: string
  streaming: boolean
  phase: string
  files: PageFiles | null
}

interface DebugScreenshotResultEvent {
  requestId?: string
  pageId?: string
  reason?: string
  status?: 'success' | 'error' | 'busy'
  message?: string
  fileId?: string
  name?: string
  textDigest?: string
  resolvedSelector?: string
  url?: string
}

interface DebugRouteResultEvent {
  requestId?: string
  reason?: string
  status?: 'success' | 'error' | 'ignored'
  message?: string
  path?: string
  pageId?: string
  targetPath?: string
  currentPath?: string
  tenantId?: string
  projectId?: string
}

const DEBUG_SCREENSHOT_RESULT_EVENT = 'debug-screenshot-result'
const DEBUG_ROUTE_RESULT_EVENT = 'debug-route-result'

// ── Props & composables ──

const props = defineProps<{ state: DevState }>()
const { router, tenantPath } = useTenantRouter()

// ── Reactive state ──

const pageId = ref('')
const prompt = ref('')
const loading = ref(false)
const files = ref<PageFiles>({})
const logs = ref<LogSnapshot[]>([])
const logExpanded = ref(false)
const messages = ref<PanelMessage[]>([])
const messagesRef = ref<HTMLDivElement | null>(null)
const promptRef = ref<HTMLTextAreaElement | null>(null)

let nextMsgId = 1

// ── Drag ──

const isDragging = ref(false)
const panelPos = ref({ x: -1, y: -1 })
const dragOffset = ref({ x: 0, y: 0 })

const PANEL_WIDTH = 480

function initPosition() {
  if (panelPos.value.x < 0) {
    panelPos.value = {
      x: Math.max(16, window.innerWidth - PANEL_WIDTH - 24),
      y: 64,
    }
  }
}

function startDrag(e: MouseEvent) {
  initPosition()
  isDragging.value = true
  dragOffset.value = { x: e.clientX - panelPos.value.x, y: e.clientY - panelPos.value.y }
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

function onDrag(e: MouseEvent) {
  panelPos.value = {
    x: Math.max(0, Math.min(e.clientX - dragOffset.value.x, window.innerWidth - PANEL_WIDTH)),
    y: Math.max(0, Math.min(e.clientY - dragOffset.value.y, window.innerHeight - 100)),
  }
}

function stopDrag() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

const panelStyle = computed(() => {
  if (panelPos.value.x < 0) return {}
  return {
    left: `${panelPos.value.x}px`,
    top: `${panelPos.value.y}px`,
    right: 'auto',
  }
})

// ── Computed ──

const loop = computed(() => getAILoop())
const hasFiles = computed(() => Object.keys(files.value).length > 0)
const currentFormPageId = computed(() => props.state.editForm.path?.replace(/^\/+/, '') ?? '')
const canSend = computed(() => Boolean(pageId.value.trim() && prompt.value.trim()))
const errorCount = computed(() => logs.value.filter(l => l.level === 'error').length)

// ── Sync pageId from DevState ──

watch(() => props.state.editForm.path, (val) => {
  const derived = val ? val.replace(/^\/+/, '') : ''
  if (derived) pageId.value = derived
}, { immediate: true })

// ── Message helpers ──

function addUserMessage(text: string) {
  messages.value.push({
    id: nextMsgId++,
    role: 'user',
    content: text,
    reasoning: '',
    streaming: false,
    phase: '',
    files: null,
  })
  scrollToBottom()
}

function createAssistantMessage(): PanelMessage {
  const msg: PanelMessage = {
    id: nextMsgId++,
    role: 'assistant',
    content: '',
    reasoning: '',
    streaming: true,
    phase: '',
    files: null,
  }
  messages.value.push(msg)
  scrollToBottom()
  return msg
}

function scrollToBottom() {
  void nextTick(() => {
    const el = messagesRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function clearMessages() {
  messages.value = []
  files.value = {}
  logs.value = []
}

function makeStreamCallbacks(aiMsg: PanelMessage): StreamCallbacks {
  return {
    onDelta() { /* raw JSON output — don't display in bubble */ },
    onReasoning(text) { aiMsg.reasoning += text; scrollToBottom() },
    onPhase(_phase, _status, message) { aiMsg.phase = message; scrollToBottom() },
    onError(error) { props.state.addStatus(`❌ 流式错误: ${error}`, 'error') },
  }
}

function gatherContextFiles(): PageFiles {
  const result: Record<string, string> = {}
  for (const name of ['rule.json', 'pagedata.json', 'script.js', 'style.css']) {
    const text = props.state.editFiles[name]
    if (typeof text === 'string' && text.trim()) {
      result[name] = text
    }
  }
  return result as PageFiles
}

// ── Handlers ──

async function handleSend() {
  const pid = pageId.value.trim()
  const text = prompt.value.trim()
  if (!pid || !text || loading.value) return
  if (!loop.value) {
    props.state.addStatus('AI Loop 未初始化，请确认 config.features.enableAI = true', 'error')
    return
  }

  prompt.value = ''
  resetPromptHeight()
  addUserMessage(text)
  const aiMsg = createAssistantMessage()
  loading.value = true

  try {
    let resp
    if (hasFiles.value) {
      const ctx = gatherContextFiles()
      const hasCtx = Object.keys(ctx).length > 0
      resp = await loop.value.iterateStream(
        pid, text, makeStreamCallbacks(aiMsg),
        hasCtx ? ctx : undefined,
      )
      props.state.addStatus(`✅ 迭代完成，修改 ${Object.keys(resp.files).length} 个文件`, 'success')
    } else {
      resp = await loop.value.generateStream(pid, text, makeStreamCallbacks(aiMsg))
      props.state.addStatus(`✅ 生成完成，写入 ${Object.keys(resp.files).length} 个文件`, 'success')
    }

    files.value = resp.files
    aiMsg.content = resp.explanation ?? '✅ 页面已生成'
    aiMsg.files = resp.files

    if (currentFormPageId.value === pid) {
      props.state.requestAllPageFileReload()
    }
    void props.state.loadPages()
  } catch (err) {
    aiMsg.content = `❌ ${err instanceof Error ? err.message : String(err)}`
    props.state.addStatus(`❌ 失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
  } finally {
    aiMsg.streaming = false
    loading.value = false
    scrollToBottom()
  }
}

async function handleDebug() {
  const pid = pageId.value.trim()
  if (!pid || loading.value) {
    props.state.addStatus('请先输入 Page ID', 'warning')
    return
  }
  if (!loop.value) {
    props.state.addStatus('AI Loop 未初始化', 'error')
    return
  }

  refreshLogs()
  const errorLogs = logs.value.filter(l => l.level === 'error')

  if (errorLogs.length === 0) {
    props.state.addStatus('没有错误日志，无需调试', 'info')
    return
  }

  const logSummary = errorLogs.slice(0, 15).map(l => l.message).join('\n')
  const debugFeedback = `请修复以下页面错误:\n${logSummary}`

  addUserMessage(`🔧 调试修复 (${errorLogs.length} 个错误)`)
  const aiMsg = createAssistantMessage()
  loading.value = true

  try {
    const ctx = gatherContextFiles()
    const hasCtx = Object.keys(ctx).length > 0
    const resp = await loop.value.iterateStream(
      pid, debugFeedback, makeStreamCallbacks(aiMsg),
      hasCtx ? ctx : undefined,
    )

    files.value = resp.files
    aiMsg.content = resp.explanation ?? '✅ 调试修复完成'
    aiMsg.files = resp.files

    if (currentFormPageId.value === pid) {
      props.state.requestAllPageFileReload()
    }
    props.state.addStatus('✅ 调试完成', 'success')
  } catch (err) {
    aiMsg.content = `❌ 调试失败: ${err instanceof Error ? err.message : String(err)}`
    props.state.addStatus(`❌ 调试失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
  } finally {
    aiMsg.streaming = false
    loading.value = false
    scrollToBottom()
  }
}

function navigateToPage() {
  if (!pageId.value.trim()) return
  void router.push(tenantPath(`/${pageId.value.trim()}`))
}

function refreshLogs() {
  if (!loop.value) return
  logs.value = loop.value.collector.peek(pageId.value.trim() || undefined)
}

function formatLogLevel(level: string) {
  const map: Record<string, string> = { error: '🔴', warn: '🟡', info: '🔵', debug: '⚪' }
  return map[level] ?? '⚫'
}

// ── Textarea auto resize ──

function autoResize() {
  const el = promptRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 100)}px`
}

function resetPromptHeight() {
  const el = promptRef.value
  if (!el) return
  el.style.height = 'auto'
}

// ── SSE event handlers ──

function matchCurrentPage(eventPageId?: string): boolean {
  if (typeof eventPageId !== 'string' || eventPageId.trim() === '') return true
  return eventPageId.trim() === pageId.value.trim()
}

function toScreenshotLog(event: DebugScreenshotResultEvent): LogSnapshot {
  const status = event.status ?? 'success'
  const statusText = status === 'success' ? '截图完成' : status === 'busy' ? '截图繁忙' : '截图失败'
  const detail = [
    event.message,
    event.fileId ? `fileId=${event.fileId}` : '',
    event.resolvedSelector ? `selector=${event.resolvedSelector}` : '',
    event.textDigest ? `摘要=${event.textDigest}` : '',
  ].filter(Boolean).join(' | ')

  return {
    level: status === 'error' ? 'error' : status === 'busy' ? 'warn' : 'info',
    message: `[SSE][${statusText}] ${detail || '收到截图回执'}`,
    timestamp: Date.now(),
    ...(typeof event.pageId === 'string' && event.pageId.length > 0 && { pageId: event.pageId }),
    meta: {
      requestId: event.requestId,
      status,
      fileId: event.fileId,
      name: event.name,
      reason: event.reason,
      url: event.url,
    },
  }
}

function toRouteLog(event: DebugRouteResultEvent): LogSnapshot {
  const status = event.status ?? 'success'
  const statusText = status === 'success' ? '跳转成功' : status === 'ignored' ? '跳转忽略' : '跳转失败'
  const detail = [
    event.message,
    event.targetPath ? `target=${event.targetPath}` : '',
    event.currentPath ? `current=${event.currentPath}` : '',
    event.reason ? `reason=${event.reason}` : '',
  ].filter(Boolean).join(' | ')

  return {
    level: status === 'error' ? 'error' : status === 'ignored' ? 'warn' : 'info',
    message: `[SSE][${statusText}] ${detail || '收到路由回执'}`,
    timestamp: Date.now(),
    ...(typeof event.pageId === 'string' && event.pageId.length > 0 && { pageId: event.pageId }),
    meta: {
      requestId: event.requestId,
      status,
      targetPath: event.targetPath,
      currentPath: event.currentPath,
      tenantId: event.tenantId,
      projectId: event.projectId,
    },
  }
}

let unsubSSE: (() => void) | null = null
let unsubScreenshotResultSSE: (() => void) | null = null
let unsubRouteResultSSE: (() => void) | null = null

onMounted(() => {
  initPosition()

  unsubSSE = onPageConfigChange((event: FileChangeEvent) => {
    if (event.pageId === pageId.value) {
      props.state.addStatus(`文件变更: ${event.file}`, 'info')
      void refreshFiles()
      if (currentFormPageId.value === pageId.value) {
        props.state.requestAllPageFileReload()
      }
    }
  })

  unsubScreenshotResultSSE = onServerEvent<DebugScreenshotResultEvent>(
    DEBUG_SCREENSHOT_RESULT_EVENT,
    (event) => {
      if (!matchCurrentPage(event.pageId)) return
      const entry = toScreenshotLog(event)
      logs.value = [entry, ...logs.value].slice(0, 300)
      const statusLabel = event.status ?? 'success'
      props.state.addStatus(`📸 截图回执(${statusLabel}): ${event.message ?? '已收到'}`, statusLabel === 'error' ? 'error' : 'info')
    },
  )

  unsubRouteResultSSE = onServerEvent<DebugRouteResultEvent>(
    DEBUG_ROUTE_RESULT_EVENT,
    (event) => {
      if (!matchCurrentPage(event.pageId)) return
      const entry = toRouteLog(event)
      logs.value = [entry, ...logs.value].slice(0, 300)
      const statusLabel = event.status ?? 'success'
      props.state.addStatus(`🧭 路由回执(${statusLabel}): ${event.message ?? '已收到'}`, statusLabel === 'error' ? 'error' : 'info')
    },
  )
})

onUnmounted(() => {
  unsubSSE?.()
  unsubScreenshotResultSSE?.()
  unsubRouteResultSSE?.()
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
})

async function refreshFiles() {
  if (!pageId.value.trim()) return
  try {
    files.value = await readPageFiles(pageId.value.trim())
  } catch {
    // silent
  }
}

// Auto-scroll when messages change
watch(
  () => {
    const last = messages.value[messages.value.length - 1]
    return last != null ? `${last.id}|${last.content.length}|${last.reasoning.length}` : ''
  },
  () => scrollToBottom(),
)
</script>

<style scoped>
/* ═══ Floating panel ═══ */
.ai-float {
  position: fixed;
  right: 24px;
  top: 64px;
  width: 480px;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
  z-index: 2050;
  overflow: hidden;
  transition: box-shadow 0.2s;
}
.ai-float--dragging {
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.25);
  user-select: none;
}

/* ═══ Header ═══ */
.ai-float__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  color: #fff;
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
}
.ai-float--dragging .ai-float__header {
  cursor: grabbing;
}
.ai-float__title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.3px;
}
.ai-float__header-actions {
  display: flex;
  gap: 4px;
}
.hdr-btn {
  background: rgba(255, 255, 255, 0.15);
  border: none;
  color: #fff;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.hdr-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.3); }
.hdr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.hdr-btn--close { padding: 4px 8px; font-size: 14px; font-weight: 600; }

/* ═══ Body (messages) ═══ */
.ai-float__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 180px;
}

/* Welcome */
.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 140px;
  text-align: center;
  color: #909399;
}
.welcome__main {
  font-size: 14px;
  color: #606266;
  margin: 0 0 8px;
}
.welcome__hint {
  font-size: 12px;
  margin: 2px 0;
  color: #a8abb2;
}

/* ═══ Bubbles ═══ */
.bubble {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.bubble.user {
  flex-direction: row-reverse;
}
.bubble__avatar {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}
.bubble__body {
  max-width: 82%;
  min-width: 60px;
}
.bubble.user .bubble__body {
  text-align: right;
}

/* Phase indicator */
.bubble__phase {
  font-size: 12px;
  color: #7c3aed;
  margin-bottom: 4px;
  font-weight: 500;
}

/* Bubble text */
.bubble__text {
  display: inline-block;
  padding: 8px 14px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  text-align: left;
}
.bubble__text--user {
  background: #7c3aed;
  color: #fff;
  border-radius: 14px 14px 2px 14px;
}
.bubble.assistant .bubble__text {
  background: #f3f4f6;
  color: #1f2937;
  border-radius: 14px 14px 14px 2px;
}

/* Streaming cursor */
.cursor-blink {
  display: inline-block;
  width: 7px;
  height: 16px;
  background: #7c3aed;
  margin-left: 2px;
  vertical-align: text-bottom;
  border-radius: 1px;
  animation: blink-kf 0.7s infinite;
}
@keyframes blink-kf {
  0%, 45% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

/* Reasoning */
.bubble__reasoning {
  margin-bottom: 6px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  font-size: 13px;
}
.bubble__reasoning > summary {
  padding: 6px 10px;
  background: #fafafa;
  cursor: pointer;
  color: #909399;
  font-size: 12px;
  user-select: none;
}
.bubble__reasoning > summary:hover { background: #f0f2f5; }
.thinking-dot {
  margin-left: 6px;
  color: #e6a23c;
  font-style: italic;
}
.reasoning-body {
  padding: 8px 10px;
  background: #fafcff;
  color: #606266;
  font-size: 12px;
  line-height: 1.6;
  max-height: 180px;
  overflow-y: auto;
  border-top: 1px solid #e5e7eb;
}
.reasoning-body :deep(p) { margin: 0 0 4px 0; }
.reasoning-body :deep(p:last-child) { margin-bottom: 0; }

/* Files block */
.bubble__files {
  margin-top: 6px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  font-size: 13px;
}
.bubble__files > summary {
  padding: 6px 10px;
  background: #f0fdf4;
  cursor: pointer;
  color: #059669;
  font-size: 12px;
  font-weight: 500;
  user-select: none;
}
.bubble__files > summary:hover { background: #dcfce7; }
.file-block {
  border-top: 1px solid #e5e7eb;
}
.file-block__name {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  background: #f9fafb;
}
.file-block__code {
  margin: 0;
  padding: 8px 10px;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 11px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 180px;
  overflow: auto;
}

/* Markdown in assistant bubbles */
.bubble__text :deep(p) { margin: 0 0 6px 0; }
.bubble__text :deep(p:last-child) { margin-bottom: 0; }
.bubble__text :deep(pre) {
  background: #1e1e1e; color: #d4d4d4;
  padding: 10px; border-radius: 6px;
  overflow-x: auto; margin: 6px 0;
  font-size: 12px; line-height: 1.5;
}
.bubble__text :deep(code) {
  background: #e8eaed; padding: 1px 4px; border-radius: 3px;
  font-size: 12px; font-family: 'Consolas', monospace;
}
.bubble__text :deep(pre code) { background: none; padding: 0; }
.bubble__text :deep(ul), .bubble__text :deep(ol) { margin: 4px 0; padding-left: 18px; }
.bubble__text :deep(li) { margin-bottom: 2px; }
.bubble__text :deep(blockquote) {
  margin: 6px 0; padding: 4px 10px;
  border-left: 3px solid #7c3aed; color: #606266;
  background: #f9f9fb; border-radius: 0 4px 4px 0;
}
.bubble__text :deep(table) { border-collapse: collapse; margin: 6px 0; font-size: 12px; width: 100%; }
.bubble__text :deep(th), .bubble__text :deep(td) { border: 1px solid #dcdfe6; padding: 3px 6px; }
.bubble__text :deep(th) { background: #f5f7fa; font-weight: 600; }
.bubble__text :deep(h1), .bubble__text :deep(h2), .bubble__text :deep(h3) { margin: 6px 0 4px; line-height: 1.4; }
.bubble__text :deep(a) { color: #7c3aed; text-decoration: none; }

/* ═══ Log bar ═══ */
.ai-float__logbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  background: #f9fafb;
  border-top: 1px solid #e5e7eb;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}
.ai-float__logbar:hover { background: #f3f4f6; }
.logbar__toggle { font-size: 10px; }

.ai-float__logs {
  max-height: 120px;
  overflow-y: auto;
  background: #f9fafb;
  border-top: 1px solid #f3f4f6;
  font-size: 12px;
  flex-shrink: 0;
}
.log-line {
  display: flex;
  gap: 6px;
  padding: 2px 16px;
  font-family: 'Consolas', monospace;
  border-bottom: 1px solid #f3f4f6;
}
.log-line__level { flex-shrink: 0; }
.log-line__text { color: #374151; word-break: break-word; }
.log-empty {
  text-align: center;
  color: #a8abb2;
  padding: 12px;
}

/* ═══ Input area ═══ */
.ai-float__input {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px 12px;
  border-top: 1px solid #e5e7eb;
  background: #fafafa;
  flex-shrink: 0;
}
.input-pid {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  outline: none;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  background: #fff;
  box-sizing: border-box;
}
.input-pid:focus { border-color: #7c3aed; }
.input-pid:disabled { background: #f3f4f6; }

.input-prompt {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.5;
  outline: none;
  font-family: inherit;
  resize: none;
  max-height: 100px;
  overflow-y: auto;
  background: #fff;
  box-sizing: border-box;
}
.input-prompt:focus { border-color: #7c3aed; }
.input-prompt:disabled { background: #f3f4f6; }

.input-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.act-btn {
  border: none;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.act-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.act-btn--icon {
  background: transparent;
  padding: 6px 8px;
  font-size: 16px;
  color: #6b7280;
}
.act-btn--icon:hover:not(:disabled) { background: #fee2e2; }
.act-btn--debug {
  background: #fef3c7;
  color: #92400e;
}
.act-btn--debug:hover:not(:disabled) { background: #fde68a; }
.act-btn--send {
  background: #7c3aed;
  color: #fff;
  font-weight: 500;
}
.act-btn--send:hover:not(:disabled) { background: #6d28d9; }
</style>
