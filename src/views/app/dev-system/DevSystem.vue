<template>
  <div class="dev-system">
    <!-- ═══ 顶栏 ═══ -->
    <div class="dev-header">
      <div class="dev-header__left">
        <span class="dev-header__logo"><NavIcon name="Lightning" :size="20" /></span>
        <span class="dev-header__title">SPARK 开发系统</span>
        <el-tag v-if="state.hasAnyDirty.value" type="warning" size="small" effect="dark">未保存</el-tag>
      </div>
      <div class="dev-header__right">
        <el-input
          v-if="state.activePageId.value"
          v-model="pageDesignAiPrompt"
          class="dev-ai-input"
          size="small"
          clearable
          placeholder="描述 AI 编辑需求"
        />
        <el-button
          v-if="state.activePageId.value"
          size="small"
          type="primary"
          :loading="state.pageDesignAiRunning.value"
          :disabled="!canRunPageDesignAi"
          @click="runPageDesignAi"
        >
          <NavIcon name="MagicStick" :size="14" /> AI 编辑
        </el-button>
        <el-button size="small" @click="switchToPreview" :disabled="!canPreviewCurrentPage">
          <NavIcon name="Search" :size="14" /> 预览页面
        </el-button>
        <el-button
          v-if="canSaveFromHeader"
          size="small"
          type="success"
          :loading="state.navSaving.value || state.fileSaving.value"
          @click="saveAll"
        >
          <NavIcon name="FolderChecked" :size="14" /> {{ headerSaveLabel }}
        </el-button>
      </div>
    </div>

    <!-- ═══ 主体三栏布局 ═══ -->
    <div class="dev-body" v-loading="state.navLoading.value">
      <!-- 左栏：站点树 -->
      <div class="dev-body__tree">
        <DevSiteTree :state="state" />
      </div>

      <!-- 中栏：工作区 -->
      <div class="dev-body__workspace">
        <div
          v-if="state.aiToolApprovalPending.value.length > 0"
          class="dev-ai-approvals"
        >
          <div class="dev-ai-approvals__header">
            <NavIcon name="Tools" :size="14" />
            <span>AI 工具审批</span>
          </div>
          <AiToolApprovalPanel
            :pending="state.aiToolApprovalPending.value"
            empty-text="暂无待审批工具"
            @allow="state.approveAiTool"
            @reject="state.rejectAiTool"
            @abort="state.abortAiTool"
          />
        </div>
        <el-tabs v-model="workTab" type="border-card" class="workspace-tabs">
          <!-- 🔧 节点属性（选中节点时可用） -->
          <el-tab-pane label="节点属性" name="props" :disabled="!state.selectedNode.value">
            <template v-if="state.selectedNode.value">
              <DevNodeProps :state="state" />
            </template>
            <el-empty v-else description="在左侧树中选择节点开始编辑" />
          </el-tab-pane>
          <el-tab-pane v-for="fname in state.pageFileNames" :key="fname" :name="fname" :disabled="!state.activePageId.value">
            <template #label>
              <span :class="{ 'tab-dirty': isWorkspaceTabDirty(fname) }">
                <NavIcon :name="fileIcon(fname)" :size="13" /> {{ fname }}
              </span>
            </template>
            <DevFileEditor v-if="workTab === fname" :state="state" :active-file="fname" :show-tabs="false" />
          </el-tab-pane>
          <!-- 🖼 实时预览 -->
          <el-tab-pane name="preview" :disabled="!state.activePageId.value">
            <template #label>
              <span><NavIcon name="Monitor" :size="13" /> 实时预览</span>
            </template>
            <DevPreviewTab v-if="workTab === 'preview'" :state="state" :refresh-token="previewRefreshToken" />
          </el-tab-pane>
        </el-tabs>
        <div class="workspace-footer">
          <div class="workspace-footer__left">
            <template v-if="state.selectedNode.value">
              <span class="footer-info">
                <NavIcon name="Share" :size="13" /> {{ state.navEditDto.id }}
                <template v-if="state.navEditDto.title"> · {{ state.navEditDto.title }}</template>
              </span>
              <el-tag v-if="state.navDirty.value" type="warning" size="small">属性已修改</el-tag>
            </template>
            <template v-if="state.activePageId.value">
              <span class="footer-info"><NavIcon name="Tickets" :size="13" /> {{ state.activePageId.value }}</span>
              <el-tag v-if="state.hasAnyFileDirty.value" type="warning" size="small">文件已修改</el-tag>
              <el-tag v-if="currentWorkspaceFile === 'pagedata.json' && state.pageDataError.value" type="danger" size="small">{{ state.pageDataError.value }}</el-tag>
            </template>
          </div>
          <div class="workspace-footer__right">
            <el-button
              v-if="state.activePageId.value"
              size="small"
              type="success"
              link
              @click="previewPage(state.activePageId.value)"
            >
              <NavIcon name="Connection" :size="13" /> /{{ state.activePageId.value }}
            </el-button>
          </div>
        </div>
      </div>

    </div>

    <!-- ═══ 底部状态栏 ═══ -->
    <div class="dev-status-bar">
      <div class="status-messages">
        <template v-for="(msg, idx) in state.statusMessages.value.slice(0, 3)" :key="idx">
          <span :class="`status-msg status-msg--${msg.type}`">
            <span class="status-msg__time">{{ msg.time }}</span>
            {{ msg.text }}
          </span>
        </template>
      </div>
      <div class="status-right">
        <span class="status-count"><NavIcon name="Tickets" :size="13" /> {{ state.pageList.value.length }} 页面</span>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
/**
 * @skill-description 集成开发环境，提供页面配置可视化编辑、代码编辑、预览和版本管理。
 */
import { onMounted } from 'vue'
import type { PageNodeFileName } from '@spark-appworks/spark-project-model'
import { AiToolApprovalPanel } from '@spark-appworks/spark-component'
import { useDevSystem } from './useDevSystem'
import DevSiteTree from './DevSiteTree.vue'
import DevNodeProps from './DevNodeProps.vue'
import DevFileEditor from './DevFileEditor.vue'
import DevPreviewTab from './DevPreviewTab.vue'
import NavIcon from '@/components/NavIcon.vue'

const {
  state,
  workTab,
  previewRefreshToken,
  currentWorkspaceFile,
  pageDesignAiPrompt,
  canPreviewCurrentPage,
  canSaveFromHeader,
  canRunPageDesignAi,
  headerSaveLabel,
  previewPage,
  switchToPreview,
  saveAll,
  runPageDesignAi,
  isWorkspaceTabDirty,
} = useDevSystem()

const FILE_ICON_MAP: Record<PageNodeFileName, string> = {
  'rule.json': 'Crop',
  'pagedata.json': 'Coin',
  'script.js': 'Lightning',
  'style.css': 'Brush',
}

function fileIcon(name: PageNodeFileName): string {
  return FILE_ICON_MAP[name]
}

onMounted(() => {
  void state.initialize()
})
</script>

<style scoped>
/* ═══ 整体布局 ═══ */
.dev-system {
  height: calc(100dvh - var(--spark-header-height) - var(--spark-footer-height) - var(--spark-tab-bar-height, 34px) - 32px);
  max-height: calc(100dvh - var(--spark-header-height) - var(--spark-footer-height) - var(--spark-tab-bar-height, 34px) - 32px);
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-bg-color-page);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* ═══ 顶栏 ═══ */
.dev-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
  flex-shrink: 0;
  z-index: 10;
}
.dev-header__left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.dev-header__logo {
  font-size: 22px;
}
.dev-header__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.dev-header__right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dev-ai-input {
  width: min(360px, 34vw);
}

.dev-ai-approvals {
  flex-shrink: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
}

.dev-ai-approvals__header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

/* ═══ 主体三栏 ═══ */
.dev-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
  gap: 8px;
  padding: 8px;
  background: var(--el-fill-color-lighter);
}

/* 左栏：站点树 */
.dev-body__tree {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  min-height: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-bg-color);
  overflow: hidden;
}

/* 中栏：工作区 */
.dev-body__workspace {
  min-width: 480px;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-bg-color);
}

.workspace-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.workspace-tabs :deep(.el-tabs__header) {
  margin: 0;
}

.workspace-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}
.workspace-tabs :deep(.el-tab-pane) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 12px;
}

.workspace-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
  flex-shrink: 0;
  font-size: 12px;
}
.workspace-footer__left, .workspace-footer__right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.footer-info {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--el-text-color-secondary);
}

/* ═══ 底部状态栏 ═══ */
.dev-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 16px;
  background: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color);
  font-size: 11px;
  flex-shrink: 0;
}
.status-messages {
  display: flex;
  gap: 16px;
  overflow: hidden;
}
.status-msg {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.status-msg__time {
  color: var(--el-text-color-placeholder);
  margin-right: 4px;
}
.status-msg--success { color: var(--el-color-success); }
.status-msg--warning { color: var(--el-color-warning); }
.status-msg--error { color: var(--el-color-danger); }
.status-msg--info { color: var(--el-text-color-secondary); }

.status-right {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}
.status-count {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--el-text-color-secondary);
}

.tab-dirty {
  color: var(--el-color-warning);
  font-weight: 600;
}

.tab-dirty::after {
  content: ' •';
}



/* ═══ 工作区空状态 ═══ */
.workspace-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

</style>
