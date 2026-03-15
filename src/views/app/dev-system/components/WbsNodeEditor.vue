<template>
  <div v-if="node" class="wbs-node-editor">
    <!-- ═══ Header ═══ -->
    <div class="editor-header">
      <div class="editor-header__info">
        <span class="editor-header__icon"><NavIcon :name="node.icon" /></span>
        <span class="editor-header__title">{{ node.title }}</span>
        <el-tag size="small" :type="node.type === 'group' ? 'info' : ''">
          {{ node.type === 'group' ? '分组' : '页面' }}
        </el-tag>
      </div>
      <div class="editor-header__actions">
        <el-button size="small" @click="handleAddGroup">+ 子分组</el-button>
        <el-button size="small" @click="handleAddPage">+ 子页面</el-button>
        <el-popconfirm title="确定删除此节点及其子节点？" @confirm="handleDelete">
          <template #reference>
            <el-button size="small" type="danger" plain>删除</el-button>
          </template>
        </el-popconfirm>
      </div>
    </div>

    <!-- ═══ Tabs ═══ -->
    <el-tabs v-model="activeTab" class="editor-tabs">
      <!-- Tab: 基本信息 -->
      <el-tab-pane label="基本信息" name="basic">
        <el-form label-width="80px" size="small" class="editor-form">
          <el-form-item label="标题">
            <el-input v-model="node.title" />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="node.description" type="textarea" :rows="4" />
          </el-form-item>
          <el-form-item label="图标">
            <el-input v-model="node.icon" style="width: 120px" />
          </el-form-item>
          <el-form-item label="类型">
            <el-radio-group v-model="node.type">
              <el-radio value="group">分组</el-radio>
              <el-radio value="page">页面</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="node.status" style="width: 160px">
              <el-option label="待规划" value="planned" />
              <el-option label="设计中" value="designing" />
              <el-option label="已生成" value="generated" />
              <el-option label="已验证" value="verified" />
            </el-select>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- Tab: 导航属性 -->
      <el-tab-pane label="导航属性" name="nav">
        <el-form label-width="80px" size="small" class="editor-form">
          <el-form-item label="路径">
            <el-input
              :model-value="node.navPath ?? ''"
              placeholder="/example/path"
              @update:model-value="updateNavPath"
            />
          </el-form-item>
          <el-form-item label="隐藏">
            <el-switch
              :model-value="node.navHidden === true"
              @update:model-value="updateNavHidden"
            />
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- Tab: 页面配置 (仅 page 类型) -->
      <el-tab-pane v-if="node.type === 'page'" label="页面配置" name="page-config">
        <el-form label-width="80px" size="small" class="editor-form" style="margin-bottom: 12px">
          <el-form-item label="页面 ID">
            <el-input
              :model-value="node.pageId ?? ''"
              placeholder="unique-page-id"
              @update:model-value="updatePageId"
            />
          </el-form-item>
          <el-form-item label="页面类型">
            <el-select
              :model-value="node.pageType ?? 'list'"
              style="width: 160px"
              @update:model-value="updatePageType"
            >
              <el-option label="列表页" value="list" />
              <el-option label="详情页" value="detail" />
              <el-option label="表单页" value="form" />
              <el-option label="仪表盘" value="dashboard" />
              <el-option label="树形页" value="tree" />
              <el-option label="自定义" value="custom" />
            </el-select>
          </el-form-item>
        </el-form>
        <PageConfigEditor v-if="node.pageId" :page-id="node.pageId" />
        <el-empty v-else description="请先填写页面 ID" :image-size="60" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { PageType } from '../composables/types'
import { useProject } from '../composables/useProjectInject'
import PageConfigEditor from './PageConfigEditor.vue'
import NavIcon from '@/components/NavIcon.vue'

const props = defineProps<{
  nodeId: string
}>()

const project = useProject()
const activeTab = ref('basic')

const node = computed(() => project.getNode(props.nodeId))

// ── 节点字段更新 ─────────────────────────────────────────

function updateNavPath(v: string) {
  if (node.value) node.value.navPath = v
}

function updateNavHidden(v: boolean) {
  if (node.value) node.value.navHidden = v
}

function updatePageId(v: string) {
  if (node.value) node.value.pageId = v
}

function updatePageType(v: string) {
  if (node.value) node.value.pageType = v as PageType
}

// 切换节点时重置 tab
watch(() => props.nodeId, () => {
  activeTab.value = 'basic'
})

// 类型从 page 变为 group 时退出页面配置 tab
watch(() => node.value?.type, (t) => {
  if (t !== 'page' && activeTab.value === 'page-config') {
    activeTab.value = 'basic'
  }
})

function handleAddGroup() {
  project.createGroup(props.nodeId, `新分组 ${Date.now().toString(36)}`)
}

function handleAddPage() {
  const id = Date.now().toString(36)
  project.createPage(props.nodeId, `新页面 ${id}`, `page-${id}`)
}

function handleDelete() {
  project.deleteNode(props.nodeId)
  ElMessage.success('节点已删除')
}
</script>

<style scoped>
.wbs-node-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.editor-header__info {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.editor-header__icon {
  font-size: 18px;
  flex-shrink: 0;
}

.editor-header__title {
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-header__actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.editor-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: auto;
  padding: 12px 16px;
}

.editor-form {
  max-width: 600px;
}
</style>
