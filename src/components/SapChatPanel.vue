<template>
  <div v-if="canRenderWrapper" :class="props.embedded ? 'sap-chat-embedded' : 'sap-chat-wrapper'">
    <!-- 浮动触发按钮 -->
    <button v-if="!props.embedded" class="sap-fab" :class="{ active: isOpen }" @click="togglePanel" title="SAP 工具助手">
      <span v-if="!isOpen">🔧</span>
      <span v-else>✕</span>
    </button>

    <!-- 聊天面板 -->
    <Transition name="sap-slide">
      <div v-if="panelVisible" class="sap-panel" :class="{ embedded: props.embedded }">
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
                <!-- 交互式确认问题 -->
                <div v-if="msg.uiConfirm" class="sap-ui-confirm">
                  <div class="sap-ui-confirm-title">{{ msg.uiConfirm.title || '需求确认' }}</div>
                  <div v-for="q in msg.uiConfirm.questions" :key="q.id" class="sap-ui-question">
                    <div class="sap-ui-question-text">{{ q.text }}</div>
                    <div class="sap-ui-options">
                      <template v-if="q.type === 'single'">
                        <label v-for="opt in q.options" :key="opt.key" class="sap-ui-option">
                          <input
                            type="radio"
                            :name="`q-${i}-${q.id}`"
                            :value="opt.key"
                            :checked="(msg.uiConfirm?.answers[q.id] ?? [])[0] === opt.key"
                            :disabled="msg.uiConfirm?.submitted"
                            @change="setAnswer(i, q.id, opt.key)"
                          />
                          <span class="sap-ui-option-key">{{ opt.key }}</span>
                          <span>{{ opt.label }}</span>
                          <span v-if="opt.description" class="sap-ui-option-desc">{{ opt.description }}</span>
                        </label>
                      </template>
                      <template v-else>
                        <label v-for="opt in q.options" :key="opt.key" class="sap-ui-option">
                          <input
                            type="checkbox"
                            :checked="(msg.uiConfirm?.answers[q.id] ?? []).includes(opt.key)"
                            :disabled="msg.uiConfirm?.submitted"
                            @change="toggleAnswer(i, q.id, opt.key)"
                          />
                          <span class="sap-ui-option-key">{{ opt.key }}</span>
                          <span>{{ opt.label }}</span>
                          <span v-if="opt.description" class="sap-ui-option-desc">{{ opt.description }}</span>
                        </label>
                      </template>
                    </div>
                  </div>
                  <button
                    v-if="!msg.uiConfirm.submitted"
                    class="sap-ui-submit"
                    :disabled="!isConfirmReady(i) || loading"
                    @click="submitConfirm(i)"
                  >
                    提交确认
                  </button>
                  <div v-else class="sap-ui-submitted">✅ 已提交</div>
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
import { ref, nextTick, onUnmounted, computed } from 'vue'
import VueMarkdown from 'vue-markdown-render'
import { createAuthHeaders } from '@/services/http'
import { useFloatingPanelOwner } from '@/composables/useFloatingPanelOwner'
import { streamAiChatText } from '@/services/ai-protocol'
import { extractSapProtocolBlocks, stripSapProtocolBlocks } from '@/services/sap-protocol'
import { registerAllStills, createSession, executeStill, extractUiConfirmBlocks, stripUiBlocks } from '@spark-view/spark-ai'
import type { UiConfirmPayload } from '@spark-view/spark-ai'

const props = withDefaults(defineProps<{ embedded?: boolean; forceOpen?: boolean; mode?: 'sap' | 'stills' }>(), {
  embedded: false,
  forceOpen: false,
  mode: 'sap',
})
const { isOwner } = useFloatingPanelOwner('__SPARK_SAP_PANEL_OWNER__')

// ── 常量 ──────────────────────────────────────────────────────────────────

/** 最大前端 SAP 协议回合数（防止无限循环） */
const MAX_TOOL_ROUNDS = 5

/** 通用 SAP 系统提示词 — 指导 LLM 输出 SAP/1.0 协议块 */
const SAP_SYSTEM_PROMPT = `你是一个 SAP/1.0 协议助手，拥有以下能力：

1. file.write — 写入文件到沙箱目录
  发起请求时必须输出：
  @@request:file.write#<requestId>
   {"path":"<相对路径>","content":"<文件内容>","append":false}
   @@end

2. db.query — 执行只读 SQL 查询
  发起请求时必须输出：
  @@request:db.query#<requestId>
   {"sql":"SELECT ...","limit":10}
   @@end

3. system.capabilities — 查看当前可用动作
  查询能力时必须输出：
  @@describe:system.capabilities#<requestId>
  {}
  @@end

使用规则：
- 每次回复中最多只能包含 1 个 SAP 协议块
- 如果需要多个动作，必须等待上一轮执行结果返回后再决定下一步
- 发起真实操作只能使用 request 类型
- 查看能力只能使用 describe:system.capabilities
- requestId 使用 req-1, req-2 等递增编号
- type 仅允许 request / describe
- 如果不需要调用工具，直接用自然语言回复即可
- 收到工具执行结果后，请用自然语言总结执行情况给用户
- 不要在同一次回复中既调用工具又做最终总结，先调工具等结果`

/** Stills 系统提示词 — 与 STILLS_RUNTIME_PROMPT.md 内容保持一致 */
const STILLS_SYSTEM_PROMPT = `你通过 SAP/1.0 协议与 Stills 引擎交互。

══ 协议语法 ══

  @@<type>:<action>#<id>
  <JSON>
  @@end

type：describe（查询）/ request（执行）。
系统返回 @@result（成功）或 @@error（失败，含 code + msg + fix）。
一轮只能发一个协议块。

══ 发现优先 ══

你的角色、目标、可用动作、参数格式、守卫条件——全部由引擎动态提供：

  session.describe      → 当前角色 + 状态 + 推荐下一步
  stills.capabilities   → 全部动作目录（params / example / guard）
  stills.actionSpec     → 单个动作详细规格

**以上三个发现动作是唯一真实来源。不假设任何动作名或参数格式。**

══ 执行纪律 ══

1. 首轮必须 @@describe:session.describe —— 获取角色与状态
2. 首次执行前必须 @@describe:stills.capabilities —— 获取全部动作规格
3. 参数格式以 stills.capabilities 返回值为准
4. 一轮最多一个协议块
5. 引擎有状态守卫，违反时返回 @@error + fix
6. @@error 的 fix 字段是必读输入，不允许忽略
7. 连续 2 次同一错误 → 向用户请求澄清
8. 口头声明不算数 —— 只有收到 @@result 的变更才存在

══ 蓝图纪律 ══

引擎支持蓝图工作流（blueprint）。当 session.describe 指示需要蓝图时：
- 先创建 blueprint，再执行写动作
- blueprint 管步骤，不存业务数据
- 不确定的项放 openQuestions
- 不替用户决定关键业务事实 —— 必须确认后再执行`

/** 根据当前模式选择系统提示词 */
const activeSystemPrompt = computed(() =>
  props.mode === 'stills' ? STILLS_SYSTEM_PROMPT : SAP_SYSTEM_PROMPT,
)

// ── Stills 引擎（仅 stills 模式使用，前端本地执行）─────────────────────

let _stillsSession: ReturnType<typeof createSession> | null = null

function getOrCreateStillsSession() {
  if (_stillsSession === null) {
    registerAllStills()
    _stillsSession = createSession()
  }
  return _stillsSession
}

/**
 * 在本地 Stills 引擎中执行 SAP 协议块，返回 @@result / @@error 文本。
 */
function executeStillsLocal(block: { type: string; action: string; id: string; body: unknown }): string {
  const session = getOrCreateStillsSession()
  const result = executeStill(block.action, block.body, session, block.id)
  if (result.ok) {
    return `@@result:${block.action}#${block.id}\n${JSON.stringify(result.data)}\n@@end`
  }
  return `@@error:${block.action}#${block.id}\n${JSON.stringify({ code: result.code, msg: result.msg, fix: result.fix })}\n@@end`
}

// ── 类型 ──────────────────────────────────────────────────────────────────

interface ToolCallInfo {
  action: string
  id: string
  success: boolean
  detail?: string
}

interface UiConfirmState extends UiConfirmPayload {
  answers: Record<string, string[]>
  submitted: boolean
}

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCallInfo[]
  uiConfirm?: UiConfirmState
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
const panelVisible = computed(() => (props.embedded ? props.forceOpen : isOpen.value))
const canRenderWrapper = computed(() => (props.embedded ? true : isOwner.value))

/** 取消控制 */
let _abortController: AbortController | null = null
let _abortRequested = false

onUnmounted(() => {
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

// ── SAP 协议检测与提取（由统一协议服务提供）───────────────────────────────

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

function getSapExecutionKind(result: string): 'result' | 'error' | 'unknown' {
  if (result.includes('@@result:')) return 'result'
  if (result.includes('@@error:')) return 'error'
  return 'unknown'
}

// ── 核心：前端 SAP 协议回路 ────────────────────────────────────────────────

async function handleSend() {
  const text = prompt.value.trim()
  if (!text || loading.value) return

  messages.value.push({ role: 'user', text })
  prompt.value = ''
  await runConversation()
}

// ── UI 确认交互 ─────────────────────────────────────────────────────────────

function setAnswer(msgIdx: number, questionId: string, key: string) {
  const confirm = messages.value[msgIdx]?.uiConfirm
  if (confirm && !confirm.submitted) {
    confirm.answers[questionId] = [key]
  }
}

function toggleAnswer(msgIdx: number, questionId: string, key: string) {
  const confirm = messages.value[msgIdx]?.uiConfirm
  if (!confirm || confirm.submitted) return
  const current = confirm.answers[questionId] ?? []
  if (current.includes(key)) {
    confirm.answers[questionId] = current.filter(k => k !== key)
  } else {
    confirm.answers[questionId] = [...current, key]
  }
}

function isConfirmReady(msgIdx: number): boolean {
  const confirm = messages.value[msgIdx]?.uiConfirm
  if (!confirm) return false
  return confirm.questions.every(q => {
    const ans = confirm.answers[q.id]
    return ans !== undefined && ans.length > 0
  })
}

function formatConfirmAnswers(confirm: UiConfirmState): string {
  const lines = confirm.questions.map(q => {
    const selected = confirm.answers[q.id] ?? []
    const labels = selected.map(k => {
      const opt = q.options.find(o => o.key === k)
      return opt ? `${k}. ${opt.label}` : k
    })
    return `${q.text}\n  → ${labels.join(', ')}`
  })
  return `[需求确认回答]\n\n${lines.join('\n\n')}`
}

async function submitConfirm(msgIdx: number) {
  const confirm = messages.value[msgIdx]?.uiConfirm
  if (!confirm || confirm.submitted || loading.value) return
  confirm.submitted = true

  const answerText = formatConfirmAnswers(confirm)
  messages.value.push({ role: 'user', text: answerText })
  scrollToBottom()
  await runConversation()
}

// ── 核心：前端 SAP 协议回路 ────────────────────────────────────────────────

async function runConversation() {
  loading.value = true
  _abortRequested = false
  _abortController = new AbortController()
  updateStatus('generating')
  scrollToBottom()

  // 构建对话历史（包含所有消息）
  const conversation = messages.value.map(m => ({
    role: m.role,
    content: m.text,
  })) as Array<{ role: 'user' | 'assistant'; content: string }>

  try {
    let round = 0

    while (round < MAX_TOOL_ROUNDS) {
      if (_abortRequested) break
      round++

      // ── Step 1: 流式调用 LLM ──
      streamingText.value = ''
      phaseMessage.value = round > 1 ? `第 ${round} 轮 SAP 协议执行` : ''
      scrollToBottom()

      const aiReply = await streamAiChatText({
        messages: conversation,
        mode: 'multi',
        systemPrompt: activeSystemPrompt.value,
        signal: _abortController.signal,
        onDelta: (delta) => {
          streamingText.value += delta
          scrollToBottom()
        },
        onReasoning: (reasoning) => {
          streamingText.value += reasoning
          scrollToBottom()
        },
      })
      streamingText.value = ''

      if (_abortRequested) break

      // ── Step 2: 检测是否包含 SAP 协议块 ──
      const extraction = extractSapProtocolBlocks(aiReply)
      if (extraction.kind === 'none') {
        // 检测 @@ui:confirm-questions 交互块
        const confirmPayloads = extractUiConfirmBlocks(aiReply)
        const displayText = stripUiBlocks(stripSapProtocolBlocks(aiReply)) || aiReply
        if (confirmPayloads.length > 0 && confirmPayloads[0] !== undefined) {
          const payload = confirmPayloads[0]
          messages.value.push({
            role: 'assistant',
            text: displayText,
            uiConfirm: { ...payload, answers: {}, submitted: false },
          })
          conversation.push({ role: 'assistant', content: aiReply })
          scrollToBottom()
          // 等待用户通过 submitConfirm 提交后恢复对话
          break
        }
        // 无工具调用、无 UI 块 → 最终回复
        messages.value.push({ role: 'assistant', text: displayText })
        conversation.push({ role: 'assistant', content: aiReply })
        scrollToBottom()
        break
      }

      if (extraction.kind === 'multiple') {
        messages.value.push({
          role: 'assistant',
          text: '⚠️ SAP 协议错误：一次只允许输出 1 个 request/describe 协议块，已要求模型重试。',
        })
        conversation.push({ role: 'assistant', content: aiReply })
        conversation.push({
          role: 'user',
          content: '[系统协议错误]\n一次只允许输出 1 个 SAP 协议块。请只输出一个 @@request:<action>#<id> 或 @@describe:system.capabilities#<id>，或者直接用自然语言回答。',
        })
        scrollToBottom()
        continue
      }

      const [block] = extraction.blocks
      if (block === undefined) {
        throw new Error('SAP 协议提取失败：缺少协议块')
      }

      // ── Step 3: 执行单个 SAP 协议块 ──
      const toolCalls: ToolCallInfo[] = []

      // 显示 AI 回复（含协议块）
      phaseMessage.value = `正在执行 SAP 协议请求 ${block.action}#${block.id}...`

      // Stills 模式 → 本地引擎执行；通用模式 → 后端执行
      const executionResult = props.mode === 'stills'
        ? executeStillsLocal(block)
        : await executeSapProtocol(block.raw)
      const executionKind = getSapExecutionKind(executionResult)
      if (executionKind === 'unknown') {
        throw new Error('SAP 执行返回了未知协议结果')
      }

      toolCalls.push({
        action: block.action,
        id: block.id,
        success: executionKind === 'result',
        detail: truncateResult(executionResult),
      })

      // 将 AI 回复（含工具调用追踪）加入消息列表
      // 将非协议文本部分提取为展示文本
      const displayText = stripSapProtocolBlocks(aiReply) || `调用了 SAP 协议请求 ${block.action}#${block.id}`
      messages.value.push({
        role: 'assistant',
        text: displayText,
        toolCalls,
      })
      scrollToBottom()

      // ── Step 4: 将结果拼回对话，让 AI 继续 ──
      conversation.push({ role: 'assistant', content: aiReply })

      if (executionKind === 'result') {
        conversation.push({
          role: 'user',
          content: `[系统工具执行结果]\n${executionResult}\n\n请根据以上结果回复用户。`,
        })

        phaseMessage.value = '正在生成执行总结...'
        streamingText.value = ''
        scrollToBottom()

        const finalAnswer = await streamAiChatText({
          messages: conversation,
          mode: 'multi',
          systemPrompt: activeSystemPrompt.value,
          signal: _abortController.signal,
          onDelta: (delta) => {
            streamingText.value += delta
            scrollToBottom()
          },
          onReasoning: (reasoning) => {
            streamingText.value += reasoning
            scrollToBottom()
          },
        })
        streamingText.value = ''

        if (_abortRequested) break

        messages.value.push({ role: 'assistant', text: finalAnswer })
        conversation.push({ role: 'assistant', content: finalAnswer })
        scrollToBottom()
        break
      }

      conversation.push({
        role: 'user',
        content: `[系统工具执行结果]\n${executionResult}\n\n如果上面是 @@error，请根据其中的 msg 和 fix 修正参数，并且只输出一个 SAP 协议块。`,
      })
    }

    if (round >= MAX_TOOL_ROUNDS && !_abortRequested) {
      messages.value.push({
        role: 'assistant',
        text: `⚠️ 已达最大 SAP 协议轮数 (${MAX_TOOL_ROUNDS})，循环终止。`,
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

.sap-chat-embedded {
  position: relative;
  width: 100%;
  height: 100%;
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

.sap-panel.embedded {
  position: relative;
  bottom: auto;
  left: auto;
  width: 100%;
  max-height: none;
  height: 100%;
  border-radius: 0;
  box-shadow: none;
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

/* ── UI 确认交互 ──────────────────────────────────────────────────────── */
.sap-ui-confirm {
  margin-top: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  background: #fafbfc;
}
.sap-ui-confirm-title {
  font-weight: 600;
  font-size: 13px;
  color: #1f2937;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e5e7eb;
}
.sap-ui-question {
  margin-bottom: 12px;
}
.sap-ui-question:last-child {
  margin-bottom: 0;
}
.sap-ui-question-text {
  font-size: 12.5px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 6px;
}
.sap-ui-options {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-left: 4px;
}
.sap-ui-option {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background 0.15s;
}
.sap-ui-option:hover {
  background: #f3f4f6;
}
.sap-ui-option input {
  margin: 0;
  flex-shrink: 0;
}
.sap-ui-option-key {
  font-weight: 600;
  color: #6b7280;
  min-width: 16px;
}
.sap-ui-option-desc {
  color: #9ca3af;
  font-size: 11px;
}
.sap-ui-submit {
  margin-top: 10px;
  padding: 6px 16px;
  background: linear-gradient(135deg, #34d399 0%, #059669 100%);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.sap-ui-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.sap-ui-submit:hover:not(:disabled) {
  opacity: 0.9;
}
.sap-ui-submitted {
  margin-top: 8px;
  font-size: 12px;
  color: #059669;
  font-weight: 500;
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
