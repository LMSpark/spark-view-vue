<template>
  <div class="dev-workbench">
    <!-- ═══ 顶栏 ═══ -->
    <div class="wb-header">
      <div class="wb-header__left">
        <span class="wb-header__logo">⚡</span>
        <span class="wb-header__title">SPARK 开发工作台</span>
        <el-input
          v-model="project.state.projectName"
          size="small"
          style="width: 180px"
        />
      </div>
      <div class="wb-header__right">
        <el-button size="small" @click="handleExport">📤 导出</el-button>
        <el-button size="small" @click="handleImport">📥 导入</el-button>
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

    <!-- ═══ 主体布局 ═══ -->
    <div class="wb-body">
      <!-- 左栏：WBS 树 -->
      <div class="wb-body__tree">
        <ProjectTree
          :state="project.state"
          @node-click="handleNodeClick"
          @add-group="handleAddRootGroup"
          @add-page="handleAddRootPage"
        />
      </div>

      <!-- 中栏：节点编辑器 -->
      <div class="wb-body__workspace">
        <WorkspacePanel :node-id="project.state.selectedNodeId" />
      </div>

      <!-- 右栏：AI 助手 (可折叠) -->
      <transition name="slide-right">
        <div v-if="project.state.aiPanelVisible" class="wb-body__ai">
          <div class="ai-panel-header">
            <span>🤖 AI 助手</span>
            <el-button size="small" link @click="project.state.aiPanelVisible = false">✕</el-button>
          </div>
          <div class="ai-panel-placeholder">
            <p>AI 面板将在后续阶段实现</p>
          </div>
        </div>
      </transition>
    </div>

    <!-- ═══ 底部状态栏 ═══ -->
    <div class="wb-status-bar">
      <span class="status-info">
        {{ project.state.projectName }} · {{ nodeCount }} 个节点
      </span>
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
import { ref, computed, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { WbsNode } from './composables/types'
import { useProjectState } from './composables/useProjectState'
import { provideProject } from './composables/useProjectInject'
import ProjectTree from './components/ProjectTree.vue'
import WorkspacePanel from './components/WorkspacePanel.vue'

const project = useProjectState()
provideProject(project)

// ── 节点计数 ────────────────────────────────────────────────

function countNodes(nodes: WbsNode[]): number {
  let c = nodes.length
  for (const n of nodes) c += countNodes(n.children)
  return c
}

const nodeCount = computed(() => countNodes(project.state.wbsRoot))

// ── 树操作 ──────────────────────────────────────────────────

function handleNodeClick(nodeId: string) {
  project.selectNode(nodeId)
}

function handleAddRootGroup() {
  project.createGroup(null, '新分组')
}

function handleAddRootPage() {
  const id = Date.now().toString(36)
  project.createPage(null, '新页面', `page-${id}`)
}

// ── 导出/导入 ───────────────────────────────────────────────

function handleExport() {
  const json = project.exportProject()
  void navigator.clipboard.writeText(json).then(() => {
    ElMessage.success('项目数据已复制到剪贴板')
  })
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
  const ok = project.importProject(importJson.value)
  if (ok) {
    ElMessage.success('导入成功')
    importVisible.value = false
  } else {
    ElMessage.error('JSON 格式无效或版本不兼容')
  }
}

// ── 生命周期 ────────────────────────────────────────────────

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

/* ═══ 主体 ═══ */
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
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

/* ═══ 底部状态栏 ═══ */
.wb-status-bar {
  display: flex;
  align-items: center;
  padding: 4px 16px;
  background: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color);
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

/* ═══ AI 面板过渡 ═══ */
.slide-right-enter-active,
.slide-right-leave-active {
  transition: width 0.2s ease, opacity 0.2s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  width: 0;
  opacity: 0;
}
</style>
