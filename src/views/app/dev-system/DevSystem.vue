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
        <el-button size="small" @click="showCreateDialog">
          <NavIcon name="Plus" :size="14" /> 新建页面
        </el-button>
        <el-button size="small" @click="previewCurrentPage" :disabled="!state.editForm.path">
          <NavIcon name="Search" :size="14" /> 预览页面
        </el-button>
        <el-button size="small" @click="showPreview = true">
          <NavIcon name="View" :size="14" /> JSON
        </el-button>
        <el-button
          type="primary"
          size="small"
          :loading="state.navSaving.value || state.fileSaving.value"
          @click="state.saveAll()"
        >
          <NavIcon name="DocumentChecked" :size="14" /> 保存全部
        </el-button>
        <el-divider direction="vertical" />
        <el-button
          size="small"
          :type="state.aiPanelVisible.value ? 'primary' : 'default'"
          @click="state.aiPanelVisible.value = !state.aiPanelVisible.value"
        >
          <NavIcon name="Cpu" :size="14" /> AI
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
        <el-tabs v-model="workTab" type="border-card" class="workspace-tabs">
          <!-- 🔧 节点属性（选中节点时可用） -->
          <el-tab-pane label="节点属性" name="props" :disabled="!state.selectedNode.value">
            <template v-if="state.selectedNode.value">
              <DevNodeProps :state="state" @create-page="showCreateDialogLinked" />
            </template>
            <el-empty v-else description="在左侧树中选择节点开始编辑" />
          </el-tab-pane>
          <!-- 4 个配置文件 tab（配置页面时） -->
            <template v-if="state.activePageId.value">
              <el-tab-pane v-for="fname in PAGE_FILE_NAMES" :key="fname" :name="fname">
                <template #label>
                  <span :class="{ 'tab-dirty': state.fileDirty[fname] }">
                    <NavIcon :name="fileIcon(fname)" :size="13" /> {{ fname }}
                  </span>
                </template>
                <div class="inline-file-editor" v-loading="!state.fileLoaded.value">
                  <div class="inline-file-toolbar">
                    <span class="inline-file-id"><NavIcon name="Tickets" :size="14" /> {{ state.activePageId.value }}</span>
                    <div class="inline-file-actions">
                      <el-button
                        v-if="state.hasAnyFileDirty.value"
                        size="small"
                        type="primary"
                        :loading="state.fileSaving.value"
                        @click="state.savePageFiles()"
                      ><NavIcon name="DocumentChecked" :size="14" /> 保存文件</el-button>
                      <el-button size="small" @click="refreshFiles"><NavIcon name="Refresh" :size="14" /></el-button>
                    </div>
                  </div>
                  <el-input
                    v-model="state.editFiles[fname]"
                    type="textarea"
                    :autosize="{ minRows: 28, maxRows: 60 }"
                    class="code-input"
                    @input="state.fileDirty[fname] = true"
                  />
                </div>
              </el-tab-pane>
            </template>
          </el-tabs>

        <!-- 工作区底栏 -->
        <div class="workspace-footer">
          <div class="workspace-footer__left">
            <template v-if="state.selectedNode.value">
              <span class="footer-info">
                <NavIcon name="Share" :size="13" /> {{ state.editForm.id }}
                <template v-if="state.editForm.title"> · {{ state.editForm.title }}</template>
              </span>
              <el-tag v-if="state.navDirty.value" type="warning" size="small">属性已修改</el-tag>
            </template>
            <template v-if="state.activePageId.value">
              <span class="footer-info"><NavIcon name="Tickets" :size="13" /> {{ state.activePageId.value }}</span>
              <el-tag v-if="state.hasAnyFileDirty.value" type="warning" size="small">文件已修改</el-tag>
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

      <!-- 右栏：AI 助手 (可折叠) -->
      <transition name="slide-right">
        <div v-if="state.aiPanelVisible.value" class="dev-body__ai">
          <div class="ai-panel-header">
            <span class="ai-panel-header__title"><NavIcon name="Cpu" :size="14" /> AI 助手</span>
            <el-button
              size="small"
              link
              @click="state.aiPanelVisible.value = false"
            ><NavIcon name="CloseBold" :size="12" /></el-button>
          </div>
          <DevAiPanel :state="state" />
        </div>
      </transition>
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

    <!-- ═══ 新建页面对话框 ═══ -->
    <el-dialog v-model="createVisible" title="新建页面" width="480px" :close-on-click-modal="false">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="100px">
        <el-form-item label="Page ID" prop="pageId">
          <el-input v-model="createForm.pageId" placeholder="英文/数字/横线" />
        </el-form-item>
        <el-form-item label="标题" prop="title">
          <el-input v-model="createForm.title" placeholder="页面显示名称" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="createForm.icon" placeholder="Document" style="width: 120px" />
        </el-form-item>
        <el-form-item v-if="state.selectedNode.value" label="关联到节点">
          <el-switch v-model="createForm.linkToNav" />
          <span v-if="createForm.linkToNav" style="margin-left: 8px; color: var(--el-text-color-secondary); font-size: 12px">
            将自动写入当前节点的 pageId
          </span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="doCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- ═══ JSON 预览对话框 ═══ -->
    <el-dialog v-model="showPreview" title="导航配置 JSON" width="720px" top="5vh">
      <el-input
        :model-value="state.previewJson.value"
        type="textarea"
        :rows="30"
        readonly
        style="font-family: monospace; font-size: 13px"
      />
      <template #footer>
        <el-button @click="copyJson"><NavIcon name="List" :size="14" /> 复制</el-button>
        <el-button @click="showPreview = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue'
import { useTenantRouter } from '@/composables/useTenantRouter'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useDevState, PAGE_FILE_NAMES } from './useDevState'
import DevSiteTree from './DevSiteTree.vue'
import DevNodeProps from './DevNodeProps.vue'
import DevAiPanel from './DevAiPanel.vue'
import NavIcon from '@/components/NavIcon.vue'

const { router, tenantPath } = useTenantRouter()
const state = useDevState()

// 工作区 Tab
const workTab = ref<string>('props')

// activePageId 变化时自动切换 Tab：
// - 关联了配置页（选下拉/点击配置节点）→ 切到文件编辑
// - 取消关联或选中非配置节点 → 切到节点属性
watch(() => state.activePageId.value, (newId) => {
  if (newId) {
    // 切到第一个文件 tab（若当前不在任何文件 tab 上）
    if (!PAGE_FILE_NAMES.includes(workTab.value as typeof PAGE_FILE_NAMES[number])) {
      workTab.value = PAGE_FILE_NAMES[0]
    }
  } else if (state.selectedNode.value) {
    workTab.value = 'props'
  }
})

function fileIcon(name: string) {
  if (name === 'rule.json') return 'Crop'
  if (name === 'pagedata.json') return 'Coin'
  if (name === 'script.js') return 'Lightning'
  if (name === 'style.css') return 'Brush'
  return 'Document'
}

// JSON 预览
const showPreview = ref(false)

function previewPage(pageId: string) {
  void router.push(tenantPath(`/${pageId}`))
}

function previewCurrentPage() {
  if (state.editForm.path) void router.push(tenantPath(state.editForm.path))
  else if (state.activePageId.value) void router.push(tenantPath(`/${state.activePageId.value}`))
}
const createVisible = ref(false)
const creating = ref(false)
const createFormRef = ref<FormInstance>()
const createForm = reactive({ pageId: '', title: '', icon: 'Document', linkToNav: false })
const createRules: FormRules = {
  pageId: [
    { required: true, message: '必填', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/, message: '英文/数字/横线', trigger: 'blur' },
  ],
  title: [{ required: true, message: '必填', trigger: 'blur' }],
}

function showCreateDialog() {
  createForm.pageId = ''
  createForm.title = ''
  createForm.icon = 'Document'
  createForm.linkToNav = false
  createVisible.value = true
}

function showCreateDialogLinked() {
  createForm.pageId = state.editForm.id || ''
  createForm.title = state.editForm.title || ''
  createForm.icon = state.editForm.icon || 'Document'
  createForm.linkToNav = state.selectedNode.value != null
  createVisible.value = true
}

async function doCreate() {
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) return
  creating.value = true
  try {
    await state.createPage(
      createForm.pageId,
      createForm.title,
      createForm.icon,
      createForm.linkToNav,
    )
    createVisible.value = false
  } catch (e) {
    ElMessage.error(String(e))
  } finally {
    creating.value = false
  }
}

function copyJson() {
  void navigator.clipboard.writeText(state.previewJson.value).then(() => ElMessage.success('已复制'))
}

function refreshFiles() {
  if (state.activePageId.value) void state.loadPageFiles(state.activePageId.value)
}

// 初始化
onMounted(() => { void state.initialize() })
</script>

<style scoped>
/* ═══ 整体布局 ═══ */
.dev-system {
  height: 100%;
  display: flex;
  flex-direction: column;
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

/* ═══ 主体三栏 ═══ */
.dev-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
  gap: 12px;
  padding: 12px;
  background: var(--el-fill-color-lighter);
}

/* 左栏：站点树 */
.dev-body__tree {
  width: 320px;
  flex-shrink: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-bg-color);
  overflow: hidden;
}

/* 中栏：工作区 */
.dev-body__workspace {
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
  overflow: auto;
  padding: 0;
}
.workspace-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: auto;
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

/* 右栏：AI 面板 */
.dev-body__ai {
  width: 380px;
  flex-shrink: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
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

.ai-panel-header__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

/* ═══ 内嵌文件编辑器 ═══ */
.inline-file-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.inline-file-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  margin-bottom: 4px;
}
.inline-file-id {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
}
.inline-file-actions {
  display: flex;
  gap: 6px;
}
.code-input :deep(textarea) {
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
}

/* ═══ Tab 脏标记 ═══ */
.tab-dirty {
  color: var(--el-color-warning);
  font-weight: 600;
}
.tab-dirty::after {
  content: ' •';
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

/* ═══ 工作区空状态 ═══ */
.workspace-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

</style>
