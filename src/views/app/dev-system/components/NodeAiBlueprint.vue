<template>
  <div v-if="showSection" class="ai-blueprint">
    <el-divider content-position="left">
      <span class="divider-title">
        <NavIcon name="Cpu" :size="14" /> AI 智能助手
      </span>
    </el-divider>

    <!-- 页面型节点：AI 页面设计 -->
    <template v-if="isDesignableNode">
      <div class="ai-blueprint__context">
        <span class="context-label">AI 上下文：</span>
        <span v-if="state.editForm.description" class="context-text">{{ state.editForm.description }}</span>
        <span v-else class="context-empty">（在上方「描述」栏填写内容可增强 AI 生成质量）</span>
      </div>

      <el-input
        v-model="aiPrompt"
        type="textarea"
        :rows="3"
        :placeholder="promptPlaceholder"
        :disabled="pageLoading"
      />

      <div class="ai-blueprint__actions">
        <el-button
          type="primary"
          size="small"
          :loading="pageLoading"
          :disabled="!canGenerate"
          @click="handleGenerate"
        >
          <NavIcon name="Cpu" :size="13" /> AI 生成页面
        </el-button>
        <el-button
          v-if="hasExistingPage"
          type="warning"
          size="small"
          :loading="pageLoading"
          @click="handleIterate"
        >
          <NavIcon name="RefreshRight" :size="13" /> AI 迭代
        </el-button>
        <el-button
          v-if="!hasExistingPage && derivedPageId"
          size="small"
          @click="$emit('createPage')"
        >
          <NavIcon name="Plus" :size="13" /> 创建空白页
        </el-button>
      </div>

      <!-- 页面状态 -->
      <div class="ai-blueprint__status">
        <el-tag v-if="hasExistingPage" type="success" size="small">
          <NavIcon name="SuccessFilled" :size="12" /> 页面已就绪：{{ derivedPageId }}
        </el-tag>
        <el-tag v-else-if="derivedPageId" type="warning" size="small">
          <NavIcon name="WarningFilled" :size="12" /> 页面未创建：{{ derivedPageId }}
        </el-tag>
        <el-tag v-else type="info" size="small">
          <NavIcon name="InfoFilled" :size="12" /> 请先选择目标路由或页面
        </el-tag>
      </div>
    </template>

    <!-- AI 导航策划按钮（所有节点类型展示） -->
    <div class="ai-blueprint__nav-planner">
      <el-button
        type="success"
        size="small"
        @click="openNavPlanner"
      >
        <NavIcon name="Guide" :size="13" /> AI 导航策划
        <template v-if="planner.stats.value.addCount + planner.stats.value.deleteCount > 0">
          （{{ planner.stats.value.addCount + planner.stats.value.deleteCount }} 个变更）
        </template>
      </el-button>
      <span v-if="planner.phase.value !== 'idle'" class="planner-phase-hint">
        <el-tag size="small" :type="plannerPhaseTagType">{{ plannerPhaseLabel }}</el-tag>
      </span>
    </div>

    <!-- ═══ 导航策划抽屉 ═══ -->
    <el-drawer
      v-model="drawerVisible"
      direction="rtl"
      size="72%"
      :show-close="false"
      :close-on-click-modal="false"
      :close-on-press-escape="true"
      :destroy-on-close="false"
      class="nav-planner-drawer"
    >
      <template #header>
        <div class="planner-header">
          <span class="planner-title">🧭 AI 导航策划</span>
          <span v-if="planner.target.value" class="planner-target">
            🔒 {{ planner.target.value.nodeTitle }}
          </span>
          <!-- 模式切换 -->
          <div class="planner-mode-switch">
            <el-radio-group v-model="planner.mode.value" size="small">
              <el-radio-button value="current-node">当前节点</el-radio-button>
              <el-radio-button value="global">全局</el-radio-button>
            </el-radio-group>
          </div>
          <button class="planner-close" title="关闭" @click="drawerVisible = false">✕</button>
        </div>
      </template>

      <div class="planner-layout">
        <!-- ── 左侧：聊天区域 ─── -->
        <div class="planner-chat">
          <div ref="messagesRef" class="chat-messages">
            <!-- 引导文字 -->
            <div v-if="chatMessages.length === 0" class="chat-empty">
              <div class="empty-icon"><NavIcon name="Guide" :size="32" /></div>
              <p><b>AI 导航策划模式</b></p>
              <p>描述你的功能需求，AI 将基于当前导航树建议新增/删除节点。</p>
              <p>你可以对每个建议 <b>采纳</b>、<b>跳过</b> 或 <b>讨论</b>，确认后一键应用到导航树。</p>
            </div>

            <!-- 消息列表 -->
            <template v-for="msg in chatMessages" :key="msg.id">
              <div class="chat-message" :class="msg.role">
                <div class="msg-avatar">{{ msg.role === 'user' ? '🧑' : '🤖' }}</div>
                <div class="msg-body">
                  <!-- 推理过程 -->
                  <details v-if="msg.reasoning" class="msg-reasoning">
                    <summary>💭 思考过程</summary>
                    <div class="reasoning-content"><VueMarkdown :source="msg.reasoning" /></div>
                  </details>
                  <!-- 消息内容 -->
                  <div v-if="msg.role === 'user'" class="msg-content" v-text="msg.content" />
                  <div v-else class="msg-content msg-markdown">
                    <VueMarkdown :source="displayContent(msg)" />
                  </div>
                  <span v-if="msg.streaming" class="streaming-cursor" />
                  <!-- 内联导航建议卡片 -->
                  <div
                    v-for="s in getMessageSuggestions(msg.id)"
                    :key="s.id"
                    class="nav-suggestion-card"
                    :class="[`kind-${s.kind}`, `status-${s.status}`]"
                  >
                    <div class="ns-header">
                      <NavIcon :name="s.kind === 'add' ? 'Plus' : 'Delete'" :size="14" />
                      <span class="ns-title">{{ s.title }}</span>
                      <span v-if="s.status === 'accepted'" class="ns-badge accepted">✅ 已采纳</span>
                      <span v-else-if="s.status === 'rejected'" class="ns-badge rejected">⏭️ 已跳过</span>
                    </div>
                    <details class="ns-details">
                      <summary>查看详情</summary>
                      <pre class="ns-content"><code>{{ formatSuggestionDetail(s) }}</code></pre>
                    </details>
                    <div v-if="s.status === 'pending'" class="ns-actions">
                      <button class="btn-accept" @click="planner.acceptSuggestion(s.id)">✅ 采纳</button>
                      <button class="btn-reject" @click="planner.rejectSuggestion(s.id)">⏭️ 跳过</button>
                      <button class="btn-discuss" @click="handleDiscuss(s)">💬 讨论</button>
                    </div>
                  </div>
                  <!-- token 用量 -->
                  <div v-if="msg.usage && !msg.streaming" class="msg-usage">
                    {{ formatUsage(msg.usage) }}
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- 错误提示 -->
          <div v-if="chatError" class="chat-error">⚠️ {{ chatError }}</div>

          <!-- 输入区域 -->
          <div class="chat-input-area">
            <div class="input-row">
              <textarea
                ref="textareaRef"
                v-model="inputText"
                class="chat-textarea"
                placeholder="描述需要的功能模块或页面结构..."
                :disabled="isStreaming"
                rows="1"
                @keydown.enter.exact.prevent="handleSend"
                @input="autoResize"
              />
              <button
                class="send-btn"
                :disabled="isStreaming || inputText.trim() === ''"
                @click="handleSend"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- ── 右侧：建议侧栏 ─── -->
        <div class="planner-sidebar">
          <div class="sidebar-header">📋 变更清单</div>
          <div class="sidebar-body">
            <!-- 空状态 -->
            <div
              v-if="planner.acceptedSuggestions.value.length === 0 && planner.pendingSuggestions.value.length === 0"
              class="sidebar-empty"
            >
              <p>AI 的导航建议将在这里汇总。</p>
              <p>采纳的建议会自动归类，确认后可一键应用到导航树。</p>
            </div>

            <!-- 新增项 -->
            <div v-if="acceptedAdds.length > 0" class="decision-group">
              <div class="group-header">
                <NavIcon name="Plus" :size="14" /> 新增节点
                <span class="group-count">{{ acceptedAdds.length }}</span>
              </div>
              <div v-for="s in acceptedAdds" :key="s.id" class="decision-item">
                <span class="decision-title">{{ s.title }}</span>
                <button class="decision-revoke" title="撤回" @click="planner.revokeSuggestion(s.id)">↩</button>
              </div>
            </div>

            <!-- 删除项 -->
            <div v-if="acceptedDeletes.length > 0" class="decision-group">
              <div class="group-header">
                <NavIcon name="Delete" :size="14" /> 删除节点
                <span class="group-count">{{ acceptedDeletes.length }}</span>
              </div>
              <div v-for="s in acceptedDeletes" :key="s.id" class="decision-item delete-item">
                <span class="decision-title">{{ s.title }}</span>
                <button class="decision-revoke" title="撤回" @click="planner.revokeSuggestion(s.id)">↩</button>
              </div>
            </div>

            <!-- 待决定提示 -->
            <div v-if="planner.pendingSuggestions.value.length > 0" class="pending-hint">
              ⏳ {{ planner.pendingSuggestions.value.length }} 个建议待决定
            </div>
          </div>

          <!-- 操作面板 -->
          <div class="sidebar-footer">
            <button
              class="apply-btn"
              :disabled="!planner.hasAccepted.value || planner.phase.value === 'applying'"
              @click="handleApply"
            >
              <template v-if="planner.phase.value === 'applying'">⏳ 应用中...</template>
              <template v-else>
                🚀 应用变更
                <span v-if="planner.hasAccepted.value" class="gen-count">
                  （{{ planner.acceptedSuggestions.value.length }} 项）
                </span>
              </template>
            </button>

            <!-- 应用结果 -->
            <div v-if="applyResult" class="apply-result" :class="applyResult.success ? 'success' : 'error'">
              {{ applyResult.message }}
            </div>

            <button class="reset-btn" :disabled="planner.phase.value === 'applying'" @click="handleReset">
              🗑️ 清空会话
            </button>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import VueMarkdown from 'vue-markdown-render'
import type { DevState } from '../useDevState'
import { useNodeKindFlags } from '../composables/useNodeKindFlags'
import { useNavPlanner, stripNavProposalTags } from '../composables/useNavPlanner'
import type { NavSuggestion } from '../composables/useNavPlanner'
import NavIcon from '@/components/NavIcon.vue'
import { useAiChat } from '@/composables/useAiChat'
import type { TokenUsage } from '@/composables/useAiChat'
import { getAILoop } from '@spark-view/spark-ai'
import { NAV_PLANNER_SYSTEM_PROMPT } from '@spark-view/spark-ai'
import type { NavNode } from '@spark-view/spark-utils'

const props = defineProps<{ state: DevState }>()
defineEmits<{ createPage: [] }>()

const flags = useNodeKindFlags(props.state)

// ── 页面设计状态（保留原有逻辑） ──

const aiPrompt = ref('')
const pageLoading = ref(false)

const isDesignableNode = computed(() =>
  flags.isPageNode.value || flags.isSystemPageNode.value,
)

const showSection = computed(() => {
  const node = props.state.selectedNode.value
  return node !== null && node !== undefined
})

const derivedPageId = computed(() => {
  const path = props.state.editForm.path
  return path ? path.replace(/^\/+/, '') : ''
})

const hasExistingPage = computed(() => {
  const pid = derivedPageId.value
  if (!pid) return false
  return props.state.pageList.value.some(
    (p: Record<string, unknown>) => String(p['pageId'] ?? '') === pid,
  )
})

const canGenerate = computed(() => {
  return Boolean(derivedPageId.value && aiPrompt.value.trim())
})

const promptPlaceholder = computed(() => {
  const title = props.state.editForm.title
  return title
    ? `描述「${title}」页面应包含的功能和布局...`
    : '描述你想创建的页面...'
})

// ── 导航策划状态 ──

const planner = useNavPlanner()
const drawerVisible = ref(false)
const inputText = ref('')
const messagesRef = ref<HTMLDivElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const applyResult = ref<{ success: boolean; message: string } | null>(null)

const {
  messages: chatMessages,
  isStreaming,
  error: chatError,
  send,
  clear: clearChat,
} = useAiChat({ mode: 'multi', systemPrompt: NAV_PLANNER_SYSTEM_PROMPT })

const plannerPhaseLabel = computed(() => {
  const labels: Record<string, string> = {
    idle: '就绪',
    planning: '策划中',
    reviewing: '审核中',
    applying: '应用中',
    applied: '已应用',
    failed: '失败',
  }
  return labels[planner.phase.value] ?? '就绪'
})

const plannerPhaseTagType = computed(() => {
  const types: Record<string, string> = {
    planning: 'primary',
    reviewing: 'warning',
    applying: 'info',
    applied: 'success',
    failed: 'danger',
  }
  return types[planner.phase.value] ?? 'info'
})

const acceptedAdds = computed(() =>
  planner.addSuggestions.value.filter((s) => s.status === 'accepted'),
)

const acceptedDeletes = computed(() =>
  planner.deleteSuggestions.value.filter((s) => s.status === 'accepted'),
)

// ── 打开策划抽屉 ──

function openNavPlanner() {
  const node = props.state.selectedNode.value
  const tree = props.state.treeData.value

  if (planner.phase.value === 'idle') {
    if (planner.mode.value === 'global') {
      planner.lockTarget(null, tree)
    } else {
      planner.lockTarget(node, tree)
    }
  }
  drawerVisible.value = true
}

// ── 聊天逻辑 ──

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return

  // 第一次发送时，将导航上下文注入
  const contextText = planner.buildContextPrompt(text)

  inputText.value = ''
  resetTextareaHeight()
  await send(contextText)
}

function displayContent(msg: { content: string }): string {
  return stripNavProposalTags(msg.content)
}

function getMessageSuggestions(messageId: string): NavSuggestion[] {
  return planner.suggestionsByMessage.value.get(messageId) ?? []
}

function formatSuggestionDetail(s: NavSuggestion): string {
  if (s.kind === 'add') {
    return JSON.stringify({ parentId: s.parentId, node: s.node }, null, 2)
  }
  return JSON.stringify({ nodeId: s.nodeId, reason: s.reason }, null, 2)
}

function handleDiscuss(s: NavSuggestion) {
  inputText.value = `关于「${s.title}」，`
  textareaRef.value?.focus()
}

function formatUsage(usage: TokenUsage): string {
  const parts: string[] = []
  if (usage.promptTokens !== undefined) parts.push(`P:${usage.promptTokens}`)
  if (usage.completionTokens !== undefined) parts.push(`C:${usage.completionTokens}`)
  if (usage.totalTokens !== undefined) parts.push(`≈${usage.totalTokens}`)
  return parts.length > 0 ? `🔢 ${parts.join(' ')}` : ''
}

// 流式结束后提取 nav 建议
watch(isStreaming, (streaming, wasStreaming) => {
  if (wasStreaming && !streaming) {
    const lastMsg = chatMessages.value[chatMessages.value.length - 1]
    if (lastMsg?.role === 'assistant' && lastMsg.content) {
      planner.addSuggestionsFromMessage(lastMsg.content, lastMsg.id)
    }
  }
})

// 自动滚动
watch(chatMessages, () => {
  void nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}, { deep: true })

function autoResize(e: Event) {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
}

function resetTextareaHeight() {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
  }
}

// ── 应用变更到导航树 ──

async function handleApply() {
  if (!planner.hasAccepted.value) return

  // 安全检查
  const check = planner.verifyTarget(props.state.treeData.value)
  if (!check.valid) {
    applyResult.value = { success: false, message: `⚠️ 安全检查失败：${check.reason ?? '未知原因'}` }
    return
  }

  planner.phase.value = 'applying'
  applyResult.value = null

  try {
    let addCount = 0
    let deleteCount = 0

    // 先执行删除（避免删除的父节点影响新增）
    for (const s of acceptedDeletes.value) {
      const found = findNodeAndParent(props.state.treeData.value, s.nodeId)
      if (found) {
        props.state.removeNodeFromTree(
          { parent: { data: found.parent } },
          found.node,
        )
        deleteCount++
      }
    }

    // 再执行新增
    for (const s of acceptedAdds.value) {
      const parentId = s.parentId
      if (parentId === null) {
        // 添加到根级
        ;(props.state.treeData.value).push(s.node)
      } else {
        const parent = findNodeById(props.state.treeData.value, parentId)
        if (parent) {
          ;(parent.children ??= []).push(s.node)
        }
      }
      addCount++
    }

    // 持久化
    await props.state.saveNavConfig()

    planner.phase.value = 'applied'
    applyResult.value = {
      success: true,
      message: `✅ 已应用：新增 ${addCount} 个、删除 ${deleteCount} 个节点`,
    }
    props.state.addStatus(`AI 导航策划已应用：+${addCount} -${deleteCount}`, 'success')
  } catch (e) {
    planner.phase.value = 'failed'
    applyResult.value = {
      success: false,
      message: `❌ 应用失败：${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

function handleReset() {
  clearChat()
  planner.reset()
  applyResult.value = null
  inputText.value = ''
}

// ── 页面设计操作（保留原逻辑） ──

async function handleGenerate() {
  const ai = getAILoop()
  if (!ai) {
    props.state.addStatus('AI Loop 未初始化，请确认 config.features.enableAI = true', 'error')
    return
  }

  const pid = derivedPageId.value
  if (!pid || !aiPrompt.value.trim()) return

  const desc = props.state.editForm.description
  const fullPrompt = desc
    ? `页面描述：${desc}\n\n需求：${aiPrompt.value.trim()}`
    : aiPrompt.value.trim()

  pageLoading.value = true
  props.state.addStatus(`⏳ AI 生成中... pageId=${pid}`, 'info')
  try {
    await ai.generate(pid, fullPrompt)
    await props.state.loadPageFiles(pid)
    await props.state.loadPages()
    props.state.addStatus(`✅ AI 已生成页面: ${pid}`, 'success')
    aiPrompt.value = ''
  } catch (err) {
    props.state.addStatus(`❌ AI 生成失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
  } finally {
    pageLoading.value = false
  }
}

async function handleIterate() {
  const ai = getAILoop()
  if (!ai) {
    props.state.addStatus('AI Loop 未初始化', 'error')
    return
  }

  const pid = derivedPageId.value
  if (!pid) return

  pageLoading.value = true
  props.state.addStatus(`⏳ AI 迭代中... feedback=${aiPrompt.value || '(无)'}`, 'info')
  try {
    await ai.iterate(pid, aiPrompt.value.trim() || undefined)
    await props.state.loadPageFiles(pid)
    props.state.addStatus(`✅ AI 迭代完成: ${pid}`, 'success')
    aiPrompt.value = ''
  } catch (err) {
    props.state.addStatus(`❌ AI 迭代失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
  } finally {
    pageLoading.value = false
  }
}

// ── 工具函数 ──

function findNodeById(nodes: NavNode[], id: string): NavNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const found = findNodeById(n.children, id)
      if (found) return found
    }
  }
  return null
}

interface NodeWithParent { node: NavNode; parent: NavNode }

/** 虚拟根用于 removeNodeFromTree 接口兼容 */
function findNodeAndParent(nodes: NavNode[], id: string): NodeWithParent | null {
  // 根级虚拟父
  const virtualRoot: NavNode = { id: '__root__', nodeKind: 'module', title: '', children: nodes }
  return _findInChildren(virtualRoot, id)
}

function _findInChildren(parent: NavNode, id: string): NodeWithParent | null {
  for (const child of parent.children ?? []) {
    if (child.id === id) return { node: child, parent }
    const found = _findInChildren(child, id)
    if (found) return found
  }
  return null
}
</script>

<style scoped>
.ai-blueprint {
  margin-top: 4px;
}
.divider-title {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.ai-blueprint__context {
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
.context-label { font-weight: 600; }
.context-text { color: var(--el-text-color-primary); }
.context-empty { color: var(--el-text-color-placeholder); font-style: italic; }
.ai-blueprint__actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.ai-blueprint__status { margin-top: 8px; }

/* ── 导航策划按钮区 ── */
.ai-blueprint__nav-planner {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.planner-phase-hint { font-size: 12px; }

/* ── 抽屉头部 ── */
.planner-header {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.planner-title { font-size: 16px; font-weight: 700; }
.planner-target {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  padding: 2px 8px;
  border-radius: 4px;
}
.planner-mode-switch { margin-left: auto; }
.planner-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}
.planner-close:hover {
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
}

/* ── 布局：左聊天 + 右侧栏 ── */
.planner-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}
.planner-chat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--el-border-color-lighter);
}
.planner-sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--el-fill-color-extra-light);
}

/* ── 聊天消息 ── */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.chat-empty {
  text-align: center;
  color: var(--el-text-color-secondary);
  padding: 40px 20px;
  font-size: 13px;
  line-height: 1.8;
}
.empty-icon { margin-bottom: 12px; opacity: 0.4; }
.chat-message {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
.chat-message.user { flex-direction: row-reverse; }
.msg-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
  background: var(--el-fill-color);
}
.msg-body {
  max-width: 80%;
  min-width: 0;
}
.msg-content {
  background: var(--el-fill-color-light);
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.7;
  word-break: break-word;
}
.chat-message.user .msg-content {
  background: var(--el-color-primary-light-9);
  border-radius: 12px 12px 4px 12px;
}
.chat-message.assistant .msg-content {
  border-radius: 12px 12px 12px 4px;
}
.msg-markdown :deep(p) { margin: 0.4em 0; }
.msg-markdown :deep(ul),
.msg-markdown :deep(ol) { padding-left: 1.4em; }
.msg-markdown :deep(code) {
  background: var(--el-fill-color);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
}
.msg-markdown :deep(pre) {
  background: var(--el-fill-color);
  padding: 10px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 12px;
}
.msg-reasoning {
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.msg-reasoning summary { cursor: pointer; }
.reasoning-content {
  padding: 8px;
  background: var(--el-fill-color-extra-light);
  border-radius: 6px;
  margin-top: 4px;
  font-size: 12px;
}
.streaming-cursor {
  display: inline-block;
  width: 6px;
  height: 14px;
  background: var(--el-color-primary);
  margin-left: 2px;
  animation: blink 1s infinite;
  vertical-align: middle;
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.msg-usage {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

/* ── 导航建议卡片 ── */
.nav-suggestion-card {
  margin-top: 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--el-bg-color);
  transition: border-color 0.2s;
}
.nav-suggestion-card.kind-add { border-left: 3px solid var(--el-color-success); }
.nav-suggestion-card.kind-delete { border-left: 3px solid var(--el-color-danger); }
.nav-suggestion-card.status-accepted { opacity: 0.7; background: var(--el-color-success-light-9); }
.nav-suggestion-card.status-rejected { opacity: 0.5; }
.ns-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}
.ns-title { flex: 1; }
.ns-badge {
  font-size: 11px;
  font-weight: 400;
}
.ns-details { margin-top: 6px; font-size: 12px; }
.ns-details summary { cursor: pointer; color: var(--el-text-color-secondary); }
.ns-content {
  margin: 6px 0 0;
  padding: 8px;
  background: var(--el-fill-color-extra-light);
  border-radius: 4px;
  font-size: 11px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow: auto;
}
.ns-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.ns-actions button {
  padding: 3px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: var(--el-bg-color);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}
.btn-accept:hover { background: var(--el-color-success-light-9); border-color: var(--el-color-success); }
.btn-reject:hover { background: var(--el-fill-color); }
.btn-discuss:hover { background: var(--el-color-primary-light-9); border-color: var(--el-color-primary); }

/* ── 错误提示 ── */
.chat-error {
  padding: 8px 16px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  font-size: 12px;
}

/* ── 输入区域 ── */
.chat-input-area {
  padding: 12px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}
.input-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.chat-textarea {
  flex: 1;
  resize: none;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.5;
  max-height: 120px;
  outline: none;
  transition: border-color 0.2s;
}
.chat-textarea:focus { border-color: var(--el-color-primary); }
.chat-textarea:disabled { background: var(--el-fill-color-light); }
.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.2s;
}
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.send-btn:not(:disabled):hover { opacity: 0.85; }

/* ── 侧栏 ── */
.sidebar-header {
  padding: 12px 14px;
  font-weight: 700;
  font-size: 14px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
}
.sidebar-empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.8;
  text-align: center;
  padding: 20px 0;
}
.decision-group { margin-bottom: 14px; }
.group-header {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}
.group-count {
  background: var(--el-fill-color);
  border-radius: 10px;
  padding: 0 6px;
  font-size: 11px;
  margin-left: auto;
}
.decision-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: var(--el-color-success-light-9);
  margin-bottom: 4px;
}
.decision-item.delete-item {
  background: var(--el-color-danger-light-9);
}
.decision-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.decision-revoke {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  padding: 2px;
  border-radius: 4px;
}
.decision-revoke:hover { background: var(--el-fill-color); }
.pending-hint {
  font-size: 12px;
  color: var(--el-color-warning);
  text-align: center;
  padding: 8px 0;
}

/* ── 侧栏底部 ── */
.sidebar-footer {
  padding: 12px 14px;
  border-top: 1px solid var(--el-border-color-extra-light);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.apply-btn {
  width: 100%;
  padding: 8px;
  border-radius: 8px;
  background: var(--el-color-success);
  color: white;
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.apply-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.apply-btn:not(:disabled):hover { opacity: 0.85; }
.gen-count { font-weight: 400; opacity: 0.8; }

.apply-result {
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
}
.apply-result.success {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}
.apply-result.error {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.reset-btn {
  width: 100%;
  padding: 6px;
  border-radius: 6px;
  background: none;
  border: 1px solid var(--el-border-color);
  font-size: 12px;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  transition: all 0.2s;
}
.reset-btn:hover { background: var(--el-fill-color); }
.reset-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>

<!-- 抽屉全局样式（非 scoped） -->
<style>
.nav-planner-drawer .el-drawer__header {
  padding: 12px 20px;
  margin-bottom: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.nav-planner-drawer .el-drawer__body {
  padding: 0;
  overflow: hidden;
}
</style>
