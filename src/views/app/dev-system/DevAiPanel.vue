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
            <details v-if="getFileCount(msg.files) > 0" class="bubble__files">
              <summary>📂 生成 {{ getFileCount(msg.files) }} 个文件</summary>
              <div v-for="(code, name) in msg.files" :key="name" class="file-block">
                <div class="file-block__name">{{ name }}</div>
                <pre class="file-block__code">{{ code }}</pre>
              </div>
            </details>
          </div>
        </div>
      </div>

      <!-- ═══ Blueprint bar ═══ -->
      <div v-if="stillsBlueprint" class="ai-float__blueprint">
        <div class="blueprint__header" @click="blueprintExpanded = !blueprintExpanded">
          <span>📋 执行计划 ({{ blueprintProgress }})</span>
          <span class="blueprint__toggle">{{ blueprintExpanded ? '▲' : '▼' }}</span>
        </div>
        <div v-show="blueprintExpanded" class="blueprint__items">
          <div
            v-for="(item, idx) in stillsBlueprint.items"
            :key="idx"
            class="bp-item"
            :class="{ 'bp-item--done': item.status === 'done', 'bp-item--running': item.status === 'running' }"
          >
            <span class="bp-item__icon">
              {{ item.status === 'done' ? '✅' : item.status === 'running' ? '⏳' : '⬜' }}
            </span>
            <span class="bp-item__text">{{ item.description || item.action }}</span>
            <button
              v-if="item.status === 'pending' && stillsInteractive"
              class="bp-item__skip"
              @click="skipBlueprintItem(idx)"
            >跳过</button>
          </div>
        </div>
      </div>

      <!-- ═══ Blueprint bar ═══ -->
      <div v-if="stillsBlueprint" class="ai-float__blueprint">
        <div class="blueprint__header" @click="blueprintExpanded = !blueprintExpanded">
          <span>📋 执行计划 ({{ blueprintProgress }})</span>
          <span class="blueprint__toggle">{{ blueprintExpanded ? '▲' : '▼' }}</span>
        </div>
        <div v-show="blueprintExpanded" class="blueprint__items">
          <div
            v-for="(item, idx) in stillsBlueprint.items"
            :key="idx"
            class="bp-item"
            :class="{ 'bp-item--done': item.status === 'done', 'bp-item--running': item.status === 'running' }"
          >
            <span class="bp-item__icon">
              {{ item.status === 'done' ? '✅' : item.status === 'running' ? '⏳' : '⬜' }}
            </span>
            <span class="bp-item__text">{{ item.description || item.action }}</span>
            <button
              v-if="item.status === 'pending' && stillsInteractive"
              class="bp-item__skip"
              @click="skipBlueprintItem(idx)"
            >跳过</button>
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
          <div class="send-dropdown" :class="{ 'send-dropdown--open': sendMenuOpen }">
            <button
              class="act-btn act-btn--send"
              :disabled="loading || !canSend"
              @click="handleSend"
            >
              {{ loading ? '⏳' : '📤' }} {{ sendMode === 'stills' ? 'Stills' : '生成' }}
            </button>
            <button
              class="act-btn act-btn--dropdown"
              :disabled="loading"
              @click.stop="sendMenuOpen = !sendMenuOpen"
            >▼</button>
            <div v-show="sendMenuOpen" class="send-dropdown__menu">
              <div class="send-dropdown__item" :class="{ active: sendMode === 'generate' }" @click="selectSendMode('generate')">
                📤 生成页面
              </div>
              <div class="send-dropdown__item" :class="{ active: sendMode === 'stills' }" @click="selectSendMode('stills')">
                ⚡ Stills 执行
              </div>
            </div>
          </div>
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
  // Stills 相关
  runStillsLoop,
  SessionBackendImpl,
  createSession,
  registerEditStills,
  clearRegistry,
  clearDomains,
  executeStill,
  STILLS_EDIT_RUNTIME_PROMPT,
  type IStillSession,
  type DialogueTurn,
} from '@spark-view/spark-ai'
import { onPageConfigChange, onServerEvent, type FileChangeEvent } from '@spark-view/spark-utils'
import type { DevState } from './useDevState'

// ── Types ──

type SendMode = 'generate' | 'stills'

interface BlueprintItem {
  action: string
  description?: string
  status: 'pending' | 'running' | 'done' | 'skipped'
}

interface BlueprintState {
  goal: string
  items: BlueprintItem[]
  currentIndex: number
}

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

// Stills 模式状态
const sendMode = ref<SendMode>('generate')
const sendMenuOpen = ref(false)
const stillsBlueprint = ref<BlueprintState | null>(null)
const blueprintExpanded = ref(true)
const stillsInteractive = ref(true)
const stillsSession = ref<IStillSession | null>(null)
const stillsBackend = ref<SessionBackendImpl | null>(null)

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
const hasFiles = computed(() => getFileCount(files.value) > 0)
const currentFormPageId = computed(() => props.state.editForm.path?.replace(/^\/+/, '') ?? '')
const canSend = computed(() => Boolean(pageId.value.trim() && prompt.value.trim()))
const errorCount = computed(() => logs.value.filter(l => l.level === 'error').length)

// Stills 蓝图进度
const blueprintProgress = computed(() => {
  if (!stillsBlueprint.value) return '0/0'
  const done = stillsBlueprint.value.items.filter(i => i.status === 'done' || i.status === 'skipped').length
  return `${done}/${stillsBlueprint.value.items.length}`
})

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
  // Stills: 清空时销毁会话
  if (stillsSession.value) {
    stillsSession.value = null
  }
  stillsBlueprint.value = null
}

// ── Send mode dropdown ──

function selectSendMode(mode: SendMode) {
  sendMode.value = mode
  sendMenuOpen.value = false
}

function skipBlueprintItem(idx: number) {
  if (!stillsBlueprint.value) return
  if (stillsBlueprint.value.items[idx]) {
    stillsBlueprint.value.items[idx].status = 'skipped'
  }
}

function makeStreamCallbacks(aiMsg: PanelMessage): StreamCallbacks {
  return {
    onDelta() { /* raw JSON output — don't display in bubble */ },
    onReasoning(text) { aiMsg.reasoning += text; scrollToBottom() },
    onPhase(_phase, _status, message) { aiMsg.phase = message; scrollToBottom() },
    onError(error) { props.state.addStatus(`❌ 流式错误: ${error}`, 'error') },
  }
}

function getFileCount(value: unknown): number {
  if (value === null || value === undefined || typeof value !== 'object') return 0
  return Object.keys(value as Record<string, unknown>).length
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

function buildEditInitParamsFromFiles(contextFiles: PageFiles): {
  ruleJson: unknown[]
  pageDataJson: Record<string, unknown>
  scriptJs: string
  styleCss: string
} {
  const ruleRaw = contextFiles['rule.json']
  const pagedataRaw = contextFiles['pagedata.json']

  if (typeof ruleRaw !== 'string' || ruleRaw.trim() === '') {
    throw new Error('edit.init 失败: 缺少 rule.json')
  }
  if (typeof pagedataRaw !== 'string' || pagedataRaw.trim() === '') {
    throw new Error('edit.init 失败: 缺少 pagedata.json')
  }

  const parsedRule = JSON.parse(ruleRaw) as unknown
  const parsedPageData = JSON.parse(pagedataRaw) as unknown

  const ruleJson = Array.isArray(parsedRule)
    ? parsedRule
    : (typeof parsedRule === 'object' && parsedRule !== null && Array.isArray((parsedRule as Record<string, unknown>)['children'])
      ? (parsedRule as Record<string, unknown>)['children'] as unknown[]
      : null)

  if (!Array.isArray(ruleJson)) {
    throw new Error('edit.init 失败: rule.json 必须是数组，或包含 children 数组的根对象')
  }
  if (typeof parsedPageData !== 'object' || parsedPageData === null || Array.isArray(parsedPageData)) {
    throw new Error('edit.init 失败: pagedata.json 必须是对象')
  }

  return {
    ruleJson,
    pageDataJson: parsedPageData as Record<string, unknown>,
    scriptJs: contextFiles['script.js'] ?? '',
    styleCss: contextFiles['style.css'] ?? '',
  }
}

// ── Handlers ──

async function handleSend() {
  if (sendMode.value === 'stills') {
    await handleStillsSend()
    return
  }
  await handleGenerateSend()
}

async function handleGenerateSend() {
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
      const hasCtx = getFileCount(ctx) > 0
      resp = await loop.value.iterateStream(
        pid, text, makeStreamCallbacks(aiMsg),
        hasCtx ? ctx : undefined,
      )
      props.state.addStatus(`✅ 迭代完成，修改 ${getFileCount(resp.files)} 个文件`, 'success')
    } else {
      resp = await loop.value.generateStream(pid, text, makeStreamCallbacks(aiMsg))
      props.state.addStatus(`✅ 生成完成，写入 ${getFileCount(resp.files)} 个文件`, 'success')
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

async function handleStillsSend() {
  const pid = pageId.value.trim()
  const text = prompt.value.trim()
  if (!pid || !text || loading.value) return

  prompt.value = ''
  resetPromptHeight()
  addUserMessage(`[Stills] ${text}`)
  const aiMsg = createAssistantMessage()
  loading.value = true

  try {
    const contextFiles = gatherContextFiles()
    if (getFileCount(contextFiles) === 0) {
      throw new Error('细粒度编辑模式要求当前页面已加载上下文文件（rule.json / pagedata.json / script.js / style.css）')
    }

    // 一步到位：stills 仅走 edit domain，不再兼容生成模式目录。
    clearRegistry()
    clearDomains()
    registerEditStills()

    // 初始化后端
    if (!stillsBackend.value) {
      const aiLoop = loop.value
      if (!aiLoop) throw new Error('AI Loop 未初始化')
      stillsBackend.value = new SessionBackendImpl((aiLoop as unknown as { baseUrl: string }).baseUrl)
    }

    // 创建本地 session
    const session = createSession()
    stillsSession.value = session

    const initParams = buildEditInitParamsFromFiles(contextFiles)
    const initResult = executeStill('edit.init', initParams, session, `edit-init-${Date.now()}`)
    if (!initResult.ok) {
      throw new Error(`edit.init 失败: ${initResult.msg}`)
    }
    props.state.addStatus('✅ 已进入细粒度编辑模式（edit domain）', 'success')

    // 初始化蓝图显示
    stillsBlueprint.value = {
      goal: text,
      items: [],
      currentIndex: 0,
    }

    // 运行 Stills Loop
    const result = await runStillsLoop(text, session, stillsBackend.value, {
      maxRounds: 20,
      slidingWindow: 10,
      systemPrompt: STILLS_EDIT_RUNTIME_PROMPT,
      onRoundStart(round: number) {
        aiMsg.content = `⏳ 执行中... (轮次 ${round})`
        scrollToBottom()
      },
      onRoundComplete(turn: DialogueTurn) {
        // 更新蓝图状态
        if (turn.toolBlock) {
          const idx = stillsBlueprint.value?.items.findIndex(
            i => i.action === turn.toolBlock?.action && i.status !== 'done',
          ) ?? -1
          if (idx >= 0 && stillsBlueprint.value) {
            const item = stillsBlueprint.value.items[idx]
            if (item) item.status = turn.stillsResult?.ok ? 'done' : 'running'
          }
        }
        // 更新消息内容
        if (turn.stillsResult) {
          const status = turn.stillsResult.ok ? '✓' : '✗'
          aiMsg.content += `\n${status} ${turn.toolBlock?.action ?? 'unknown'}: ${turn.stillsResult.summary ?? (turn.stillsResult.ok ? '成功' : turn.stillsResult.msg)}`
        }
        scrollToBottom()
      },
    })

    // 完成
    if (result.exportCompleted) {
      aiMsg.content += `\n\n✅ Stills 执行完成 (${result.rounds} 轮)`
      props.state.addStatus(`✅ Stills 执行完成`, 'success')
    } else if (result.aborted) {
      aiMsg.content += `\n\n⚠️ Stills 中止: ${result.abortReason}`
      props.state.addStatus(`⚠️ Stills 中止: ${result.abortReason}`, 'warning')
    } else {
      aiMsg.content += `\n\n📊 Stills 已完成 ${result.rounds} 轮`
    }

    if (currentFormPageId.value === pid) {
      props.state.requestAllPageFileReload()
    }
    void props.state.loadPages()
  } catch (err) {
    aiMsg.content = `❌ Stills 执行失败: ${err instanceof Error ? err.message : String(err)}`
    props.state.addStatus(`❌ Stills 失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
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
    const hasCtx = getFileCount(ctx) > 0
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
    return last != null
      ? `${last.id}|${typeof last.content === 'string' ? last.content.length : 0}|${typeof last.reasoning === 'string' ? last.reasoning.length : 0}`
      : ''
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
  border-radius: 8px 0 0 8px;
}
.act-btn--send:hover:not(:disabled) { background: #6d28d9; }
.act-btn--dropdown {
  background: #6d28d9;
  color: #fff;
  padding: 6px 8px;
  font-size: 10px;
  border-radius: 0 8px 8px 0;
  border-left: 1px solid rgba(255, 255, 255, 0.2);
}
.act-btn--dropdown:hover:not(:disabled) { background: #5b21b6; }

/* ═══ Send dropdown menu ═══ */
.send-dropdown {
  position: relative;
  display: inline-flex;
}
.send-dropdown__menu {
  position: absolute;
  bottom: calc(100% + 4px);
  right: 0;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  min-width: 140px;
  z-index: 10;
  overflow: hidden;
}
.send-dropdown__item {
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}
.send-dropdown__item:hover { background: #f3f4f6; }
.send-dropdown__item.active { background: #f0e7ff; color: #7c3aed; font-weight: 500; }

/* ═══ Blueprint bar ═══ */
.ai-float__blueprint {
  border-top: 1px solid #e5e7eb;
  background: #fef9e7;
  flex-shrink: 0;
}
.blueprint__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  font-size: 12px;
  color: #92400e;
  cursor: pointer;
  user-select: none;
  font-weight: 500;
}
.blueprint__header:hover { background: rgba(0, 0, 0, 0.03); }
.blueprint__toggle { font-size: 10px; }
.blueprint__items {
  padding: 4px 16px 8px;
  max-height: 120px;
  overflow-y: auto;
}
.bp-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 12px;
  color: #4b5563;
}
.bp-item--done { color: #059669; }
.bp-item--running { color: #7c3aed; font-weight: 500; }
.bp-item__icon { flex-shrink: 0; }
.bp-item__text { flex: 1; }
.bp-item__skip {
  background: #fee2e2;
  border: none;
  color: #dc2626;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
}
.bp-item__skip:hover { background: #fecaca; }
</style>
