<!--
@module @spark-appworks/spark-component:ai/components/SessionChatBubble
@spark-appworks/spark-component 的 ai/components/SessionChatBubble 模块。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <div :class="[$style['chat-bubble'], $style[`chat-bubble--${role}`]]">
    <div :class="$style['chat-bubble__header']">
      <span :class="$style['chat-bubble__role']">{{ roleLabel }}</span>
      <span v-if="timestamp !== undefined" :class="$style['chat-bubble__time']">
        {{ formattedTime }}
      </span>
    </div>
    <div :class="$style['chat-bubble__content']">
      <span v-if="isTyping" :class="$style['chat-bubble__cursor']">|</span>
      {{ content }}
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 单条聊天气泡。支持 user/assistant/system/error 四种角色。
 */
import { computed } from 'vue'
import type { SessionChatBubbleProps } from './SessionChatBubble.props'

const props = withDefaults(defineProps<SessionChatBubbleProps>(), {
  isTyping: false,
})

const roleLabel = computed(() => {
  switch (props.role) {
    case 'user': return '用户'
    case 'assistant': return 'AI 助手'
    case 'system': return '系统'
    case 'error': return '错误'
  }
})

const formattedTime = computed(() => {
  if (props.timestamp === undefined) return ''
  return new Date(props.timestamp).toLocaleTimeString()
})
</script>

<style module>
.chat-bubble {
  padding: 12px 16px;
  border-radius: 8px;
  max-width: 100%;
}

.chat-bubble--user {
  background-color: var(--el-color-primary-light-9);
  align-self: flex-end;
}

.chat-bubble--assistant {
  background-color: var(--el-fill-color-light);
}

.chat-bubble--system {
  background-color: var(--el-color-warning-light-9);
  border-left: 3px solid var(--el-color-warning);
}

.chat-bubble--error {
  background-color: var(--el-color-danger-light-9);
  border-left: 3px solid var(--el-color-danger);
}

.chat-bubble__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.chat-bubble__role {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.chat-bubble__time {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.chat-bubble__content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}

.chat-bubble__cursor {
  display: inline-block;
  animation: blink 1s step-end infinite;
  color: var(--el-color-primary);
}

@keyframes blink {
  50% { opacity: 0; }
}
</style>
