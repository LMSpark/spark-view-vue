<template>
  <el-card :class="$style['tool-card']" shadow="never">
    <div :class="$style['tool-card__header']">
      <div :class="$style['tool-card__name']">
        <el-icon :size="14">
          <Promotion />
        </el-icon>
        <span>{{ toolCall.toolName }}</span>
      </div>
      <el-tag :type="statusTagType" size="small">
        {{ statusLabel }}
      </el-tag>
    </div>

    <div v-if="toolCall.argsPreview" :class="$style['tool-card__section']">
      <div :class="$style['tool-card__label']">参数</div>
      <el-tooltip :content="toolCall.argsPreview" placement="top" :show-after="500">
        <div :class="$style['tool-card__preview']">{{ toolCall.argsPreview }}</div>
      </el-tooltip>
    </div>

    <div v-if="toolCall.resultSummary" :class="$style['tool-card__section']">
      <div :class="$style['tool-card__label']">结果</div>
      <el-tooltip :content="toolCall.resultSummary" placement="top" :show-after="500">
        <div :class="$style['tool-card__preview']">{{ toolCall.resultSummary }}</div>
      </el-tooltip>
    </div>

    <div :class="$style['tool-card__meta']">
      <span>Round {{ toolCall.round }}</span>
      <span v-if="toolCall.durationMs > 0">{{ toolCall.durationMs }}ms</span>
    </div>
  </el-card>
</template>

<script setup lang="ts">
/**
 * 工具调用卡片——纯渲染，接收已截断的字符串。
 * 截断在 useSessionStream.appendToolCall() 中完成。
 */
import { computed } from 'vue'
import { Promotion } from '@element-plus/icons-vue'
import type { SessionToolCallCardProps } from './SessionToolCallCard.props'

const props = defineProps<SessionToolCallCardProps>()

const statusTagType = computed(() =>
  props.toolCall.status === 'success' ? 'success' : 'danger',
)

const statusLabel = computed(() =>
  props.toolCall.status === 'success' ? '成功' : '失败',
)
</script>

<style module>
.tool-card {
  margin: 4px 0;
}

.tool-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.tool-card__name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 14px;
}

.tool-card__section {
  margin-bottom: 6px;
}

.tool-card__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 2px;
}

.tool-card__preview {
  font-family: monospace;
  font-size: 12px;
  color: var(--el-text-color-regular);
  background-color: var(--el-fill-color-light);
  padding: 6px 8px;
  border-radius: 4px;
  max-height: 80px;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-all;
}

.tool-card__meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  margin-top: 8px;
}
</style>
