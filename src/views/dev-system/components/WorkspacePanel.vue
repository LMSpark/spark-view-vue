<template>
  <div class="workspace-panel">
    <!-- 阶段标签页 -->
    <el-tabs
      :model-value="currentStage"
      type="border-card"
      class="workspace-tabs"
      @tab-change="handleTabChange"
    >
      <el-tab-pane
        v-for="stage in STAGE_ORDER"
        :key="stage"
        :name="stage"
        :label="`${STAGE_META[stage].icon} ${STAGE_META[stage].label}`"
      >
        <!-- 阶段占位视图（Phase 2+ 替换为真实组件） -->
        <div class="stage-placeholder">
          <div class="stage-placeholder__icon">{{ STAGE_META[stage].icon }}</div>
          <div class="stage-placeholder__title">{{ STAGE_META[stage].label }}</div>
          <div class="stage-placeholder__desc">{{ stageDescription(stage) }}</div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import type { ProjectStage } from '../composables/types'
import { STAGE_ORDER, STAGE_META } from '../composables/types'

defineProps<{
  currentStage: ProjectStage
}>()

const emit = defineEmits<{
  'stage-change': [stage: ProjectStage]
}>()

function handleTabChange(name: string | number) {
  emit('stage-change', name as ProjectStage)
}

function stageDescription(stage: ProjectStage): string {
  const desc: Record<ProjectStage, string> = {
    'requirements':  '描述项目需求，AI 助手将帮助理清需求细节',
    'functions':     '根据需求拆解功能模块和页面清单',
    'navigation':    '设计站点导航结构，组织页面层级',
    'page-design':   '逐页设计：数据模型、UI 布局、交互逻辑',
    'verification':  '预览页面效果，查看日志，AI 自动纠错',
  }
  return desc[stage]
}
</script>

<style scoped>
.workspace-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.workspace-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.workspace-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: auto;
  padding: 0;
}

.workspace-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: auto;
}

.stage-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
  gap: 16px;
  color: var(--el-text-color-secondary);
}

.stage-placeholder__icon {
  font-size: 48px;
  opacity: 0.6;
}

.stage-placeholder__title {
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.stage-placeholder__desc {
  font-size: 14px;
  max-width: 400px;
  text-align: center;
  line-height: 1.6;
}
</style>
