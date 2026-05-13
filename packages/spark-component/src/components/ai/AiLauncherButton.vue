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
 * @skill ai-launcher-button
 * @catalogInternal
 * @description AI 面板启动按钮，绑定 AiSessionConfig 并负责打开/关闭全局 AI 面板，支持图标、快捷键、激活态事件和打开前取消钩子。
 *
 * AiLauncherButton — 通用 AI 入口按钮。
 *
 * 组件只做一件事：绑定一个 AI 业务注册体（`config`）并控制面板开关。
 * 不再承担任何摊平业务字段拼装逻辑。
 */
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'
import * as Icons from '@element-plus/icons-vue'
import { Logger } from '@spark-view/spark-utils'
import {
  useAiPanelStore,
  type AiSessionConfig,
} from './useAiPanelStore'

const logger = Logger('AiLauncherButton')

// ── Props ───────────────────────────────────────────────────────────────────
interface Props {
  /** AI 业务注册体（唯一业务入口）。 */
  config: AiSessionConfig

  /** Button label; 展示在 AI 启动按钮上的文字。 */
  label?: string
  /** Button size; 对齐 Element Plus small/default/large 尺寸。 */
  size?: 'small' | 'default' | 'large'
  /** Button visual type; 控制主色、危险色等按钮语义色。 */
  type?: '' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
  /** Link style; true 时使用轻量链接按钮外观。 */
  link?: boolean
  /** Icon name; 对应 Element Plus icons-vue 的图标组件名。 */
  icon?: string
  /** Icon size; 设置按钮图标像素尺寸。 */
  iconSize?: number
  /** Disabled state; true 时禁止点击和快捷键打开面板。 */
  disabled?: boolean

  /**
   * 全局快捷键，例如 `"ctrl+shift+a"` / `"meta+k"`。
   * 支持修饰符：`ctrl` / `meta` / `shift` / `alt`，键名使用小写（`a` / `k` / `escape` 等）。
   * 在输入框 / 可编辑元素中按下时会被忽略，避免劫持用户输入。
   * 快捷键触发行为与点击完全一致（toggle）。
   */
  shortcut?: string
}

/** before-open 事件载荷：允许宿主在打开 AI 面板前读取 config 并取消本次打开。 */
interface AiLauncherBeforeOpenPayload {
  /** 即将打开的 AI 会话配置。 */
  config: AiSessionConfig
  /** 取消本次打开请求；调用后不会执行 store.open。 */
  cancel: () => void
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
  /**
   * 即将打开——在 `store.open()` 之前触发，payload 提供 `cancel()` 阻止本次打开。
   * @param payload Before-open payload with session config and cancel function.
   */
  'before-open': [payload: AiLauncherBeforeOpenPayload]
}>()

const sessionConfig: AiSessionConfig = props.config
if (!sessionConfig) {
  throw new Error('[AiLauncherButton] `config` 不能为空。')
}

// ── 与全局 AI 面板的绑定 ────────────────────────────────────────────────────
const store = useAiPanelStore()

const isActive = computed(
  () => store.visible.value && store.getCurrentConfig() === sessionConfig,
)

watch(isActive, (active) => emit('active-change', active), { immediate: true })

onScopeDispose(() => {
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
    logger.error('启动 AI 流程失败', error)
  } finally {
    launching.value = false
  }
}

watch(() => props.disabled, (nextDisabled) => {
  if (!isActive.value) return
  if (nextDisabled) {
    store.close()
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
