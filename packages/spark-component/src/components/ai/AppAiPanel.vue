<template>
  <transition name="app-ai-panel-fade">
    <div
      v-show="visible"
      class="app-ai-panel"
      :class="{ 'is-dragging': dragging, 'is-resizing': resizing }"
      :style="panelStyle"
      role="dialog"
      aria-label="AI 助手"
    >
      <header class="app-ai-panel__header" @mousedown="onDragStart">
        <div class="app-ai-panel__title-wrap">
          <span class="app-ai-panel__title-dot" />
          <span class="app-ai-panel__title">{{ title }}</span>
        </div>
        <div class="app-ai-panel__actions">
          <button
            class="app-ai-panel__icon-btn"
            :aria-label="maximized ? '还原' : '最大化'"
            :title="maximized ? '还原' : '最大化'"
            @mousedown.stop
            @click="toggleMaximize"
          >
            <svg v-if="!maximized" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2.5" y="2.5" width="11" height="11" rx="1.2" />
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="4.5" y="2.5" width="9" height="9" rx="1" />
              <rect x="2.5" y="4.5" width="9" height="9" rx="1" />
            </svg>
          </button>
          <button
            class="app-ai-panel__icon-btn"
            aria-label="关闭"
            title="关闭"
            @mousedown.stop
            @click="store.close"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M4 4 L12 12 M12 4 L4 12" />
            </svg>
          </button>
        </div>
      </header>

      <div class="app-ai-panel__body">
        <AiChatWidget
          v-if="sender && storageKey"
          :key="storageKey"
          :storage-key="storageKey"
          :disable-persistence="disablePersistence"
          :page-id="pageId"
          :sender="sender"
          :title="title"
          :placeholder="placeholder"
          :stream-ai-chat-text="streamAiChatText"
          :parse-token-usage="parseTokenUsage"
          :upload-file="uploadFile"
          :report-fc-error="fcErrorReporter"
          :turn-concurrency="turnConcurrency"
          :draft-actions="draftActions"
          :action-title-map="actionTitleMap"
          :action-prefix-title-map="actionPrefixTitleMap"
          :action-suffix-title-map="actionSuffixTitleMap"
          v-bind="externalToolLogProps"
          :compact="false"
          mode="multi"
        />
        <div v-else class="app-ai-panel__empty">
          <div class="app-ai-panel__empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </div>
          <p>尚未注入 AI 会话</p>
          <span>请在业务页进入对应入口启动 AI</span>
        </div>
      </div>

      <template v-if="!maximized">
        <div class="app-ai-panel__resize app-ai-panel__resize--l" @mousedown.prevent="(e) => onResizeStart(e, 'l')" />
        <div class="app-ai-panel__resize app-ai-panel__resize--r" @mousedown.prevent="(e) => onResizeStart(e, 'r')" />
        <div class="app-ai-panel__resize app-ai-panel__resize--t" @mousedown.prevent="(e) => onResizeStart(e, 't')" />
        <div class="app-ai-panel__resize app-ai-panel__resize--b" @mousedown.prevent="(e) => onResizeStart(e, 'b')" />
        <div class="app-ai-panel__resize app-ai-panel__resize--tl" @mousedown.prevent="(e) => onResizeStart(e, 'tl')" />
        <div class="app-ai-panel__resize app-ai-panel__resize--tr" @mousedown.prevent="(e) => onResizeStart(e, 'tr')" />
        <div class="app-ai-panel__resize app-ai-panel__resize--bl" @mousedown.prevent="(e) => onResizeStart(e, 'bl')" />
        <div class="app-ai-panel__resize app-ai-panel__resize--br" @mousedown.prevent="(e) => onResizeStart(e, 'br')" />
      </template>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, ref, onBeforeUnmount, watch } from 'vue'
import AiChatWidget from './AiChatWidget.vue'
import { useAiPanelStore } from './useAiPanelStore'
import { readCache, writeCache, PANEL_LAYOUT_PREFIX } from './aiSessionCache'
import type { FileAttachment, StreamAiChatText, TokenUsage } from './useAiChat'

const props = defineProps<{
  streamAiChatText?: StreamAiChatText | undefined
  parseTokenUsage?: ((usageRaw: Record<string, unknown>) => TokenUsage) | undefined
  uploadFile?: ((file: File) => Promise<FileAttachment>) | undefined
}>()

const streamAiChatText = props.streamAiChatText
const parseTokenUsage = props.parseTokenUsage
const uploadFile = props.uploadFile

const store = useAiPanelStore()
const visible = store.visible
const storageKey = store.storageKey
const disablePersistence = store.disablePersistence
const pageId = store.pageId
const title = store.title
const placeholder = store.placeholder
const externalToolLogs = store.externalToolLogs
const clearExternalToolLogs = store.clearExternalToolLogs
const fcErrorReporter = store.fcErrorReporter
const turnConcurrency = store.turnConcurrency
const draftActions = store.draftActions
const actionTitleMap = store.actionTitleMap
const actionPrefixTitleMap = store.actionPrefixTitleMap
const actionSuffixTitleMap = store.actionSuffixTitleMap
const sender = store.sender

const externalToolLogProps = computed(() => {
  if (externalToolLogs.value === undefined) return {}
  return {
    externalToolLogs: externalToolLogs.value,
    ...(clearExternalToolLogs.value !== undefined ? { clearExternalToolLogs: clearExternalToolLogs.value } : {}),
  }
})

// ────────────────── 位置 / 尺寸（localStorage 持久化） ──────────────────
const STORAGE_KEY = `${PANEL_LAYOUT_PREFIX}layout`
const DEFAULT_WIDTH = 420
const DEFAULT_HEIGHT = 640
const MIN_WIDTH = 320
const MIN_HEIGHT = 360

interface Layout {
  x: number
  y: number
  width: number
  height: number
  maximized?: boolean
}

function loadLayout(): Layout {
  try {
    const raw = readCache(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Layout>
      if (
        typeof parsed.x === 'number' &&
        typeof parsed.y === 'number' &&
        typeof parsed.width === 'number' &&
        typeof parsed.height === 'number'
      ) {
        return {
          x: parsed.x,
          y: parsed.y,
          width: Math.max(parsed.width, MIN_WIDTH),
          height: Math.max(parsed.height, MIN_HEIGHT),
          maximized: !!parsed.maximized,
        }
      }
    }
  } catch {
    /* ignore */
  }
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  return {
    x: Math.max(16, vw - DEFAULT_WIDTH - 24),
    y: 64,
    width: DEFAULT_WIDTH,
    height: Math.min(DEFAULT_HEIGHT, vh - 96),
  }
}

const initial = loadLayout()
const x = ref(initial.x)
const y = ref(initial.y)
const width = ref(initial.width)
const height = ref(initial.height)
const maximized = ref(!!initial.maximized)
function persist() {
  try {
    writeCache(
      STORAGE_KEY,
      JSON.stringify({
        x: x.value,
        y: y.value,
        width: width.value,
        height: height.value,
        maximized: maximized.value,
      }),
    )
  } catch {
    /* ignore */
  }
}
watch([x, y, width, height, maximized], persist)

const panelStyle = computed(() => {
  if (maximized.value) {
    return {
      left: '16px',
      top: '16px',
      width: 'calc(100vw - 32px)',
      height: 'calc(100vh - 32px)',
    }
  }
  return {
    left: `${x.value}px`,
    top: `${y.value}px`,
    width: `${width.value}px`,
    height: `${height.value}px`,
  }
})

function toggleMaximize() {
  maximized.value = !maximized.value
}

// ────────────────── 拖拽（标题栏） ──────────────────
const dragging = ref(false)
let dragOffsetX = 0
let dragOffsetY = 0

function onDragStart(e: MouseEvent) {
  if (maximized.value) return
  if ((e.target as HTMLElement).closest('.app-ai-panel__icon-btn')) return
  dragging.value = true
  dragOffsetX = e.clientX - x.value
  dragOffsetY = e.clientY - y.value
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
  e.preventDefault()
}

function onDragMove(e: MouseEvent) {
  if (!dragging.value) return
  const vw = window.innerWidth
  const vh = window.innerHeight
  let nx = e.clientX - dragOffsetX
  let ny = e.clientY - dragOffsetY
  nx = Math.max(48 - width.value, Math.min(nx, vw - 48))
  ny = Math.max(0, Math.min(ny, vh - 40))
  x.value = nx
  y.value = ny
}

function onDragEnd() {
  dragging.value = false
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
}

// ────────────────── Resize ──────────────────
type ResizeDir = 'l' | 'r' | 't' | 'b' | 'tl' | 'tr' | 'bl' | 'br'
const resizing = ref(false)
let resizeDir: ResizeDir = 'r'
let startX = 0
let startY = 0
let startW = 0
let startH = 0
let startLeft = 0
let startTop = 0

function onResizeStart(e: MouseEvent, dir: ResizeDir) {
  if (maximized.value) return
  resizing.value = true
  resizeDir = dir
  startX = e.clientX
  startY = e.clientY
  startW = width.value
  startH = height.value
  startLeft = x.value
  startTop = y.value
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd)
}

function onResizeMove(e: MouseEvent) {
  if (!resizing.value) return
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  const vw = window.innerWidth
  const vh = window.innerHeight

  if (resizeDir.includes('r')) {
    width.value = Math.max(MIN_WIDTH, Math.min(startW + dx, vw - startLeft - 8))
  }
  if (resizeDir.includes('l')) {
    const nw = Math.max(MIN_WIDTH, startW - dx)
    const nl = startLeft + (startW - nw)
    width.value = nw
    x.value = Math.max(8, nl)
  }
  if (resizeDir.includes('b')) {
    height.value = Math.max(MIN_HEIGHT, Math.min(startH + dy, vh - startTop - 8))
  }
  if (resizeDir.includes('t')) {
    const nh = Math.max(MIN_HEIGHT, startH - dy)
    const nt = startTop + (startH - nh)
    height.value = nh
    y.value = Math.max(0, nt)
  }
}

function onResizeEnd() {
  resizing.value = false
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
}

function onWindowResize() {
  if (maximized.value) return
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (x.value + 48 > vw) x.value = Math.max(8, vw - width.value - 8)
  if (y.value + 40 > vh) y.value = Math.max(0, vh - height.value - 8)
  if (width.value > vw - 16) width.value = Math.max(MIN_WIDTH, vw - 16)
  if (height.value > vh - 16) height.value = Math.max(MIN_HEIGHT, vh - 16)
}
if (typeof window !== 'undefined') {
  window.addEventListener('resize', onWindowResize)
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', onWindowResize)
  }
})
</script>

<style scoped>
.app-ai-panel {
  position: fixed;
  z-index: 2002;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 12px;
  box-shadow:
    0 12px 32px -8px rgba(0, 0, 0, 0.18),
    0 4px 12px -2px rgba(0, 0, 0, 0.08),
    0 0 0 1px rgba(0, 0, 0, 0.02);
  overflow: hidden;
  user-select: none;
  backdrop-filter: saturate(180%) blur(6px);
}

.app-ai-panel.is-dragging,
.app-ai-panel.is-resizing {
  box-shadow:
    0 18px 48px -10px rgba(0, 0, 0, 0.28),
    0 6px 16px -2px rgba(0, 0, 0, 0.12);
  transition: none;
}

.app-ai-panel-fade-enter-active,
.app-ai-panel-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.app-ai-panel-fade-enter-from,
.app-ai-panel-fade-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}

.app-ai-panel__header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 10px 14px;
  background: linear-gradient(135deg, var(--el-color-primary-light-9, #ecf5ff) 0%, var(--el-bg-color, #fff) 100%);
  border-bottom: 1px solid var(--el-border-color-lighter, #e4e7ed);
  cursor: move;
}

.app-ai-panel__title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.app-ai-panel__title-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-primary, #409eff);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-primary, #409eff) 18%, transparent);
  flex-shrink: 0;
}

.app-ai-panel__title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-ai-panel__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.app-ai-panel__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.app-ai-panel__icon-btn:hover {
  background: var(--el-fill-color, #f5f7fa);
  color: var(--el-color-primary, #409eff);
}

.app-ai-panel__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-bg-color-page, #fafafa);
  user-select: text;
}

.app-ai-panel__body :deep(.ai-chat-widget) {
  flex: 1;
  min-height: 0;
  border: none;
  border-radius: 0;
  background: transparent;
}

.app-ai-panel__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  gap: 6px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.app-ai-panel__empty-icon {
  color: var(--el-color-primary, #409eff);
  opacity: 0.55;
  margin-bottom: 4px;
}

.app-ai-panel__empty p {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.app-ai-panel__empty span {
  font-size: 12px;
}

.app-ai-panel__resize {
  position: absolute;
  z-index: 2;
}
.app-ai-panel__resize--l {
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 4px;
  cursor: ew-resize;
}
.app-ai-panel__resize--r {
  right: 0;
  top: 8px;
  bottom: 8px;
  width: 4px;
  cursor: ew-resize;
}
.app-ai-panel__resize--t {
  left: 8px;
  right: 8px;
  top: 0;
  height: 4px;
  cursor: ns-resize;
}
.app-ai-panel__resize--b {
  left: 8px;
  right: 8px;
  bottom: 0;
  height: 4px;
  cursor: ns-resize;
}
.app-ai-panel__resize--tl {
  left: 0;
  top: 0;
  width: 10px;
  height: 10px;
  cursor: nwse-resize;
}
.app-ai-panel__resize--tr {
  right: 0;
  top: 0;
  width: 10px;
  height: 10px;
  cursor: nesw-resize;
}
.app-ai-panel__resize--bl {
  left: 0;
  bottom: 0;
  width: 10px;
  height: 10px;
  cursor: nesw-resize;
}
.app-ai-panel__resize--br {
  right: 0;
  bottom: 0;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
}
.app-ai-panel__resize--br::after {
  content: '';
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 6px;
  height: 6px;
  border-right: 2px solid var(--el-border-color, #dcdfe6);
  border-bottom: 2px solid var(--el-border-color, #dcdfe6);
  border-bottom-right-radius: 2px;
}
</style>
