<template>
  <div v-if="canRenderWrapper" :class="props.embedded ? 'ai-chat-embedded' : 'ai-chat-wrapper'">
    <!-- 浮动触发按钮 -->
    <button v-if="!props.embedded" class="ai-fab" :class="{ active: isOpen }" @click="togglePanel" title="AI 页面生成">
      <span v-if="!isOpen">🤖</span>
      <span v-else>✕</span>
    </button>

    <!-- 聊天面板 -->
    <Transition name="slide">
      <div v-if="panelVisible" class="ai-panel" :class="{ embedded: props.embedded }">
        <div class="ai-panel-header">
          <span>🤖 AI · {{ displayPageId ? `/${displayPageId}` : '首页' }}
            <span v-if="loading && lockedPageId" class="ai-lock-badge" title="生成中，页面ID已锁定">🔒</span>
          </span>
          <span class="ai-status" :class="statusClass">{{ statusText }}</span>
        </div>

        <div class="ai-panel-body" ref="messagesRef">
          <div v-if="messages.length === 0" class="ai-empty">
            输入页面描述，AI 将自动生成 SPARK 页面配置。<br>
            例如：「创建一个用户管理页面，包含表格和搜索」<br><br>
            💡 点击 <b>🐛 调试</b> 可将当前页面错误发送给 AI 自动修复
          </div>
          <div
            v-for="(msg, i) in messages"
            :key="i"
            class="ai-message"
            :class="msg.role"
          >
            <div class="ai-message-content">
              <template v-if="msg.role === 'user'">{{ msg.text }}</template>
              <template v-else>
                <div class="ai-text ai-markdown">
                  <VueMarkdown :source="msg.text" />
                </div>
                <div v-if="msg.files" class="ai-files">
                  <span v-for="f in msg.files" :key="f" class="ai-file-tag">{{ f }}</span>
                </div>
                <button
                  v-if="msg.pageId"
                  class="ai-nav-btn"
                  @click="tenantNavigateToPage(msg.pageId, 'ai')"
                >
                  🔗 打开页面 /{{ msg.pageId }}
                </button>
              </template>
            </div>
          </div>
          <div v-if="loading" class="ai-message assistant">
            <div class="ai-message-content ai-streaming">
              <div v-if="phaseMessage" class="ai-phase-badge">{{ phaseMessage }}</div>
              <div v-if="diagnosticHint" class="ai-quality-badge">Q{{ diagnosticQuality }} · {{ diagnosticHint }}</div>
              <div v-if="streamingText" class="ai-stream-text ai-markdown">
                <VueMarkdown :source="streamingText" />
              </div>
              <div v-else class="ai-loading">
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              </div>
            </div>
          </div>
        </div>

        <!-- 实时日志流 -->
        <div v-if="panelVisible && pageId.trim() && recentLogs.length > 0" class="ai-log-feed">
          <div class="ai-log-header" @click="showLogs = !showLogs">
            <span>📋 {{ recentLogs.length }} 条日志
              <span v-if="errorLogCount > 0" class="ai-error-count">({{ errorLogCount }} 错误)</span>
              <span v-if="apiErrorLogs.length > 0" class="ai-api-error-count"> · API错误 {{ apiErrorLogs.length }}</span>
              <span class="ai-quality-inline">· {{ qualityText(liveLogSummary) }}</span>
            </span>
            <span class="ai-log-toggle">{{ showLogs ? '▼' : '▶' }}</span>
          </div>
          <div v-if="showLogs" class="ai-log-list">
            <div v-if="apiErrorDigests.length > 0" class="ai-api-error-group">
              <div class="ai-api-error-title">🌐 API 错误分组（{{ apiErrorDigests.length }}）</div>
              <div v-for="(item, i) in apiErrorDigests.slice(-8)" :key="`api-${i}`" class="ai-api-error-item">
                <div class="ai-api-error-line">
                  {{ item.method }} {{ item.url }} · {{ item.codeLabel }}
                  <span v-if="item.count > 1" class="ai-api-error-repeat"> · x{{ item.count }}</span>
                </div>
                <div class="ai-api-error-message">{{ item.message }}</div>
                <pre v-if="item.responsePreview" class="ai-api-error-preview">{{ item.responsePreview }}</pre>
              </div>
            </div>
            <div v-for="(log, i) in nonApiRecentLogs.slice(-30)" :key="i" class="ai-log-entry" :class="log.level">
              <span class="ai-log-level">{{ levelEmoji(log.level) }}</span>
              <div class="ai-log-body">
                <pre
                  v-if="formatLogOutput(log.message).kind !== 'plain'"
                  class="ai-log-code"
                  :class="formatLogOutput(log.message).kind"
                >{{ formatLogOutput(log.message).content }}</pre>
                <span v-else class="ai-log-msg">{{ log.message }}</span>
                <pre v-if="log.meta" class="ai-log-meta">{{ formatLogMeta(log.meta) }}</pre>
              </div>
            </div>
          </div>
        </div>

        <div class="ai-panel-footer">
          <input
            v-model="pageId"
            class="ai-input-page"
            placeholder="页面ID (同步当前路由)"
            :disabled="loading"
            @keydown.enter="handleSend"
          />
          <textarea
            v-model="prompt"
            class="ai-input"
            placeholder="描述你想要的页面..."
            rows="2"
            :disabled="loading"
            @keydown.enter.ctrl="handleSend"
            @keydown.enter.meta="handleSend"
          ></textarea>
          <div class="ai-actions">
            <button class="ai-delete-btn" :disabled="loading || !pageId.trim()" @click="handleDelete" title="删除当前页面配置">
              🗑️
            </button>
            <button class="ai-debug-btn" :disabled="loading || !pageId.trim()" @click="handleDebug" title="收集当前页面错误并发送给 AI 修复">
              🐛 调试
            </button>
            <button v-if="loading" class="ai-cancel-btn" @click="handleCancel">
              ⏹ 取消
            </button>
            <button class="ai-send-btn" :disabled="loading || !prompt.trim() || !pageId.trim()" @click="handleSend">
              {{ loading ? '生成中...' : '发送' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch, computed } from 'vue'
// vue-router provided by useTenantRouter
import VueMarkdown from 'vue-markdown-render'
import { getNavHomePath, refreshRoutes } from '@spark-view/spark-app'
import { getAILoop, clearPageCache, setAutoIterating, readPageFiles, triggerPageRefresh, onLogUpdate } from '@spark-view/spark-ai'
import { summarizeLogBatch } from '@spark-view/spark-ai'
import type { AIResponse, LogBatchSummary, LogSnapshot, StreamCallbacks } from '@spark-view/spark-ai'
import { http } from '@/services/http'
import { getPageApi } from '@/services/api-paths'
import { useTenantRouter } from '@/composables/useTenantRouter'
import { useFloatingPanelOwner } from '@spark-view/spark-app'
import {
  streamAiChatText,
  extractToolProtocolBlocks,
  parseToolProtocolPayload,
  stripToolProtocolBlocks,
  type ProtocolMessage,
} from '@/services/ai-protocol'

/** 最大自动迭代次数（防止无限循环） */
const MAX_AUTO_ITERATIONS = 3
/** 日志稳定窗口：连续无新增日志超过该时长视为收敛（ms） */
const LOG_STABILITY_WINDOW = 1800
/** 单轮诊断最大等待时间（ms） */
const LOG_WAIT_TIMEOUT = 12000
/** 诊断轮询间隔（ms） */
const LOG_POLL_INTERVAL = 250
/** 单轮发送给 AI 的问题数上限 */
const MAX_ISSUES_PER_ROUND = 8
/** 单轮发送给 AI 的日志样本上限 */
const MAX_LOG_SAMPLES_PER_ROUND = 30
/** 同一问题签名连续出现阈值（达到则提前终止） */
const MAX_STAGNATION_ROUNDS = 2
/** pageId 合法字符：字母、数字、短横线 */
const PAGE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/
const AI_TOOL_SYSTEM_PROMPT = `你是 SPARK 页面助手的工具调度器。你必须优先输出工具协议块，不要直接输出自然语言。

可用工具：
1) page.auto
  参数：{"pageId":"string","prompt":"string"}
  作用：根据页面是否存在自动走生成或迭代修复

2) page.debug
  参数：{"pageId":"string","reason":"string"}
  作用：触发日志驱动的自动调试修复

3) page.delete
  参数：{"pageId":"string","confirm":true}
  作用：删除页面（必须 confirm=true 才允许执行）

4) chat.reply
  参数：{"message":"string"}
  作用：仅回复说明，不执行工具

输出格式（严格）：
@@tool:<action>#<requestId>
<json>
@@end

规则：
- 每次只输出 1 个工具块
- json 必须可解析
- 缺省 pageId 使用上下文当前 pageId`

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  files?: string[]
  pageId?: string
  iteration?: number
}

interface AiToolPayload {
  pageId?: string
  prompt?: string
  reason?: string
  message?: string
  confirm?: boolean
}

const { router, route, tenantPath, ensureRouteExists: tenantEnsureRouteExists, navigateToPage: tenantNavigateToPage } = useTenantRouter()
const props = withDefaults(defineProps<{ embedded?: boolean; forceOpen?: boolean }>(), {
  embedded: false,
  forceOpen: false,
})
const { isOwner } = useFloatingPanelOwner('__SPARK_AI_PANEL_OWNER__')

const isOpen = ref(false)
const panelVisible = computed(() => (props.embedded ? props.forceOpen : isOpen.value))
const canRenderWrapper = computed(() => (props.embedded ? true : isOwner.value))
const loading = ref(false)
const prompt = ref('')
const pageId = ref('')

/** 生成期间锁定的 pageId — 一旦开始生成就固定，不随路由/输入变化 */
const lockedPageId = ref('')

/** 面板标题栏展示的 pageId：生成中显示锁定值，空闲时显示路由值 */
const displayPageId = computed(() =>
  loading.value && lockedPageId.value ? lockedPageId.value : (pageId.value || routePageId.value)
)

/** 当前路由对应的 pageId（剥离租户前缀 /t/:tenantId/:projectId/ 后取尾段） */
const routePageId = computed(() => {
  const path = route.path
  const match = /^\/t\/[^/]+\/[^/]+\/(.+)$/.exec(path)
  return match?.[1] ?? ''
})

// 路由变化时自动同步 pageId（生成中不同步，防止迭代期间路由跳转覆盖）
watch(routePageId, (newId) => {
  if (!loading.value && newId) {
    pageId.value = newId
  }
}, { immediate: true })

// pageId 切换时清空旧页面的聊天记录和状态（生成中不响应）
watch(pageId, () => {
  if (!loading.value) {
    messages.value = []
    showLogs.value = false
    updateStatus('idle')
  }
})

// 加载结束后：清除锁定，重新同步到当前路由
watch(loading, (isLoading) => {
  if (!isLoading) {
    lockedPageId.value = ''
    if (routePageId.value) {
      pageId.value = routePageId.value
    }
  }
})
const messages = ref<ChatMessage[]>([])
const messagesRef = ref<HTMLElement>()
/** 取消标志：用户点击取消后置 true，迭代循环检测到后中断 */
let _abortRequested = false

const statusClass = ref('')
const statusText = ref('就绪')
const showLogs = ref(false)

/** 流式输出文本（SSE delta 累积） */
const streamingText = ref('')
/** 当前阶段进度描述 */
const phaseMessage = ref('')
/** 诊断质量分（0-100） */
const diagnosticQuality = ref(0)
/** 诊断质量提示 */
const diagnosticHint = ref('')

/** 日志更新信号（本地响应式，由 onLogUpdate 驱动） */
const _logTick = ref(0)
const _unsubLog = onLogUpdate(() => { _logTick.value++ })
onUnmounted(() => { _unsubLog() })

/** 当前页面的实时日志（响应式，_logTick 变化时自动刷新） */
const recentLogs = computed(() => {
  void _logTick.value // 建立响应式依赖
  const pid = pageId.value.trim()
  if (!pid) return [] as LogSnapshot[]
  const loop = getAILoop()
  if (!loop) return [] as LogSnapshot[]
  return collectRelevantLogs(loop, pid, {
    includeGlobal: false,
  })
})

const liveLogSummary = computed(() =>
  summarizeLogBatch(recentLogs.value, {
    maxIssues: MAX_ISSUES_PER_ROUND,
    maxSamples: MAX_LOG_SAMPLES_PER_ROUND,
  })
)

const errorLogCount = computed(() =>
  recentLogs.value.filter(l => l.level === 'error' || l.level === 'warn').length
)

interface ApiErrorDigest {
  method: string
  url: string
  codeLabel: string
  message: string
  responsePreview: string | undefined
  count: number
}

function isApiErrorLog(log: LogSnapshot): boolean {
  if (log.message.includes('HTTP 请求失败')) return true
  const code = log.meta?.['code']
  return typeof code === 'string' && code.startsWith('ERR_HTTP_')
}

const apiErrorLogs = computed(() =>
  recentLogs.value.filter(isApiErrorLog)
)

const nonApiRecentLogs = computed(() =>
  recentLogs.value.filter(log => !isApiErrorLog(log))
)

function asPlainText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

const apiErrorDigests = computed<ApiErrorDigest[]>(() => {
  interface ApiErrorDigestWithTimestamp extends ApiErrorDigest {
    latestTimestamp: number
  }

  const grouped = new Map<string, ApiErrorDigestWithTimestamp>()

  for (const log of apiErrorLogs.value) {
    const method = (asPlainText(log.meta?.['method']) || 'GET').toUpperCase()
    const url = asPlainText(log.meta?.['url']) || '(unknown-url)'
    const status = asPlainText(log.meta?.['status'])
    const code = asPlainText(log.meta?.['code'])
    const codeLabel = status !== '' ? `HTTP ${status}` : (code || 'HTTP_ERR')
    const message = asPlainText(log.meta?.['message']) || log.message
    const responsePreviewRaw = asPlainText(log.meta?.['responsePreview'])
    const responsePreview = responsePreviewRaw !== '' ? responsePreviewRaw : undefined

    const signature = `${method}|${url}|${codeLabel}`
    const prev = grouped.get(signature)

    if (!prev) {
      grouped.set(signature, {
        method,
        url,
        codeLabel,
        message,
        responsePreview,
        count: 1,
        latestTimestamp: log.timestamp,
      })
      continue
    }

    prev.count += 1
    if (log.timestamp >= prev.latestTimestamp) {
      prev.latestTimestamp = log.timestamp
      prev.message = message
      prev.responsePreview = responsePreview
    }
  }

  return Array.from(grouped.values())
    .sort((a, b) => a.latestTimestamp - b.latestTimestamp)
    .map(({ latestTimestamp: _ignored, ...rest }) => rest)
})

function levelEmoji(level: string): string {
  const map: Record<string, string> = { error: '❌', warn: '⚠️', info: 'ℹ️', debug: '🐛' }
  return map[level] ?? '📝'
}

type FormattedLogKind = 'plain' | 'json' | 'js'

interface FormattedLogOutput {
  kind: FormattedLogKind
  content: string
}

function tryFormatJson(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null
  if (!(trimmed.endsWith('}') || trimmed.endsWith(']'))) return null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    return JSON.stringify(parsed, null, 2)
  } catch {
    return null
  }
}

function formatJavaScript(text: string): string {
  const normalized = text
    .replace(/\{\s*/g, '{\n')
    .replace(/\}\s*/g, '}\n')
    .replace(/;\s*/g, ';\n')
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')

  let indent = 0
  const out: string[] = []
  for (const line of lines) {
    if (line.startsWith('}')) {
      indent = Math.max(0, indent - 1)
    }
    out.push(`${'  '.repeat(indent)}${line}`)
    if (line.endsWith('{')) {
      indent += 1
    }
  }
  return out.join('\n')
}

function tryFormatJavaScript(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const maybeJs = /(function\s+\w+\s*\(|\bconst\b|\blet\b|\bvar\b|=>|\breturn\b|\bif\s*\(|\bfor\s*\(|\bwhile\s*\()/u.test(trimmed)
  if (!maybeJs) return null
  return formatJavaScript(trimmed)
}

function formatLogOutput(message: string): FormattedLogOutput {
  const asJson = tryFormatJson(message)
  if (asJson !== null) {
    return { kind: 'json', content: asJson }
  }
  const asJs = tryFormatJavaScript(message)
  if (asJs !== null) {
    return { kind: 'js', content: asJs }
  }
  return { kind: 'plain', content: message }
}

function formatLogMeta(meta: Record<string, unknown>): string {
  try {
    return JSON.stringify(meta, null, 2)
  } catch {
    return String(meta)
  }
}

function updateStatus(s: 'idle' | 'generating' | 'success' | 'error') {
  statusClass.value = s
  statusText.value = { idle: '就绪', generating: '生成中...', success: '完成', error: '失败' }[s]
}

function qualityText(summary: LogBatchSummary): string {
  if (summary.qualityLevel === 'high') return `高质量 ${summary.qualityScore}`
  if (summary.qualityLevel === 'medium') return `中质量 ${summary.qualityScore}`
  return `低质量 ${summary.qualityScore}`
}

function issueDigest(summary: LogBatchSummary): string {
  if (summary.issues.length === 0) return '未采集到可归类问题'
  return summary.issues
    .map(issue => `[${issue.level} x${issue.count}] ${issue.message}`)
    .join('\n')
}

function hasBlockingIssues(summary: LogBatchSummary): boolean {
  if (summary.errorCount > 0) return true
  return summary.issues.some(issue => {
    if (issue.level !== 'warn') return false
    const text = issue.message.toLowerCase()
    return (
      text.includes('未注册') ||
      text.includes('not found') ||
      text.includes('无法解析') ||
      text.includes('datakey') ||
      text.includes('dataview') ||
      text.includes('缺少必需') ||
      text.includes('字段缺失') ||
      text.includes('non-props attributes')
    )
  })
}

function updateDiagnosticHint(summary: LogBatchSummary, timedOut: boolean): void {
  diagnosticQuality.value = summary.qualityScore
  const timeoutMark = timedOut ? '（诊断窗口超时）' : ''
  diagnosticHint.value = `${qualityText(summary)} · 错误${summary.errorCount} 警告${summary.warnCount} 问题簇${summary.issues.length}${timeoutMark}`
}

async function waitForDiagnosticWindow(
  pid: string,
  options?: { includeGlobal?: boolean; sinceTimestamp?: number },
): Promise<{ logs: LogSnapshot[]; summary: LogBatchSummary; timedOut: boolean }> {
  const loop = getAILoop()
  if (!loop) {
    throw new Error('AI Loop 未初始化，无法执行诊断')
  }

  const includeGlobal = options?.includeGlobal ?? true
  const sinceTimestamp = options?.sinceTimestamp ?? 0
  const startAt = Date.now()
  let lastChangeAt = startAt
  let lastCount = -1

  for (;;) {
    if (_abortRequested) {
      const logs = collectRelevantLogs(loop, pid, { includeGlobal, sinceTimestamp })
      const summary = summarizeLogBatch(logs, {
        maxIssues: MAX_ISSUES_PER_ROUND,
        maxSamples: MAX_LOG_SAMPLES_PER_ROUND,
      })
      updateDiagnosticHint(summary, false)
      return { logs, summary, timedOut: false }
    }

    const logs = collectRelevantLogs(loop, pid, { includeGlobal, sinceTimestamp })
    if (logs.length !== lastCount) {
      lastCount = logs.length
      lastChangeAt = Date.now()
    }

    const stableEnough = Date.now() - lastChangeAt >= LOG_STABILITY_WINDOW
    if (stableEnough) {
      const summary = summarizeLogBatch(logs, {
        maxIssues: MAX_ISSUES_PER_ROUND,
        maxSamples: MAX_LOG_SAMPLES_PER_ROUND,
      })
      updateDiagnosticHint(summary, false)
      return { logs, summary, timedOut: false }
    }

    if (Date.now() - startAt >= LOG_WAIT_TIMEOUT) {
      const summary = summarizeLogBatch(logs, {
        maxIssues: MAX_ISSUES_PER_ROUND,
        maxSamples: MAX_LOG_SAMPLES_PER_ROUND,
      })
      updateDiagnosticHint(summary, true)
      return { logs, summary, timedOut: true }
    }

    await delay(LOG_POLL_INTERVAL)
  }
}

/** 创建 SSE 流式回调，累积 delta 文本并更新阶段进度 */
function createStreamCallbacks(): StreamCallbacks {
  return {
    onDelta(text: string) {
      streamingText.value += text
      scrollToBottom()
    },
    onReasoning(text: string) {
      streamingText.value += text
      scrollToBottom()
    },
    onPhase(_phase: number, _status: string, message: string) {
      phaseMessage.value = message
    },
    onError(error: string) {
      if (import.meta.env.DEV) console.warn('[AiChatPanel] SSE error:', error)
    },
  }
}

/** 重置流式状态 */
function resetStreamState(): void {
  streamingText.value = ''
  phaseMessage.value = ''
  diagnosticQuality.value = 0
  diagnosticHint.value = ''
}

function isValidPageId(value: unknown): value is string {
  return typeof value === 'string' && PAGE_ID_RE.test(value)
}

function buildToolPlanningMessages(currentPageId: string, userPrompt: string): ProtocolMessage[] {
  const history = messages.value.slice(-4).map(item => ({
    role: item.role,
    content: item.text,
  })) as Array<{ role: 'user' | 'assistant'; content: string }>

  return [
    ...history,
    {
      role: 'user',
      content: `当前页面ID: ${currentPageId}\n用户请求: ${userPrompt}`,
    },
  ]
}

async function tryHandleWithProtocol(): Promise<boolean> {
  const originalPrompt = prompt.value.trim()
  const originalPageId = pageId.value.trim()

  if (originalPrompt === '' || originalPageId === '') return false
  if (!PAGE_ID_RE.test(originalPageId)) return false

  const controller = new AbortController()
  phaseMessage.value = '协议规划中...'
  streamingText.value = ''

  try {
    const planningMessages = buildToolPlanningMessages(originalPageId, originalPrompt)
    const responseText = await streamAiChatText({
      messages: planningMessages,
      mode: 'single',
      systemPrompt: AI_TOOL_SYSTEM_PROMPT,
      signal: controller.signal,
      onDelta: (delta) => {
        streamingText.value += delta
        scrollToBottom()
      },
      onReasoning: (reasoning) => {
        streamingText.value += reasoning
        scrollToBottom()
      },
      onPhase: (_phase, _status, message) => {
        phaseMessage.value = message
      },
    })
    const blocks = extractToolProtocolBlocks(responseText, { type: 'tool' })

    if (blocks.length === 0) {
      return false
    }

    const block = blocks[0]
    if (block === undefined) {
      return false
    }
    const payload = parseToolProtocolPayload<AiToolPayload>(block)
    if (payload === null) {
      messages.value.push({ role: 'assistant', text: '⚠️ 协议解析失败（JSON 无法解析），已回退默认生成流程。' })
      scrollToBottom()
      return false
    }

    const targetPageId = isValidPageId(payload.pageId) ? payload.pageId : originalPageId
    if (targetPageId !== pageId.value) {
      pageId.value = targetPageId
    }

    switch (block.action) {
      case 'page.auto':
      case 'page.generate':
      case 'page.iterate': {
        const nextPrompt = typeof payload.prompt === 'string' && payload.prompt.trim() !== ''
          ? payload.prompt.trim()
          : originalPrompt
        prompt.value = nextPrompt
        await runGenerateFlow()
        return true
      }
      case 'page.debug': {
        messages.value.push({ role: 'user', text: `[${targetPageId}] ${originalPrompt}` })
        scrollToBottom()
        await handleDebug()
        return true
      }
      case 'page.delete': {
        if (payload.confirm !== true) {
          messages.value.push({ role: 'assistant', text: '⚠️ 协议请求删除页面，但缺少 confirm=true，已拒绝执行。' })
          scrollToBottom()
          return true
        }
        messages.value.push({ role: 'user', text: `[${targetPageId}] ${originalPrompt}` })
        scrollToBottom()
        await handleDelete()
        return true
      }
      case 'chat.reply': {
        const message = typeof payload.message === 'string' && payload.message.trim() !== ''
          ? payload.message.trim()
          : stripToolProtocolBlocks(responseText, { type: 'tool' })
        if (message !== '') {
          messages.value.push({ role: 'assistant', text: message })
          scrollToBottom()
        }
        return true
      }
      default:
        messages.value.push({ role: 'assistant', text: `⚠️ 未识别协议动作：${block.action}，已回退默认生成流程。` })
        scrollToBottom()
        return false
    }
  } catch {
    return false
  } finally {
    controller.abort()
    if (!loading.value) {
      streamingText.value = ''
      phaseMessage.value = ''
    }
  }
}

function togglePanel() {
  isOpen.value = !isOpen.value
}

/** 删除当前页面配置 */
async function handleDelete() {
  const pid = pageId.value.trim()
  if (!pid || loading.value) return
  if (!confirm(`确定删除页面 /${pid} 的所有配置文件？此操作不可撤销。`)) return

  loading.value = true
  updateStatus('generating')
  try {
    await http.delete(`${getPageApi()}/${encodeURIComponent(pid)}`)
    clearPageCache(pid)
    messages.value.push({ role: 'assistant', text: `🗑️ 页面 /${pid} 已删除` })
    // 如果当前路由就是被删页面，导航回首页
    if (routePageId.value === pid) {
      void router.push(tenantPath(getNavHomePath()))
    }
    updateStatus('success')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    messages.value.push({ role: 'assistant', text: `❌ 删除失败: ${msg}` })
    updateStatus('error')
  } finally {
    loading.value = false
    scrollToBottom()
  }
}

/** 用户取消当前生成/调试操作 */
function handleCancel() {
  _abortRequested = true
  messages.value.push({ role: 'assistant', text: '⏹ 用户已取消操作' })
  scrollToBottom()
}

function scrollToBottom() {
  void nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

// tenantPath / ensureRouteExists / navigateToPage 由 useTenantRouter() 提供

function collectRelevantLogs(
  loop: ReturnType<typeof getAILoop>,
  pid: string,
  options?: { includeGlobal?: boolean; sinceTimestamp?: number },
): LogSnapshot[] {
  if (!loop) return []
  const includeGlobal = options?.includeGlobal ?? true
  const sinceTimestamp = options?.sinceTimestamp ?? 0
  return loop.collector.peek().filter(log => {
    if (log.timestamp < sinceTimestamp) return false
    if (log.pageId === pid) return true
    if (!includeGlobal) return false
    return log.pageId === undefined && (log.level === 'error' || log.level === 'warn')
  })
}

function detectAiFailure(response: AIResponse): string | null {
  const explanation = response.explanation ?? ''
  const ruleContent = response.files['rule.json'] ?? ''
  const markers = [
    'AI 生成失败',
    '响应解析失败',
    '未返回标准 JSON',
    'UI 层生成失败',
    '数据/行为层生成失败',
  ]

  const hit = markers.find(marker =>
    explanation.includes(marker) || ruleContent.includes(marker)
  )

  if (!hit) return null
  return explanation.trim() !== '' ? explanation : `AI 返回失败占位页面：${hit}`
}

/** 等待指定时间 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 格式化导航注册结果为简短提示 */
function formatNavNote(response: AIResponse): string {
  const nav = response.navigationResult
  if (nav === undefined) return ''
  if (nav.alreadyExists) return '📌 导航节点已存在，跳过注册'
  if (nav.success) return '✅ 已自动注册到导航菜单'
  return `⚠️ 导航注册失败: ${nav.error ?? '未知错误'}`
}

async function runGenerateFlow() {
  const text = prompt.value.trim()
  const pid = pageId.value.trim()
  if (!text || !pid || loading.value) return
  if (!PAGE_ID_RE.test(pid)) {
    messages.value.push({ role: 'assistant', text: '❌ pageId 只允许字母、数字和短横线（如 order-list）' })
    scrollToBottom()
    return
  }

  const loop = getAILoop()
  if (!loop) {
    messages.value.push({ role: 'assistant', text: '❌ AI Loop 未初始化，无法执行生成。请先开启 enableAI。' })
    scrollToBottom()
    return
  }

  messages.value.push({ role: 'user', text: `[${pid}] ${text}` })
  prompt.value = ''
  loading.value = true
  lockedPageId.value = pid
  _abortRequested = false
  updateStatus('generating')
  resetStreamState()
  // 先开启自动迭代守卫：避免 generate/iterate 写文件期间触发热重载风暴
  setAutoIterating(true)
  scrollToBottom()

  try {
    // 检查页面是否已存在：已有文件时走 iterate（附带当前 4 文件 + 修改需求），否则走 generate
    const existingFiles = await readPageFiles(pid)
    const hasExistingPage = Object.keys(existingFiles).length > 0

    const callbacks = createStreamCallbacks()
    const response = hasExistingPage
      ? await loop.iterateStream(pid, text, callbacks)
      : await loop.generateStream(pid, text, callbacks)

    const fileNames = Object.keys(response.files)
    const explanation = response.explanation ?? '页面生成完成'

    // 导航注册状态提示
    const navNote = formatNavNote(response)
    messages.value.push({
      role: 'assistant',
      text: navNote.length > 0 ? `${explanation}\n\n${navNote}` : explanation,
      files: fileNames,
      pageId: pid,
    })
    scrollToBottom()

    const aiFailure = detectAiFailure(response)
    if (aiFailure !== null) {
      messages.value.push({
        role: 'assistant',
        text: `❌ 生成失败: ${aiFailure}`,
      })
      updateStatus('error')
      setAutoIterating(false)
      return
    }

    // 注册路由 → 清除旧缓存 → 导航到页面
    // 若 AI 自动注册了导航节点，先刷新导航树使新节点可见
    if (response.navigationResult?.success === true && !response.navigationResult.alreadyExists) {
      await refreshRoutes()
    }
    tenantEnsureRouteExists(pid, 'ai')
    clearPageCache(pid)
    await router.push(tenantPath(`/${pid}`))
    // 关键：autoIterating=true 会抑制 setupHotReload；若是同路由 push，页面不会自动重建
    // 这里主动触发一次重建，确保后续日志采集针对“新生成代码”而不是旧页面状态
    let diagnosticSince = Date.now()
    triggerPageRefresh()
    await nextTick()
    let iterationFailed = false
    let previousSignature = ''
    let stagnationRounds = 0
    try {
      for (let i = 1; i <= MAX_AUTO_ITERATIONS; i++) {
        if (_abortRequested) break

        updateStatus('generating')
        messages.value.push({
          role: 'assistant',
          text: `🔍 第 ${i} 轮检查：等待页面日志进入稳定窗口...`,
          iteration: i,
        })
        scrollToBottom()

        const stable = await waitForDiagnosticWindow(pid, {
          includeGlobal: true,
          sinceTimestamp: diagnosticSince,
        })
        if (_abortRequested) break

        if (!hasBlockingIssues(stable.summary)) {
          messages.value.push({
            role: 'assistant',
            text: `✅ 第 ${i} 轮检查通过：${diagnosticHint.value}`,
            iteration: i,
          })
          scrollToBottom()
          break
        }

        if (stable.summary.signature === previousSignature && stable.summary.signature !== '') {
          stagnationRounds += 1
        } else {
          stagnationRounds = 0
        }
        previousSignature = stable.summary.signature

        if (stagnationRounds >= MAX_STAGNATION_ROUNDS) {
          messages.value.push({
            role: 'assistant',
            text: `⛔ 第 ${i} 轮触发收敛停滞：连续问题簇未变化，已停止自动迭代。请补充更具体业务约束后重试。`,
            iteration: i,
          })
          scrollToBottom()
          updateStatus('error')
          iterationFailed = true
          break
        }

        const errorSummary = issueDigest(stable.summary)

        messages.value.push({
          role: 'assistant',
          text: `⚠️ 第 ${i} 轮检测到 ${stable.summary.issues.length} 个问题簇（错误 ${stable.summary.errorCount} / 警告 ${stable.summary.warnCount}），正在回传 AI 自动修复...\n\`\`\`\n${errorSummary}\n\`\`\``,
          iteration: i,
        })
        scrollToBottom()

        resetStreamState()
        const iterResponse: AIResponse = await loop.iterateStream(pid,
          `页面渲染后出现以下问题簇，请按优先级修复：\n${errorSummary}\n诊断结论：${diagnosticHint.value}`,
          createStreamCallbacks(),
        )

        const iterFailure = detectAiFailure(iterResponse)
        if (iterFailure !== null) {
          messages.value.push({
            role: 'assistant',
            text: `❌ 第 ${i} 轮修复失败: ${iterFailure}`,
            iteration: i,
          })
          scrollToBottom()
          updateStatus('error')
          iterationFailed = true
          break
        }

        const iterFiles = Object.keys(iterResponse.files)
        messages.value.push({
          role: 'assistant',
          text: iterResponse.explanation ?? `🔧 第 ${i} 轮修复完成`,
          files: iterFiles,
          pageId: pid,
          iteration: i,
        })
        scrollToBottom()

        // 清除缓存 → key 驱动页面组件重建（路由不变，AI 面板不受影响）
        clearPageCache(pid)
        diagnosticSince = Date.now()
        triggerPageRefresh()
        await nextTick()
      }
    } finally {
      setAutoIterating(false)
    }

    if (iterationFailed) return

    updateStatus('success')
  } catch (err) {
    setAutoIterating(false)
    const msg = err instanceof Error ? err.message : String(err)
    messages.value.push({
      role: 'assistant',
      text: `❌ 生成失败: ${msg}`,
    })
    updateStatus('error')
  } finally {
    loading.value = false
    scrollToBottom()
  }
}

async function handleSend() {
  const handledByProtocol = await tryHandleWithProtocol()
  if (handledByProtocol) {
    return
  }
  await runGenerateFlow()
}

/**
 * 调试当前页面：收集运行时错误 + 当前文件，发送给 AI 自动修复
 * 无需用户输入 prompt，自动从 PageLogCollector 获取错误上下文
 */
async function handleDebug() {
  const pid = pageId.value.trim()
  if (!pid || loading.value) return

  const loop = getAILoop()
  if (!loop) {
    messages.value.push({ role: 'assistant', text: '❌ AI Loop 未初始化，无法执行调试。' })
    scrollToBottom()
    return
  }

  const relevantLogs = collectRelevantLogs(loop, pid, {
    includeGlobal: true,
  })

  const debugLogs = relevantLogs.length > 0
    ? relevantLogs
    : collectRelevantLogs(loop, pid, { includeGlobal: true })

  if (debugLogs.length === 0) {
    messages.value.push({
      role: 'assistant',
      text: '🔍 当前页面暂无收集到的错误日志。请先访问页面触发错误后再调试。',
    })
    scrollToBottom()
    return
  }

  const initialSummary = summarizeLogBatch(debugLogs, {
    maxIssues: MAX_ISSUES_PER_ROUND,
    maxSamples: MAX_LOG_SAMPLES_PER_ROUND,
  })
  updateDiagnosticHint(initialSummary, false)
  const errorSummary = issueDigest(initialSummary)

  messages.value.push({
    role: 'user',
    text: `[${pid}] 🐛 调试模式：修复页面运行时错误`,
  })
  messages.value.push({
    role: 'assistant',
    text: `🐛 检测到 ${initialSummary.issues.length} 个问题簇，读取当前文件并发送到 AI...\n\`\`\`\n${errorSummary}\n\`\`\``,
  })
  scrollToBottom()

  loading.value = true
  lockedPageId.value = pid
  _abortRequested = false
  updateStatus('generating')
  setAutoIterating(true)
  resetStreamState()

  try {
    let previousSignature = initialSummary.signature
    let stagnationRounds = 0

    const iterResponse: AIResponse = await loop.iterateStream(pid,
      `页面 /${pid} 运行时出现以下问题簇，请根据当前文件内容修复：\n${errorSummary}\n诊断结论：${diagnosticHint.value}`,
      createStreamCallbacks(),
    )

    const iterFiles = Object.keys(iterResponse.files)
    messages.value.push({
      role: 'assistant',
      text: iterResponse.explanation ?? '🔧 AI 修复完成',
      files: iterFiles,
      pageId: pid,
      iteration: 1,
    })
    scrollToBottom()

    // 清缓存 → key 驱动页面组件重建
    clearPageCache(pid)
    let diagnosticSince = Date.now()
    triggerPageRefresh()
    await nextTick()

    // ── 后续自动迭代（最多 MAX_AUTO_ITERATIONS - 1 轮） ──
    for (let i = 2; i <= MAX_AUTO_ITERATIONS; i++) {
      if (_abortRequested) break
      updateStatus('generating')
      messages.value.push({
        role: 'assistant',
        text: `🔍 第 ${i} 轮检查：等待页面日志进入稳定窗口...`,
        iteration: i,
      })
      scrollToBottom()

      const stable = await waitForDiagnosticWindow(pid, {
        includeGlobal: true,
        sinceTimestamp: diagnosticSince,
      })
      if (_abortRequested) break

      if (!hasBlockingIssues(stable.summary)) {
        messages.value.push({
          role: 'assistant',
          text: `✅ 第 ${i} 轮检查通过：${diagnosticHint.value}`,
          iteration: i,
        })
        scrollToBottom()
        break
      }

      if (stable.summary.signature === previousSignature && stable.summary.signature !== '') {
        stagnationRounds += 1
      } else {
        stagnationRounds = 0
      }
      previousSignature = stable.summary.signature

      if (stagnationRounds >= MAX_STAGNATION_ROUNDS) {
        messages.value.push({
          role: 'assistant',
          text: `⛔ 第 ${i} 轮触发收敛停滞：连续问题簇未变化，已停止自动迭代。`,
          iteration: i,
        })
        scrollToBottom()
        updateStatus('error')
        return
      }

      const newErrorSummary = issueDigest(stable.summary)

      messages.value.push({
        role: 'assistant',
        text: `⚠️ 第 ${i} 轮检测到 ${stable.summary.issues.length} 个问题簇，继续修复...\n\`\`\`\n${newErrorSummary}\n\`\`\``,
        iteration: i,
      })
      scrollToBottom()

      resetStreamState()
      const nextResponse: AIResponse = await loop.iterateStream(pid,
        `页面渲染后仍有以下问题簇，请继续修复：\n${newErrorSummary}\n诊断结论：${diagnosticHint.value}`,
        createStreamCallbacks(),
      )

      messages.value.push({
        role: 'assistant',
        text: nextResponse.explanation ?? `🔧 第 ${i} 轮修复完成`,
        files: Object.keys(nextResponse.files),
        pageId: pid,
        iteration: i,
      })
      scrollToBottom()

      clearPageCache(pid)
      diagnosticSince = Date.now()
      triggerPageRefresh()
      await nextTick()
    }

    updateStatus('success')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    messages.value.push({
      role: 'assistant',
      text: `❌ 调试修复失败: ${msg}`,
    })
    updateStatus('error')
  } finally {
    setAutoIterating(false)
    loading.value = false
    scrollToBottom()
  }
}

onMounted(() => {
  updateStatus('idle')
})

// 监听 aiDebug query 参数：从页面管理跳转过来时自动打开面板并触发调试
watch(() => route.query['aiDebug'], async (val) => {
  if (val === '1') {
    isOpen.value = true
    const pid = pageId.value.trim()
    if (pid) {
      try {
        await waitForDiagnosticWindow(pid, {
          includeGlobal: true,
        })
      } catch {
        // ignore pre-debug warmup failure, handleDebug 会给出明确报错
      }
    }
    // 清除 query 参数（避免刷新后重复触发）
    void router.replace({ path: route.path, query: {} })
    // 自动触发调试
    void handleDebug()
  }
}, { immediate: true })
</script>

<style scoped>
.ai-chat-wrapper {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
}

.ai-chat-embedded {
  position: relative;
  width: 100%;
  height: 100%;
}

.ai-fab {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  font-size: 24px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ai-fab:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 24px rgba(102, 126, 234, 0.6);
}
.ai-fab.active {
  background: #666;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.ai-panel {
  position: absolute;
  bottom: 64px;
  right: 0;
  width: 25vw;
  height: 75vh;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ai-panel.embedded {
  position: relative;
  bottom: auto;
  right: auto;
  width: 100%;
  height: 100%;
  max-height: none;
  border-radius: 0;
  box-shadow: none;
}

.ai-panel-header {
  padding: 14px 18px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  font-weight: 600;
  font-size: 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ai-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
}
.ai-status.generating { background: #e6a23c; color: #fff; }
.ai-status.success { background: #67c23a; color: #fff; }
.ai-status.error { background: #f56c6c; color: #fff; }

.ai-quality-badge {
  margin-bottom: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(64, 158, 255, 0.12);
  color: #409eff;
  font-size: 12px;
}

.ai-quality-inline {
  font-size: 12px;
  color: #606266;
}

.ai-lock-badge {
  font-size: 11px;
  margin-left: 4px;
  vertical-align: middle;
}

.ai-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 0;
  max-height: none;
}

.ai-empty {
  color: #999;
  text-align: center;
  padding: 40px 20px;
  line-height: 1.8;
  font-size: 13px;
}

.ai-message {
  margin-bottom: 12px;
  display: flex;
}
.ai-message.user {
  justify-content: flex-end;
}
.ai-message.assistant {
  justify-content: flex-start;
}

.ai-message-content {
  max-width: 92%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}
.ai-message.user .ai-message-content {
  background: #667eea;
  color: #fff;
  border-bottom-right-radius: 4px;
}
.ai-message.assistant .ai-message-content {
  background: #f4f4f5;
  color: #333;
  border-bottom-left-radius: 4px;
}

.ai-files {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.ai-file-tag {
  display: inline-block;
  padding: 2px 8px;
  background: #e8eaf6;
  color: #5c6bc0;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
}

.ai-nav-btn {
  margin-top: 8px;
  padding: 4px 12px;
  background: #667eea;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.ai-nav-btn:hover {
  background: #5a6fd6;
}

.ai-loading {
  display: flex;
  gap: 4px;
  padding: 12px 18px;
}
.ai-loading .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #999;
  animation: dot-bounce 1.4s infinite ease-in-out both;
}
.ai-loading .dot:nth-child(1) { animation-delay: -0.32s; }
.ai-loading .dot:nth-child(2) { animation-delay: -0.16s; }
@keyframes dot-bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

.ai-streaming {
  min-height: 32px;
}

.ai-phase-badge {
  font-size: 11px;
  color: #667eea;
  background: #eef0ff;
  padding: 2px 8px;
  border-radius: 8px;
  margin-bottom: 6px;
  display: inline-block;
}

.ai-stream-text {
  font-size: 14px;
  color: #555;
  line-height: 1.6;
  white-space: pre-wrap;
  max-height: 260px;
  overflow-y: auto;
}

.ai-markdown :deep(pre) {
  background: #282c34;
  color: #abb2bf;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 13px;
  margin: 8px 0;
}

.ai-markdown :deep(code) {
  font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 13px;
}

.ai-markdown :deep(code:not(pre code)) {
  background: #e8eaed;
  color: #c7254e;
  padding: 2px 4px;
  border-radius: 3px;
}

.ai-markdown :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  width: 100%;
}

.ai-markdown :deep(th),
.ai-markdown :deep(td) {
  border: 1px solid #dcdfe6;
  padding: 6px 10px;
  font-size: 13px;
}

.ai-markdown :deep(th) {
  background: #f5f7fa;
  font-weight: 600;
}

.ai-markdown :deep(ul),
.ai-markdown :deep(ol) {
  padding-left: 20px;
  margin: 6px 0;
}

.ai-markdown :deep(blockquote) {
  border-left: 3px solid #409eff;
  padding: 4px 12px;
  margin: 8px 0;
  color: #606266;
  background: #f5f7fa;
  border-radius: 0 4px 4px 0;
}

.ai-markdown :deep(h1),
.ai-markdown :deep(h2),
.ai-markdown :deep(h3) {
  margin: 12px 0 6px;
  font-weight: 600;
}

.ai-markdown :deep(h1) { font-size: 18px; }
.ai-markdown :deep(h2) { font-size: 16px; }
.ai-markdown :deep(h3) { font-size: 14px; }

.ai-markdown :deep(p) {
  margin: 6px 0;
}

.ai-panel-footer {
  padding: 12px;
  border-top: 1px solid #eee;
  background: #fafafa;
}

.ai-input-page {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 8px;
  box-sizing: border-box;
  outline: none;
}
.ai-input-page:focus {
  border-color: #667eea;
}

.ai-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 13px;
  resize: none;
  box-sizing: border-box;
  outline: none;
  font-family: inherit;
}
.ai-input:focus {
  border-color: #667eea;
}

.ai-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
  gap: 8px;
}

.ai-delete-btn {
  padding: 6px 10px;
  background: transparent;
  color: #f56c6c;
  border: 1px solid #f56c6c;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.ai-delete-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ai-delete-btn:not(:disabled):hover {
  background: #fef0f0;
}

.ai-debug-btn {
  padding: 6px 16px;
  background: #e6a23c;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}
.ai-debug-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ai-debug-btn:not(:disabled):hover {
  background: #d4940f;
}

.ai-cancel-btn {
  padding: 6px 16px;
  background: #f56c6c;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}
.ai-cancel-btn:hover {
  background: #e04040;
}

.ai-send-btn {
  padding: 6px 20px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}
.ai-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ai-send-btn:not(:disabled):hover {
  opacity: 0.9;
}

/* 实时日志 */
.ai-log-feed {
  border-top: 1px solid #eee;
  background: #fafbfc;
  max-height: 160px;
  overflow-y: auto;
}
.ai-log-header {
  padding: 6px 16px;
  font-size: 12px;
  color: #666;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
}
.ai-log-header:hover { background: #f0f0f0; }
.ai-error-count { color: #f56c6c; font-weight: 600; }
.ai-api-error-count { color: #e6a23c; font-weight: 600; }
.ai-log-toggle { font-size: 10px; color: #999; }
.ai-log-list { padding: 0 12px 8px; }

.ai-api-error-group {
  margin: 4px 0 8px;
  padding: 6px 8px;
  background: #fff7ed;
  border: 1px solid #fde3c2;
  border-radius: 6px;
}

.ai-api-error-title {
  font-size: 11px;
  font-weight: 600;
  color: #b88230;
  margin-bottom: 6px;
}

.ai-api-error-item {
  padding: 4px 0;
  border-top: 1px dashed #f3d19e;
}

.ai-api-error-item:first-of-type {
  border-top: none;
}

.ai-api-error-line {
  font-size: 11px;
  color: #7a5a26;
  font-family: 'Menlo', 'Consolas', monospace;
}

.ai-api-error-repeat {
  color: #d2691e;
  font-weight: 600;
}

.ai-api-error-message {
  font-size: 11px;
  color: #8c6331;
  margin-top: 2px;
  word-break: break-word;
}

.ai-api-error-preview {
  margin: 4px 0 0;
  padding: 4px 6px;
  background: #fff;
  color: #606266;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.4;
}

.ai-log-entry {
  font-size: 11px;
  font-family: 'Menlo', 'Consolas', monospace;
  padding: 2px 0;
  display: flex;
  gap: 6px;
  align-items: flex-start;
  line-height: 1.5;
  color: #555;
}
.ai-log-entry.error { color: #f56c6c; }
.ai-log-entry.warn { color: #e6a23c; }
.ai-log-level { flex-shrink: 0; }

.ai-log-body {
  flex: 1;
  min-width: 0;
}

.ai-log-msg {
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-log-code {
  margin: 0;
  padding: 6px 8px;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
  line-height: 1.5;
}

.ai-log-code.json {
  background: #eef5ff;
  color: #2c5aa0;
}

.ai-log-code.js {
  background: #282c34;
  color: #abb2bf;
}

.ai-log-meta {
  margin: 4px 0 0;
  padding: 6px 8px;
  background: #f5f7fa;
  color: #606266;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}

/* Slide transition */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}
</style>
