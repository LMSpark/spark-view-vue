<template>
  <div class="dev-workbench">
    <!-- ═══ 顶栏 ═══ -->
    <div class="wb-header">
      <div class="wb-header__left">
        <span class="wb-header__logo">⚡</span>
        <span class="wb-header__title">SPARK 开发工作台</span>
        <StageProgressBar
          :current-stage="project.state.currentStage"
          @jump="handleStageJump"
        />
      </div>
      <div class="wb-header__right">
        <el-button size="small" @click="handleExport" title="导出项目">📤 导出</el-button>
        <el-button size="small" @click="handleImport" title="导入项目">📥 导入</el-button>
        <el-divider direction="vertical" />
        <el-button
          size="small"
          :type="project.state.aiPanelVisible ? 'primary' : 'default'"
          @click="project.state.aiPanelVisible = !project.state.aiPanelVisible"
        >
          🤖 AI
        </el-button>
      </div>
    </div>

    <!-- ═══ 主体三栏布局 ═══ -->
    <div class="wb-body">
      <!-- 左栏：项目树 -->
      <div class="wb-body__tree">
        <ProjectTree
          :state="project.state"
          @node-click="handleTreeNodeClick"
        />
      </div>

      <!-- 中栏：工作区 -->
      <div class="wb-body__workspace">
        <WorkspacePanel
          :current-stage="project.state.currentStage"
          @stage-change="handleStageChange"
        />
      </div>

      <!-- 右栏：AI 助手 (可折叠) -->
      <transition name="slide-right">
        <div v-if="project.state.aiPanelVisible" class="wb-body__ai">
          <div class="ai-panel-header">
            <span>🤖 AI 助手 · {{ currentStageMeta.label }}</span>
            <el-button
              size="small"
              link
              @click="project.state.aiPanelVisible = false"
            >✕</el-button>
          </div>
          <div class="ai-panel-placeholder">
            <p>{{ currentStageMeta.icon }} {{ currentStageMeta.label }}</p>
            <p class="ai-panel-hint">AI 面板将在后续阶段实现</p>
          </div>
        </div>
      </transition>
    </div>

    <!-- ═══ 底部状态栏 ═══ -->
    <div class="wb-status-bar">
      <div class="wb-status__left">
        <span class="status-stage">
          {{ currentStageMeta.icon }} {{ currentStageMeta.label }}
        </span>
        <el-tag v-if="project.state.navDirty" type="warning" size="small">导航未保存</el-tag>
      </div>
      <div class="wb-status__center">
        <el-button
          text
          size="small"
          :disabled="isFirstStageFlag"
          @click="handlePrev"
        >
          ◀ 上一阶段
        </el-button>
        <el-button
          text
          size="small"
          type="primary"
          :disabled="isLastStageFlag"
          @click="handleNext"
        >
          下一阶段 ▶
        </el-button>
      </div>
      <div class="wb-status__right">
        <span class="status-info">
          📋 {{ project.state.requirements.length }} 需求 · 📦 {{ project.state.modules.length }} 模块
        </span>
      </div>
    </div>

    <!-- 导入对话框 -->
    <el-dialog v-model="importVisible" title="导入项目" width="500px">
      <el-input
        v-model="importJson"
        type="textarea"
        :rows="12"
        placeholder="粘贴导出的 JSON..."
        style="font-family: monospace; font-size: 13px"
      />
      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button type="primary" @click="doImport">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { STAGE_META } from './composables/types'
import type { ProjectStage } from './composables/types'
import { useProjectState } from './composables/useProjectState'
import { isFirstStage, isLastStage, canJumpTo, prevStage } from './composables/useStageFlow'
import StageProgressBar from './components/StageProgressBar.vue'
import ProjectTree from './components/ProjectTree.vue'
import WorkspacePanel from './components/WorkspacePanel.vue'
import type { ProjectTreeNodeClickEvent } from './components/ProjectTree.vue'

const project = useProjectState()

const currentStageMeta = computed(() => STAGE_META[project.state.currentStage])
const isFirstStageFlag = computed(() => isFirstStage(project.state.currentStage))
const isLastStageFlag = computed(() => isLastStage(project.state.currentStage))

// ── 阶段导航 ────────────────────────────────────────────────

function handleStageChange(stage: ProjectStage) {
  const result = canJumpTo(project.state.currentStage, stage, project.state)
  if (result.allowed) {
    project.goToStage(stage)
  } else {
    ElMessage.warning(result.reason)
  }
}

function handleStageJump(stage: ProjectStage) {
  handleStageChange(stage)
}

function handleNext() {
  const result = project.tryAdvance()
  if (!result.success && result.reason) {
    ElMessage.warning(result.reason)
  }
}

async function handlePrev() {
  const result = project.tryRegress()
  if (!result.success) {
    if (result.needsConfirm && result.reason) {
      try {
        await ElMessageBox.confirm(result.reason, '确认回退', { type: 'warning' })
        const target = prevStage(project.state.currentStage)
        if (target) {
          project.forceRegress(target)
        }
      } catch {
        // cancelled
      }
    } else if (result.reason) {
      ElMessage.warning(result.reason)
    }
  }
}

// ── 项目树节点点击 ──────────────────────────────────────────

function handleTreeNodeClick(event: ProjectTreeNodeClickEvent) {
  switch (event.kind) {
    case 'requirement':
      project.state.activeRequirementId = event.sourceId ?? null
      project.goToStage('requirements')
      break
    case 'module':
      project.goToStage('functions')
      break
    case 'page':
      project.state.activePageId = event.sourceId ?? null
      project.goToStage('page-design')
      break
    case 'nav-group':
    case 'nav-page':
      project.goToStage('navigation')
      break
  }
}

// ── 导出/导入 ───────────────────────────────────────────────

function handleExport() {
  const json = project.exportProject()
  if (json) {
    void navigator.clipboard.writeText(json).then(() => {
      ElMessage.success('项目数据已复制到剪贴板')
    })
  }
}

const importVisible = ref(false)
const importJson = ref('')

function handleImport() {
  importJson.value = ''
  importVisible.value = true
}

function doImport() {
  if (!importJson.value.trim()) {
    ElMessage.warning('请粘贴 JSON 数据')
    return
  }
  const success = project.importProject(importJson.value)
  if (success) {
    ElMessage.success('导入成功')
    importVisible.value = false
  } else {
    ElMessage.error('JSON 格式无效或版本不兼容')
  }
}

// ── 生命周期 ────────────────────────────────────────────────

onMounted(() => {
  void project.loadNavFromBackend()
})

onUnmounted(() => {
  project.dispose()
})
</script>

<style scoped>
/* ═══ 整体布局 ═══ */
.dev-workbench {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-page);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* ═══ 顶栏 ═══ */
.wb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
  flex-shrink: 0;
  z-index: 10;
}

.wb-header__left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.wb-header__logo {
  font-size: 22px;
}

.wb-header__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.wb-header__right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ═══ 主体三栏 ═══ */
.wb-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.wb-body__tree {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  overflow: hidden;
}

.wb-body__workspace {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wb-body__ai {
  width: 360px;
  flex-shrink: 0;
  border-left: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ai-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  flex-shrink: 0;
}

.ai-panel-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 16px;
  color: var(--el-text-color-secondary);
}

.ai-panel-hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

/* ═══ 底部状态栏 ═══ */
.wb-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 16px;
  background: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color);
  font-size: 12px;
  flex-shrink: 0;
}

.wb-status__left,
.wb-status__center,
.wb-status__right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wb-status__center {
  gap: 4px;
}

.status-stage {
  font-weight: 600;
  color: var(--el-color-primary);
}

.status-info {
  color: var(--el-text-color-secondary);
}

/* ═══ AI 面板滑入动画 ═══ */
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.25s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  width: 0;
  opacity: 0;
  overflow: hidden;
}
</style>
