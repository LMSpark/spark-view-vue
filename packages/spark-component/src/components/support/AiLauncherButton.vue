<template>
  <el-button
    :size="size"
    :link="link"
    :type="ai.isActive.value ? 'primary' : type"
    :disabled="disabled"
    @click="ai.toggle"
  >
    <el-icon v-if="isElIcon && normalizedIconName" :size="iconSize"><component :is="iconMap[normalizedIconName]" /></el-icon>
    <span v-else-if="icon" class="ai-launcher-btn__emoji-icon">{{ icon }}</span>
    <span v-if="label" :class="{ 'ai-launcher-btn__label-with-icon': !!icon }">{{ label }}</span>
  </el-button>
</template>

<script setup lang="ts">
/**
 * AiLauncherButton — 通用 AI 入口按钮，承载标准化的 AiSessionConfig。
 *
 * ── 两种配置方式（二选一，优先级：`config` > 摊平 props）──
 *
 * 1) 原生组合式调用（业务 composable / Vue 组件）——直接传整个 config：
 *    ```vue
 *    <AiLauncherButton :config="pageSession.config" />
 *    ```
 *
 * 2) 业务脚本 / 页面配置 / `h()` 构造——摊平的字段式 props：
 *    `script.js` 沙盒通常无法直接构造 Ref/Computed 或整体 config，
 *    因此本组件额外接受一组摊平字段（storage-key / session-title /
 *    placeholder / sender / external-tool-logs / before-open），
 *    内部自动合成稳定的 {@link AiSessionConfig}。
 *
 *    ```js
 *    // script.js
 *    h('ai-launcher-button', {
 *      storageKey: 'order-list:ai',
 *      sessionTitle: '订单助手',
 *      sender: async (prompt) => SparkData.ai.invoke(prompt),
 *      label: 'AI',
 *    })
 *    ```
 *
 * 同时提供 `config` 与摊平 props 时以 `config` 为准（避免双源歧义）。
 */
import { computed, shallowRef, watch, type Ref, type ComputedRef } from 'vue'
import * as Icons from '@element-plus/icons-vue'
import { useAiSession } from '../../composables/useAiSession'
import type {
  AiSessionConfig,
  AiSessionToolLog,
  AiToolSpec,
  AiToolHandler,
  AiFcLoopConfig,
  AiFeedbackConfig,
} from '../../composables/useAiPanelStore'
import type { AiChatSender } from '../../composables/useAiChat'

interface Props {
  // ── 方式 1：整体配置（最高优先级） ──
  config?: AiSessionConfig

  // ── 方式 2：摊平配置（脚本/页面配置友好） ──
  /** 持久化 key；多会话必须唯一。 */
  storageKey?: string
  /** 聊天发送器。 */
  sender?: AiChatSender
  /** 面板标题。 */
  sessionTitle?: string
  /** 输入框 placeholder。 */
  placeholder?: string
  /** 外部工具日志流。 */
  externalToolLogs?: Ref<AiSessionToolLog[]> | ComputedRef<AiSessionToolLog[]>
  /** 打开前的准备钩子。 */
  beforeOpen?: () => void | Promise<void>

  // ── 全配置：提示词 / 工具 / FC / 反馈 ──
  /** 自定义 system prompt。 */
  systemPrompt?: string
  /** 工具使用指南文本。 */
  toolGuide?: string
  /** 工具目录（function schema 列表）。 */
  toolCatalog?: readonly AiToolSpec[]
  /** 工具实例（函数名 → 执行器）。 */
  toolInstances?: Record<string, AiToolHandler>
  /** SSE + FC 循环配置。 */
  fcLoop?: AiFcLoopConfig
  /** 反馈机制配置。 */
  feedback?: AiFeedbackConfig

  // ── 展示配置 ──
  label?: string
  size?: 'small' | 'default' | 'large'
  type?: '' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
  link?: boolean
  icon?: string
  iconSize?: number
  disabled?: boolean
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

const iconMap = Icons as Record<string, object>
const normalizedIconName = computed(() => {
  const name = props.icon?.trim()
  if (!name) return undefined
  return name
})
const isElIcon = computed(() => {
  if (!normalizedIconName.value) return false
  return normalizedIconName.value in iconMap
})

/**
 * 解析当前 props 得到一个新的 AiSessionConfig 实例。
 * 摊平分支的字段全部使用 getter，天然跟随 props 响应式变化。
 */
function buildConfig(): AiSessionConfig {
  if (props.config) return props.config
  if (!props.storageKey || !props.sender) {
    throw new Error(
      '[AiLauncherButton] 必须提供 `config`，或同时提供摊平形式的 `storageKey` 与 `sender`。',
    )
  }
  const fallbackKey = props.storageKey
  const sender = props.sender
  const cfg: AiSessionConfig = {
    storageKey: () => props.storageKey ?? fallbackKey,
    sender,
    ...(props.sessionTitle !== undefined ? { title: () => props.sessionTitle ?? '' } : {}),
    ...(props.placeholder !== undefined ? { placeholder: () => props.placeholder ?? '' } : {}),
    ...(props.externalToolLogs ? { externalToolLogs: props.externalToolLogs } : {}),
    ...(props.beforeOpen ? { beforeOpen: props.beforeOpen } : {}),
    // 全配置字段：用 getter 跟随 props 响应式。
    ...(props.systemPrompt !== undefined ? { systemPrompt: () => props.systemPrompt ?? '' } : {}),
    ...(props.toolGuide !== undefined ? { toolGuide: () => props.toolGuide ?? '' } : {}),
    ...(props.toolCatalog !== undefined ? { toolCatalog: () => props.toolCatalog ?? [] } : {}),
    ...(props.toolInstances ? { toolInstances: props.toolInstances } : {}),
    ...(props.fcLoop ? { fcLoop: props.fcLoop } : {}),
    ...(props.feedback ? { feedback: props.feedback } : {}),
  }
  return cfg
}

// 稳定身份：只有"配置源"语义变化（整体 config 引用 / sender 引用 /
// 摊平 storageKey）时才重建，避免每次 props 变动都重建 config 对象。
const stableConfig = shallowRef<AiSessionConfig>(buildConfig())
watch(
  () => [props.config, props.sender, props.storageKey] as const,
  () => {
    stableConfig.value = buildConfig()
  },
)

// 透传代理：useAiSession 拿到的始终是一个身份不变的对象，字段读取转发
// 到当前 stableConfig，上游响应式不丢。
const proxiedConfig = new Proxy({} as AiSessionConfig, {
  get(_t, key) {
    return (stableConfig.value as unknown as Record<string | symbol, unknown>)[key]
  },
  has(_t, key) {
    return key in (stableConfig.value as unknown as Record<string | symbol, unknown>)
  },
})

const ai = useAiSession(proxiedConfig)

// 未被直接读取但用于开发期自我校验。
void computed(() => stableConfig.value)
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
