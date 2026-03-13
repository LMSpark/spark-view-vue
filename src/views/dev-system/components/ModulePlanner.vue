<template>
  <div class="module-planner">
    <div class="editor-header">
      <h2 class="editor-title">🏗️ 功能规划</h2>
      <el-button type="primary" size="small" @click="showAddDialog = true">+ 新增模块</el-button>
    </div>

    <!-- 模块卡片列表 -->
    <div v-if="project.state.modules.length" class="module-grid">
      <div v-for="mod in project.state.modules" :key="mod.id" class="module-card">
        <div class="module-card__header">
          <span class="module-card__name">{{ mod.icon || '📦' }} {{ mod.name }}</span>
          <div class="module-card__actions">
            <el-button size="small" text type="primary" @click="gotoModule(mod.id)">编辑</el-button>
            <el-popconfirm title="确认删除此模块？" @confirm="project.removeModule(mod.id)">
              <template #reference>
                <el-button size="small" text type="danger">删除</el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
        <div class="module-card__desc">{{ mod.description || '暂无描述' }}</div>
        <div class="module-card__pages">
          <el-tag
            v-for="p in mod.pages"
            :key="p.pageId"
            size="small"
            :type="pageStatusType(p.status)"
            class="page-tag"
            @click="gotoPage(p.pageId)"
          >
            {{ p.title }}
          </el-tag>
          <span v-if="!mod.pages.length" class="no-pages">暂无页面</span>
        </div>
        <div class="module-card__meta">
          <el-tag size="small" :type="modStatusType(mod.status)">{{ mod.status }}</el-tag>
          <span class="meta-text">{{ mod.pages.length }} 页</span>
        </div>
      </div>
    </div>

    <el-empty v-else description="尚未规划功能模块">
      <el-button type="primary" @click="showAddDialog = true">添加第一个模块</el-button>
    </el-empty>

    <!-- 新增模块对话框 -->
    <el-dialog v-model="showAddDialog" title="新增功能模块" width="480px" @close="resetForm">
      <el-form label-position="top">
        <el-form-item label="模块名称" required>
          <el-input v-model="newName" placeholder="如：订单管理" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="newDesc" type="textarea" :rows="3" placeholder="模块功能描述" maxlength="1000" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="newIcon" placeholder="如：📦" style="width: 100px" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="handleAdd" :disabled="!newName.trim()">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useProject } from '../composables/useProjectInject'
import type { ModuleStatus } from '../composables/types'

const project = useProject()

const showAddDialog = ref(false)
const newName = ref('')
const newDesc = ref('')
const newIcon = ref('📦')

function resetForm() {
  newName.value = ''
  newDesc.value = ''
  newIcon.value = '📦'
}

function handleAdd() {
  const name = newName.value.trim()
  if (!name) return
  project.addModule({
    id: crypto.randomUUID(),
    name,
    icon: newIcon.value || '📦',
    description: newDesc.value.trim(),
    pages: [],
    requirementId: '',
    status: 'planned',
  })
  showAddDialog.value = false
  resetForm()
}

function gotoModule(id: string) {
  project.setFocus({ view: 'module', moduleId: id })
}

function gotoPage(pageId: string) {
  project.setFocus({ view: 'page-design', pageId })
}

function modStatusType(status: ModuleStatus) {
  const map: Record<ModuleStatus, 'info' | 'warning' | 'success'> = {
    planned: 'info',
    designing: 'warning',
    generated: 'success',
    verified: 'success',
  }
  return map[status]
}

function pageStatusType(status: string) {
  if (status === 'generated' || status === 'verified') return 'success' as const
  if (status === 'designing') return 'warning' as const
  return 'info' as const
}
</script>

<style scoped>
.module-planner {
  padding: 20px 24px;
  overflow: auto;
  height: 100%;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.editor-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.module-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.module-card {
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  transition: border-color 0.15s;
}

.module-card:hover {
  border-color: var(--el-color-primary-light-5);
}

.module-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.module-card__name {
  font-size: 15px;
  font-weight: 600;
}

.module-card__actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.module-card__desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
  line-height: 1.5;
}

.module-card__pages {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.page-tag {
  cursor: pointer;
}

.no-pages {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.module-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meta-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
