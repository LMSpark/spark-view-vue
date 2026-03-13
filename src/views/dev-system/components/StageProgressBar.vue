<template>
  <div class="stage-progress">
    <div
      v-for="(stage, idx) in STAGE_ORDER"
      :key="stage"
      class="stage-item"
      :class="{
        'stage-item--active': stage === currentStage,
        'stage-item--has-content': stage !== currentStage && stageHasContent(stage),
        'stage-item--empty': stage !== currentStage && !stageHasContent(stage),
      }"
      @click="handleClick(stage)"
    >
      <span class="stage-icon">{{ STAGE_META[stage].icon }}</span>
      <span class="stage-label">{{ STAGE_META[stage].label }}</span>
      <span v-if="idx < STAGE_ORDER.length - 1" class="stage-arrow">›</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ProjectStage, ProjectState } from '../composables/types'
import { STAGE_ORDER, STAGE_META } from '../composables/types'
import { hasStageContent } from '../composables/useStageFlow'

const props = defineProps<{
  currentStage: ProjectStage
  projectState: ProjectState
}>()

const emit = defineEmits<{
  jump: [stage: ProjectStage]
}>()

function stageHasContent(stage: ProjectStage): boolean {
  return hasStageContent(stage, props.projectState)
}

function handleClick(stage: ProjectStage) {
  if (stage !== props.currentStage) {
    emit('jump', stage)
  }
}
</script>

<style scoped>
.stage-progress {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
}

.stage-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  white-space: nowrap;
  user-select: none;
}

.stage-item:hover {
  background: var(--el-fill-color-light);
}

.stage-item--active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}

.stage-item--has-content {
  color: var(--el-color-success);
}

.stage-item--empty {
  color: var(--el-text-color-placeholder);
}

.stage-icon {
  font-size: 15px;
}

.stage-label {
  font-size: 12px;
}

.stage-arrow {
  color: var(--el-text-color-placeholder);
  font-size: 16px;
  margin-left: 4px;
}
</style>
