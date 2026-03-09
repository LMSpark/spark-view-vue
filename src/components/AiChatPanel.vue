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
          <span>🤖 AI · {{ routePageId ? `/${routePageId}` : '首页' }}</span>
          <span class="ai-status" :class="statusClass">{{ statusText }}</span>
        </div>

        <div class="ai-panel-body" ref="messagesRef">
          <div v-if="messages.length === 0" class="ai-empty">
            输入页面描述，AI 将自动生成 SPARK 页面配置。<br>
            例如：「创建一个用户管理页面，包含表格和搜索」
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
                <div class="ai-text">{{ msg.text }}</div>
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
            <div class="ai-message-content ai-loading">
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            </div>
          </div>
        </div>

        <div class="ai-panel-footer">
          <input
            v-model="pageId"
            class="ai-input-page"
            placeholder="页面ID (同步当前路由)"
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
import { ref, nextTick, onMounted, watch, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getAILoop, clearPageCache, setAutoIterating, setConfigLoader } from '@/services/ai-loop'
import type { AIResponse, LogSnapshot } from '@/services/ai-loop'
import { createRequest } from '@spark-view/spark-utils'

// Skill Catalog（构建时生成的虚拟模块，可能不可用）
let _skillCatalog: string | undefined
import('virtual:spark-skill-catalog')
  .then((mod) => { _skillCatalog = mod.buildSkillPrompt?.('## SPARK Skill 目录', 'compact') as string | undefined })
  .catch(() => { /* virtual module not available */ })

const http = createRequest({ timeout: 120_000 })

/** 最大自动迭代次数（防止无限循环） */
const MAX_AUTO_ITERATIONS = 3
/** 渲染后等待日志收集的时间 ms */
const LOG_COLLECT_DELAY = 4000
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

/** 当前路由对应的 pageId（去除前导 /） */
const routePageId = computed(() => {
  const trimmed = route.path.replace(/^\/+/, '')
  return trimmed.length > 0 ? trimmed : ''
})

// 路由变化时自动同步 pageId（生成中不同步，防止迭代期间路由跳转覆盖）
watch(routePageId, (newId) => {
  if (!loading.value && newId) {
    pageId.value = newId
  }
}, { immediate: true })

// 加载结束后重新同步（路由可能在 loading 期间变更，watcher 被跳过）
watch(loading, (isLoading) => {
  if (!isLoading && routePageId.value) {
    pageId.value = routePageId.value
  }
})
const messages = ref<ChatMessage[]>([])
const messagesRef = ref<HTMLElement>()
const status = ref<'idle' | 'generating' | 'success' | 'error'>('idle')

const statusClass = ref('')
const statusText = ref('就绪')

function updateStatus(s: 'idle' | 'generating' | 'success' | 'error') {
  status.value = s
  statusClass.value = s
  statusText.value = { idle: '就绪', generating: '生成中...', success: '完成', error: '失败' }[s]
}

function togglePanel() {
  isOpen.value = !isOpen.value
}

function scrollToBottom() {
  void nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

function ensureRouteExists(pid: string) {
  const exists = router.getRoutes().some(r => r.path === `/${pid}`)
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
      path: `/${pid}`,
      name: `ai-${pid}`,
      component: comp,
      ...(configLoader ? { props: { configLoader } } : {}),
      meta: { pageId: pid, title: pid, icon: '🤖' },
    })
  }
}

function navigateTo(pid: string) {
  ensureRouteExists(pid)
  void router.push(`/${pid}`)
}

/** 判断日志中是否包含需要修复的错误 */
function hasRenderErrors(logs: LogSnapshot[]): boolean {
  return logs.some(l =>
    l.level === 'error' || l.level === 'warn' ||
    (typeof l.message === 'string' && (
      l.message.includes('未注册') ||
      l.message.includes('not found') ||
      l.message.includes('Component') ||
      l.message.includes('失败')
    ))
  )
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
  updateStatus('generating')
  scrollToBottom()

  try {
    const loop = getAILoop()
    let response: AIResponse

    if (loop) {
      response = await loop.generate(pid, text)
    } else {
      response = await http.post<AIResponse>('/api/ai/chat', {
        action: 'generate',
        pageId: pid,
        prompt: text,
        sessionId: `chat-${Date.now()}`,
        skillCatalog: _skillCatalog,
      })
    }

    const fileNames = Object.keys(response.files)
    const explanation = response.explanation ?? '页面生成完成'

    // fallback 模式：loop 不可用时手动写入文件
    if (!loop && fileNames.length > 0) {
      const { writePageFiles } = await import('@/services/ai-loop')
      await writePageFiles(pid, response.files)
    }

    messages.value.push({
      role: 'assistant',
      text: explanation,
      files: fileNames,
      pageId: pid,
    })
    scrollToBottom()

    // ── 自动迭代闭环 ──
    // 必须在 generate 之前设置，因为 generate 内部 writePageFiles 会触发 SSE 事件，
    // 如果 _autoIterating 为 false，setupHotReload 会触发页面重载，导致面板状态丢失
    setAutoIterating(true)

    // 注册路由 → 清除旧缓存 → 导航到页面
    ensureRouteExists(pid)
    clearPageCache(pid)
    await router.push(`/${pid}`)
    try {
      for (let i = 1; i <= MAX_AUTO_ITERATIONS; i++) {
        // 等待页面渲染，让 Logger 收集运行时日志
        updateStatus('generating')
        messages.value.push({
          role: 'assistant',
          text: `🔍 第 ${i} 轮检查：等待页面渲染并收集日志...`,
          iteration: i,
        })
        scrollToBottom()
        await delay(LOG_COLLECT_DELAY)

        // 检查日志（peek 不清空，iterate 内部 drain 会清空）
        const logs = loop
          ? loop.collector.peek(pid)
          : [] // fallback 模式无日志收集，直接跳过迭代
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
          iterResponse = await loop.iterate(pid,
            `页面渲染后出现以下错误，请修复：\n${errorSummary}`
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
            const { writePageFiles } = await import('@/services/ai-loop')
            await writePageFiles(pid, iterResponse.files)
          }
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

        // 清除缓存 → 路由切换强制页面组件卸载/重建
        clearPageCache(pid)
        await router.push('/')
        await delay(300)
        ensureRouteExists(pid)
        await router.push(`/${pid}`)
      }
    } finally {
      setAutoIterating(false)
    }

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

onMounted(() => {
  // 初始化面板状态
  updateStatus('idle')
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
  width: 420px;
  max-height: 600px;
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

.ai-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 200px;
  max-height: 360px;
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
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
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
