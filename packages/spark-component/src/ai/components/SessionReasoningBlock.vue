<!--
@module @spark-appworks/spark-component:ai/components/SessionReasoningBlock
@spark-appworks/spark-component 的 ai/components/SessionReasoningBlock 模块。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <el-collapse :model-value="isActive ? [0] : []">
    <el-collapse-item :title="collapsed ? '推理过程（已完成）' : '正在推理...'" :name="0">
      <div :class="$style['reasoning-block__text']">{{ text }}</div>
    </el-collapse-item>
  </el-collapse>
</template>

<script setup lang="ts">
/**
 * 可折叠推理块。isActive 时展开，完成后自动折叠。
 */
import type { SessionReasoningBlockProps } from './SessionReasoningBlock.props'

withDefaults(defineProps<SessionReasoningBlockProps>(), {
  collapsed: false,
  isActive: false,
})
</script>

<style module>
.reasoning-block__text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
  padding: 8px 0;
}
</style>
