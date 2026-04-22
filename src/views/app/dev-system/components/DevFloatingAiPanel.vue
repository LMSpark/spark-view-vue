<template>
  <!-- inline 模式：直接嵌入布局，无 fixed 定位/拖拽 -->
  <template v-if="props.inline">
    <div
      v-if="props.state.activePageId.value"
      class="floating-ai-panel__frame floating-ai-panel__frame--inline"
    >
      <div class="floating-ai-panel__summary">
        <div class="floating-ai-panel__summary-main">
          <span class="floating-ai-panel__title">AI 编辑面板</span>
          <span class="floating-ai-panel__context">
            {{ props.state.activePageId.value }}
            <template v-if="props.activeFile"> · {{ props.activeFile }}</template>
          </span>
        </div>
        <div class="floating-ai-panel__summary-actions">
          <el-tooltip content="撤销上一条 AI 页面事务" placement="bottom" :show-after="600">
            <el-button size="small" :disabled="!props.state.canPageEditTransactionBack()" @click="props.state.undoPageEditTransaction()">
              <NavIcon name="RefreshLeft" :size="14" />
            </el-button>
          </el-tooltip>
          <el-tooltip content="重做上一条 AI 页面事务" placement="bottom" :show-after="600">
            <el-button size="small" :disabled="!props.state.canPageEditTransactionForward()" @click="props.state.redoPageEditTransaction()">
              <NavIcon name="RefreshRight" :size="14" />
            </el-button>
          </el-tooltip>
          <el-tag v-if="props.state.getPageEditTransactionCount() > 0" size="small" type="info" effect="plain">
            AI 事务 {{ props.state.getPageEditTransactionCount() }}
          </el-tag>
        </div>
      </div>

      <div v-if="supportsAiEditing" class="floating-ai-panel__body">
        <div class="floating-ai-panel__rule-tip" :class="{ 'floating-ai-panel__rule-tip--dataset': isPageDataFile }">
          {{ currentAiTip }}
        </div>
        <el-alert
          v-if="isPageDataFile && pageDataBlockReason"
          class="floating-ai-panel__dataset-alert"
          title="存在未保存 DataSet 改动"
          type="warning"
          :closable="false"
          show-icon
        >
          {{ pageDataBlockReason }}
        </el-alert>
        <!-- 工具调用日志 -->
        <div v-if="ruleSession.log.value.length > 0" class="floating-ai-panel__tool-log">
          <div
            v-for="(entry, i) in ruleSession.log.value"
            :key="i"
            :class="['tool-log-entry', `tool-log-entry--${entry.type}`]"
          >
            <span class="tool-log-entry__type">{{ entry.type }}</span>
            <span class="tool-log-entry__tag">{{ entry.tag }}</span>
            <span class="tool-log-entry__text">{{ entry.text }}</span>
          </div>
        </div>
        <AiChatWidget
          :key="currentAiChatStorageKey"
          :storage-key="currentAiChatStorageKey"
          mode="multi"
          :title="currentAiTitle"
          :placeholder="currentAiPlaceholder"
          :compact="true"
          :sender="currentAiSender"
        />
      </div>

      <div v-else-if="props.activeFile" class="floating-ai-panel__body">
        <el-alert
          title="当前文件暂未接入模型级 AI"
          type="info"
          :closable="false"
          show-icon
        >
          当前浮层仅支持页面 4 文件模型编辑；请切到 rule.json、pagedata.json、script.js 或 style.css。
        </el-alert>
      </div>

      <div v-else class="floating-ai-panel__placeholder">
        <el-alert
          title="切换到页面文件后可使用 AI"
          type="info"
          :closable="false"
          show-icon
        >
          当前工作区不是页面文件视图；请切到 rule.json、pagedata.json、script.js 或 style.css。
        </el-alert>
      </div>
    </div>
  </template>

  <!-- floating 模式：原 fixed 定位可拖拽浮层 -->
  <template v-else>
    <div
      v-if="props.state.activePageId.value"
      class="floating-ai-panel"
      :class="{ 'floating-ai-panel--dragging': isDragging }"
      :style="panelStyle"
    >
      <div
        ref="frameRef"
        class="floating-ai-panel__frame"
        :class="{ 'floating-ai-panel__frame--collapsed': isCollapsed }"
      >
        <div class="floating-ai-panel__summary" @pointerdown="startDrag">
          <div class="floating-ai-panel__summary-main">
            <span class="floating-ai-panel__title">AI 编辑面板</span>
            <span class="floating-ai-panel__context">
              {{ props.state.activePageId.value }}
              <template v-if="props.activeFile"> · {{ props.activeFile }}</template>
            </span>
          </div>
          <div class="floating-ai-panel__summary-actions" @pointerdown.stop>
            <el-button size="small" @click.stop="toggleCollapsed">{{ isCollapsed ? '展开' : '折叠' }}</el-button>
            <el-tooltip content="撤销上一条 AI 页面事务" placement="bottom" :show-after="600">
              <el-button size="small" :disabled="!props.state.canPageEditTransactionBack()" @click="props.state.undoPageEditTransaction()">
                <NavIcon name="RefreshLeft" :size="14" />
              </el-button>
            </el-tooltip>
            <el-tooltip content="重做上一条 AI 页面事务" placement="bottom" :show-after="600">
              <el-button size="small" :disabled="!props.state.canPageEditTransactionForward()" @click="props.state.redoPageEditTransaction()">
                <NavIcon name="RefreshRight" :size="14" />
              </el-button>
            </el-tooltip>
            <el-tag v-if="props.state.getPageEditTransactionCount() > 0" size="small" type="info" effect="plain">
              AI 事务 {{ props.state.getPageEditTransactionCount() }}
            </el-tag>
          </div>
        </div>

        <template v-if="!isCollapsed">
          <div v-if="supportsAiEditing" class="floating-ai-panel__body">
            <div class="floating-ai-panel__rule-tip" :class="{ 'floating-ai-panel__rule-tip--dataset': isPageDataFile }">
              {{ currentAiTip }}
            </div>
            <el-alert
              v-if="isPageDataFile && pageDataBlockReason"
              class="floating-ai-panel__dataset-alert"
              title="存在未保存 DataSet 改动"
              type="warning"
              :closable="false"
              show-icon
            >
              {{ pageDataBlockReason }}
            </el-alert>
            <AiChatWidget
              :key="currentAiChatStorageKey"
              :storage-key="currentAiChatStorageKey"
              mode="multi"
              :title="currentAiTitle"
              :placeholder="currentAiPlaceholder"
              :compact="true"
              :sender="currentAiSender"
            />
          </div>

          <div v-else-if="props.activeFile" class="floating-ai-panel__body">
            <el-alert
              title="当前文件暂未接入模型级 AI"
              type="info"
              :closable="false"
              show-icon
            >
              当前浮层仅支持页面 4 文件模型编辑；请切到 rule.json、pagedata.json、script.js 或 style.css。
            </el-alert>
          </div>

          <div v-else class="floating-ai-panel__placeholder">
            <el-alert
              title="切换到页面文件后可使用 AI"
              type="info"
              :closable="false"
              show-icon
            >
              当前工作区不是页面文件视图；请切到 rule.json、pagedata.json、script.js 或 style.css。
            </el-alert>
          </div>
        </template>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import AiChatWidget from '@/components/AiChatWidget.vue'
import NavIcon from '@/components/NavIcon.vue'
import type { AiChatSender } from '@/composables/useAiChat'
import type { AiChatSendRequest } from '@/composables/useAiChat'
import { usePageModelSessionHost } from '../composables/usePageModelSessionHost'
import { useRuleEditSession } from '../composables/useRuleEditSession'
import type { DevState, PageFileName } from '../useDevState'

interface Props {
  state: DevState
  activeFile: PageFileName | null
  inline?: boolean
}

const props = defineProps<Props>()
const AI_CHAT_STORAGE_PREFIX = 'devsystem-ai-chat'
const AI_PANEL_LAYOUT_STORAGE_PREFIX = 'devsystem-ai-panel-layout'

interface PanelLayoutSnapshot {
  left: number
  top: number
  collapsed: boolean
}

const frameRef = ref<HTMLElement | null>(null)
const panelLeft = ref(0)
const panelTop = ref(0)
const panelPositionReady = ref(false)
const isCollapsed = ref(false)
const isDragging = ref(false)

let dragPointerId: number | null = null
let dragStartX = 0
let dragStartY = 0
let dragOriginLeft = 0
let dragOriginTop = 0

function buildAiChatStorageKey(pageId: string | undefined | null): string {
  return `${AI_CHAT_STORAGE_PREFIX}:${pageId ?? ''}`
}

function buildPanelLayoutStorageKey(): string {
  if (typeof window === 'undefined') {
    return AI_PANEL_LAYOUT_STORAGE_PREFIX
  }
  return `${AI_PANEL_LAYOUT_STORAGE_PREFIX}:${window.location.pathname}`
}

function parseCssPxNumber(rawValue: string, fallback: number): number {
  const parsed = Number.parseFloat(rawValue)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readViewportHeaderOffset(): number {
  if (typeof window === 'undefined') return 80
  const rootStyle = window.getComputedStyle(document.documentElement)
  const headerHeight = parseCssPxNumber(rootStyle.getPropertyValue('--spark-header-height').trim(), 56)
  return headerHeight + 24
}

function getFrameSize(): { width: number; height: number } {
  const rect = frameRef.value?.getBoundingClientRect()
  return {
    width: rect?.width ?? 360,
    height: rect?.height ?? (isCollapsed.value ? 68 : 560),
  }
}

function clampPanelPosition(left: number, top: number): { left: number; top: number } {
  if (typeof window === 'undefined') {
    return { left, top }
  }

  const margin = 12
  const frameSize = getFrameSize()
  const maxLeft = Math.max(margin, window.innerWidth - frameSize.width - margin)
  const maxTop = Math.max(margin, window.innerHeight - frameSize.height - margin)

  return {
    left: Math.min(Math.max(left, margin), maxLeft),
    top: Math.min(Math.max(top, margin), maxTop),
  }
}

function applyPanelPosition(left: number, top: number): void {
  const next = clampPanelPosition(left, top)
  panelLeft.value = next.left
  panelTop.value = next.top
}

function savePanelLayoutSnapshot(): void {
  if (typeof window === 'undefined') return
  const snapshot: PanelLayoutSnapshot = {
    left: panelLeft.value,
    top: panelTop.value,
    collapsed: isCollapsed.value,
  }
  try {
    window.localStorage.setItem(buildPanelLayoutStorageKey(), JSON.stringify(snapshot))
  } catch {
    // Ignore storage failures to avoid breaking panel interaction in private mode.
  }
}

function loadPanelLayoutSnapshot(): PanelLayoutSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(buildPanelLayoutStorageKey())
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PanelLayoutSnapshot>
    if (typeof parsed.left !== 'number' || typeof parsed.top !== 'number') return null
    return {
      left: parsed.left,
      top: parsed.top,
      collapsed: Boolean(parsed.collapsed),
    }
  } catch {
    return null
  }
}

function initializePanelPosition(): void {
  if (panelPositionReady.value || typeof window === 'undefined') return

  const restored = loadPanelLayoutSnapshot()
  if (restored) {
    isCollapsed.value = restored.collapsed
    applyPanelPosition(restored.left, restored.top)
    panelPositionReady.value = true
    return
  }

  const defaultWidth = getFrameSize().width
  const defaultLeft = Math.max(12, window.innerWidth - defaultWidth - 24)
  const defaultTop = readViewportHeaderOffset()
  applyPanelPosition(defaultLeft, defaultTop)
  panelPositionReady.value = true
}

function removeDragListeners(): void {
  if (typeof window === 'undefined') return
  window.removeEventListener('pointermove', handleDragMove)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
}

function startDrag(event: PointerEvent): void {
  if (event.button !== 0) return
  initializePanelPosition()
  dragPointerId = event.pointerId
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragOriginLeft = panelLeft.value
  dragOriginTop = panelTop.value
  isDragging.value = true

  if (typeof window !== 'undefined') {
    window.addEventListener('pointermove', handleDragMove)
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('pointercancel', stopDrag)
  }
}

function handleDragMove(event: PointerEvent): void {
  if (!isDragging.value) return
  if (dragPointerId !== null && event.pointerId !== dragPointerId) return
  applyPanelPosition(
    dragOriginLeft + (event.clientX - dragStartX),
    dragOriginTop + (event.clientY - dragStartY),
  )
}

function stopDrag(event?: PointerEvent): void {
  if (!isDragging.value) return
  if (event && dragPointerId !== null && event.pointerId !== dragPointerId) return
  isDragging.value = false
  dragPointerId = null
  removeDragListeners()
  savePanelLayoutSnapshot()
}

function toggleCollapsed(): void {
  isCollapsed.value = !isCollapsed.value
  void nextTick(() => {
    initializePanelPosition()
    applyPanelPosition(panelLeft.value, panelTop.value)
    savePanelLayoutSnapshot()
  })
}

function handleViewportResize(): void {
  if (!panelPositionReady.value) return
  applyPanelPosition(panelLeft.value, panelTop.value)
}

const panelStyle = computed<CSSProperties>(() => ({
  left: `${panelLeft.value}px`,
  top: `${panelTop.value}px`,
  visibility: panelPositionReady.value ? 'visible' : 'hidden',
}))

const sharedSessionHost = usePageModelSessionHost({
  getLiveModelAdapter: () => props.state.createLiveEditModelAdapter(),
  getSessionKey: () => props.state.activePageId.value ?? '',
})
const currentAiChatStorageKey = computed(() => buildAiChatStorageKey(props.state.activePageId.value))

const supportsAiEditing = computed(() => {
  return props.activeFile === 'rule.json'
    || props.activeFile === 'script.js'
    || props.activeFile === 'style.css'
    || props.activeFile === 'pagedata.json'
})

const isPageDataFile = computed(() => props.activeFile === 'pagedata.json')

const pageDataBlockReason = computed(() => {
  if (!props.state.pageDataDesignerDirty.value) return ''
  return '当前 DataSet 设计器存在尚未保存到服务端的本地模型改动。AI 会继续编辑同一内存模型；点击保存时会统一写回 pagedata.json 并提交到服务端。'
})

const pageDataTip = computed(() => {
  if (pageDataBlockReason.value) {
    return 'pagedata.json 当前与 rule/script/style 共享同一会话与同一 live model；无论 AI 还是手工编辑，都会先改当前内存模型，保存时再统一写回 pagedata.json。'
  }
  return 'pagedata.json 当前与 rule/script/style 共享同一页面模型级 tool 会话；AI 会在同页 4 文件语境中优先执行 datasetTool.*。'
})

const pageModelTip = computed(() => {
  if (props.activeFile === 'script.js') {
    return 'script.js 当前复用页面模型级 tool 会话；AI 不维护副本，只通过 FC 读写统一的 4 文件 live model。'
  }
  if (props.activeFile === 'style.css') {
    return 'style.css 当前复用页面模型级 tool 会话；AI 不维护副本，只通过 FC 读写统一的 4 文件 live model。'
  }
  return 'rule.json 当前直接走页面模型级 tool 会话；AI 不维护副本，只通过 FC 读写统一的 4 文件 live model。'
})

const currentAiTip = computed(() => isPageDataFile.value ? pageDataTip.value : pageModelTip.value)
const currentAiTitle = computed(() => isPageDataFile.value ? 'DataSet 模型级编辑' : '页面模型级编辑')
const currentAiPlaceholder = computed(() => isPageDataFile.value
  ? '支持多轮对话；当前会在同页 4 文件上下文中直接修改 pagedata 对应数据模型'
  : '支持多轮对话；当前会通过 stills tool 层执行 4 文件模型级编辑')

const ruleSession = useRuleEditSession({
  getSessionKey: () => props.state.activePageId.value ?? '',
  getLiveModelAdapter: () => props.state.createLiveEditModelAdapter(),
  sessionHost: sharedSessionHost,
  ensureContextLoaded: ensureAllContextFilesLoaded,
  onStatus: (message, type) => {
    props.state.addStatus(message, type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'error')
  },
})

watch(() => props.state.activePageId.value, (pageId, previousPageId) => {
  if (pageId !== previousPageId) {
    sharedSessionHost.resetSync()
    ruleSession.reset()
  }
})

async function ensureAllContextFilesLoaded() {
  await props.state.ensureActivePageFilesLoaded()
}

function buildContinuationPrompt(prompt: string, historyMsgs: AiChatSendRequest['historyMsgs']): string {
  const hasBackendSession = sharedSessionHost.getResumeSessionOptions().resumeSessionId !== undefined
  const previousMessages = historyMsgs.slice(0, -1).filter(message => message.role !== 'system')
  if (hasBackendSession || previousMessages.length === 0) {
    return prompt
  }

  const transcript = previousMessages
    .slice(-8)
    .map((message) => `${message.role === 'assistant' ? 'AI' : '用户'}: ${message.content}`)
    .join('\n')

  return [
    '[全局对话延续]',
    `当前页面: ${props.state.activePageId.value ?? 'unknown'}`,
    `当前焦点文件: ${props.activeFile ?? 'unknown'}`,
    '以下是最近对话摘录；当前真实读写只以当前页面 live model 为准，AI 不维护独立模型副本。',
    transcript,
    '',
    '[本轮用户需求]',
    prompt,
  ].join('\n')
}

const pageModelChatSender: AiChatSender = async (request) => {
  const prompt = [...request.historyMsgs].reverse().find(message => message.role === 'user')?.content?.trim() ?? ''
  if (!prompt) return
  request.onDelta?.('已接收需求，正在执行页面模型级编辑...\n')
  await runRuleSessionChat(request, buildContinuationPrompt(prompt, request.historyMsgs))
}

function buildPageDataFocusedPrompt(prompt: string): string {
  return [
    '[pagedata 目标约束]',
    '当前目标文件是 pagedata.json，优先使用 datasetTool.* 完成需求。',
    '除非用户明确要求或存在强依赖，不修改 rule.json、script.js、style.css。',
    '',
    prompt,
  ].join('\n')
}

async function runRuleSessionChat(request: AiChatSendRequest, prompt: string): Promise<void> {
  let streamed = false
  await ruleSession.runLlm(prompt, {
    ...(request.signal ? { signal: request.signal } : {}),
    onDelta: (delta) => {
      streamed = true
      request.onDelta?.(delta)
    },
    onReasoning: (reasoning) => {
      request.onReasoning?.(reasoning)
    },
  })
  if (request.signal?.aborted === true) return
  if (streamed) return
  const latest = ruleSession.log.value.at(-1)
  if (!latest) {
    request.onDelta?.('模型级编辑已执行完成。')
    return
  }
  if (latest.type === 'error') {
    throw new Error(`${latest.tag}: ${latest.text}`)
  }
  request.onDelta?.(`${latest.tag}: ${latest.text}`)
}

const pageDataModelChatSender: AiChatSender = async (request) => {
  const prompt = [...request.historyMsgs].reverse().find(message => message.role === 'user')?.content?.trim() ?? ''
  if (!prompt) return

  request.onDelta?.('已接收需求，正在执行 DataSet 模型级编辑...\n')
  await runRuleSessionChat(
    request,
    buildContinuationPrompt(buildPageDataFocusedPrompt(prompt), request.historyMsgs),
  )
}

const currentAiSender = computed<AiChatSender>(() => isPageDataFile.value ? pageDataModelChatSender : pageModelChatSender)

onMounted(() => {
  void nextTick(() => {
    initializePanelPosition()
  })
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleViewportResize)
  }
})

onBeforeUnmount(() => {
  removeDragListeners()
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleViewportResize)
  }
})
</script>

<style scoped>
/* ─── inline 模式：嵌入布局右栏 ─── */
.floating-ai-panel__frame--inline {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: none;
  border-radius: 0;
  background: var(--el-bg-color);
}

.floating-ai-panel__frame--inline .floating-ai-panel__summary {
  cursor: default;
  touch-action: auto;
}

/* ─── tool call log ─── */
.floating-ai-panel__tool-log {
  margin: 8px 14px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
  padding-right: 4px;
}

.tool-log-entry {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.5;
  background: var(--el-fill-color);
}

.tool-log-entry--info { color: var(--el-text-color-secondary); }
.tool-log-entry--success { color: var(--el-color-success); background: var(--el-color-success-light-9); }
.tool-log-entry--error { color: var(--el-color-danger); background: var(--el-color-danger-light-9); }

.tool-log-entry__type {
  text-transform: uppercase;
  font-size: 10px;
  opacity: 0.75;
}

.tool-log-entry__tag {
  font-weight: 500;
  font-family: ui-monospace, monospace;
  word-break: break-word;
}

.tool-log-entry__text {
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  word-break: break-word;
}

/* ─── floating 模式 ─── */
.floating-ai-panel {
  position: fixed;
  width: min(360px, calc(100vw - 24px));
  z-index: 2100;
  pointer-events: none;
}

.floating-ai-panel--dragging {
  user-select: none;
}

.floating-ai-panel__frame {
  display: flex;
  flex-direction: column;
  height: min(72dvh, calc(100dvh - var(--spark-header-height) - var(--spark-footer-height) - 48px));
  min-height: 320px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 18px;
  background: color-mix(in srgb, var(--el-bg-color) 94%, white 6%);
  box-shadow: 0 16px 40px rgb(15 23 42 / 0.18);
  pointer-events: auto;
}

.floating-ai-panel__frame--collapsed {
  height: auto;
  min-height: 0;
}

.floating-ai-panel__summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: linear-gradient(135deg, rgb(255 255 255 / 0.98), rgb(241 245 249 / 0.92));
  cursor: move;
  touch-action: none;
}

.floating-ai-panel__summary-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.floating-ai-panel__summary-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
  cursor: default;
}

.floating-ai-panel__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.floating-ai-panel__context {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.floating-ai-panel__body,
.floating-ai-panel__placeholder {
  flex: 1;
  min-height: 0;
}

.floating-ai-panel__body {
  display: flex;
  flex-direction: column;
}

.floating-ai-panel__placeholder {
  padding: 14px;
}

.floating-ai-panel__placeholder--inner {
  padding-top: 10px;
}

.floating-ai-panel__rule-tip {
  margin: 14px 14px 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #eff6ff;
  border: 1px dashed #93c5fd;
  color: #1d4ed8;
  font-size: 12px;
  line-height: 1.5;
}

.floating-ai-panel__rule-tip--dataset {
  background: #ecfeff;
  border-color: #67e8f9;
  color: #0f766e;
}

.floating-ai-panel__body :deep(.ai-chat-widget.compact) {
  flex: 1;
  min-height: 0;
  padding: 14px;
}

.floating-ai-panel__dataset-section {
  margin: 0 14px 14px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: color-mix(in srgb, var(--el-bg-color) 97%, #e2e8f0 3%);
  overflow: auto;
  max-height: 168px;
}

.floating-ai-panel__dataset-alert {
  margin: 10px 14px 0;
}

.floating-ai-panel__section-label {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.floating-ai-panel__task-step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.floating-ai-panel__task-step + .floating-ai-panel__task-step {
  margin-top: 6px;
}

.floating-ai-panel__task-icon {
  flex: 0 0 auto;
}

.floating-ai-panel__task-name {
  color: var(--el-text-color-primary);
  word-break: break-word;
}

.floating-ai-panel__trace {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

.floating-ai-panel__trace :deep(code) {
  padding: 1px 4px;
  border-radius: 4px;
  background: rgb(148 163 184 / 0.12);
  font-size: 11px;
}

@media (max-width: 1280px) {
  .floating-ai-panel {
    width: min(340px, calc(100vw - 32px));
  }
}
</style>