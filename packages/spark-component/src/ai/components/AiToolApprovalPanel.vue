<!--
@module @spark-appworks/spark-component:ai/components/AiToolApprovalPanel
@spark-appworks/spark-component 的 ai/components/AiToolApprovalPanel 模块。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <div :class="$style['approval-panel']">
    <template v-if="pending.length === 0">
      <el-empty :description="emptyText" :image-size="60" />
    </template>
    <template v-else>
      <AiToolApprovalCard
        v-for="request in pending"
        :key="request.id"
        :request="request"
        @allow="(id) => emit('allow', id)"
        @reject="(id, reason) => emit('reject', id, reason)"
        @abort="(id, reason) => emit('abort', id, reason)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import AiToolApprovalCard from './AiToolApprovalCard.vue'
import type { AiToolApprovalPanelProps } from './AiToolApprovalPanel.props'

defineProps<AiToolApprovalPanelProps>()

const emit = defineEmits<{
  allow: [id: string]
  reject: [id: string, reason: string]
  abort: [id: string, reason: string]
}>()
</script>

<style module>
.approval-panel {
  min-height: 60px;
}
</style>
