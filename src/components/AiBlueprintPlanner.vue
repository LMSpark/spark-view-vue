<template>
  <el-drawer
    v-model="visible"
    direction="rtl"
    size="90%"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    :destroy-on-close="false"
    class="blueprint-planner-drawer"
  >
    <template #header>
      <div class="planner-header">
        <span class="planner-title">🏗️ AI 蓝图策划</span>
        <span v-if="planner.phase.value === 'generating'" class="planner-badge generating">生成中...</span>
        <span v-else-if="planner.phase.value === 'applied'" class="planner-badge applied">已应用</span>
        <span v-else-if="planner.phase.value !== 'needs-analysis'" class="planner-badge phase">
          {{ PHASE_LABELS[planner.phase.value] ?? planner.phase.value }}
        </span>
        <button class="planner-close" @click="visible = false" title="关闭">✕</button>
      </div>
    </template>

    <div class="planner-layout">
      <!-- ── 左侧：聊天区域 ─────────────────────────────────────────────── -->
      <div class="planner-chat">
        <div ref="messagesRef" class="chat-messages">
          <!-- 引导文字 -->
          <div v-if="messages.length === 0" class="chat-empty">
            <div class="empty-icon">🏗️</div>
            <p><b>AI 蓝图策划模式</b></p>
            <p>描述你想构建的业务应用，AI 将引导你逐步完成：</p>
            <ol class="guide-steps">
              <li>📋 需求理解 — 明确业务目标和关键场景</li>
              <li>📦 模块规划 — 拆分功能模块和页面结构</li>
              <li>🗂️ 数据建模 — 设计数据表和关系</li>
              <li>📝 页面详设 — 规划每页核心功能</li>
              <li>✅ 蓝图审阅 — 汇总确认完整蓝图</li>
            </ol>
            <div class="quick-start">
              <p class="quick-label">💡 快速开始：</p>
              <div class="quick-start-name">
                <input
                  v-model="planner.appName.value"
                  class="quick-name-input"
                  placeholder="输入应用名称（如 工程项目管理）"
                  @keydown.enter.prevent="handleCustomQuickStart"
                />
                <button class="quick-go-btn" :disabled="planner.appName.value.trim() === ''" @click="handleCustomQuickStart">
                  开始策划 →
                </button>
              </div>
              <div class="quick-templates">
                <button class="quick-btn" @click="handleQuickStart('pm')">🏗️ 工程项目管理</button>
                <button class="quick-btn" @click="handleQuickStart('crm')">👥 客户管理 CRM</button>
                <button class="quick-btn" @click="handleQuickStart('oa')">📋 企业 OA 办公</button>
              </div>
            </div>
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
                <div v-if="msg.role === 'user'" class="msg-content" v-text="msg.content" />
                <div v-else class="msg-content msg-markdown">
                  <VueMarkdown :source="displayContent(msg)" />
                </div>
                <span v-if="msg.streaming" class="streaming-cursor" />
                <!-- 内联提案卡片 -->
                <AiProposalCard
                  v-for="p in getMessageProposals(msg.id)"
                  :key="p.id"
                  :proposal="p"
                  @accept="planner.acceptProposal"
                  @reject="planner.rejectProposal"
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
              placeholder="描述你的应用需求，或对 AI 的方案给出反馈..."
              :disabled="isStreaming || planner.phase.value === 'generating'"
              rows="1"
              @keydown.enter.exact.prevent="handleSend"
              @input="autoResize"
            />
            <button
              class="send-btn"
              :disabled="isStreaming || inputText.trim() === '' || planner.phase.value === 'generating'"
              @click="handleSend"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- ── 右侧：蓝图概览侧栏 ──────────────────────────────────────────── -->
      <div class="planner-sidebar">
        <div class="sidebar-header">📐 蓝图概览</div>

        <div class="sidebar-body">
          <!-- 空状态 -->
          <div v-if="!planner.hasAccepted.value && planner.pendingProposals.value.length === 0" class="sidebar-empty">
            <p>与 AI 讨论后，确认的规划决策将在这里汇总。</p>
            <p>蓝图完成后可一键写入后端导航。</p>
          </div>

          <!-- 统计概览 -->
          <div v-if="planner.hasAccepted.value" class="blueprint-stats">
            <span class="stat-item">📦 {{ planner.stats.value.moduleCount }} 模块</span>
            <span class="stat-item">📄 {{ planner.stats.value.pageCount }} 页面</span>
            <span class="stat-item">🗂️ {{ planner.stats.value.tableCount }} 数据表</span>
            <span class="stat-item">📝 {{ planner.stats.value.functionPlanCount }} 功能规划</span>
          </div>

          <!-- 分类展示已采纳提案 -->
          <div v-for="type in planner.blueprintTypes" :key="type" class="decision-group">
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
                <button class="decision-revoke" @click="planner.revokeProposal(p.id)" title="撤回">↩</button>
              </div>
            </template>
          </div>

          <!-- 待决定提案计数 -->
          <div v-if="planner.pendingProposals.value.length > 0" class="pending-hint">
            ⏳ {{ planner.pendingProposals.value.length }} 个提案待决定
          </div>
        </div>

        <!-- 操作面板 -->
        <div class="sidebar-footer">
          <input
            v-model="planner.appName.value"
            class="app-name-input"
            placeholder="应用名称（如 工程项目管理）"
            :disabled="planner.phase.value === 'generating'"
          />
          <div v-if="targetProjectId" class="project-id-hint">
            项目 ID: <code>{{ targetProjectId }}</code>
          </div>

          <!-- 写入导航 -->
          <button
            class="apply-btn"
            :disabled="!canApply"
            @click="handleApplyBlueprint"
          >
            <template v-if="planner.phase.value === 'generating'">
              ⏳ 写入中...
            </template>
            <template v-else>
              🚀 写入导航
              <span v-if="planner.hasAccepted.value" class="apply-count">
                （{{ planner.acceptedProposals.value.length }} 个决策）
              </span>
            </template>
          </button>

          <!-- 导出蓝图概要 -->
          <button
            class="export-btn"
            :disabled="!planner.hasAccepted.value"
            @click="handleExportSummary"
          >
            📋 导出蓝图概要
          </button>

          <!-- 操作结果 -->
          <div v-if="applyResult" class="apply-result" :class="applyResult.success ? 'success' : 'error'">
            {{ applyResult.message }}
          </div>

          <button class="reset-btn" @click="handleReset" :disabled="planner.phase.value === 'generating'">
            🗑️ 清空会话
          </button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, inject } from 'vue'
import VueMarkdown from 'vue-markdown-render'
import { useAiChat } from '../composables/useAiChat'
import { useBlueprintPlanner } from '../composables/useBlueprintPlanner'
import {
  stripProposalTags,
  typeLabel,
  typeIcon,
  extractProposals,
} from '@spark-view/spark-ai'
import { BLUEPRINT_SYSTEM_PROMPT } from '@spark-view/spark-ai'
import type { ProposalType, DesignProposal } from '@spark-view/spark-ai'
import type { TokenUsage } from '../composables/useAiChat'
import NavIcon from './NavIcon.vue'
import AiProposalCard from './AiProposalCard.vue'
import { createRequest } from '@spark-view/spark-utils'
import { getProjectApi } from '@/services/api-paths'
import { getUser, switchProject } from '@/services/auth'
import { PROJECT_SWITCH_KEY } from '@/services/project-switch'
import type { BlueprintPhase } from '../composables/useBlueprintPlanner'

const PHASE_LABELS: Record<BlueprintPhase, string> = {
  'needs-analysis': '需求理解',
  'module-planning': '模块规划',
  'data-modeling': '数据建模',
  'page-design': '页面详设',
  'reviewing': '蓝图审阅',
  'generating': '生成中',
  'applied': '已应用',
  'failed': '失败',
}

const http = createRequest({ timeout: 120_000 })

// ── 状态 ─────────────────────────────────────────────────────────────────────

const visible = defineModel<boolean>({ default: false })

const planner = useBlueprintPlanner()
const { messages, isStreaming, error: _chatError, send, clear } = useAiChat({
  mode: 'multi',
  systemPrompt: BLUEPRINT_SYSTEM_PROMPT,
})

const inputText = ref('')
const messagesRef = ref<HTMLDivElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const applyResult = ref<{ success: boolean; message: string } | null>(null)
const projectSwitch = inject(PROJECT_SWITCH_KEY, null)

/** 生成的项目 ID（kebab-case，从 appName 派生） */
const targetProjectId = computed(() => {
  const name = planner.appName.value.trim()
  if (!name) return ''
  // 简单 kebab-case：中文直接保留，英文小写化，空格/特殊字符转 '-'
  return name
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'new-app'
})

const canApply = computed(() => {
  // 至少有一个 navigation 类型提案被采纳
  const hasNav = planner.acceptedProposals.value.some((p) => p.type === 'navigation')
  return hasNav
    && planner.appName.value.trim() !== ''
    && planner.phase.value !== 'generating'
    && planner.phase.value !== 'applied'
})

// ── 内容处理 ─────────────────────────────────────────────────────────────────

function displayContent(msg: { content: string; streaming?: boolean; id: string }): string {
  return stripProposalTags(msg.content)
}

function getMessageProposals(messageId: string): DesignProposal[] {
  return planner.proposalsByMessage.value.get(messageId) ?? []
}

function getAcceptedByType(type: ProposalType): DesignProposal[] {
  return planner.acceptedByType.value.get(type) ?? []
}

// ── 流式结束 → 提取提案 ─────────────────────────────────────────────────────

watch(isStreaming, (streaming, wasStreaming) => {
  if (wasStreaming && !streaming) {
    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg?.role === 'assistant' && lastMsg.content) {
      const { proposals } = extractProposals(lastMsg.content, lastMsg.id)
      if (proposals.length > 0) {
        planner.addProposals(proposals)
      }
      // 记录用户目标
      if (!planner.userGoal.value) {
        const firstUser = messages.value.find((m) => m.role === 'user')
        if (firstUser) {
          planner.userGoal.value = firstUser.content
        }
      }
      // 自动推进阶段
      autoAdvancePhase()
    }
  }
})

/** 根据已采纳提案自动推进蓝图阶段 */
function autoAdvancePhase() {
  const accepted = planner.acceptedProposals.value
  const hasNav = accepted.some((p) => p.type === 'navigation')
  const hasData = accepted.some((p) => p.type === 'data-model')
  const hasFunc = accepted.some((p) => p.type === 'function-plan')

  if (hasFunc && hasData && hasNav) {
    planner.phase.value = 'reviewing'
  } else if (hasData && hasNav) {
    planner.phase.value = 'page-design'
  } else if (hasNav) {
    planner.phase.value = 'data-modeling'
  } else if (accepted.length > 0) {
    planner.phase.value = 'module-planning'
  }
}

// ── 发送消息 ─────────────────────────────────────────────────────────────────

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return

  inputText.value = ''
  resetTextareaHeight()
  await send(text)
}

/** 快速开始模板 */
const QUICK_TEMPLATES: Record<string, { name: string; prompt: string }> = {
  pm: {
    name: '工程项目管理',
    prompt: '我想做一个「工程项目管理」系统，用于管理建筑/IT 工程项目的全生命周期，包括项目立项、任务分解、进度跟踪、资源调配、成本管控、文档管理等核心模块。请帮我规划这个应用的蓝图。',
  },
  crm: {
    name: '客户管理 CRM',
    prompt: '我想做一个「客户管理 CRM」系统，用于管理客户信息、销售线索、商机跟踪、合同管理、客户服务和数据报表，支持销售团队协作。请帮我规划这个应用的蓝图。',
  },
  oa: {
    name: '企业 OA 办公',
    prompt: '我想做一个「企业 OA 办公」系统，用于考勤管理、请假审批、公告通知、日程管理、会议室预定、资产管理等日常办公协作功能。请帮我规划这个应用的蓝图。',
  },
}

async function handleQuickStart(templateId: string) {
  const tpl = QUICK_TEMPLATES[templateId]
  if (!tpl) return
  inputText.value = ''
  planner.appName.value = tpl.name
  await send(tpl.prompt)
}

/** 自定义快速开始：从应用名称生成需求描述 */
async function handleCustomQuickStart() {
  const name = planner.appName.value.trim()
  if (!name) return
  const prompt = `我想做一个「${name}」系统，请帮我规划这个应用的蓝图。先帮我分析这个应用的核心需求和业务场景。`
  inputText.value = ''
  await send(prompt)
}

function handleDiscuss(proposal: DesignProposal) {
  inputText.value = `关于「${proposal.title}」，`
  textareaRef.value?.focus()
}

// ── 写入导航 ─────────────────────────────────────────────────────────────────

async function handleApplyBlueprint() {
  if (!canApply.value) return

  planner.phase.value = 'generating'
  applyResult.value = null

  try {
    // 从已采纳的 navigation 提案中组装完整导航树
    const navTree = buildNavTreeFromProposals()
    if (!navTree) {
      planner.phase.value = 'reviewing'
      applyResult.value = { success: false, message: '❌ 未找到有效的导航结构提案' }
      return
    }

    const user = getUser()
    const tenantId = user?.tenantId ?? 'default'
    const projectId = targetProjectId.value

    // 1. 创建项目（若不存在则创建，已存在会返回现有项目）
    try {
      await http.post(`${getProjectApi()}`, {
        projectId,
        name: planner.appName.value,
        description: `由 AI 蓝图策划生成 — ${planner.userGoal.value || planner.appName.value}`,
      })
    } catch (e) {
      // 409 表示项目已存在，可以继续写入导航
      const status = (e as Record<string, unknown>)?.['status']
      if (status !== 409) throw e
    }

    // 2. 写入导航树到目标项目
    const navApiPath = `/api/tenants/${tenantId}/projects/${projectId}/navigation`
    await http.put(navApiPath, navTree)

    // 3. 切换到新项目并刷新导航
    if (projectSwitch) {
      await projectSwitch.switchAndReload(projectId)
    } else {
      // 无注入时降级：仅切换 localStorage 中的 projectId
      switchProject(projectId)
    }

    planner.phase.value = 'applied'
    applyResult.value = {
      success: true,
      message: `✅ 蓝图已写入项目「${projectId}」！${planner.stats.value.moduleCount} 个模块、${planner.stats.value.pageCount} 个页面已注册`,
    }
  } catch (e) {
    planner.phase.value = 'reviewing'
    const msg = e instanceof Error ? e.message : String(e)
    applyResult.value = { success: false, message: `❌ 写入失败: ${msg}` }
  }
}

/** 从已采纳提案组装 AppNavRoot（自动注入开发工具栏和用户菜单） */
function buildNavTreeFromProposals(): Record<string, unknown> | null {
  const navProposals = planner.acceptedProposals.value.filter((p) => p.type === 'navigation')
  if (navProposals.length === 0) return null

  // 系统自举：为每个生成的应用注入开发工具栏和用户菜单
  const devToolbar = {
    id: '__toolbar__',
    nodeKind: 'system-directory',
    title: '工具栏',
    icon: 'SetUp',
    childPlacement: 'toolbar',
    children: [
      { id: 'tb-ai-blueprint', nodeKind: 'system-page', title: 'AI 蓝图策划', icon: 'OfficeBuilding', path: 'ai-blueprint' },
      { id: 'tb-ai-design', nodeKind: 'system-page', title: 'AI 协同设计', icon: 'Brush', path: 'ai-design' },
      { id: 'tb-ai-chat', nodeKind: 'system-page', title: 'AI 对话', icon: 'ChatDotRound', path: 'ai-chat' },
      { id: 'tb-search', nodeKind: 'system-page', title: '搜索', icon: 'Search', path: 'search' },
      { id: 'tb-fullscreen', nodeKind: 'system-page', title: '全屏', icon: 'FullScreen', path: 'fullscreen' },
      { id: 'tb-notifications', nodeKind: 'system-page', title: '通知', icon: 'Bell', path: 'notifications' },
      { id: 'tb-theme', nodeKind: 'system-page', title: '主题切换', icon: 'Moon', path: 'theme-toggle' },
    ],
  }
  const userMenu = {
    id: '__user-menu__',
    nodeKind: 'system-directory',
    title: '用户菜单',
    icon: 'User',
    childPlacement: 'user-menu',
    children: [
      { id: 'um-profile', nodeKind: 'system-page', title: '个人中心', icon: 'User', path: 'profile' },
      { id: 'um-settings', nodeKind: 'system-page', title: '系统设置', icon: 'Setting', path: 'settings' },
      { id: 'um-home', nodeKind: 'system-page', title: '返回主应用', icon: 'HomeFilled', path: 'home' },
    ],
  }

  // 检查是否有完整 AppNavRoot 提案（阶段 5 审阅产出）
  for (const p of navProposals) {
    try {
      const parsed = JSON.parse(p.content) as Record<string, unknown>
      if (parsed['childPlacement'] && Array.isArray(parsed['children'])) {
        const children = parsed['children'] as Record<string, unknown>[]
        // 注入工具栏和用户菜单（如果不存在）
        const hasToolbar = children.some((c) => c['id'] === '__toolbar__')
        const hasUserMenu = children.some((c) => c['id'] === '__user-menu__')
        return {
          ...parsed,
          title: planner.appName.value || parsed['title'] || '新应用',
          children: [
            ...(hasToolbar ? [] : [devToolbar]),
            ...(hasUserMenu ? [] : [userMenu]),
            ...children,
          ],
        }
      }
    } catch {
      // 非 JSON，跳过
    }
  }

  // 否则组装模块级 navigation 提案为 AppNavRoot
  const modules: unknown[] = []
  for (const p of navProposals) {
    try {
      const parsed = JSON.parse(p.content) as Record<string, unknown>
      if (parsed['nodeKind'] === 'module') {
        modules.push(parsed)
      }
    } catch {
      // skip
    }
  }

  if (modules.length === 0) return null

  const firstModule = modules[0] as Record<string, unknown>
  const firstChild = Array.isArray(firstModule['children']) ? firstModule['children'][0] : null
  const homePath = (firstChild as Record<string, unknown> | null)?.['path'] ?? '/dashboard'

  return {
    title: planner.appName.value || '新应用',
    childPlacement: 'header',
    homePath,
    children: [devToolbar, userMenu, ...modules],
  }
}

// ── 导出蓝图概要 ─────────────────────────────────────────────────────────────

function handleExportSummary() {
  const summary = planner.buildBlueprintSummary()
  if (!summary) return

  const blob = new Blob([summary], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `blueprint-${planner.appName.value || 'unnamed'}.md`
  a.click()
  URL.revokeObjectURL(url)
}

// ── 清空 ─────────────────────────────────────────────────────────────────────

function handleReset() {
  clear()
  planner.reset()
  applyResult.value = null
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

.planner-header {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.planner-title {
  font-size: 16px;
  font-weight: 600;
}

.planner-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}

.planner-badge.generating {
  background: #fdf6ec;
  color: #e6a23c;
}

.planner-badge.applied {
  background: #f0f9eb;
  color: #67c23a;
}

.planner-badge.phase {
  background: #ecf5ff;
  color: #409eff;
}

.planner-close {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  color: #909399;
  padding: 4px 8px;
  border-radius: 4px;
}

.planner-close:hover {
  background: #f5f7fa;
  color: #303133;
}

.planner-layout {
  display: flex;
  height: 100%;
  gap: 0;
}

/* ── 聊天区域 ──────────────────────────────────────────────────────────────── */

.planner-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid #e4e7ed;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.chat-empty {
  text-align: center;
  color: #909399;
  padding: 40px 20px;
}

.chat-empty .empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.chat-empty p {
  margin: 6px 0;
  font-size: 14px;
}

.guide-steps {
  text-align: left;
  display: inline-block;
  margin: 12px auto;
  padding-left: 20px;
  font-size: 13px;
  color: #606266;
  line-height: 1.8;
}

.quick-start {
  margin-top: 20px;
  padding: 16px;
  background: #f0f7ff;
  border-radius: 8px;
}

.quick-label {
  font-size: 13px;
  color: #606266;
  margin-bottom: 8px !important;
}

.quick-start-name {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.quick-name-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.quick-name-input:focus {
  border-color: #409eff;
}

.quick-go-btn {
  padding: 8px 16px;
  background: #409eff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  transition: background 0.2s;
}

.quick-go-btn:hover:not(:disabled) {
  background: #337ecc;
}

.quick-go-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.quick-templates {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-btn {
  display: inline-block;
  padding: 6px 14px;
  background: white;
  color: #409eff;
  border: 1px solid #b3d8ff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.quick-btn:hover {
  background: #ecf5ff;
  border-color: #409eff;
}

.chat-message {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.chat-message.user {
  flex-direction: row-reverse;
}

.msg-avatar {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.msg-body {
  max-width: 80%;
  min-width: 60px;
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
  color: white;
  border-bottom-right-radius: 4px;
}

.chat-message.assistant .msg-content {
  background: #f4f4f5;
  color: #303133;
  border-bottom-left-radius: 4px;
}

.msg-markdown :deep(h1),
.msg-markdown :deep(h2),
.msg-markdown :deep(h3) {
  margin: 12px 0 8px;
  font-size: 15px;
}

.msg-markdown :deep(ul),
.msg-markdown :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}

.msg-markdown :deep(li) {
  margin: 4px 0;
}

.msg-markdown :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 13px;
}

.msg-markdown :deep(th),
.msg-markdown :deep(td) {
  border: 1px solid #dcdfe6;
  padding: 6px 10px;
}

.msg-markdown :deep(th) {
  background: #f5f7fa;
}

.msg-markdown :deep(code) {
  background: #e8eaed;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 12px;
}

.msg-markdown :deep(pre) {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 12px;
  margin: 8px 0;
}

.msg-markdown :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
}

.msg-reasoning {
  margin-bottom: 6px;
  font-size: 12px;
  color: #909399;
}

.msg-reasoning summary {
  cursor: pointer;
  user-select: none;
}

.reasoning-content {
  padding: 8px;
  background: #fafafa;
  border-radius: 4px;
  margin-top: 4px;
  font-size: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.streaming-cursor::after {
  content: '▊';
  animation: blink 0.8s step-end infinite;
  color: #409eff;
}

@keyframes blink {
  50% { opacity: 0; }
}

.msg-usage {
  font-size: 11px;
  color: #c0c4cc;
  margin-top: 4px;
  text-align: right;
}

.chat-error {
  padding: 8px 16px;
  background: #fef0f0;
  color: #f56c6c;
  font-size: 13px;
}

.chat-input-area {
  padding: 12px 16px;
  border-top: 1px solid #e4e7ed;
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
  max-height: 120px;
  outline: none;
  transition: border-color 0.2s;
}

.chat-textarea:focus {
  border-color: #409eff;
}

.chat-textarea:disabled {
  background: #f5f7fa;
}

.send-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: #409eff;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.2s;
}

.send-btn:hover:not(:disabled) {
  background: #337ecc;
}

.send-btn:disabled {
  background: #c0c4cc;
  cursor: not-allowed;
}

/* ── 侧栏 ─────────────────────────────────────────────────────────────────── */

.planner-sidebar {
  width: 300px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 12px 16px;
  font-weight: 600;
  font-size: 14px;
  border-bottom: 1px solid #e4e7ed;
}

.sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.sidebar-empty {
  text-align: center;
  color: #c0c4cc;
  font-size: 13px;
  padding: 20px 0;
}

.sidebar-empty p {
  margin: 6px 0;
}

/* ── 蓝图统计 ──────────────────────────────────────────────────────────────── */

.blueprint-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  padding: 10px;
  background: #f0f7ff;
  border-radius: 8px;
}

.stat-item {
  font-size: 12px;
  color: #409eff;
  font-weight: 500;
}

/* ── 决策分组 ──────────────────────────────────────────────────────────────── */

.decision-group + .decision-group {
  margin-top: 12px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  padding: 4px 0;
}

.group-count {
  background: #e4e7ed;
  color: #909399;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  margin-left: auto;
}

.decision-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  margin: 2px 0;
  font-size: 12px;
  color: #303133;
  background: #f0f9eb;
  border-radius: 4px;
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
  color: #909399;
  padding: 2px;
  border-radius: 4px;
  flex-shrink: 0;
}

.decision-revoke:hover {
  background: #fef0f0;
  color: #f56c6c;
}

.pending-hint {
  font-size: 12px;
  color: #e6a23c;
  padding: 8px 0;
  text-align: center;
}

/* ── 底部操作 ──────────────────────────────────────────────────────────────── */

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.app-name-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}

.app-name-input:focus {
  border-color: #409eff;
}

.project-id-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.project-id-hint code {
  background: #f5f7fa;
  padding: 1px 4px;
  border-radius: 3px;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  color: #606266;
}

.apply-btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 6px;
  background: #409eff;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.apply-btn:hover:not(:disabled) {
  background: #337ecc;
}

.apply-btn:disabled {
  background: #c0c4cc;
  cursor: not-allowed;
}

.apply-count {
  font-weight: 400;
  font-size: 12px;
  opacity: 0.8;
}

.export-btn {
  width: 100%;
  padding: 8px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: white;
  color: #606266;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.export-btn:hover:not(:disabled) {
  border-color: #409eff;
  color: #409eff;
}

.export-btn:disabled {
  color: #c0c4cc;
  cursor: not-allowed;
}

.apply-result {
  font-size: 12px;
  padding: 8px;
  border-radius: 6px;
  line-height: 1.5;
}

.apply-result.success {
  background: #f0f9eb;
  color: #67c23a;
}

.apply-result.error {
  background: #fef0f0;
  color: #f56c6c;
}

.reset-btn {
  width: 100%;
  padding: 8px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: #fafafa;
  color: #909399;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.reset-btn:hover:not(:disabled) {
  border-color: #f56c6c;
  color: #f56c6c;
  background: #fef0f0;
}

.reset-btn:disabled {
  color: #c0c4cc;
  cursor: not-allowed;
}
</style>

<style>
.blueprint-planner-drawer .el-drawer__body {
  padding: 0;
  overflow: hidden;
}

.blueprint-planner-drawer .el-drawer__header {
  margin-bottom: 0;
  padding: 12px 16px;
  border-bottom: 1px solid #e4e7ed;
}
</style>
