<template>
  <div class="ai-chat-wrapper">
    <!-- 浮动触发按钮 -->
    <button class="ai-fab" :class="{ active: isOpen }" @click="togglePanel" title="AI 页面生成">
      <span v-if="!isOpen">🤖</span>
      <span v-else>✕</span>
    </button>

    <!-- 聊天面板 -->
    <Transition name="slide">
      <div v-if="isOpen" class="ai-panel">
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
                  @click="navigateTo(msg.pageId)"
                >
                  🔗 打开页面 /{{ msg.pageId }}
                </button>
              </template>
            </div>
          </div>
          <div v-if="loading" class="ai-message assistant">
            <div class="ai-message-content ai-streaming">
              <div v-if="phaseMessage" class="ai-phase-badge">{{ phaseMessage }}</div>
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
        <div v-if="isOpen && pageId.trim() && recentLogs.length > 0" class="ai-log-feed">
          <div class="ai-log-header" @click="showLogs = !showLogs">
            <span>📋 {{ recentLogs.length }} 条日志
              <span v-if="errorLogCount > 0" class="ai-error-count">({{ errorLogCount }} 错误)</span>
            </span>
            <span class="ai-log-toggle">{{ showLogs ? '▼' : '▶' }}</span>
          </div>
          <div v-if="showLogs" class="ai-log-list">
            <div v-for="(log, i) in recentLogs.slice(-30)" :key="i" class="ai-log-entry" :class="log.level">
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
import { useRouter, useRoute } from 'vue-router'
import VueMarkdown from 'vue-markdown-render'
import { getNavHomePath } from '@spark-view/spark-app'
import { getAILoop, clearPageCache, setAutoIterating, setConfigLoader, readPageFiles, triggerPageRefresh, onLogUpdate } from '@spark-view/spark-ai'
import type { AIResponse, LogSnapshot, StreamCallbacks } from '@spark-view/spark-ai'
import { createRequest } from '@spark-view/spark-utils'
import { getPageApi } from '@/services/api-paths'

// Skill Catalog（构建时生成的虚拟模块，可能不可用）
let _skillCatalog: string | undefined
import('virtual:spark-skill-catalog')
  .then((mod) => { _skillCatalog = mod.buildSkillPrompt?.('## SPARK Skill 目录', 'compact') as string | undefined })
  .catch(() => { /* virtual module not available */ })

const http = createRequest({ timeout: 120_000 })

/** 最大自动迭代次数（防止无限循环） */
const MAX_AUTO_ITERATIONS = 3
/** 渲染后等待日志收集的时间 ms */
const LOG_COLLECT_DELAY = 5000
/** pageId 合法字符：字母、数字、短横线 */
const PAGE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  files?: string[]
  pageId?: string
  iteration?: number
}

const router = useRouter()
const route = useRoute()

const isOpen = ref(false)
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
  // 剥离租户前缀：/t/{tenantId}/{projectId}/xxx → /xxx
  const match = /^\/t\/[^/]+\/[^/]+\/(.+)$/.exec(path)
  if (match) return match[1]
  // 无租户前缀时回退到去前导 /
  const trimmed = path.replace(/^\/+/, '')
  return trimmed.length > 0 ? trimmed : ''
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
  return collectRelevantLogs(loop, pid)
})

const errorLogCount = computed(() =>
  recentLogs.value.filter(l => l.level === 'error' || l.level === 'warn').length
)

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

/** 构建当前用户的租户前缀路径 */
function tenantPath(relativePath: string): string {
  const normalized = relativePath.startsWith('/') ? relativePath : `/${relativePath}`
  if (normalized.startsWith('/t/')) return normalized

  const scopedMatch = /^\/t\/([^/]+)\/([^/]+)(?:\/|$)/.exec(route.path)
  if (!scopedMatch) {
    throw new Error(`tenantPath 仅支持租户作用域路由：期望 /t/{tenantId}/{projectId}，当前为 ${route.path}`)
  }

  const tenantId = scopedMatch[1]
  const projectId = scopedMatch[2]
  return `/t/${tenantId}/${projectId}${normalized}`
}

function ensureRouteExists(pid: string) {
  // 检查是否已有租户前缀路由（DynamicRouter 注册的 /t/:tenantId/xxx 模式）
  const tenantPrefixed = `/t/:tenantId/${pid}`
  const exists = router.getRoutes().some(r => r.path === tenantPrefixed)
  if (exists) return
  // 从已注册的配置页面路由中克隆组件和 configLoader
  const configRoute = router.getRoutes().find(
    r => r.meta?.['pageId'] != null && r.meta?.['type'] !== 'vue-component'
  )
  if (configRoute) {
    const comp = configRoute.components?.['default']
    if (!comp) return
    // 提取 configLoader：DynamicRouter 通过 props: { configLoader } 注入
    const routeProps = configRoute.props?.['default'] as Record<string, unknown> | undefined
    const configLoader = routeProps?.['configLoader'] as { clearCache(key?: string): void } | undefined
    // 注册 configLoader 到 ai-loop，使 clearPageCache 能同时清除 memCache
    if (configLoader) setConfigLoader(configLoader)
    router.addRoute({
      path: tenantPrefixed,
      name: `ai-${pid}`,
      component: comp,
      ...(configLoader ? { props: { configLoader } } : {}),
      meta: { pageId: pid, title: pid, icon: 'MagicStick' },
    })
  }
}

function navigateTo(pid: string) {
  ensureRouteExists(pid)
  void router.push(tenantPath(`/${pid}`))
}

/** 判断日志中是否包含需要修复的渲染错误
 * 只对 error 级和结构性 warn （未注册组件、数据绑定失败等）触发迭代；
 * 功能性 warn（性能提示、ResizeObserver 等）不触发
 */
function hasRenderErrors(logs: LogSnapshot[]): boolean {
  return logs.some(l => {
    if (l.level === 'error') return true
    if (l.level !== 'warn') return false
    const msg = typeof l.message === 'string' ? l.message : ''
    const metaMessage =
      l.meta !== undefined && typeof l.meta['message'] === 'string'
        ? l.meta['message']
        : ''
    const text = `${msg} ${metaMessage}`
    return (
      text.includes('未注册') ||
      text.includes('not found') ||
      text.includes('无法解析') ||
      text.includes('dataKey') ||
      text.includes('DataView') ||
      text.includes('缺少必需') ||
      text.includes('字段缺失') ||
      text.includes('Extraneous non-props attributes') ||
      text.includes('non-props attributes')
    )
  })
}

function collectRelevantLogs(loop: ReturnType<typeof getAILoop>, pid: string): LogSnapshot[] {
  if (!loop) return []
  const pageLogs = loop.collector.peek(pid)
  const globalErrors = loop.collector.peek().filter(
    l => l.pageId === undefined && (l.level === 'error' || l.level === 'warn')
  )
  return [...pageLogs, ...globalErrors]
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

async function handleSend() {
  const text = prompt.value.trim()
  const pid = pageId.value.trim()
  if (!text || !pid || loading.value) return
  if (!PAGE_ID_RE.test(pid)) {
    messages.value.push({ role: 'assistant', text: '❌ pageId 只允许字母、数字和短横线（如 order-list）' })
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
    const loop = getAILoop()
    let response: AIResponse

    // 检查页面是否已存在：已有文件时走 iterate（附带当前 4 文件 + 修改需求），否则走 generate
    const existingFiles = await readPageFiles(pid)
    const hasExistingPage = Object.keys(existingFiles).length > 0

    const callbacks = createStreamCallbacks()

    if (hasExistingPage) {
      // 页面已存在 → 迭代模式，把用户输入作为修改反馈
      if (loop) {
        response = await loop.iterateStream(pid, text, callbacks)
      } else {
        response = await http.post<AIResponse>('/api/ai/chat', {
          action: 'iterate',
          pageId: pid,
          sessionId: `chat-${Date.now()}`,
          feedback: text,
          currentFiles: existingFiles,
          skillCatalog: _skillCatalog,
        })
      }
    } else {
      // 新页面 → 生成模式
      if (loop) {
        response = await loop.generateStream(pid, text, callbacks)
      } else {
        response = await http.post<AIResponse>('/api/ai/chat', {
          action: 'generate',
          pageId: pid,
          prompt: text,
          sessionId: `chat-${Date.now()}`,
          skillCatalog: _skillCatalog,
        })
      }
    }

    const fileNames = Object.keys(response.files)
    const explanation = response.explanation ?? '页面生成完成'

    // fallback 模式：loop 不可用时手动写入文件
    if (!loop && fileNames.length > 0) {
      const { writePageFiles } = await import('@spark-view/spark-ai')
      await writePageFiles(pid, response.files)
    }

    messages.value.push({
      role: 'assistant',
      text: explanation,
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
    ensureRouteExists(pid)
    clearPageCache(pid)
    await router.push(tenantPath(`/${pid}`))
    // 关键：autoIterating=true 会抑制 setupHotReload；若是同路由 push，页面不会自动重建
    // 这里主动触发一次重建，确保后续日志采集针对“新生成代码”而不是旧页面状态
    triggerPageRefresh()
    await nextTick()
    let iterationFailed = false
    try {
      for (let i = 1; i <= MAX_AUTO_ITERATIONS; i++) {
        if (_abortRequested) break
        // 等待页面渲染，让 Logger 收集运行时日志
        updateStatus('generating')
        messages.value.push({
          role: 'assistant',
          text: `🔍 第 ${i} 轮检查：等待页面渲染并收集日志...`,
          iteration: i,
        })
        scrollToBottom()
        await delay(LOG_COLLECT_DELAY)
        if (_abortRequested) break

        // 检查日志（peek 不清空，iterate 内部 drain 会清空）
        const logs = collectRelevantLogs(loop, pid)
        if (!hasRenderErrors(logs)) {
          messages.value.push({
            role: 'assistant',
            text: `✅ 第 ${i} 轮检查通过，页面无渲染错误`,
            iteration: i,
          })
          scrollToBottom()
          break
        }

        // 有错误 → 回传日志给 AI 自动修复
        const errorLogs = logs.filter(l => l.level === 'error' || l.level === 'warn')
        const errorSummary = errorLogs
          .map(l => {
            const metaStr = l.meta ? ` ${JSON.stringify(l.meta)}` : ''
            return `[${l.level}] ${l.message}${metaStr}`
          })
          .slice(0, 20)
          .join('\n')

        messages.value.push({
          role: 'assistant',
          text: `⚠️ 第 ${i} 轮检测到 ${errorLogs.length} 条错误/警告，正在回传 AI 自动修复...\n\`\`\`\n${errorSummary}\n\`\`\``,
          iteration: i,
        })
        scrollToBottom()

        // 调用 iterate 回传日志并写入修复后的文件
        let iterResponse: AIResponse
        if (loop) {
          resetStreamState()
          iterResponse = await loop.iterateStream(pid,
            `页面渲染后出现以下错误，请修复：\n${errorSummary}`,
            createStreamCallbacks(),
          )
        } else {
          // fallback：直接 POST 迭代请求
          iterResponse = await http.post<AIResponse>('/api/ai/chat', {
            action: 'iterate',
            pageId: pid,
            sessionId: `chat-${Date.now()}`,
            feedback: `页面渲染后出现以下错误，请修复：\n${errorSummary}`,
            skillCatalog: _skillCatalog,
          })
          if (Object.keys(iterResponse.files).length > 0) {
            const { writePageFiles } = await import('@spark-view/spark-ai')
            await writePageFiles(pid, iterResponse.files)
          }
        }

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

/**
 * 调试当前页面：收集运行时错误 + 当前文件，发送给 AI 自动修复
 * 无需用户输入 prompt，自动从 PageLogCollector 获取错误上下文
 */
async function handleDebug() {
  const pid = pageId.value.trim()
  if (!pid || loading.value) return

  const loop = getAILoop()
  // 检查是否有可收集的错误
  const logs = loop ? loop.collector.peek(pid) : []
  const allLogs = loop ? loop.collector.peek() : []

  // 合并当前 pageId 的日志 + 无 pageId 的全局错误
  const relevantLogs = [
    ...logs,
    ...allLogs.filter(l => l.pageId === undefined && (l.level === 'error' || l.level === 'warn')),
  ]

  if (relevantLogs.length === 0) {
    messages.value.push({
      role: 'assistant',
      text: '🔍 当前页面暂无收集到的错误日志。请先访问页面触发错误后再调试。',
    })
    scrollToBottom()
    return
  }

  // 构建错误摘要
  const errorLogs = relevantLogs.filter(l => l.level === 'error' || l.level === 'warn')
  const errorSummary = errorLogs
    .map(l => {
      const metaStr = l.meta ? ` ${JSON.stringify(l.meta)}` : ''
      return `[${l.level}] ${l.message}${metaStr}`
    })
    .slice(0, 20)
    .join('\n')

  messages.value.push({
    role: 'user',
    text: `[${pid}] 🐛 调试模式：修复页面运行时错误`,
  })
  messages.value.push({
    role: 'assistant',
    text: `🐛 检测到 ${errorLogs.length} 条错误/警告，读取当前文件并发送到 AI...\n\`\`\`\n${errorSummary}\n\`\`\``,
  })
  scrollToBottom()

  loading.value = true
  lockedPageId.value = pid
  _abortRequested = false
  updateStatus('generating')
  setAutoIterating(true)
  resetStreamState()

  try {
    // ── 第一轮：发送当前错误 + 文件给 AI ──
    let iterResponse: AIResponse
    if (loop) {
      iterResponse = await loop.iterateStream(pid,
        `页面 /${pid} 运行时出现以下错误，请根据当前文件内容修复：\n${errorSummary}`,
        createStreamCallbacks(),
      )
    } else {
      const currentFiles = await readPageFiles(pid)
      iterResponse = await http.post<AIResponse>('/api/ai/chat', {
        action: 'iterate',
        pageId: pid,
        sessionId: `debug-${Date.now()}`,
        feedback: `页面 /${pid} 运行时出现以下错误，请根据当前文件内容修复：\n${errorSummary}`,
        currentFiles,
        logs: errorLogs,
        skillCatalog: _skillCatalog,
      })
      if (Object.keys(iterResponse.files).length > 0) {
        const { writePageFiles } = await import('@spark-view/spark-ai')
        await writePageFiles(pid, iterResponse.files)
      }
    }

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
    triggerPageRefresh()
    await nextTick()

    // ── 后续自动迭代（最多 MAX_AUTO_ITERATIONS - 1 轮） ──
    for (let i = 2; i <= MAX_AUTO_ITERATIONS; i++) {
      if (_abortRequested) break
      updateStatus('generating')
      messages.value.push({
        role: 'assistant',
        text: `🔍 第 ${i} 轮检查：等待页面渲染并收集日志...`,
        iteration: i,
      })
      scrollToBottom()
      await delay(LOG_COLLECT_DELAY)
      if (_abortRequested) break

      const checkLogs = collectRelevantLogs(loop, pid)
      if (!hasRenderErrors(checkLogs)) {
        messages.value.push({
          role: 'assistant',
          text: `✅ 第 ${i} 轮检查通过，页面无渲染错误`,
          iteration: i,
        })
        scrollToBottom()
        break
      }

      const newErrorLogs = checkLogs.filter(l => l.level === 'error' || l.level === 'warn')
      const newErrorSummary = newErrorLogs
        .map(l => {
          const metaStr = l.meta ? ` ${JSON.stringify(l.meta)}` : ''
          return `[${l.level}] ${l.message}${metaStr}`
        })
        .slice(0, 20)
        .join('\n')

      messages.value.push({
        role: 'assistant',
        text: `⚠️ 第 ${i} 轮检测到 ${newErrorLogs.length} 条错误/警告，继续修复...\n\`\`\`\n${newErrorSummary}\n\`\`\``,
        iteration: i,
      })
      scrollToBottom()

      let nextResponse: AIResponse
      if (loop) {
        resetStreamState()
        nextResponse = await loop.iterateStream(pid,
          `页面渲染后仍有以下错误，请继续修复：\n${newErrorSummary}`,
          createStreamCallbacks(),
        )
      } else {
        const currentFiles = await readPageFiles(pid)
        nextResponse = await http.post<AIResponse>('/api/ai/chat', {
          action: 'iterate',
          pageId: pid,
          sessionId: `debug-${Date.now()}`,
          feedback: `页面渲染后仍有以下错误，请继续修复：\n${newErrorSummary}`,
          currentFiles,
          logs: newErrorLogs,
          skillCatalog: _skillCatalog,
        })
        if (Object.keys(nextResponse.files).length > 0) {
          const { writePageFiles } = await import('@spark-view/spark-ai')
          await writePageFiles(pid, nextResponse.files)
        }
      }

      messages.value.push({
        role: 'assistant',
        text: nextResponse.explanation ?? `🔧 第 ${i} 轮修复完成`,
        files: Object.keys(nextResponse.files),
        pageId: pid,
        iteration: i,
      })
      scrollToBottom()

      clearPageCache(pid)
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
    // 等待页面渲染产生日志
    await delay(LOG_COLLECT_DELAY)
    // 清除 query 参数（避免刷新后重复触发）
    void router.replace({ path: route.path, query: {} })
    // 自动触发调试
    void handleDebug()
  }
})
</script>

<style scoped>
.ai-chat-wrapper {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
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
.ai-log-toggle { font-size: 10px; color: #999; }
.ai-log-list { padding: 0 12px 8px; }
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
