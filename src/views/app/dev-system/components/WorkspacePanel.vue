<template>
  <div class="workspace-panel">
    <WbsNodeEditor v-if="nodeId" :node-id="nodeId" />
    <div v-else class="workspace-panel__empty">
      <p>👈 请在左侧树中选择一个节点</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import WbsNodeEditor from './WbsNodeEditor.vue'

defineProps<{
  nodeId: string | null
}>()
</script>

<style scoped>
.workspace-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.workspace-panel__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
  font-size: 14px;
}
</style>
