<template>
  <div v-if="isOwner" class="sap-chat-wrapper">
    <!-- 浮动触发按钮 -->
    <button class="sap-fab" :class="{ active: isOpen }" @click="togglePanel" title="SAP 工具助手">
      <span v-if="!isOpen">🔧</span>
      <span v-else>✕</span>
    </button>

    <!-- 聊天面板 -->
    <Transition name="sap-slide">
      <div v-if="isOpen" class="sap-panel">
        <div class="sap-panel-header">
          <span>🔧 SAP 工具助手</span>
          <span class="sap-status" :class="statusClass">{{ statusText }}</span>
        </div>

        <div class="sap-panel-body" ref="messagesRef">
          <div v-if="messages.length === 0" class="sap-empty">
            输入自然语言指令，AI 会自动调用工具执行。<br>
            例如：「写一个 hello.txt，内容是 Hello SPARK」<br>
            例如：「查询用户表的前 5 条数据」<br><br>
            💡 支持的工具：<b>file.write</b>（沙箱文件写入）、<b>db.query</b>（只读 SQL 查询）
          </div>
          <div
            v-for="(msg, i) in messages"
            :key="i"
            class="sap-message"
            :class="msg.role"
          >
            <div class="sap-message-content">
              <template v-if="msg.role === 'user'">{{ msg.text }}</template>
              <template v-else>
                <div class="sap-text sap-markdown">
                  <VueMarkdown :source="msg.text" />
                </div>
                <!-- 工具调用追踪 -->
                <div v-if="msg.toolCalls && msg.toolCalls.length > 0" class="sap-tool-trace">
                  <div
                    v-for="(tc, j) in msg.toolCalls"
                    :key="j"
                    class="sap-tool-call"
                    :class="tc.success ? 'success' : 'error'"
                  >
                    <span class="sap-tool-icon">{{ tc.success ? '✅' : '❌' }}</span>
                    <span class="sap-tool-action">{{ tc.action }}#{{ tc.id }}</span>
                    <pre v-if="tc.detail" class="sap-tool-detail">{{ tc.detail }}</pre>
                  </div>
                </div>
              </template>
            </div>
          </div>
          <!-- 流式输出 -->
          <div v-if="loading" class="sap-message assistant">
            <div class="sap-message-content sap-streaming">
              <div v-if="phaseMessage" class="sap-phase-badge">{{ phaseMessage }}</div>
              <div v-if="streamingText" class="sap-stream-text sap-markdown">
                <VueMarkdown :source="streamingText" />
              </div>
              <div v-else class="sap-loading">
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              </div>
            </div>
          </div>
        </div>

        <div class="sap-panel-footer">
          <textarea
            v-model="prompt"
            class="sap-input"
            placeholder="描述你想让 AI 执行的操作..."
            rows="2"
            :disabled="loading"
            @keydown.enter.ctrl="handleSend"
            @keydown.enter.meta="handleSend"
          ></textarea>
          <div class="sap-actions">
            <button v-if="loading" class="sap-cancel-btn" @click="handleCancel">
              ⏹ 取消
            </button>
            <button class="sap-send-btn" :disabled="loading || !prompt.trim()" @click="handleSend">
              {{ loading ? '执行中...' : '发送' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, onActivated, onDeactivated } from 'vue'
import VueMarkdown from 'vue-markdown-render'
import { createAuthHeaders } from '@/services/http'

const SAP_PANEL_OWNER_KEY = '__SPARK_SAP_PANEL_OWNER__'
const panelInstanceId = `sap-panel-${Date.now()}-${Math.random().toString(36).slice(2)}`
const isOwner = ref(false)

function claimPanelOwnership(): void {
  const globalWindow = window as unknown as Record<string, unknown>
  globalWindow[SAP_PANEL_OWNER_KEY] = panelInstanceId
  isOwner.value = true
}

function releasePanelOwnership(): void {
  const globalWindow = window as unknown as Record<string, unknown>
  if (globalWindow[SAP_PANEL_OWNER_KEY] === panelInstanceId) {
    globalWindow[SAP_PANEL_OWNER_KEY] = null
  }
  isOwner.value = false
}

// ── 常量 ──────────────────────────────────────────────────────────────────

/** 最大前端 Tool Loop 回合数（防止无限循环） */
const MAX_TOOL_ROUNDS = 5

/** SAP 系统提示词 — 指导 LLM 输出 SAP/1.0 协议块 */
const SAP_SYSTEM_PROMPT = `你是一个 SAP 工具助手，拥有以下能力：

1. file.write — 写入文件到沙箱目录
   协议格式：
   @@tool:file.write#<requestId>
   {"path":"<相对路径>","content":"<文件内容>","append":false}
   @@end

2. db.query — 执行只读 SQL 查询
   协议格式：
   @@tool:db.query#<requestId>
   {"sql":"SELECT ...","limit":10}
   @@end

使用规则：
- 每次回复中可以包含 0~N 个工具调用块
- requestId 使用 req-1, req-2 等递增编号
- 如果不需要调用工具，直接用自然语言回复即可
- 收到工具执行结果后，请用自然语言总结执行情况给用户
- 不要在同一次回复中既调用工具又做最终总结，先调工具等结果`

// ── 类型 ──────────────────────────────────────────────────────────────────

interface ToolCallInfo {
  action: string
  id: string
  success: boolean
  detail?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCallInfo[]
}

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// ── 响应式状态 ─────────────────────────────────────────────────────────────

const isOpen = ref(false)
const loading = ref(false)
const prompt = ref('')
const messages = ref<ChatMessage[]>([])
const messagesRef = ref<HTMLElement>()
const streamingText = ref('')
const phaseMessage = ref('')
const statusClass = ref('')
const statusText = ref('就绪')

/** 取消控制 */
let _abortController: AbortController | null = null
let _abortRequested = false

onMounted(() => {
  claimPanelOwnership()
})

onActivated(() => {
  claimPanelOwnership()
})

onDeactivated(() => {
  releasePanelOwnership()
})

onUnmounted(() => {
  releasePanelOwnership()
  _abortController?.abort()
})

// ── 工具函数 ───────────────────────────────────────────────────────────────

function togglePanel() {
  isOpen.value = !isOpen.value
}

function updateStatus(s: 'idle' | 'generating' | 'success' | 'error') {
  statusClass.value = s
  statusText.value = { idle: '就绪', generating: '执行中...', success: '完成', error: '失败' }[s]
}

function scrollToBottom() {
  void nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

// ── SAP 协议检测与提取 ─────────────────────────────────────────────────────

const SAP_BLOCK_RE = /@@(\w+):([\w.]+)#([\w-]+)\n([\s\S]*?)\n@@end/g

/** 检测文本中是否包含 SAP 协议块 */
function containsSapBlock(text: string): boolean {
  SAP_BLOCK_RE.lastIndex = 0
  return SAP_BLOCK_RE.test(text)
}

interface SapBlock {
  raw: string
  type: string
  action: string
  id: string
  body: string
}

/** 提取所有 SAP 协议块 */
function extractSapBlocks(text: string): SapBlock[] {
  const blocks: SapBlock[] = []
  SAP_BLOCK_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = SAP_BLOCK_RE.exec(text)) !== null) {
    blocks.push({
      raw: match[0],
      type: match[1] ?? '',
      action: match[2] ?? '',
      id: match[3] ?? '',
      body: match[4] ?? '',
    })
  }
  return blocks
}

// ── SSE 流式调用 LLM ───────────────────────────────────────────────────────

/**
 * 调用后端通用 SSE 流式端点（/api/ai/chat/stream）。
 * 返回 AI 完整回复文本。
 */
async function streamLlmCall(
  conversationMessages: ConversationMessage[],
  signal: AbortSignal,
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...createAuthHeaders(),
  }

  const response = await fetch('/api/ai/chat/stream', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages: conversationMessages.map(m => ({ role: m.role, content: m.content })),
      mode: 'multi',
      systemPrompt: SAP_SYSTEM_PROMPT,
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`SSE 请求失败: ${response.status} ${response.statusText}`)
  }

  // 消费 SSE 流，累积完整文本
  const reader = response.body?.getReader()
  if (!reader) throw new Error('响应体不可读')

  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let currentEvent = 'message'
  let currentData = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line === '' || line === '\r') {
          // 空行 → 分发事件
          if (currentData) {
            try {
              const parsed = JSON.parse(currentData) as Record<string, unknown>
              if (currentEvent === 'delta' && typeof parsed['delta'] === 'string') {
                const delta = parsed['delta']
                fullText += delta
                streamingText.value += delta
                scrollToBottom()
              } else if (currentEvent === 'reasoning' && typeof parsed['reasoning'] === 'string') {
                streamingText.value += parsed['reasoning']
                scrollToBottom()
              } else if (currentEvent === 'error' && typeof parsed['error'] === 'string') {
                throw new Error(parsed['error'])
              }
            } catch (e) {
              if (e instanceof SyntaxError) { /* 跳过非 JSON */ }
              else throw e
            }
          }
          currentEvent = 'message'
          currentData = ''
        } else if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') continue
          currentData = currentData ? `${currentData}\n${payload}` : payload
        }
      }
    }
    // 残余
    if (currentData) {
      try {
        const parsed = JSON.parse(currentData) as Record<string, unknown>
        if (currentEvent === 'delta' && typeof parsed['delta'] === 'string') {
          fullText += parsed['delta']
        }
      } catch { /* skip */ }
    }
  } finally {
    reader.releaseLock()
  }

  return fullText
}

// ── 执行 SAP 协议块 ────────────────────────────────────────────────────────

/**
 * 将 SAP 协议文本发送到后端 /api/sap/execute，返回结果文本。
 */
async function executeSapProtocol(sapText: string): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'text/plain',
    ...createAuthHeaders(),
  }

  const response = await fetch('/api/sap/execute', {
    method: 'POST',
    headers,
    body: sapText,
  })

  if (!response.ok) {
    throw new Error(`工具执行失败: ${response.status}`)
  }

  const json = await response.json() as { result?: string; error?: string }
  if (json.error) throw new Error(json.error)
  return json.result ?? ''
}

// ── 核心：前端 Tool Loop ──────────────────────────────────────────────────

async function handleSend() {
  const text = prompt.value.trim()
  if (!text || loading.value) return

  messages.value.push({ role: 'user', text })
  prompt.value = ''
  loading.value = true
  _abortRequested = false
  _abortController = new AbortController()
  updateStatus('generating')
  scrollToBottom()

  // 构建对话历史（包含所有消息）
  const conversation: ConversationMessage[] = messages.value.map(m => ({
    role: m.role,
    content: m.text,
  }))

  try {
    let round = 0

    while (round < MAX_TOOL_ROUNDS) {
      if (_abortRequested) break
      round++

      // ── Step 1: 流式调用 LLM ──
      streamingText.value = ''
      phaseMessage.value = round > 1 ? `第 ${round} 轮工具调用` : ''
      scrollToBottom()

      const aiReply = await streamLlmCall(conversation, _abortController.signal)
      streamingText.value = ''

      if (_abortRequested) break

      // ── Step 2: 检测是否包含 SAP 协议块 ──
      if (!containsSapBlock(aiReply)) {
        // 无工具调用 → 最终回复，退出循环
        messages.value.push({ role: 'assistant', text: aiReply })
        conversation.push({ role: 'assistant', content: aiReply })
        scrollToBottom()
        break
      }

      // ── Step 3: 提取并执行工具调用 ──
      const blocks = extractSapBlocks(aiReply)
      const toolCalls: ToolCallInfo[] = []
      const resultParts: string[] = []

      // 显示 AI 回复（含协议块）
      phaseMessage.value = `正在执行 ${blocks.length} 个工具调用...`

      for (const block of blocks) {
        try {
          const result = await executeSapProtocol(block.raw)
          toolCalls.push({
            action: block.action,
            id: block.id,
            success: true,
            detail: truncateResult(result),
          })
          resultParts.push(`[${block.action}#${block.id}] 成功:\n${result}`)
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          toolCalls.push({
            action: block.action,
            id: block.id,
            success: false,
            detail: errMsg,
          })
          resultParts.push(`[${block.action}#${block.id}] 失败: ${errMsg}`)
        }
      }

      // 将 AI 回复（含工具调用追踪）加入消息列表
      // 将非协议文本部分提取为展示文本
      const displayText = aiReply.replace(SAP_BLOCK_RE, '').trim() || `调用了 ${blocks.length} 个工具`
      messages.value.push({
        role: 'assistant',
        text: displayText,
        toolCalls,
      })
      scrollToBottom()

      // ── Step 4: 将结果拼回对话，让 AI 继续 ──
      conversation.push({ role: 'assistant', content: aiReply })
      conversation.push({
        role: 'user',
        content: `工具执行结果：\n${resultParts.join('\n\n')}\n\n请根据以上结果回复用户。`,
      })
    }

    if (round >= MAX_TOOL_ROUNDS && !_abortRequested) {
      messages.value.push({
        role: 'assistant',
        text: `⚠️ 已达最大工具调用轮数 (${MAX_TOOL_ROUNDS})，循环终止。`,
      })
    }

    updateStatus('success')
  } catch (err) {
    if (_abortRequested) {
      messages.value.push({ role: 'assistant', text: '⏹ 用户已取消操作' })
    } else {
      const msg = err instanceof Error ? err.message : String(err)
      messages.value.push({ role: 'assistant', text: `❌ 执行失败: ${msg}` })
    }
    updateStatus(_abortRequested ? 'idle' : 'error')
  } finally {
    loading.value = false
    _abortController = null
    phaseMessage.value = ''
    scrollToBottom()
  }
}

function handleCancel() {
  _abortRequested = true
  _abortController?.abort()
}

/** 截断过长的结果文本 */
function truncateResult(text: string, max = 500): string {
  return text.length > max ? `${text.slice(0, max)}... (共 ${text.length} 字符)` : text
}
</script>

<style scoped>
/* ── 浮动按钮 ─────────────────────────────────────────────────────────── */
.sap-chat-wrapper {
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 9998;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.sap-fab {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #34d399 0%, #059669 100%);
  color: #fff;
  font-size: 22px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(5, 150, 105, 0.4);
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sap-fab:hover { transform: scale(1.1); }
.sap-fab.active {
  background: linear-gradient(135deg, #6b7280 0%, #374151 100%);
  box-shadow: 0 4px 14px rgba(55, 65, 81, 0.4);
}

/* ── 面板 ─────────────────────────────────────────────────────────────── */
.sap-panel {
  position: fixed;
  bottom: 80px;
  left: 20px;
  width: 440px;
  max-height: 70vh;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sap-panel-header {
  padding: 14px 18px;
  background: linear-gradient(135deg, #34d399 0%, #059669 100%);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sap-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
}
.sap-status.generating { background: rgba(255, 193, 7, 0.3); }
.sap-status.success { background: rgba(76, 175, 80, 0.3); }
.sap-status.error { background: rgba(244, 67, 54, 0.3); }

/* ── 消息体 ───────────────────────────────────────────────────────────── */
.sap-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  min-height: 200px;
  max-height: 50vh;
}

.sap-empty {
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
  padding: 40px 16px;
  line-height: 1.8;
}

.sap-message {
  margin-bottom: 12px;
  display: flex;
}
.sap-message.user { justify-content: flex-end; }
.sap-message.assistant { justify-content: flex-start; }

.sap-message-content {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}
.sap-message.user .sap-message-content {
  background: #059669;
  color: #fff;
  border-bottom-right-radius: 4px;
}
.sap-message.assistant .sap-message-content {
  background: #f3f4f6;
  color: #1f2937;
  border-bottom-left-radius: 4px;
}

/* ── 工具调用追踪 ─────────────────────────────────────────────────────── */
.sap-tool-trace {
  margin-top: 8px;
  border-top: 1px solid #e5e7eb;
  padding-top: 8px;
}

.sap-tool-call {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 4px 8px;
  margin-bottom: 4px;
  border-radius: 6px;
  font-size: 12px;
}
.sap-tool-call.success { background: #ecfdf5; }
.sap-tool-call.error { background: #fef2f2; }

.sap-tool-icon { flex-shrink: 0; }
.sap-tool-action {
  font-weight: 600;
  font-family: 'Fira Code', 'Cascadia Code', monospace;
  white-space: nowrap;
}
.sap-tool-detail {
  margin: 4px 0 0 0;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 4px;
  font-size: 11px;
  max-height: 100px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: 'Fira Code', 'Cascadia Code', monospace;
}

/* ── 流式输出 ─────────────────────────────────────────────────────────── */
.sap-streaming {
  background: #f0fdf4 !important;
}

.sap-phase-badge {
  font-size: 11px;
  color: #059669;
  font-weight: 600;
  margin-bottom: 4px;
}

.sap-stream-text { font-size: 13px; }

.sap-loading {
  display: flex;
  gap: 4px;
  padding: 4px 0;
}
.sap-loading .dot {
  width: 8px;
  height: 8px;
  background: #34d399;
  border-radius: 50%;
  animation: sap-bounce 1.4s infinite ease-in-out both;
}
.sap-loading .dot:nth-child(1) { animation-delay: -0.32s; }
.sap-loading .dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes sap-bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

/* ── 底部输入 ─────────────────────────────────────────────────────────── */
.sap-panel-footer {
  padding: 12px;
  border-top: 1px solid #e5e7eb;
  background: #fafafa;
}

.sap-input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  resize: none;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
  font-family: inherit;
}
.sap-input:focus { border-color: #059669; }
.sap-input:disabled { background: #f3f4f6; }

.sap-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.sap-send-btn,
.sap-cancel-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.sap-send-btn {
  background: linear-gradient(135deg, #34d399 0%, #059669 100%);
  color: #fff;
}
.sap-send-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3); }
.sap-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.sap-cancel-btn {
  background: #fee2e2;
  color: #dc2626;
}
.sap-cancel-btn:hover { background: #fecaca; }

/* ── Markdown 样式 ────────────────────────────────────────────────────── */
.sap-markdown :deep(p) { margin: 0 0 8px; }
.sap-markdown :deep(p:last-child) { margin-bottom: 0; }
.sap-markdown :deep(code) {
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
  font-family: 'Fira Code', 'Cascadia Code', monospace;
}
.sap-markdown :deep(pre) {
  background: #1e293b;
  color: #e2e8f0;
  padding: 10px 12px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 12px;
  margin: 8px 0;
}
.sap-markdown :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
}

/* ── 动画 ─────────────────────────────────────────────────────────────── */
.sap-slide-enter-active,
.sap-slide-leave-active {
  transition: all 0.3s ease;
}
.sap-slide-enter-from,
.sap-slide-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}
</style>
