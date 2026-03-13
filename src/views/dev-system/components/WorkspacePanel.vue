<template>
  <div class="workspace-panel">
    <!-- 项目总览 -->
    <div v-if="workFocus.view === 'overview'" class="focus-placeholder">
      <div class="focus-placeholder__icon">⚡</div>
      <div class="focus-placeholder__title">项目总览</div>
      <div class="focus-placeholder__desc">从左侧项目树选择一个需求、模块或页面开始工作，或点击顶部阶段切换全局视图</div>
    </div>

    <!-- 需求编辑 -->
    <div v-else-if="workFocus.view === 'requirement'" class="focus-placeholder">
      <div class="focus-placeholder__icon">📝</div>
      <div class="focus-placeholder__title">需求 · {{ activeRequirementTitle }}</div>
      <div class="focus-placeholder__desc">编辑需求详情，AI 助手将帮助理清需求细节</div>
    </div>

    <!-- 全局功能规划 -->
    <div v-else-if="workFocus.view === 'functions'" class="focus-placeholder">
      <div class="focus-placeholder__icon">🏗️</div>
      <div class="focus-placeholder__title">功能规划（全局）</div>
      <div class="focus-placeholder__desc">整体规划功能模块和页面清单，AI 可根据需求自动生成规划</div>
    </div>

    <!-- 模块功能规划 -->
    <div v-else-if="workFocus.view === 'module'" class="focus-placeholder">
      <div class="focus-placeholder__icon">📦</div>
      <div class="focus-placeholder__title">模块 · {{ activeModuleTitle }}</div>
      <div class="focus-placeholder__desc">管理此模块的页面规划，可新增、调整或删除页面</div>
    </div>

    <!-- 导航设计 -->
    <div v-else-if="workFocus.view === 'navigation'" class="focus-placeholder">
      <div class="focus-placeholder__icon">🌐</div>
      <div class="focus-placeholder__title">导航设计</div>
      <div class="focus-placeholder__desc">设计站点导航结构，组织页面层级</div>
    </div>

    <!-- 页面设计 -->
    <div v-else-if="workFocus.view === 'page-design'" class="focus-placeholder">
      <div class="focus-placeholder__icon">📄</div>
      <div class="focus-placeholder__title">页面 · {{ activePageTitle }}</div>
      <div class="focus-placeholder__desc">逐页设计：数据模型、UI 布局、交互逻辑</div>
    </div>

    <!-- 验证部署 -->
    <div v-else-if="workFocus.view === 'verification'" class="focus-placeholder">
      <div class="focus-placeholder__icon">✅</div>
      <div class="focus-placeholder__title">验证部署</div>
      <div class="focus-placeholder__desc">预览页面效果，查看日志，AI 自动纠错</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WorkFocus, ProjectState } from '../composables/types'

const props = defineProps<{
  workFocus: WorkFocus
  projectState: ProjectState
}>()

const activeRequirementTitle = computed(() => {
  const focus = props.workFocus
  if (focus.view !== 'requirement') return ''
  const req = props.projectState.requirements.find(r => r.id === focus.requirementId)
  return req?.title ?? focus.requirementId
})

const activeModuleTitle = computed(() => {
  const focus = props.workFocus
  if (focus.view !== 'module') return ''
  const mod = props.projectState.modules.find(m => m.id === focus.moduleId)
  return mod?.name ?? focus.moduleId
})

const activePageTitle = computed(() => {
  const focus = props.workFocus
  if (focus.view !== 'page-design') return ''
  const pageId = focus.pageId
  for (const mod of props.projectState.modules) {
    const page = mod.pages.find(p => p.pageId === pageId)
    if (page) return `${page.title} (${pageId})`
  }
  return pageId
})
</script>

<style scoped>
.workspace-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.focus-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
  gap: 16px;
  color: var(--el-text-color-secondary);
}

.focus-placeholder__icon {
  font-size: 48px;
  opacity: 0.6;
}

.focus-placeholder__title {
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.focus-placeholder__desc {
  font-size: 14px;
  max-width: 400px;
  text-align: center;
  line-height: 1.6;
}
</style>
