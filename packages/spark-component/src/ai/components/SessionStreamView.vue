<template>
  <el-card :class="$style['stream-view']" shadow="never">
    <div v-if="entries.length === 0" :class="$style['stream-view__empty']">
      <el-empty :description="emptyText" />
    </div>
    <div v-else :class="$style['stream-view__list']">
      <template v-for="(entry, index) in entries" :key="index">
        <SessionChatBubble
          v-if="entry.kind === 'user-message'"
          role="user"
          :content="entry.content"
          :timestamp="entry.timestamp"
        />
        <SessionChatBubble
          v-else-if="entry.kind === 'assistant-delta'"
          role="assistant"
          :content="entry.content"
          :is-typing="isStreaming"
        />
        <SessionChatBubble
          v-else-if="entry.kind === 'assistant-complete'"
          role="assistant"
          :content="entry.content"
        />
        <SessionReasoningBlock
          v-else-if="entry.kind === 'reasoning'"
          :text="entry.item.text"
          :collapsed="entry.item.collapsed"
          :is-active="isReasoning && !entry.item.collapsed"
        />
        <SessionToolCallCard
          v-else-if="entry.kind === 'tool-call'"
          :tool-call="entry.item"
        />
        <SessionChatBubble
          v-else-if="entry.kind === 'error'"
          role="error"
          :content="entry.message"
          :timestamp="entry.timestamp"
        />
        <SessionChatBubble
          v-else-if="entry.kind === 'system-message'"
          role="system"
          :content="entry.content"
          :timestamp="entry.timestamp"
        />
      </template>
    </div>
  </el-card>
</template>

<script setup lang="ts">
/**
 * 流式消息主视图。按 StreamDisplayEntry.kind 分发到对应子组件。
 */
import SessionChatBubble from './SessionChatBubble.vue'
import SessionReasoningBlock from './SessionReasoningBlock.vue'
import SessionToolCallCard from './SessionToolCallCard.vue'
import type { SessionStreamViewProps } from './SessionStreamView.props'

withDefaults(defineProps<SessionStreamViewProps>(), {
  emptyText: '等待 AI 响应...',
})
</script>

<style module>
.stream-view {
  height: 100%;
}

.stream-view__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.stream-view__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
