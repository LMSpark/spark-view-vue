<template>
  <el-button
    :size="size"
    :link="link"
    :type="isActive ? 'primary' : type"
    :disabled="disabled || launching"
    :loading="launching"
    @click="handleClick"
  >
    <el-icon v-if="iconComponent && !launching" :size="iconSize"><component :is="iconComponent" /></el-icon>
    <span v-else-if="icon && !launching" class="ai-launcher-btn__emoji-icon">{{ icon }}</span>
    <span v-if="label" :class="{ 'ai-launcher-btn__label-with-icon': !!icon }">{{ label }}</span>
  </el-button>
</template>

<script setup lang="ts">
/**
 * AiLauncherButton — 通用 AI 入口按钮，承载标准化的 AiSessionConfig。
 *
 * ── 两种配置方式（二选一，优先级：`config` > 摊平 props）──
 *
 * 1) 组合式 / Vue 模板调用——直接传整个 config：
 *    ```vue
 *    <AiLauncherButton :config="pageSession.config" />
 *    ```
 *
 * 2) 脚本沙盒 / 页面配置 / `h()` 构造——摊平字段（沙盒无法构造 Ref/Getter）：
 *    ```js
 *    h('ai-launcher-button', {
 *      storageKey: 'order-list:ai',
 *      sessionTitle: '订单助手',
 *      sender: async (req) => SparkData.ai.invoke(req),
 *      toolCatalog: [...],
 *      toolInstances: { ... },
 *    })
 *    ```
 *
 * 同时提供 `config` 与摊平 props 时以 `config` 为准（避免双源歧义）。
 *
 * ── 对外契约 ──
 * 输入：`config` 或摊平字段 + 展示属性
 * 输出：全生命周期 Vue emits（见下方 defineEmits）——消费层可通过模板 `@xxx`
 *       订阅面板 lifecycle / 消息流 / FC 工具循环 / 快照 / 反馈等事件。所有
 *       事件均按"当前按钮 sessionConfig"过滤，互不串扰。
 * 可取消：`before-open` 事件 payload 提供 `cancel()`，消费层可拦截本次打开。
 * 生命周期：作用域结束时自动释放会话绑定；若声明 `shortcut` 则自动注册全局键盘。
 */
import { computed, onMounted, onScopeDispose, ref, toValue, watch, type Ref } from 'vue'
import * as Icons from '@element-plus/icons-vue'
import {
  useAiPanelStore,
  type AiSessionConfig,
  type AiSessionEventMap,
  type AiSessionToolLog,
  type AiToolSpec,
  type AiToolHandler,
  type AiFcLoopConfig,
  type AiFeedbackConfig,
} from '../../composables/useAiPanelStore'
import type { AiChatSender } from '../../composables/useAiChat'

// ── Props ───────────────────────────────────────────────────────────────────
interface Props {
  // 方式 1：整体配置（最高优先级）
  config?: AiSessionConfig

  // 方式 2：摊平配置（脚本 / 页面配置 / h() 友好）
  /** 持久化 key；多会话必须唯一。 */
  storageKey?: string
  /** 聊天发送器。 */
  sender?: AiChatSender
  /** 面板标题。 */
  sessionTitle?: string
  /** 输入框 placeholder。 */
  placeholder?: string
  /** 外部工具日志流。 */
  externalToolLogs?: Ref<AiSessionToolLog[]>
  /** 打开前的准备钩子（按钮会在此期间显示 loading）。 */
  beforeOpen?: () => void | Promise<void>
  /** 自定义 system prompt。 */
  systemPrompt?: string
  /** 工具使用指南文本。 */
  toolGuide?: string
  /** 工具目录。 */
  toolCatalog?: readonly AiToolSpec[]
  /** 工具实例（函数名 → 执行器）。 */
  toolInstances?: Record<string, AiToolHandler>
  /** SSE + FC 循环配置。 */
  fcLoop?: AiFcLoopConfig
  /** 反馈配置。 */
  feedback?: AiFeedbackConfig

  // 展示属性
  label?: string
  size?: 'small' | 'default' | 'large'
  type?: '' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
  link?: boolean
  icon?: string
  iconSize?: number
  disabled?: boolean

  /**
   * 全局快捷键，例如 `"ctrl+shift+a"` / `"meta+k"`。
   * 支持修饰符：`ctrl` / `meta` / `shift` / `alt`，键名使用小写（`a` / `k` / `escape` 等）。
   * 在输入框 / 可编辑元素中按下时会被忽略，避免劫持用户输入。
   * 快捷键触发行为与点击完全一致（toggle）。
   */
  shortcut?: string
}

const props = withDefaults(defineProps<Props>(), {
  label: 'AI',
  size: 'small',
  type: '',
  link: false,
  icon: 'ChatRound',
  iconSize: 14,
  disabled: false,
})

const emit = defineEmits<{
  /** 激活态变化（`isActive` = 面板可见 **且** 当前 config 就是本按钮的 sessionConfig）。 */
  'active-change': [active: boolean]
  /** 快捷键命中（在执行 open/close 之前触发，可用于埋点）。 */
  'shortcut-trigger': []
  /** 即将打开——在 `store.open()` 之前触发，payload 提供 `cancel()` 阻止本次打开。 */
  'before-open': [payload: { config: AiSessionConfig; cancel: () => void }]

  // ── 生命周期（来自 store）──
  'open': [payload: { config: AiSessionConfig }]
  'opened': [payload: { config: AiSessionConfig }]
  'sync': [payload: { previousConfig: AiSessionConfig | null; config: AiSessionConfig }]
  'synced': [payload: { previousConfig: AiSessionConfig | null; config: AiSessionConfig }]
  'close': [payload: { config: AiSessionConfig | null }]
  'closed': [payload: { config: AiSessionConfig | null }]
  'dispose': [payload: { config: AiSessionConfig }]

  // ── 消息流（sender 内部 emit，按当前 sessionConfig 过滤）──
  'message-send': [payload: AiSessionEventMap['message:send']]
  'message-delta': [payload: AiSessionEventMap['message:delta']]
  'message-complete': [payload: AiSessionEventMap['message:complete']]
  'message-error': [payload: AiSessionEventMap['message:error']]

  // ── FC / 工具循环 ──
  'tool-call': [payload: AiSessionEventMap['tool:call']]
  'tool-result': [payload: AiSessionEventMap['tool:result']]
  'tool-error': [payload: AiSessionEventMap['tool:error']]
  'fc-round-start': [payload: AiSessionEventMap['fc:round:start']]
  'fc-round-end': [payload: AiSessionEventMap['fc:round:end']]

  // ── 缓存快照（按 storageKey 过滤）──
  'snapshot-restore': [payload: AiSessionEventMap['snapshot:restore']]
  'snapshot-persist': [payload: AiSessionEventMap['snapshot:persist']]
  'snapshot-clear': [payload: AiSessionEventMap['snapshot:clear']]

  // ── 反馈 ──
  'feedback-submit': [payload: AiSessionEventMap['feedback:submit']]
}>()

// ── 会话身份 ────────────────────────────────────────────────────────────────
// 在 setup 时确定一次；getter 字段闭包到响应式 props，天然跟随变化。
// config 引用即会话身份；会话语义变化应由父层换 key 重挂载，而非原地替换。
function createFlatConfig(): AiSessionConfig {
  if (!props.storageKey || !props.sender) {
    throw new Error(
      '[AiLauncherButton] 必须提供 `config`，或同时提供摊平形式的 `storageKey` 与 `sender`。',
    )
  }
  const sender = props.sender
  return {
    storageKey: () => props.storageKey!,
    sender,
    ...(props.sessionTitle !== undefined ? { title: () => props.sessionTitle ?? '' } : {}),
    ...(props.placeholder !== undefined ? { placeholder: () => props.placeholder ?? '' } : {}),
    ...(props.externalToolLogs ? { externalToolLogs: props.externalToolLogs } : {}),
    ...(props.beforeOpen ? { beforeOpen: props.beforeOpen } : {}),
    ...(props.systemPrompt !== undefined ? { systemPrompt: () => props.systemPrompt ?? '' } : {}),
    ...(props.toolGuide !== undefined ? { toolGuide: () => props.toolGuide ?? '' } : {}),
    ...(props.toolCatalog !== undefined ? { toolCatalog: () => props.toolCatalog ?? [] } : {}),
    ...(props.toolInstances ? { toolInstances: props.toolInstances } : {}),
    ...(props.fcLoop ? { fcLoop: props.fcLoop } : {}),
    ...(props.feedback ? { feedback: props.feedback } : {}),
  }
}

const sessionConfig: AiSessionConfig = props.config ?? createFlatConfig()

// ── 与全局 AI 面板的绑定 ────────────────────────────────────────────────────
const store = useAiPanelStore()

const isActive = computed(
  () => store.visible.value && store.getCurrentConfig() === sessionConfig,
)

watch(isActive, (active) => emit('active-change', active), { immediate: true })

// ── 事件中继：把 store 事件映射成 Vue emit，按 sessionConfig 过滤 ──────────
// 规则：
// - lifecycle (open/opened/close/closed/dispose) 的 payload 本身带 config，
//   按 config 身份过滤；close/closed 接受 null（disposeIf 正常路径）。
// - message/tool/fc/feedback payload 不带 config，退化为"当前 store 持有者"
//   过滤（isCurrent）；非当前持有者直接丢弃。
// - snapshot 按 storageKey 过滤（持久化 key 是会话身份的字符串形式）。
// - 所有订阅在 scope dispose 时统一释放。
function isCurrent(): boolean {
  return store.getCurrentConfig() === sessionConfig
}
const currentStorageKey = computed(() => store.storageKey.value)
const ownStorageKey = computed(() => toValue(sessionConfig.storageKey))

const unsubscribers: Array<() => void> = [
  store.on('open', (p) => { if (p.config === sessionConfig) emit('open', p) }),
  store.on('opened', (p) => { if (p.config === sessionConfig) emit('opened', p) }),
  store.on('sync', (p) => { if (p.config === sessionConfig) emit('sync', p) }),
  store.on('synced', (p) => { if (p.config === sessionConfig) emit('synced', p) }),
  store.on('close', (p) => { if (p.config === sessionConfig || p.config === null) emit('close', p) }),
  store.on('closed', (p) => { if (p.config === sessionConfig || p.config === null) emit('closed', p) }),
  store.on('dispose', (p) => { if (p.config === sessionConfig) emit('dispose', p) }),

  store.on('message:send', (p) => { if (isCurrent()) emit('message-send', p) }),
  store.on('message:delta', (p) => { if (isCurrent()) emit('message-delta', p) }),
  store.on('message:complete', (p) => { if (isCurrent()) emit('message-complete', p) }),
  store.on('message:error', (p) => { if (isCurrent()) emit('message-error', p) }),

  store.on('tool:call', (p) => { if (isCurrent()) emit('tool-call', p) }),
  store.on('tool:result', (p) => { if (isCurrent()) emit('tool-result', p) }),
  store.on('tool:error', (p) => { if (isCurrent()) emit('tool-error', p) }),
  store.on('fc:round:start', (p) => { if (isCurrent()) emit('fc-round-start', p) }),
  store.on('fc:round:end', (p) => { if (isCurrent()) emit('fc-round-end', p) }),

  store.on('snapshot:restore', (p) => { if (p.storageKey === ownStorageKey.value || p.storageKey === currentStorageKey.value) emit('snapshot-restore', p) }),
  store.on('snapshot:persist', (p) => { if (p.storageKey === ownStorageKey.value || p.storageKey === currentStorageKey.value) emit('snapshot-persist', p) }),
  store.on('snapshot:clear', (p) => { if (p.storageKey === ownStorageKey.value || p.storageKey === currentStorageKey.value) emit('snapshot-clear', p) }),

  store.on('feedback:submit', (p) => { if (isCurrent()) emit('feedback-submit', p) }),
]

onScopeDispose(() => {
  for (const unsub of unsubscribers) unsub()
  store.disposeIf(sessionConfig)
})

// ── 图标解析 ────────────────────────────────────────────────────────────────
const iconComponent = computed(() => {
  const name = props.icon?.trim()
  if (!name) return null
  const map = Icons as Record<string, object>
  return map[name] ?? null
})

// ── 交互 ────────────────────────────────────────────────────────────────────
/**
 * 点击语义：按钮自身承担"启动 AI 流程"的完整生命周期。
 *
 * - 激活态 → 关闭面板。
 * - 非激活态 → 先 emit `before-open`（可取消），未取消则 await `store.open()`
 *   走完 `beforeOpen`（上下文预加载 / bootstrap），期间按钮进入 loading。
 * - 启动失败不 rethrow：面板层已决定"beforeOpen 失败不阻塞打开"，按钮层
 *   仅负责日志上报与 emit 生命周期事件。
 */
const launching = ref(false)
const syncingContext = ref(false)

async function syncActiveContext(): Promise<void> {
  if (syncingContext.value || launching.value) return
  syncingContext.value = true
  try {
    await store.sync(sessionConfig)
  } catch (error) {
    console.error('[AiLauncherButton] 同步 AI 上下文失败', error)
  } finally {
    syncingContext.value = false
  }
}

async function handleClick(): Promise<void> {
  if (launching.value) return
  if (isActive.value) {
    store.close()
    return
  }
  let cancelled = false
  emit('before-open', {
    config: sessionConfig,
    cancel: () => { cancelled = true },
  })
  if (cancelled) return
  launching.value = true
  try {
    await store.open(sessionConfig)
  } catch (error) {
    console.error('[AiLauncherButton] 启动 AI 流程失败', error)
  } finally {
    launching.value = false
  }
}

watch([ownStorageKey, () => props.disabled], ([nextStorageKey, nextDisabled], [previousStorageKey]) => {
  if (!isActive.value) return
  if (nextDisabled) {
    store.close()
    return
  }
  if (nextStorageKey !== previousStorageKey) {
    void syncActiveContext()
  }
})

// ── 全局快捷键 ──────────────────────────────────────────────────────────────
/**
 * 解析 "ctrl+shift+a" 这样的组合键字符串为匹配器。
 * 返回 null 表示未启用；否则返回接受 KeyboardEvent 的谓词。
 */
function parseShortcut(spec: string | undefined): ((e: KeyboardEvent) => boolean) | null {
  if (!spec) return null
  const parts = spec.toLowerCase().split('+').map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0) return null
  const needCtrl = parts.includes('ctrl')
  const needMeta = parts.includes('meta')
  const needShift = parts.includes('shift')
  const needAlt = parts.includes('alt')
  const key = parts.find((p) => !['ctrl', 'meta', 'shift', 'alt'].includes(p))
  if (!key) return null
  return (event: KeyboardEvent) => {
    // ctrl 与 meta 视为同义（跨平台），任一匹配即可。
    const ctrlOrMeta = event.ctrlKey || event.metaKey
    const needsCtrlOrMeta = needCtrl || needMeta
    if (needsCtrlOrMeta && !ctrlOrMeta) return false
    if (!needsCtrlOrMeta && ctrlOrMeta) return false
    if (event.shiftKey !== needShift) return false
    if (event.altKey !== needAlt) return false
    return event.key.toLowerCase() === key
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

const shortcutMatcher = computed(() => parseShortcut(props.shortcut))

function handleKeydown(event: KeyboardEvent): void {
  const match = shortcutMatcher.value
  if (!match) return
  if (props.disabled) return
  if (isEditableTarget(event.target)) return
  if (!match(event)) return
  event.preventDefault()
  emit('shortcut-trigger')
  void handleClick()
}

onMounted(() => {
  if (shortcutMatcher.value) window.addEventListener('keydown', handleKeydown)
})
onScopeDispose(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.ai-launcher-btn__label-with-icon {
  margin-left: 4px;
}

.ai-launcher-btn__emoji-icon {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}
</style>
