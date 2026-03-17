<template>
  <el-drawer
    v-model="visible"
    direction="rtl"
    size="88%"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    :destroy-on-close="false"
    class="design-studio-drawer"
  >
    <template #header>
      <div class="studio-header">
        <span class="studio-title">🎨 AI 协同设计</span>
        <span v-if="session.phase.value === 'generating'" class="studio-badge generating">生成中...</span>
        <span v-else-if="session.phase.value === 'applied'" class="studio-badge applied">已应用</span>
        <button class="studio-close" @click="visible = false" title="关闭">✕</button>
      </div>
    </template>

    <div class="studio-layout">
      <!-- ── 左侧：聊天区域 ─────────────────────────────────────────────── -->
      <div class="studio-chat">
        <div ref="messagesRef" class="chat-messages">
          <!-- 引导文字 -->
          <div v-if="messages.length === 0" class="chat-empty">
            <div class="empty-icon"><NavIcon name="Brush" :size="32" /></div>
            <p><b>AI 协同设计模式</b></p>
            <p>描述你的页面需求，AI 会在讨论中提出结构化设计方案。</p>
            <p>你可以对每个方案选择 <b>采纳</b> 或 <b>跳过</b>，全部确认后一键生成页面。</p>
          </div>

          <!-- 消息列表 -->
          <template v-for="msg in messages" :key="msg.id">
            <div class="chat-message" :class="msg.role">
              <div class="msg-avatar">{{ msg.role === 'user' ? '🧑' : '🤖' }}</div>
              <div class="msg-body">
                <!-- 推理过程 -->
                <details v-if="msg.reasoning" class="msg-reasoning">
                  <summary>💭 思考过程</summary>
                  <div class="reasoning-content"><VueMarkdown :source="msg.reasoning" /></div>
                </details>
                <!-- 消息内容 -->
                <template v-if="msg.role === 'user'">
                  <div v-if="isAutoQuery(msg)" class="msg-content auto-query-msg">
                    <details class="auto-query-details">
                      <summary>{{ autoQuerySummary(msg.content) }}</summary>
                      <pre class="auto-query-body">{{ autoQueryBody(msg.content) }}</pre>
                    </details>
                  </div>
                  <div v-else class="msg-content" v-text="msg.content" />
                </template>
                <div v-else class="msg-content msg-markdown">
                  <VueMarkdown :source="displayContent(msg)" />
                </div>
                <span v-if="msg.streaming" class="streaming-cursor" />
                <!-- 内联提案卡片 -->
                <AiProposalCard
                  v-for="p in getMessageProposals(msg.id)"
                  :key="p.id"
                  :proposal="p"
                  @accept="session.acceptProposal"
                  @reject="session.rejectProposal"
                  @discuss="handleDiscuss"
                />
                <!-- token 用量 -->
                <div v-if="msg.usage && !msg.streaming" class="msg-usage">
                  {{ formatUsage(msg.usage) }}
                </div>
              </div>
            </div>
          </template>
        </div>

    <!-- 错误提示 -->
    <div v-if="_chatError" class="chat-error">⚠️ {{ _chatError }}</div>

        <!-- 输入区域 -->
        <div class="chat-input-area">
          <div class="input-row">
            <textarea
              ref="textareaRef"
              v-model="inputText"
              class="chat-textarea"
              placeholder="描述页面需求，或对 AI 的提案给出反馈..."
              :disabled="isStreaming || session.phase.value === 'generating'"
              rows="1"
              @keydown.enter.exact.prevent="handleSend"
              @input="autoResize"
            />
            <button
              class="send-btn"
              :disabled="isStreaming || inputText.trim() === '' || session.phase.value === 'generating'"
              @click="handleSend"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- ── 右侧：设计决策侧栏 ──────────────────────────────────────────── -->
      <div class="studio-sidebar">
        <div class="sidebar-header">📋 设计决策</div>

        <div class="sidebar-body">
          <!-- 空状态 -->
          <div v-if="!session.hasAccepted.value && session.pendingProposals.value.length === 0" class="sidebar-empty">
            <p>AI 提出的设计方案将在这里汇总。</p>
            <p>与 AI 讨论后，采纳的方案会自动归类到此处。</p>
          </div>

          <!-- 分类展示已采纳提案 -->
          <div v-for="type in PROPOSAL_TYPES" :key="type" class="decision-group">
            <template v-if="getAcceptedByType(type).length > 0">
              <div class="group-header">
                <NavIcon :name="typeIcon(type)" /> {{ typeLabel(type) }}
                <span class="group-count">{{ getAcceptedByType(type).length }}</span>
              </div>
              <div
                v-for="p in getAcceptedByType(type)"
                :key="p.id"
                class="decision-item"
              >
                <span class="decision-title">{{ p.title }}</span>
                <button class="decision-revoke" @click="session.revokeProposal(p.id)" title="撤回">↩</button>
              </div>
            </template>
          </div>

          <!-- 待决定提案计数 -->
          <div v-if="session.pendingProposals.value.length > 0" class="pending-hint">
            ⏳ {{ session.pendingProposals.value.length }} 个提案待决定
          </div>
        </div>

        <!-- 生成面板 -->
        <div class="sidebar-footer">
          <input
            v-model="session.pageId.value"
            class="page-id-input"
            placeholder="页面 ID（如 order-list）"
            :disabled="session.phase.value === 'generating'"
          />
          <button
            class="generate-btn"
            :disabled="!canGenerate"
            @click="handleGenerate"
          >
            <template v-if="session.phase.value === 'generating'">
              ⏳ 生成中...
            </template>
            <template v-else>
              🚀 生成页面
              <span v-if="session.hasAccepted.value" class="gen-count">
                （{{ session.acceptedProposals.value.length }} 个决策）
              </span>
            </template>
          </button>

          <!-- 生成结果 -->
          <div v-if="generateResult" class="generate-result" :class="generateResult.success ? 'success' : 'error'">
            {{ generateResult.message }}
            <button
              v-if="generateResult.success && generateResult.pageId"
              class="nav-btn"
              @click="navigateToPage(generateResult.pageId)"
            >
              🔗 打开页面
            </button>
          </div>

          <button class="reset-btn" @click="handleReset" :disabled="session.phase.value === 'generating'">
            🗑️ 清空会话
          </button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import VueMarkdown from 'vue-markdown-render'
import { useAiChat } from '../composables/useAiChat'
import { useDesignSession } from '../composables/useDesignSession'
import {
  stripProposalTags,
  buildGenerationPrompt,
  typeLabel,
  typeIcon,
  DESIGN_SYSTEM_PROMPT,
  AUTO_QUERY_PREFIX,
} from '@spark-view/spark-ai'
import type { ProposalType, DesignProposal } from '@spark-view/spark-ai'
import NavIcon from './NavIcon.vue'
import {
  ResponsePipeline,
  BlockExtractorProcessor,
  ProposalValidatorProcessor,
  SchemaCheckerProcessor,
  QueryResolverProcessor,
  AutoResponderProcessor,
} from '@spark-view/spark-ai'
import type { TokenUsage } from '../composables/useAiChat'
import AiProposalCard from './AiProposalCard.vue'
import { http } from '@/services/http'
import {
  writePageFiles,
  clearPageCache,
  setConfigLoader,
} from '@spark-view/spark-ai'
import type { AIResponse } from '@spark-view/spark-ai'

const PROPOSAL_TYPES: ProposalType[] = ['data-model', 'ui-structure', 'interaction', 'api-config', 'style', 'db-schema', 'dict-entry']
const PAGE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/

const router = useRouter()
const route = useRoute()

// ── Skill Catalog（可选） ────────────────────────────────────────────────────

let _skillCatalog: string | undefined
import('virtual:spark-skill-catalog')
  .then((mod: Record<string, unknown>) => {
    const fn = mod['buildSkillPrompt']
    if (typeof fn === 'function') {
      _skillCatalog = fn('## SPARK Skill 目录', 'compact') as string | undefined
    }
  })
  .catch(() => { /* virtual module not available */ })

// ── 状态 ─────────────────────────────────────────────────────────────────────

const visible = defineModel<boolean>({ default: false })

const session = useDesignSession()
const { messages, isStreaming, error: _chatError, send, clear } = useAiChat({
  mode: 'multi',
  systemPrompt: DESIGN_SYSTEM_PROMPT,
})

const inputText = ref('')
const messagesRef = ref<HTMLDivElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const generateResult = ref<{ success: boolean; message: string; pageId?: string } | null>(null)

const canGenerate = computed(() =>
  session.hasAccepted.value
  && session.pageId.value.trim() !== ''
  && PAGE_ID_RE.test(session.pageId.value.trim())
  && session.phase.value !== 'generating',
)

// ── 消息中的提案处理 ─────────────────────────────────────────────────────────

/** 流式渲染时去除 proposal 标签，流完成后提取提案 */
function displayContent(msg: { content: string; streaming?: boolean; id: string }): string {
  return stripProposalTags(msg.content)
}

function getMessageProposals(messageId: string): DesignProposal[] {
  return session.proposalsByMessage.value.get(messageId) ?? []
}

// ── 组件 Props 自动查询 ─────────────────────────────────────────────────────

function isAutoQuery(msg: { role: string; content: string }): boolean {
  return msg.role === 'user' && msg.content.startsWith(AUTO_QUERY_PREFIX)
}

function autoQuerySummary(content: string): string {
  return content.split('\n')[0] ?? ''
}

function autoQueryBody(content: string): string {
  return content.split('\n').slice(2).join('\n').trim()
}

function getAcceptedByType(type: ProposalType): DesignProposal[] {
  return session.acceptedByType.value.get(type) ?? []
}

// ── ResponsePipeline 实例 ─────────────────────────────────────────────────

const pipeline = new ResponsePipeline()
  .use(new BlockExtractorProcessor())
  .use(new ProposalValidatorProcessor())
  .use(new SchemaCheckerProcessor())
  .use(new QueryResolverProcessor())
  .use(new AutoResponderProcessor())

// 监听流式结束 → 管线处理（提取提案 + 校验 + 自动查询）
watch(isStreaming, (streaming, wasStreaming) => {
  if (wasStreaming && !streaming) {
    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg?.role === 'assistant' && lastMsg.content) {
      void pipeline.execute(lastMsg.content, lastMsg.id).then((ctx) => {
        // 添加提案
        if (ctx.proposals.length > 0) {
          session.addProposals(ctx.proposals)
        }
        // 记录用户目标（取自第一条用户消息）
        if (!session.userGoal.value) {
          const firstUser = messages.value.find((m) => m.role === 'user')
          if (firstUser) {
            session.userGoal.value = firstUser.content
          }
        }
        // 发送自动回复（Props 注入 / 验证反馈）
        for (const auto of ctx.autoMessages) {
          // 防重入：如果上一条用户消息已经是自动查询响应，不再触发 props-injection
          if (auto.type === 'props-injection') {
            const lastUserMsg = [...messages.value].reverse().find((m) => m.role === 'user')
            if (lastUserMsg?.content.startsWith(AUTO_QUERY_PREFIX)) continue
          }
          void send(auto.content)
        }
      })
    }
  }
})

// ── 发送消息 ─────────────────────────────────────────────────────────────────

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return

  inputText.value = ''
  resetTextareaHeight()
  await send(text)
}

// ── 讨论提案 ─────────────────────────────────────────────────────────────────

function handleDiscuss(proposal: DesignProposal) {
  inputText.value = `关于「${proposal.title}」，`
  textareaRef.value?.focus()
}

// ── 生成页面 ─────────────────────────────────────────────────────────────────

async function handleGenerate() {
  const pid = session.pageId.value.trim()
  if (!pid || !canGenerate.value) return

  session.phase.value = 'generating'
  generateResult.value = null

  try {
    const prompt = buildGenerationPrompt(session.proposals.value, session.userGoal.value)

    const response = await http.post<AIResponse>('/api/ai/chat', {
      action: 'generate',
      pageId: pid,
      prompt,
      sessionId: `design-${Date.now()}`,
      skillCatalog: _skillCatalog,
    }, { timeout: 240_000 })

    if (Object.keys(response.files).length > 0) {
      await writePageFiles(pid, response.files)
      ensureRouteExists(pid)
      clearPageCache(pid)

      session.phase.value = 'applied'
      generateResult.value = {
        success: true,
        message: `✅ 页面 /${pid} 已生成（${Object.keys(response.files).join(', ')}）`,
        pageId: pid,
      }
    } else {
      session.phase.value = 'discussing'
      generateResult.value = { success: false, message: '❌ AI 未返回任何文件' }
    }
  } catch (e) {
    session.phase.value = 'discussing'
    const msg = e instanceof Error ? e.message : String(e)
    generateResult.value = { success: false, message: `❌ 生成失败: ${msg}` }
  }
}

// ── 路由注册（复用 AiChatPanel 逻辑） ───────────────────────────────────────

/** 构建当前用户的租户前缀路径 */
function tenantPath(relativePath: string): string {
  const normalized = relativePath.startsWith('/') ? relativePath : `/${relativePath}`
  if (normalized.startsWith('/t/')) return normalized
  const scopedMatch = /^\/t\/([^/]+)\/([^/]+)(?:\/|$)/.exec(route.path)
  if (!scopedMatch) return normalized
  const tenantId = scopedMatch[1]
  const projectId = scopedMatch[2]
  return `/t/${tenantId}/${projectId}${normalized}`
}

function ensureRouteExists(pid: string) {
  const tenantPrefixed = `/t/:tenantId/:projectId/${pid}`
  const exists = router.getRoutes().some((r) => r.path === tenantPrefixed)
  if (exists) return
  const configRoute = router.getRoutes().find(
    (r) => r.meta?.['pageId'] != null && r.meta?.['type'] !== 'system-page',
  )
  if (configRoute) {
    const comp = configRoute.components?.['default']
    if (!comp) return
    const routeProps = configRoute.props?.['default'] as Record<string, unknown> | undefined
    const configLoader = routeProps?.['configLoader'] as { clearCache(key?: string): void } | undefined
    if (configLoader) setConfigLoader(configLoader)
    router.addRoute({
      path: tenantPrefixed,
      name: `design-${pid}`,
      component: comp,
      ...(configLoader ? { props: { configLoader } } : {}),
      meta: { pageId: pid, title: pid, icon: 'Brush' },
    })
  }
}

function navigateToPage(pid: string) {
  ensureRouteExists(pid)
  void router.push(tenantPath(`/${pid}`))
  visible.value = false
}

// ── 清空 ─────────────────────────────────────────────────────────────────────

function handleReset() {
  clear()
  session.reset()
  generateResult.value = null
  inputText.value = ''
}

// ── 自动滚动 ─────────────────────────────────────────────────────────────────

watch(
  () => {
    const last = messages.value[messages.value.length - 1]
    return last ? `${last.content}|${last.reasoning ?? ''}` : ''
  },
  () => {
    void nextTick(() => {
      const el = messagesRef.value
      if (el) el.scrollTop = el.scrollHeight
    })
  },
)

// ── textarea 高度自适应 ──────────────────────────────────────────────────────

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
}

function resetTextareaHeight() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
}

function formatUsage(usage: TokenUsage): string {
  const parts: string[] = []
  if (usage.totalTokens !== undefined) parts.push(`${usage.totalTokens} tokens`)
  if (usage.promptCacheHitTokens !== undefined && usage.promptCacheHitTokens > 0) {
    parts.push(`缓存命中 ${usage.promptCacheHitTokens}`)
  }
  return parts.join(' · ')
}
</script>

<style scoped>
/* ── 布局 ─────────────────────────────────────────────────────────────────── */

.studio-header {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.studio-title {
  font-size: 16px;
  font-weight: 600;
}

.studio-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}

.studio-badge.generating {
  background: #fdf6ec;
  color: #e6a23c;
}

.studio-badge.applied {
  background: #f0f9eb;
  color: #67c23a;
}

.studio-close {
  margin-left: auto;
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #909399;
  padding: 4px 8px;
  border-radius: 4px;
}

.studio-close:hover {
  background: #f5f7fa;
  color: #303133;
}

.studio-layout {
  display: flex;
  height: calc(100vh - 70px);
  gap: 0;
}

/* ── 左侧聊天 ────────────────────────────────────────────────────────────── */

.studio-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e4e7ed;
  min-width: 0;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.chat-empty {
  text-align: center;
  color: #909399;
  padding: 60px 20px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.chat-empty p {
  margin: 6px 0;
  font-size: 14px;
  line-height: 1.6;
}

.chat-message {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.chat-message.user {
  flex-direction: row-reverse;
}

.msg-avatar {
  font-size: 20px;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.msg-body {
  max-width: 80%;
  min-width: 0;
}

.msg-content {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}

.chat-message.user .msg-content {
  background: #409eff;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.chat-message.assistant .msg-content {
  background: #f5f7fa;
  color: #303133;
  border-bottom-left-radius: 4px;
}

/* markdown 渲染样式 */
.msg-markdown :deep(pre) {
  background: #282c34;
  color: #abb2bf;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 13px;
  margin: 8px 0;
}

.msg-markdown :deep(code) {
  font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 13px;
}

.msg-markdown :deep(code:not(pre code)) {
  background: #e8eaed;
  color: #c7254e;
  padding: 2px 4px;
  border-radius: 3px;
}

.msg-markdown :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  width: 100%;
}

.msg-markdown :deep(th),
.msg-markdown :deep(td) {
  border: 1px solid #dcdfe6;
  padding: 6px 10px;
  font-size: 13px;
}

.msg-markdown :deep(th) {
  background: #f5f7fa;
  font-weight: 600;
}

.msg-markdown :deep(ul),
.msg-markdown :deep(ol) {
  padding-left: 20px;
  margin: 6px 0;
}

.msg-markdown :deep(blockquote) {
  border-left: 3px solid #409eff;
  padding: 4px 12px;
  margin: 8px 0;
  color: #606266;
  background: #f5f7fa;
  border-radius: 0 4px 4px 0;
}

.msg-markdown :deep(h1),
.msg-markdown :deep(h2),
.msg-markdown :deep(h3) {
  margin: 12px 0 6px;
  font-weight: 600;
}

.msg-markdown :deep(h1) { font-size: 18px; }
.msg-markdown :deep(h2) { font-size: 16px; }
.msg-markdown :deep(h3) { font-size: 14px; }

.msg-markdown :deep(p) {
  margin: 6px 0;
}

.msg-reasoning {
  margin-bottom: 6px;
}

.msg-reasoning summary {
  cursor: pointer;
  font-size: 12px;
  color: #909399;
  user-select: none;
}

.reasoning-content {
  font-size: 13px;
  color: #909399;
  padding: 8px;
  background: #fafafa;
  border-radius: 6px;
  margin-top: 4px;
}

.streaming-cursor {
  display: inline-block;
  width: 6px;
  height: 14px;
  background: #409eff;
  margin-left: 2px;
  animation: blink 0.8s infinite;
  vertical-align: text-bottom;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.msg-usage {
  font-size: 11px;
  color: #c0c4cc;
  margin-top: 4px;
}

/* ── 输入区域 ─────────────────────────────────────────────────────────────── */

.chat-input-area {
  padding: 12px 16px;
  border-top: 1px solid #e4e7ed;
  background: #fff;
}

.input-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.chat-textarea {
  flex: 1;
  resize: none;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.5;
  outline: none;
  transition: border-color 0.2s;
  min-height: 38px;
  max-height: 120px;
}

.chat-textarea:focus {
  border-color: #409eff;
}

.chat-textarea:disabled {
  background: #f5f7fa;
  cursor: not-allowed;
}

.send-btn {
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 8px;
  background: #409eff;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.2s;
}

.send-btn:hover:not(:disabled) {
  background: #66b1ff;
}

.send-btn:disabled {
  background: #c0c4cc;
  cursor: not-allowed;
}

/* ── 右侧侧栏 ────────────────────────────────────────────────────────────── */

.studio-sidebar {
  width: 300px;
  display: flex;
  flex-direction: column;
  background: #fafbfc;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 14px 16px;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid #e4e7ed;
}

.sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.sidebar-empty {
  text-align: center;
  color: #c0c4cc;
  padding: 40px 16px;
  font-size: 13px;
  line-height: 1.8;
}

.decision-group {
  margin-bottom: 12px;
}

.group-header {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  padding: 6px 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.group-count {
  font-size: 11px;
  background: #409eff;
  color: #fff;
  padding: 0 6px;
  border-radius: 8px;
  font-weight: 400;
}

.decision-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  margin-bottom: 4px;
  font-size: 13px;
}

.decision-title {
  flex: 1;
  color: #303133;
}

.decision-revoke {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: #c0c4cc;
  padding: 2px 4px;
  border-radius: 4px;
}

.decision-revoke:hover {
  background: #fef0f0;
  color: #f56c6c;
}

.pending-hint {
  text-align: center;
  font-size: 12px;
  color: #e6a23c;
  padding: 8px;
  background: #fdf6ec;
  border-radius: 6px;
  margin-top: 8px;
}

/* ── 生成面板 ─────────────────────────────────────────────────────────────── */

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid #e4e7ed;
  background: #fff;
}

.page-id-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  margin-bottom: 8px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.page-id-input:focus {
  border-color: #409eff;
}

.page-id-input:disabled {
  background: #f5f7fa;
}

.generate-btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 6px;
  background: #67c23a;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  margin-bottom: 8px;
}

.generate-btn:hover:not(:disabled) {
  background: #85ce61;
}

.generate-btn:disabled {
  background: #c0c4cc;
  cursor: not-allowed;
}

.gen-count {
  font-weight: 400;
  font-size: 12px;
  opacity: 0.9;
}

.generate-result {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 8px;
  line-height: 1.5;
}

.generate-result.success {
  background: #f0f9eb;
  color: #67c23a;
}

.generate-result.error {
  background: #fef0f0;
  color: #f56c6c;
}

.nav-btn {
  display: inline-block;
  margin-top: 6px;
  padding: 4px 10px;
  border: 1px solid #67c23a;
  border-radius: 4px;
  background: #fff;
  color: #67c23a;
  font-size: 12px;
  cursor: pointer;
}

.nav-btn:hover {
  background: #f0f9eb;
}

.reset-btn {
  width: 100%;
  padding: 8px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: #fff;
  color: #909399;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.reset-btn:hover:not(:disabled) {
  border-color: #f56c6c;
  color: #f56c6c;
  background: #fef0f0;
}

.reset-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── 自动查询消息 ─────────────────────────────────────────────────────────── */

.auto-query-msg {
  background: #e8f4fd !important;
  color: #606266 !important;
  font-size: 12px;
  border: 1px dashed #b3d8ff;
}

.auto-query-details summary {
  cursor: pointer;
  font-size: 12px;
  color: #409eff;
  user-select: none;
}

.auto-query-body {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.5;
  color: #909399;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}
</style>

<!-- 抽屉全局样式（popper 脱离 scoped DOM） -->
<style>
.design-studio-drawer .el-drawer__header {
  margin-bottom: 0;
  padding: 14px 20px;
  border-bottom: 1px solid #e4e7ed;
}

.design-studio-drawer .el-drawer__body {
  padding: 0;
  overflow: hidden;
}
</style>
