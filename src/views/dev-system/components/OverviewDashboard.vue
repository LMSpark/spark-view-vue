<template>
  <div class="overview-dashboard">
    <h2 class="editor-title">项目总览</h2>

    <!-- 统计卡片 -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">{{ project.state.requirements.length }}</div>
        <div class="stat-label">需求</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ project.state.modules.length }}</div>
        <div class="stat-label">功能模块</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ totalPages }}</div>
        <div class="stat-label">页面</div>
      </div>
      <div class="stat-card stat-card--accent">
        <div class="stat-value">{{ generatedPages }}</div>
        <div class="stat-label">已生成</div>
      </div>
    </div>

    <!-- 快速添加需求 -->
    <section class="editor-section">
      <h3>📝 快速添加需求</h3>
      <el-form @submit.prevent="handleAddReq" label-position="top" class="compact-form">
        <el-form-item label="标题">
          <el-input v-model="newTitle" placeholder="如：用户管理系统" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="newDesc"
            type="textarea"
            :rows="3"
            placeholder="简述需求背景和核心功能…"
            maxlength="2000"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleAddReq" :disabled="!newTitle.trim()">
            + 添加需求
          </el-button>
        </el-form-item>
      </el-form>
    </section>

    <!-- 需求列表 -->
    <section v-if="project.state.requirements.length" class="editor-section">
      <h3>📋 需求列表（点击编辑）</h3>
      <div class="item-list">
        <div
          v-for="req in project.state.requirements"
          :key="req.id"
          class="item-row clickable"
          @click="project.setFocus({ view: 'requirement', requirementId: req.id })"
        >
          <span class="item-title">{{ req.title }}</span>
          <el-tag size="small" :type="statusType(req.status)">{{ req.status }}</el-tag>
        </div>
      </div>
    </section>

    <!-- 模块概览 -->
    <section v-if="project.state.modules.length" class="editor-section">
      <h3>📦 功能模块</h3>
      <div class="item-list">
        <div
          v-for="mod in project.state.modules"
          :key="mod.id"
          class="item-row clickable"
          @click="project.setFocus({ view: 'module', moduleId: mod.id })"
        >
          <span class="item-title">{{ mod.icon || '📦' }} {{ mod.name }}</span>
          <el-tag size="small" type="info">{{ mod.pages.length }} 页</el-tag>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProject } from '../composables/useProjectInject'
import type { RequirementStatus } from '../composables/types'

const project = useProject()

const newTitle = ref('')
const newDesc = ref('')

const totalPages = computed(() =>
  project.state.modules.reduce((sum, m) => sum + m.pages.length, 0),
)
const generatedPages = computed(() =>
  project.state.modules.reduce(
    (sum, m) => sum + m.pages.filter(p => p.status === 'generated' || p.status === 'verified').length,
    0,
  ),
)

function statusType(status: RequirementStatus) {
  const map: Record<RequirementStatus, 'success' | 'info' | 'warning' | 'danger'> = {
    draft: 'info',
    analyzed: 'warning',
    planned: 'success',
    completed: 'success',
  }
  return map[status]
}

function handleAddReq() {
  const title = newTitle.value.trim()
  if (!title) return
  const req = project.addRequirement(title, newDesc.value.trim())
  newTitle.value = ''
  newDesc.value = ''
  project.setFocus({ view: 'requirement', requirementId: req.id })
}
</script>

<style scoped>
.overview-dashboard {
  padding: 20px 24px;
  overflow: auto;
  height: 100%;
}

.editor-title {
  margin: 0 0 20px;
  font-size: 18px;
  font-weight: 700;
}

.stats-row {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  flex: 1;
  padding: 16px;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  text-align: center;
}

.stat-card--accent {
  background: var(--el-color-primary-light-9);
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.editor-section {
  margin-bottom: 24px;
}

.editor-section h3 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
}

.compact-form :deep(.el-form-item) {
  margin-bottom: 12px;
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  transition: background 0.15s;
}

.item-row.clickable {
  cursor: pointer;
}

.item-row.clickable:hover {
  background: var(--el-fill-color-light);
}

.item-title {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
